#!/usr/bin/env python3
"""Verify living LLM (product brain) reachable from host and optionally from EIC container.

Probes ``EIC_LLM_BASE_URL`` (default ``http://127.0.0.1:8080`` for host checks)
``/health`` and ``/v1/models``. Compose defaults use ``host.containers.internal:8080``
so containers reach a brain on the same host — set ``EIC_LLM_BASE_URL`` in ``.env``
for a LAN peer.

When ``EMPERY_SMOKE_FROM_CONTAINER=1`` or a running ``empery_intelligence_core``
container is auto-detected, also probes from inside that container via Python
urllib.

Usage:
  python3 scripts/verify_living_brain.py
  EIC_LLM_BASE_URL=http://192.168.x.x:8080 python3 scripts/verify_living_brain.py
  EMPERY_SMOKE_FROM_CONTAINER=1 python3 scripts/verify_living_brain.py
"""

from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:8080"
EIC_CONTAINER_HINT = "empery_intelligence_core"


def _base_url() -> str:
    return os.environ.get("EIC_LLM_BASE_URL", DEFAULT_BASE).rstrip("/")


def _get(url: str, timeout: float = 10.0) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def _probe_host(base: str, errors: list[str]) -> None:
    for path in ("/health", "/v1/models"):
        url = f"{base}{path}"
        try:
            code, body = _get(url)
            if code != 200:
                errors.append(f"host {url} HTTP {code}")
                continue
            if path == "/v1/models":
                json.loads(body)
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            errors.append(f"host {url}: {exc}")


def _list_running_containers() -> list[str]:
    names: list[str] = []
    for runtime in ("podman", "docker"):
        try:
            out = subprocess.check_output(
                [runtime, "ps", "--format", "{{.Names}}"],
                text=True,
                stderr=subprocess.DEVNULL,
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
        for line in out.splitlines():
            name = line.strip()
            if name:
                names.append(name)
        if names:
            break
    return names


def _find_eic_container() -> str | None:
    for name in _list_running_containers():
        if EIC_CONTAINER_HINT in name:
            return name
    return None


def _truthy_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _should_probe_container() -> bool:
    if _truthy_env("EMPERY_SMOKE_FROM_CONTAINER"):
        return True
    return _find_eic_container() is not None


def _probe_container(base: str, container: str, errors: list[str]) -> None:
    py = (
        "import json, urllib.request, sys\n"
        f"base = {base!r}\n"
        "for path in ('/health', '/v1/models'):\n"
        "    url = base + path\n"
        "    try:\n"
        "        with urllib.request.urlopen(url, timeout=10) as r:\n"
        "            if r.status != 200:\n"
        "                print(f'container {url} HTTP {r.status}', file=sys.stderr)\n"
        "                sys.exit(1)\n"
        "            if path == '/v1/models':\n"
        "                json.loads(r.read().decode())\n"
        "    except Exception as e:\n"
        "        print(f'container {url}: {e}', file=sys.stderr)\n"
        "        sys.exit(1)\n"
    )
    for runtime in ("podman", "docker"):
        try:
            result = subprocess.run(
                [runtime, "exec", container, "python", "-c", py],
                capture_output=True,
                text=True,
                timeout=45,
            )
        except FileNotFoundError:
            continue
        if result.returncode == 0:
            return
        detail = (result.stderr or result.stdout or "").strip()
        errors.append(f"container probe via {runtime} exec {container}: {detail}")
        return
    errors.append(f"cannot exec into {container} (podman/docker missing)")


def main() -> int:
    base = _base_url()
    errors: list[str] = []

    print(f"Living brain verify — host probes at {base}")
    _probe_host(base, errors)

    container = _find_eic_container()
    if _should_probe_container():
        if not container:
            errors.append(
                "container probe required but no running empery_intelligence_core container found"
            )
        else:
            print(f"Container probe via {container}")
            _probe_container(base, container, errors)
    else:
        print(
            "Skipping container probe (no EIC container running; "
            "set EMPERY_SMOKE_FROM_CONTAINER=1 to require)"
        )

    if errors:
        print("verify_living_brain FAILED:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print("verify_living_brain PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
