"""Execute allowlisted podman-compose against the host rootless socket."""

from __future__ import annotations

import logging
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from core.logging import log_event

from services.empery_deploy_agent.config import ServiceConfig
from services.empery_deploy_agent.src.core.allowlist import (
    build_compose_argv_steps,
    validate_health_url,
    validate_service_name,
)
from services.empery_deploy_agent.src.core.contracts import (
    DeployAction,
    DeployResponse,
)

def socket_path_from_uri(uri: str) -> Path | None:
    if uri.startswith("unix://"):
        return Path(uri.removeprefix("unix://"))
    return None


class ComposeRunner:
    """Sandboxed compose executor — cwd = host-identical workspace."""

    def __init__(self, config: ServiceConfig, logger: logging.Logger) -> None:
        self._config = config
        self._logger = logger

    def workspace(self) -> Path:
        raw = self._config.host_workspace.strip()
        if not raw:
            raise RuntimeError(
                "EMPERY_HOST_WORKSPACE is required (absolute host path, "
                "path-identity mount for rootless Podman remote)"
            )
        path = Path(raw)
        if not path.is_absolute():
            raise RuntimeError(
                f"EMPERY_HOST_WORKSPACE must be absolute, got {raw!r}"
            )
        if not path.is_dir():
            raise RuntimeError(f"workspace missing or not a directory: {path}")
        return path

    def socket_ok(self) -> bool:
        sock = socket_path_from_uri(self._config.container_host)
        if sock is None:
            return True
        return sock.exists()

    def ensure_ready(self) -> None:
        self.workspace()
        if self._config.require_socket and not self.socket_ok():
            raise RuntimeError(
                f"podman socket not found at {self._config.container_host} "
                "(start: systemctl --user enable --now podman.socket)"
            )

    def run(
        self,
        *,
        service_name: str,
        action: DeployAction,
        health_url: str | None = None,
    ) -> DeployResponse:
        name = validate_service_name(service_name)
        try:
            self.ensure_ready()
        except RuntimeError as exc:
            return DeployResponse(
                ok=False,
                action=action,
                service_name=name,
                error=str(exc),
            )

        if action is DeployAction.HEALTH:
            return self._health(name, health_url)

        workspace = self.workspace()
        try:
            steps = build_compose_argv_steps(
                workspace=workspace, service_name=name, action=action
            )
        except (ValueError, FileNotFoundError) as exc:
            return DeployResponse(
                ok=False,
                action=action,
                service_name=name,
                error=str(exc),
            )

        env = os.environ.copy()
        env["CONTAINER_HOST"] = self._config.container_host
        env["DOCKER_HOST"] = self._config.container_host
        # Retain HEALTHCHECK metadata under Podman builds
        env.setdefault("BUILDAH_FORMAT", "docker")

        combined_output = ""
        last_argv: list[str] = []
        last_code = 0
        for argv in steps:
            last_argv = argv
            log_event(
                self._logger,
                event="deploy_agent.compose.start",
                message="Allowlisted compose command starting",
                argv=argv,
                service_name=name,
                action=action.value,
                cwd=str(workspace),
            )
            try:
                proc = subprocess.run(
                    argv,
                    cwd=str(workspace),
                    capture_output=True,
                    text=True,
                    timeout=float(self._config.compose_timeout_s),
                    check=False,
                    env=env,
                )
            except FileNotFoundError:
                return DeployResponse(
                    ok=False,
                    action=action,
                    service_name=name,
                    argv=argv,
                    error="podman-compose binary not found",
                )
            except subprocess.TimeoutExpired:
                return DeployResponse(
                    ok=False,
                    action=action,
                    service_name=name,
                    argv=argv,
                    error=(
                        f"compose timed out after {self._config.compose_timeout_s}s"
                    ),
                )

            chunk = ((proc.stdout or "") + (proc.stderr or ""))[-8000:]
            combined_output = (combined_output + "\n" + chunk)[-12000:]
            last_code = proc.returncode
            phantom = "no container with name" in chunk.lower()
            ok = proc.returncode == 0 and not phantom
            if phantom and proc.returncode == 0:
                last_code = 1
            log_event(
                self._logger,
                event="deploy_agent.compose.finished",
                message="Allowlisted compose command finished",
                argv=argv,
                exit_code=last_code,
                ok=ok,
                level=logging.INFO if ok else logging.ERROR,
            )
            if not ok:
                snippet = combined_output.strip()[-1200:] if combined_output.strip() else ""
                err_msg = (
                    f"compose exit {last_code}: {snippet}"
                    if snippet and last_code != 0
                    else (
                        "compose reported missing container"
                        if phantom
                        else f"compose exit {last_code}"
                    )
                )
                if phantom and snippet:
                    err_msg = f"compose reported missing container: {snippet}"
                return DeployResponse(
                    ok=False,
                    action=action,
                    service_name=name,
                    argv=last_argv,
                    exit_code=last_code,
                    output=combined_output,
                    error=err_msg,
                    details={"cwd": str(workspace), "steps": len(steps)},
                )

        return DeployResponse(
            ok=True,
            action=action,
            service_name=name,
            argv=last_argv,
            exit_code=last_code,
            output=combined_output,
            error=None,
            details={"cwd": str(workspace), "steps": len(steps)},
        )

    def _health(self, service_name: str, health_url: str | None) -> DeployResponse:
        if not health_url:
            # Default in-compose DNS health
            health_url = f"http://{service_name}:8000/api/v1/health"
            # Prefer dynamic bases file when present
            bases = self._load_health_base(service_name)
            if bases:
                health_url = bases.rstrip("/") + "/api/v1/health"
        try:
            url = validate_health_url(health_url, service_name=service_name)
        except ValueError as exc:
            return DeployResponse(
                ok=False,
                action=DeployAction.HEALTH,
                service_name=service_name,
                error=str(exc),
            )

        # Constant backoff between attempts: compose `up` exits before the app
        # binds its port; linear/exponential backoff adds little vs cold-start variance.
        max_attempts = max(1, int(self._config.health_probe_retries))
        backoff_s = max(0.0, float(self._config.health_probe_backoff_s))
        timeout_s = float(self._config.health_probe_timeout_s)
        last_error: str | None = None
        last_body = ""
        last_code: int | None = None

        for attempt in range(1, max_attempts + 1):
            try:
                with urllib.request.urlopen(url, timeout=timeout_s) as resp:
                    last_body = resp.read(2048).decode("utf-8", errors="replace")
                    last_code = int(getattr(resp, "status", 200))
                    if 200 <= last_code < 300:
                        return DeployResponse(
                            ok=True,
                            action=DeployAction.HEALTH,
                            service_name=service_name,
                            exit_code=0,
                            output=last_body,
                            error=None,
                            details={"url": url, "attempts": attempt},
                        )
                    last_error = f"HTTP {last_code}"
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                last_error = str(exc)

            if attempt < max_attempts and backoff_s > 0:
                time.sleep(backoff_s)

        detail_error = last_error or "health probe failed"
        if last_code is not None and last_error is None:
            detail_error = f"HTTP {last_code}"
        return DeployResponse(
            ok=False,
            action=DeployAction.HEALTH,
            service_name=service_name,
            exit_code=1,
            output=last_body,
            error=f"{detail_error} after {max_attempts} attempts",
            details={"url": url, "attempts": max_attempts},
        )

    def _load_health_base(self, service_name: str) -> str | None:
        try:
            path = (
                self.workspace()
                / ".cursor"
                / "orchestration"
                / "eic"
                / "dynamic_health_bases.json"
            )
            if not path.is_file():
                return None
            import json

            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and service_name in data:
                return str(data[service_name])
        except Exception:  # noqa: BLE001
            return None
        return None

    def status_details(self) -> dict[str, Any]:
        raw = (self._config.host_workspace or "").strip()
        ws = ""
        workspace_ok = False
        workspace_error: str | None = None
        if not raw:
            workspace_error = "EMPERY_HOST_WORKSPACE empty"
        elif not Path(raw).is_absolute():
            workspace_error = f"EMPERY_HOST_WORKSPACE not absolute: {raw!r}"
        else:
            path = Path(raw)
            if not path.is_dir():
                workspace_error = f"EMPERY_HOST_WORKSPACE missing or not a directory: {raw}"
            else:
                ws = str(path)
                workspace_ok = True
        return {
            "workspace": ws or raw,
            "workspace_ok": workspace_ok,
            "workspace_error": workspace_error,
            "socket_ok": self.socket_ok(),
            "container_host": self._config.container_host,
        }
