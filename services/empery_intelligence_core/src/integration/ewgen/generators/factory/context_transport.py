"""
Context transport protocol — Python → ts_worker data path (stdin JSON-lines, optional spill file).
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

TRANSPORT_MODE = "jsonlines_stdin"
"""Context is NOT passed via CLI argv — only ``npx tsx <worker.ts>`` in argv."""

SPILL_FILENAME = "{run_id}.context-window.json"
SPILL_FILENAME_ATTEMPT = "{run_id}.r{attempt}.context-window.json"

DEFAULT_MAX_INLINE_BYTES = int(os.getenv("EWGEN_CONTEXT_INLINE_MAX_BYTES", "65536"))
DEFAULT_MAX_STDIN_BYTES = int(os.getenv("EWGEN_TS_WORKER_MAX_STDIN_BYTES", "1048576"))


@dataclass(frozen=True)
class ContextTransportPlan:
    mode: str
    inline: bool
    payload_bytes: int
    spill_path: Optional[str] = None
    within_stdin_limit: bool = True


def estimate_json_bytes(payload: Dict[str, Any]) -> int:
    return len(json.dumps(payload, ensure_ascii=False).encode("utf-8"))


def spill_path_for_run(
    spill_dir: Path,
    run_id: str,
    *,
    attempt: int = 0,
) -> Path:
    """Resolve spill file path for a factory run (attempt suffix avoids retry poisoning)."""
    if attempt > 0:
        name = SPILL_FILENAME_ATTEMPT.format(run_id=run_id, attempt=attempt)
    else:
        name = SPILL_FILENAME.format(run_id=run_id)
    return spill_dir / name


def list_context_spill_files(run_id: str, *, spill_dir: Optional[Path] = None) -> List[Path]:
    """Return spill files belonging to ``run_id`` under the run workspace."""
    from .artifacts import get_run_workspace  # noqa: PLC0415

    root = spill_dir or get_run_workspace(run_id)
    if not root.is_dir():
        return []

    patterns = (
        f"{run_id}.context-window.json",
        f"{run_id}.r*.context-window.json",
        f"{run_id}.context-window.*.json",
    )
    found: List[Path] = []
    for pattern in patterns:
        found.extend(root.glob(pattern))
    return sorted({path.resolve() for path in found if path.is_file()})


def cleanup_context_transport_artifacts(
    run_id: str,
    *,
    spill_dir: Optional[Path] = None,
) -> List[str]:
    """
    Remove context spill files for a factory run.

    Called on terminal states (COMPLETED/FAILED) and before retry generation
    to prevent stale spill poisoning.
    """
    removed: List[str] = []
    for path in list_context_spill_files(run_id, spill_dir=spill_dir):
        try:
            path.unlink(missing_ok=True)
            removed.append(str(path))
        except OSError as error:
            logger.warning(
                "[context_transport] spill_cleanup_failed run_id=%s path=%s error=%s",
                run_id,
                path,
                error,
            )
    if removed:
        logger.info(
            "[context_transport] spill_cleanup run_id=%s removed=%d",
            run_id,
            len(removed),
        )
    return removed


def write_context_spill_atomic(
    spill_path: Path,
    context_window: Dict[str, Any],
) -> None:
    """Write spill JSON atomically (temp + rename) to avoid partial reads."""
    spill_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(context_window, ensure_ascii=False, indent=2)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{spill_path.name}.",
        suffix=".tmp",
        dir=str(spill_path.parent),
    )
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        tmp_path.replace(spill_path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def prepare_worker_request(
    request: Dict[str, Any],
    *,
    run_id: Optional[str] = None,
    spill_dir: Optional[Path] = None,
    inline_max_bytes: int = DEFAULT_MAX_INLINE_BYTES,
    stdin_max_bytes: int = DEFAULT_MAX_STDIN_BYTES,
    attempt: int = 0,
) -> tuple[Dict[str, Any], ContextTransportPlan]:
    """
    Prepare a worker request for JSON-lines stdin transport.

    - Worker argv: ``npx tsx generatorWorker.ts`` only (no context in args).
    - Config travels inside the JSON request body written to stdin (one JSON
      object per line — not a JSON stream of concatenated values).
    - When ``contextWindow`` exceeds ``inline_max_bytes``, it is spilled to
      ``{spill_dir}/{run_id}[.r{attempt}].context-window.json`` and replaced
      with ``contextWindowRef`` so stdin stays bounded.
    - Stale spill files for the same run are removed before writing.
    """
    config = dict(request.get("config") or {})
    context_window = config.get("contextWindow")

    if not isinstance(context_window, dict) or not context_window:
        payload_bytes = estimate_json_bytes(request)
        return request, ContextTransportPlan(
            mode=TRANSPORT_MODE,
            inline=True,
            payload_bytes=payload_bytes,
            within_stdin_limit=payload_bytes <= stdin_max_bytes,
        )

    inline_bytes = estimate_json_bytes({"contextWindow": context_window})
    if inline_bytes <= inline_max_bytes:
        payload_bytes = estimate_json_bytes(request)
        return request, ContextTransportPlan(
            mode=TRANSPORT_MODE,
            inline=True,
            payload_bytes=payload_bytes,
            within_stdin_limit=payload_bytes <= stdin_max_bytes,
        )

    resolved_run_id = run_id or str(config.get("factoryRunId") or "").strip()
    if not resolved_run_id or spill_dir is None:
        raise ContextTransportError(
            "contextWindow exceeds inline limit; run_id and spill_dir required for spill file",
        )

    cleanup_context_transport_artifacts(resolved_run_id, spill_dir=spill_dir)

    spill_path = spill_path_for_run(spill_dir, resolved_run_id, attempt=attempt)
    write_context_spill_atomic(spill_path, context_window)

    config.pop("contextWindow", None)
    config["contextWindowRef"] = {
        "path": str(spill_path.resolve()),
        "transport": TRANSPORT_MODE,
        "bytes": inline_bytes,
        "runId": resolved_run_id,
        "attempt": attempt,
    }
    updated = {**request, "config": config}
    payload_bytes = estimate_json_bytes(updated)

    if payload_bytes > stdin_max_bytes:
        spill_path.unlink(missing_ok=True)
        raise ContextTransportError(
            f"Worker request {payload_bytes} bytes exceeds stdin limit {stdin_max_bytes}",
        )

    return updated, ContextTransportPlan(
        mode=TRANSPORT_MODE,
        inline=False,
        payload_bytes=payload_bytes,
        spill_path=str(spill_path),
        within_stdin_limit=True,
    )


class ContextTransportError(Exception):
    """Invalid or oversized context transport payload."""
