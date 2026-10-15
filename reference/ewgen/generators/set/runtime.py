"""
SET Podman runtime orchestration
"""

import os
import shutil
import subprocess
from typing import Any, Dict, List

from .bootstrap import is_runtime_bootstrapped
from .paths import runtime_root


def _compose_command() -> List[str]:
    if shutil.which("podman"):
        return ["podman", "compose"]
    if shutil.which("docker"):
        return ["docker", "compose"]
    raise RuntimeError("Neither podman nor docker compose is available")


def _run_compose(args: List[str], *, timeout: int = 300) -> subprocess.CompletedProcess[str]:
    command = _compose_command() + args
    return subprocess.run(
        command,
        cwd=runtime_root(),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        env={**os.environ},
    )


def _container_state(name: str) -> Dict[str, Any]:
    if not shutil.which("podman"):
        return {"name": name, "running": False, "status": "podman-missing"}
    result = subprocess.run(
        ["podman", "inspect", "-f", "{{.State.Status}}", name],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return {"name": name, "running": False, "status": "missing"}
    status = result.stdout.strip() or "unknown"
    return {
        "name": name,
        "running": status == "running",
        "status": status,
    }


def get_runtime_status() -> Dict[str, Any]:
    runtime = runtime_root()
    services = [
        _container_state("ewgen-set-frontend"),
        _container_state("ewgen-set-backend"),
        _container_state("ewgen-set-db"),
    ]
    running_count = sum(1 for item in services if item.get("running"))
    return {
        "bootstrapped": is_runtime_bootstrapped(),
        "runtimePath": str(runtime),
        "services": services,
        "runningCount": running_count,
        "totalServices": len(services),
        "healthy": running_count == len(services),
        "frontendUrl": f"http://127.0.0.1:{os.getenv('SET_FRONTEND_PORT', '3100')}",
        "backendUrl": f"http://127.0.0.1:{os.getenv('SET_BACKEND_PORT', '8100')}",
    }


def runtime_up() -> Dict[str, Any]:
    if not is_runtime_bootstrapped():
        raise FileNotFoundError("SET runtime is not bootstrapped. Call bootstrap first.")
    result = _run_compose(["up", "-d", "--build"])
    status = get_runtime_status()
    return {
        "success": result.returncode == 0,
        "exitCode": result.returncode,
        "stdout": result.stdout[-4000:] if result.stdout else "",
        "stderr": result.stderr[-4000:] if result.stderr else "",
        "status": status,
    }


def rebuild_set_backend_image() -> Dict[str, Any]:
    """Rebuild backend image (pip deps) and recreate container after shell upgrade."""
    if not is_runtime_bootstrapped():
        return {"success": False, "message": "runtime not bootstrapped"}
    build = _run_compose(["build", "backend"], timeout=600)
    if build.returncode != 0:
        return {
            "success": False,
            "exitCode": build.returncode,
            "stdout": (build.stdout or "")[-4000:],
            "stderr": (build.stderr or "")[-4000:],
            "message": "backend image build failed",
        }
    up = _run_compose(["up", "-d", "backend"], timeout=120)
    return {
        "success": up.returncode == 0,
        "exitCode": up.returncode,
        "stdout": (up.stdout or "")[-4000:],
        "stderr": (up.stderr or "")[-4000:],
        "status": get_runtime_status(),
    }


def restart_set_backend() -> Dict[str, Any]:
    """Restart SET backend container so module_loader picks up registry changes."""
    if not shutil.which("podman"):
        return {"success": False, "message": "podman not available"}
    if not is_runtime_bootstrapped():
        return {"success": False, "message": "runtime not bootstrapped"}

    result = subprocess.run(
        ["podman", "restart", "ewgen-set-backend"],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    return {
        "success": result.returncode == 0,
        "exitCode": result.returncode,
        "stdout": (result.stdout or "").strip(),
        "stderr": (result.stderr or "").strip(),
    }


def runtime_down() -> Dict[str, Any]:
    if not is_runtime_bootstrapped():
        return {"success": True, "message": "runtime not bootstrapped", "status": get_runtime_status()}
    result = _run_compose(["down"])
    return {
        "success": result.returncode == 0,
        "exitCode": result.returncode,
        "stdout": result.stdout[-4000:] if result.stdout else "",
        "stderr": result.stderr[-4000:] if result.stderr else "",
        "status": get_runtime_status(),
    }
