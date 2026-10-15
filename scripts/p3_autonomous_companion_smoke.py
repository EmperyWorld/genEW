#!/usr/bin/env python3
"""P3.1 repeatable gate: Autonomous companion genesis → live Desktop proof.

Strict mode (default): exit 0 only when autonomous job ``status == completed``
AND all deterministic + live gates pass.

Lenient lab mode: ``EMPERY_SMOKE_ALLOW_POSTHOC=1`` allows job ``failed`` when
post-hoc filesystem/factory/desktop/live gates all pass (job completion still
preferred for full PASS).

Usage (stack up, living LLM configured):
  python3 scripts/p3_autonomous_companion_smoke.py

Re-verify an existing service (skip enqueue):
  EMPERY_SMOKE_SERVICE=p3_comp_live python3 scripts/p3_autonomous_companion_smoke.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

EIC_BASE = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
DEPLOY_BASE = os.environ.get("EMPERY_SMOKE_DEPLOY_BASE", "http://127.0.0.1:8010").rstrip("/")
SHELL_BASE = os.environ.get("EMPERY_SMOKE_SHELL_BASE", "http://127.0.0.1:8020").rstrip("/")
DESKTOP_UI = os.environ.get("EMPERY_SMOKE_DESKTOP_UI", "http://127.0.0.1:5174").rstrip("/")

POLL_TIMEOUT_S = float(os.environ.get("EMPERY_SMOKE_POLL_TIMEOUT_S", str(20 * 60)))
POLL_INTERVAL_S = float(os.environ.get("EMPERY_SMOKE_POLL_INTERVAL_S", "15"))
ALLOW_POSTHOC = os.environ.get("EMPERY_SMOKE_ALLOW_POSTHOC", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
EXISTING_SERVICE = os.environ.get("EMPERY_SMOKE_SERVICE", "").strip()

TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})


def _get(url: str, timeout: float = 30.0) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def _post_json(url: str, payload: dict, timeout: float = 60.0) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return resp.status, json.loads(raw) if raw else {}


def _put_json(url: str, payload: dict, timeout: float = 30.0) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return resp.status, json.loads(raw) if raw else {}


def _post_deploy(service_name: str, action: str = "health") -> dict[str, Any]:
    _, data = _post_json(
        f"{DEPLOY_BASE}/api/v1/deploy",
        {"service_name": service_name, "action": action},
        timeout=120.0,
    )
    return data


def _preflight(errors: list[str]) -> None:
    try:
        code, _ = _get(f"{EIC_BASE}/api/v1/health", timeout=15)
        if code != 200:
            errors.append(f"EIC health HTTP {code}")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        errors.append(f"EIC health unreachable: {exc}")

    try:
        code, raw = _get(f"{EIC_BASE}/api/v1/autonomous/llm/health", timeout=30)
        if code != 200:
            errors.append(f"LLM health HTTP {code}")
        else:
            llm = json.loads(raw)
            if llm.get("status") != "ok":
                errors.append(f"LLM not ready: {llm}")
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        errors.append(f"LLM health probe failed: {exc}")

    try:
        code, raw = _get(f"{EIC_BASE}/api/v1/autonomous/mode", timeout=15)
        if code != 200:
            errors.append(f"Autonomous mode GET HTTP {code}")
        else:
            mode = json.loads(raw)
            if not mode.get("enabled"):
                put_code, put_body = _put_json(
                    f"{EIC_BASE}/api/v1/autonomous/mode",
                    {"enabled": True},
                )
                if put_code != 200 or not put_body.get("enabled"):
                    errors.append(
                        f"Autonomous mode disabled and enable failed: {put_body}"
                    )
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        errors.append(f"Autonomous mode probe failed: {exc}")

    try:
        code, _ = _get(f"{DEPLOY_BASE}/api/v1/health", timeout=15)
        if code != 200:
            errors.append(f"deploy_agent health HTTP {code}")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        errors.append(f"deploy_agent health unreachable: {exc}")


def _enqueue_companion(service_name: str) -> dict[str, Any]:
    code, body = _post_json(
        f"{EIC_BASE}/api/v1/autonomous/intentions",
        {
            "intention": (
                f"Create companion chat service {service_name} with Nervas and identity"
            ),
            "service_name": service_name,
            "features": ["health", "companion_chat"],
            "metadata": {"scaffold_profile": "companion_chat"},
        },
        timeout=60.0,
    )
    if code != 201:
        raise RuntimeError(f"enqueue failed HTTP {code}: {body}")
    return body


def _poll_job(job_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + POLL_TIMEOUT_S
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        code, raw = _get(f"{EIC_BASE}/api/v1/autonomous/jobs/{job_id}", timeout=30)
        if code != 200:
            raise RuntimeError(f"job poll HTTP {code}: {raw}")
        last = json.loads(raw).get("job") or {}
        status = str(last.get("status") or "")
        print(f"  job {job_id} status={status} stage={last.get('stage')}")
        if status in TERMINAL_STATUSES:
            return last
        time.sleep(POLL_INTERVAL_S)
    raise TimeoutError(
        f"job {job_id} did not reach terminal state within {POLL_TIMEOUT_S}s"
    )


def _companion_capsule_ok(service_name: str) -> tuple[bool, list[str]]:
    notes: list[str] = []
    ok = True
    svc_root = ROOT / "services" / service_name
    manifest_path = svc_root / "manifest.json"
    if not manifest_path.is_file():
        return False, [f"missing manifest {manifest_path}"]

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    features = manifest.get("features") if isinstance(manifest.get("features"), list) else []
    deps = manifest.get("dependencies") if isinstance(manifest.get("dependencies"), list) else []

    has_companion_feature = "companion_chat" in features
    has_alembic = (svc_root / "alembic").is_dir()
    has_identity_adapter = (
        svc_root / "src" / "integration" / "identity_adapter.py"
    ).is_file()
    has_peer_deps = "identity_service" in deps and "empery_intelligence_core" in deps

    if has_companion_feature or (has_alembic and has_identity_adapter and has_peer_deps):
        notes.append("companion capsule: ok")
    else:
        ok = False
        notes.append(
            "companion capsule: FAILED "
            f"(features={features}, alembic={has_alembic}, "
            f"identity_adapter={has_identity_adapter}, deps={deps})"
        )

    sys.path.insert(0, str(ROOT))
    from services.empery_intelligence_core.src.integration.service_factory_gates import (
        verify_factory_gates,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        verify_service_desktop,
    )

    factory_status, factory_detail = verify_factory_gates(
        ROOT, service_name, scaffold_profile="companion_chat"
    )
    if factory_status != "PASSED":
        ok = False
    notes.append(f"factory: {factory_status}")

    desk_status, desk_detail = verify_service_desktop(ROOT, service_name)
    if desk_status != "PASSED":
        ok = False
    notes.append(f"desktop: {desk_status} ({desk_detail[:120]})")

    try:
        from core.registry import discover_manifest_names

        names = discover_manifest_names(ROOT / "services")
        if service_name in names:
            notes.append("registry discovery: ok")
        else:
            ok = False
            notes.append(f"registry discovery: MISSING (have sample {names[:8]})")
    except Exception as exc:  # noqa: BLE001
        ok = False
        notes.append(f"registry discovery failed: {exc}")

    if not ok:
        notes.append(factory_detail[:500])
    return ok, notes


def _live_gates(service_name: str, warnings: list[str]) -> tuple[bool, list[str]]:
    notes: list[str] = []
    ok = True
    pascal = "".join(part.capitalize() for part in service_name.split("_"))
    mount_symbol = f"{pascal}Mount"

    deploy = _post_deploy(service_name, action="health")
    if deploy.get("ok"):
        attempts = (deploy.get("details") or {}).get("attempts")
        notes.append(f"deploy health: ok (attempts={attempts})")
    else:
        ok = False
        notes.append(f"deploy health: FAILED ({deploy.get('error')})")

    try:
        _, raw = _get(f"{SHELL_BASE}/api/v1/shell-bootstrap", timeout=15)
        boot = json.loads(raw)
        apps = {
            i.get("app_component")
            for i in boot.get("items", [])
            if isinstance(i, dict)
        }
        if service_name in apps or mount_symbol in apps:
            notes.append("desktop_shell bootstrap: ok")
        else:
            ok = False
            notes.append(
                f"desktop_shell bootstrap missing {service_name}/{mount_symbol}; "
                f"have={sorted(x for x in apps if x)[:12]}"
            )
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        ok = False
        notes.append(f"desktop_shell bootstrap failed: {exc}")

    try:
        _, index = _get(f"{DESKTOP_UI}/", timeout=15)
        asset_urls: list[str] = []
        for part in index.split('src="')[1:]:
            src = part.split('"', 1)[0]
            if src.startswith("/"):
                asset_urls.append(f"{DESKTOP_UI}{src}")
        found = False
        scanned = 0
        for url in asset_urls[:8]:
            try:
                _, js = _get(url, timeout=30)
            except (urllib.error.URLError, TimeoutError, OSError):
                continue
            scanned += 1
            if service_name in js or mount_symbol in js:
                found = True
                break
        if found:
            notes.append("desktop UI baked asset: ok")
        else:
            ok = False
            notes.append(
                "desktop UI baked asset: FAILED "
                f"(symbol {service_name}/{mount_symbol} not in {scanned} assets — "
                "rebuild empery_desktop_ui after scaffold)"
            )
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        ok = False
        notes.append(f"desktop UI unreachable: {exc}")

    return ok, notes


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    job_status: str | None = None
    service_name = EXISTING_SERVICE

    print("P3 autonomous companion smoke — preflight")
    _preflight(errors)
    if errors:
        print("P3 autonomous companion smoke FAILED (preflight):")
        for e in errors:
            print(f"  - {e}")
        return 1

    if not service_name:
        suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        service_name = f"p3_smoke_{suffix}"
        print(f"Enqueue intention service_name={service_name}")
        try:
            created = _enqueue_companion(service_name)
        except (RuntimeError, urllib.error.URLError, TimeoutError, OSError) as exc:
            print(f"P3 autonomous companion smoke FAILED: enqueue: {exc}")
            return 1
        job = created.get("job") or {}
        job_id = str(job.get("id") or "")
        if not job_id:
            print("P3 autonomous companion smoke FAILED: missing job id")
            return 1
        print(f"Polling job {job_id} (timeout={POLL_TIMEOUT_S}s, interval={POLL_INTERVAL_S}s)")
        try:
            terminal = _poll_job(job_id)
        except (TimeoutError, RuntimeError, urllib.error.URLError, OSError) as exc:
            print(f"P3 autonomous companion smoke FAILED: poll: {exc}")
            return 1
        job_status = str(terminal.get("status") or "")
    else:
        print(f"EMPERY_SMOKE_SERVICE={service_name} — skipping enqueue")

    print("Asserting filesystem / factory / desktop gates")
    capsule_ok, capsule_notes = _companion_capsule_ok(service_name)
    for n in capsule_notes:
        print(f"  {n}")

    print("Asserting live gates")
    live_ok, live_notes = _live_gates(service_name, warnings)
    for n in live_notes:
        print(f"  {n}")
    for w in warnings:
        print(f"  WARN: {w}")

    gates_ok = capsule_ok and live_ok
    strict_job_ok = job_status == "completed" if job_status else True
    lenient_job_ok = job_status in {"completed", "failed"} if job_status else True

    if ALLOW_POSTHOC:
        job_ok = lenient_job_ok
        job_mode = "lenient (EMPERY_SMOKE_ALLOW_POSTHOC=1)"
    else:
        job_ok = strict_job_ok
        job_mode = "strict (job must be completed)"

    if gates_ok and job_ok:
        print("P3 autonomous companion smoke PASSED")
        print(f"  service={service_name} job_status={job_status or 'skipped'} mode={job_mode}")
        return 0

    print("P3 autonomous companion smoke FAILED")
    if not gates_ok:
        print("  deterministic/live gates did not pass")
    if job_status and not job_ok:
        print(
            f"  job status={job_status!r} — required completed ({job_mode})"
        )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
