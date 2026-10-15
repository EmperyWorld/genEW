#!/usr/bin/env python3
"""C7 proof — Autonomous Create ops_dashboard under Configuration-Driven Gates T∧C.

Production path only (living EIC, Redis, real Nervas). Writes report:
  .cursor/orchestration/reports/assembly_config_driven_c7_proof.md

Usage:
  python3 scripts/assembly_config_driven_c7_proof.py

Reuse existing job:
  EMPERY_SMOKE_SERVICE=asm_c7_… python3 scripts/assembly_config_driven_c7_proof.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPORT = (
    ROOT
    / ".cursor"
    / "orchestration"
    / "reports"
    / "assembly_config_driven_c7_proof.md"
)

EIC = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
ECC_API = os.environ.get("EMPERY_SMOKE_ECC_API", "http://127.0.0.1:8006").rstrip("/")
POLL_TIMEOUT_S = float(os.environ.get("EMPERY_SMOKE_POLL_TIMEOUT_S", str(25 * 60)))
POLL_INTERVAL_S = float(os.environ.get("EMPERY_SMOKE_POLL_INTERVAL_S", "15"))
EXISTING = os.environ.get("EMPERY_SMOKE_SERVICE", "").strip()
TERMINAL = frozenset({"completed", "failed", "cancelled"})


def _post_json(
    url: str, payload: dict[str, Any], *, timeout: float = 60.0
) -> tuple[int, dict[str, Any]]:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data = {"raw": raw}
        return exc.code, data


def _get(url: str, timeout: float = 30.0) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode()


def _put_json(url: str, payload: dict[str, Any], *, timeout: float = 30.0) -> tuple[int, dict]:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="PUT",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data = {"raw": raw}
        return exc.code, data


def _job_verify_status(job: dict[str, Any]) -> str:
    meta = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    raw = meta.get("verify_status") or ""
    if not raw:
        summary = str(job.get("result_summary") or "")
        m = re.match(r"verify_status=(PASSED|FAILED|UNKNOWN|PENDING)", summary, re.I)
        if m:
            raw = m.group(1)
    return str(raw or "").strip().upper()


def _ensure_autonomous_on() -> None:
    try:
        code, raw = _get(f"{EIC}/api/v1/autonomous/mode", timeout=15)
        if code == 200:
            mode = (json.loads(raw).get("mode") or "").lower()
            if mode == "on":
                return
        _put_json(f"{EIC}/api/v1/autonomous/mode", {"mode": "on"}, timeout=15)
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        pass


def _poll_job(job_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + POLL_TIMEOUT_S
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        try:
            code, raw = _get(f"{EIC}/api/v1/autonomous/jobs/{job_id}", timeout=120.0)
        except (TimeoutError, urllib.error.URLError, OSError) as exc:
            print(f"  job poll transient: {type(exc).__name__}")
            time.sleep(POLL_INTERVAL_S)
            continue
        if code != 200:
            raise RuntimeError(f"job poll HTTP {code}: {raw}")
        last = json.loads(raw).get("job") or {}
        status = str(last.get("status") or "")
        stage = str(last.get("stage") or "")
        print(f"  job {job_id} status={status} stage={stage}")
        if status in TERMINAL:
            return last
        time.sleep(POLL_INTERVAL_S)
    raise TimeoutError(
        f"job {job_id} not terminal within {POLL_TIMEOUT_S}s "
        f"(last={last.get('status')} stage={last.get('stage')})"
    )


def _check_assembly_artifacts(service: str) -> tuple[bool, list[str]]:
    notes: list[str] = []
    ok = True
    sys.path.insert(0, str(ROOT))
    from core.assembly.gates import (
        verify_assembly_gate_c_full,
        verify_assembly_gate_t,
    )

    bp = ROOT / ".cursor" / "orchestration" / "designs" / f"{service}_blueprint.json"
    mf = (
        ROOT
        / ".cursor"
        / "orchestration"
        / "eic"
        / "assembly"
        / f"{service}_manifest.json"
    )
    runtime = ROOT / "services" / service / "assembly_runtime.json"
    freeze = ROOT / "services" / service / "assembly_freeze.json"
    mount = (
        ROOT / "apps" / "empery_desktop" / "src" / "shell" / "mounts" / f"{service}.tsx"
    )

    for label, path in (
        ("blueprint", bp),
        ("manifest", mf),
        ("assembly_runtime.json", runtime),
        ("assembly_freeze.json", freeze),
        ("desktop mount", mount),
    ):
        if path.is_file():
            notes.append(f"{label}: ok ({path.relative_to(ROOT)})")
        else:
            ok = False
            notes.append(f"{label}: MISSING")

    if mount.is_file():
        body = mount.read_text(encoding="utf-8")
        if "metricField(" in body or "data-assembly-data-source" in body:
            notes.append("DI binding (metricField / data_source attr): ok")
        else:
            ok = False
            notes.append("DI binding: MISSING metricField/data-assembly-data-source")
        if 'data-assembler-slot="widgets"' in body or "BaseCard" in body:
            notes.append("assembler slot / BaseCard: ok")
        else:
            notes.append("assembler slot: warn")

    t_status, t_detail = verify_assembly_gate_t(ROOT, service)
    notes.append(f"Gate T: {t_status} — {t_detail[:200]}")
    if t_status != "PASSED":
        ok = False

    c_status, c_detail = verify_assembly_gate_c_full(ROOT, service)
    notes.append(f"Gate C: {c_status} — {c_detail[:200]}")
    if c_status != "PASSED":
        ok = False

    # Peer metrics if port known from dynamic_health_bases or manifest
    port = None
    bases = (
        ROOT
        / ".cursor"
        / "orchestration"
        / "eic"
        / "dynamic_health_bases.json"
    )
    if bases.is_file():
        try:
            mapping = json.loads(bases.read_text(encoding="utf-8"))
            url = str(mapping.get(service) or "")
            if ":" in url.rsplit("/", 1)[-1] or url.count(":") >= 2:
                # http://host:port → use localhost + port on host
                from urllib.parse import urlparse

                parsed = urlparse(url)
                if parsed.port:
                    port = parsed.port
        except (json.JSONDecodeError, OSError):
            port = None
    man = ROOT / "services" / service / "manifest.json"
    if man.is_file() and port is None:
        try:
            data = json.loads(man.read_text(encoding="utf-8"))
            port = data.get("port") or (data.get("http") or {}).get("port")
        except json.JSONDecodeError:
            port = None
    if port:
        health_ok = False
        for path in ("/api/v1/health", "/health"):
            try:
                code, _ = _get(f"http://127.0.0.1:{port}{path}", timeout=10)
                notes.append(f"peer health :{port}{path}: HTTP {code}")
                if code == 200:
                    health_ok = True
                    break
            except Exception as exc:  # noqa: BLE001
                notes.append(f"peer health :{port}{path}: FAIL {exc}")
        if not health_ok:
            ok = False
        try:
            code, _ = _get(
                f"http://127.0.0.1:{port}/api/v1/metrics?limit=1", timeout=10
            )
            notes.append(f"peer metrics :{port}: HTTP {code}")
            if code != 200:
                ok = False
        except Exception as exc:  # noqa: BLE001
            ok = False
            notes.append(f"peer metrics :{port}: FAIL {exc}")

    # ECC OpenAPI mention (best-effort)
    try:
        code, raw = _get(f"{ECC_API}/openapi.json", timeout=30)
        if code == 200 and service.replace("_", "-") in raw or service in raw:
            notes.append("ECC OpenAPI mentions service: ok")
        else:
            notes.append(f"ECC OpenAPI mention: warn (HTTP {code})")
    except Exception as exc:  # noqa: BLE001
        notes.append(f"ECC OpenAPI: warn {exc}")

    return ok, notes


def _write_report(
    *,
    ok: bool,
    service: str,
    notes: list[str],
    job_id: str | None,
    verify_status: str,
) -> None:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Assembly config-driven C7 proof",
        "",
        f"- Date: {datetime.now(timezone.utc).isoformat()}",
        f"- Verdict: {'PASS' if ok else 'FAIL'}",
        f"- Service: `{service}`",
        f"- Job id: `{job_id or 'n/a'}`",
        f"- Job verify_status: `{verify_status or 'MISSING'}`",
        "",
        "## Notes",
        "",
    ]
    for n in notes:
        lines.append(f"- {n}")
    lines.append("")
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {REPORT.relative_to(ROOT)}")


def main() -> int:
    _ensure_autonomous_on()
    notes: list[str] = []
    suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    service = EXISTING or f"asm_c7_ops_{suffix}"
    enqueue = not bool(EXISTING)
    notes.append(f"service={service} enqueue={enqueue}")
    print(f"C7 create path service={service} enqueue={enqueue}")

    job: dict[str, Any] | None = None
    job_id: str | None = None
    verify_status = ""

    if enqueue:
        intent = (
            f"create_service {service} ops dashboard with metrics cards and charts "
            f"— Configuration-Driven Assembly: ops_dashboard recipe "
            f"(Blueprint+Manifest only; Assembler injects UI)"
        )
        code, body = _post_json(
            f"{EIC}/api/v1/autonomous/intentions",
            {
                "intention": intent,
                "service_name": service,
                "features": ["health", "ops_dashboard"],
                "metadata": {
                    "scaffold_profile": "ops_dashboard",
                    "recipe_packs": ["ops_dashboard"],
                    "assembly_mode": "config_driven",
                },
            },
            timeout=60.0,
        )
        if code != 201:
            print("FAILED enqueue", code, body)
            notes.append(f"enqueue FAILED HTTP {code}: {body}")
            _write_report(
                ok=False,
                service=service,
                notes=notes,
                job_id=None,
                verify_status="",
            )
            return 1
        job_id = str((body.get("job") or {}).get("id") or "")
        notes.append(f"enqueue job_id={job_id}")
        print(f"  polling job {job_id}")
        try:
            job = _poll_job(job_id)
        except (TimeoutError, RuntimeError, urllib.error.URLError, OSError) as exc:
            print(f"FAILED: poll {exc}")
            notes.append(f"poll: {exc}")
            _write_report(
                ok=False,
                service=service,
                notes=notes,
                job_id=job_id,
                verify_status="",
            )
            return 1
        status = str(job.get("status") or "")
        verify_status = _job_verify_status(job)
        notes.append(f"job status={status}")
        notes.append(f"verify_status={verify_status or 'MISSING'}")
        if status != "completed":
            print("FAILED: job not completed")
            _write_report(
                ok=False,
                service=service,
                notes=notes,
                job_id=job_id,
                verify_status=verify_status,
            )
            return 1
        if verify_status != "PASSED":
            print(f"FAILED: verify_status={verify_status or 'MISSING'}")
            _write_report(
                ok=False,
                service=service,
                notes=notes,
                job_id=job_id,
                verify_status=verify_status,
            )
            return 1
    else:
        notes.append("reuse existing service (no enqueue)")

    art_ok, art_notes = _check_assembly_artifacts(service)
    notes.extend(art_notes)
    ok = art_ok and (verify_status == "PASSED" or not enqueue)
    if enqueue and verify_status != "PASSED":
        ok = False

    _write_report(
        ok=ok,
        service=service,
        notes=notes,
        job_id=job_id,
        verify_status=verify_status or ("REUSE" if not enqueue else ""),
    )
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
