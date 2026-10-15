"""
Persistent TypeScript Generator Worker Manager
Reuses a single tsx subprocess for generator requests
"""

import json
import logging
import os
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

USE_TS_WORKER = os.getenv(
    "EWGEN_USE_TS_WORKER", "true"
).lower() in ("1", "true", "yes")


class TSWorkerError(Exception):
    """TS worker execution error"""

    pass


class TSWorkerManager:
    """
    Manages persistent JSON-lines worker process
    """

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self._process: Optional[subprocess.Popen[str]] = None
        self._lock = threading.Lock()
        self._request_timeout = int(
            os.getenv("EWGEN_TS_WORKER_TIMEOUT", "60")
        )

    def _worker_script(self) -> Path:
        return (
            self.project_root
            / "src"
            / "services"
            / "generators"
            / "generatorWorker.ts"
        )

    def _start_process(self) -> None:
        if self._process and self._process.poll() is None:
            return

        script = self._worker_script()
        if not script.exists():
            raise TSWorkerError(f"Worker script not found: {script}")

        self._process = subprocess.Popen(
            ["npx", "tsx", str(script)],
            cwd=str(self.project_root),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        logger.info("Started persistent TS generator worker")

    def _stop_process(self) -> None:
        if not self._process:
            return

        if self._process.poll() is None:
            try:
                self._send_request_unlocked({
                    "id": "shutdown",
                    "type": "shutdown",
                })
            except Exception:
                self._process.kill()
        self._process = None

    def _send_request_unlocked(
        self, request: Dict[str, Any]
    ) -> Dict[str, Any]:
        if not self._process or self._process.poll() is not None:
            self._start_process()

        process = self._process
        if process is None or process.stdin is None or process.stdout is None:
            raise TSWorkerError("Worker process streams unavailable")

        line = json.dumps(request) + "\n"
        process.stdin.write(line)
        process.stdin.flush()

        response_line = process.stdout.readline()
        if not response_line:
            stderr = ""
            if process.stderr:
                stderr = process.stderr.read()
            raise TSWorkerError(
                f"Worker returned no output. stderr: {stderr}"
            )

        response = json.loads(response_line)
        if not response.get("success"):
            raise TSWorkerError(
                response.get("error", "Worker request failed")
            )

        return response

    def execute(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute request via persistent worker with retry on failure
        """
        with self._lock:
            try:
                return self._send_request_unlocked(request)
            except Exception as first_error:
                logger.warning(
                    "Worker request failed, restarting: %s",
                    str(first_error),
                )
                self._stop_process()
                self._start_process()
                return self._send_request_unlocked(request)

    def is_running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def shutdown(self) -> None:
        with self._lock:
            self._stop_process()


_worker_instance: Optional[TSWorkerManager] = None
_worker_lock = threading.Lock()


def get_ts_worker(project_root: Path) -> TSWorkerManager:
    global _worker_instance
    with _worker_lock:
        if _worker_instance is None:
            _worker_instance = TSWorkerManager(project_root)
        return _worker_instance


def reset_ts_worker_singleton() -> None:
    """Test helper — shutdown persistent worker and clear singleton."""
    global _worker_instance
    with _worker_lock:
        if _worker_instance is not None:
            try:
                _worker_instance.shutdown()
            except Exception:
                pass
        _worker_instance = None


def execute_via_worker(
    project_root: Path,
    request_type: str,
    config: Dict[str, Any],
    generator_name: Optional[str] = None,
    *,
    run_id: Optional[str] = None,
    spill_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Execute generation via persistent worker (JSON-lines stdin transport).

    Context is embedded in the JSON request body on stdin — never in CLI argv.
    """
    from generators.factory.context_transport import prepare_worker_request

    worker = get_ts_worker(project_root)
    request_id = str(uuid.uuid4())

    request: Dict[str, Any] = {
        "id": request_id,
        "type": request_type,
        "config": config,
    }
    if generator_name:
        request["generatorName"] = generator_name

    prepared, plan = prepare_worker_request(
        request,
        run_id=run_id or config.get("factoryRunId"),
        spill_dir=spill_dir,
        attempt=int(config.get("factoryRetryCount") or 0),
    )
    logger.debug(
        "[ts_worker] transport mode=%s inline=%s bytes=%s spill=%s",
        plan.mode,
        plan.inline,
        plan.payload_bytes,
        plan.spill_path,
    )

    return worker.execute(prepared)


def execute_transport_probe(
    project_root: Path,
    config: Dict[str, Any],
    *,
    run_id: Optional[str] = None,
    spill_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Round-trip a config object through the real ts_worker stdin JSON-lines protocol.

    Used by tests to prove cross-language structural integrity (including spill files).
    """
    from generators.factory.context_transport import prepare_worker_request

    worker = get_ts_worker(project_root)
    request_id = str(uuid.uuid4())
    request: Dict[str, Any] = {
        "id": request_id,
        "type": "transport_probe",
        "config": config,
    }
    prepared, _plan = prepare_worker_request(
        request,
        run_id=run_id or config.get("factoryRunId"),
        spill_dir=spill_dir,
        attempt=int(config.get("factoryRetryCount") or 0),
    )
    return worker.execute(prepared)
