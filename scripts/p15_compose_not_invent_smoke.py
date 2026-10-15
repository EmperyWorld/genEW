#!/usr/bin/env python3
"""P15 compose-not-invent — negative live gate.

Proves product companion enqueue with ``eic_skip_mechanical_extract`` fails closed:
  - job status == failed
  - error mentions forbid_scratch / EIC_FORBID_SCRATCH

Also runs unit-level forbid_scratch empty-roots check via pytest when available.

Usage (stack up, Autonomous Mode on):
  python3 scripts/p15_compose_not_invent_smoke.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / ".cursor" / "orchestration" / "reports" / "p15_compose_not_invent.md"

EIC_BASE = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
POLL_TIMEOUT_S = float(os.environ.get("EMPERY_SMOKE_POLL_TIMEOUT_S", str(20 * 60)))
POLL_INTERVAL_S = float(os.environ.get("EMPERY_SMOKE_POLL_INTERVAL_S", "10"))

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
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            body_json = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body_json = {"message": raw}
        return exc.code, body_json


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


def _ensure_autonomous(errors: list[str]) -> None:
    try:
        code, _ = _get(f"{EIC_BASE}/api/v1/health", timeout=15)
        if code != 200:
            errors.append(f"EIC health HTTP {code}")
            return
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        errors.append(f"EIC health unreachable: {exc}")
        return
    try:
        code, raw = _get(f"{EIC_BASE}/api/v1/autonomous/mode", timeout=15)
        if code != 200:
            errors.append(f"Autonomous mode GET HTTP {code}")
            return
        mode = json.loads(raw)
        if mode.get("enabled"):
            return
        put_code, put_body = _put_json(
            f"{EIC_BASE}/api/v1/autonomous/mode",
            {"enabled": True},
        )
        if put_code != 200 or not put_body.get("enabled"):
            errors.append(f"Autonomous enable failed: {put_body}")
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        errors.append(f"Autonomous mode probe failed: {exc}")


def _poll_job(job_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + POLL_TIMEOUT_S
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        code, raw = _get(f"{EIC_BASE}/api/v1/autonomous/jobs/{job_id}", timeout=60)
        if code != 200:
            raise RuntimeError(f"job poll HTTP {code}: {raw}")
        last = json.loads(raw).get("job") or {}
        status = str(last.get("status") or "")
        print(f"  job {job_id} status={status} stage={last.get('stage')}", flush=True)
        if status in TERMINAL_STATUSES:
            return last
        time.sleep(POLL_INTERVAL_S)
    raise TimeoutError(
        f"job {job_id} did not reach terminal state within {POLL_TIMEOUT_S}s"
    )


def _job_error_blob(job: dict[str, Any]) -> str:
    meta = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    parts = [
        str(job.get("error") or ""),
        str(job.get("error_message") or ""),
        str(job.get("result_summary") or ""),
        str(meta.get("forbid_scratch_when_recipe") or ""),
        str(meta.get("error_code") or ""),
        str(meta.get("last_error") or ""),
        json.dumps(meta, default=str)[:2000],
    ]
    return " ".join(parts).lower()


def _write_report(*, ok: bool, notes: list[str], service: str, job_id: str) -> None:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).isoformat()
    verdict = "PASSED" if ok else "FAILED"
    lines = [
        "# P15 compose not invent",
        "",
        f"Date: {ts}",
        f"EIC: `{EIC_BASE}`",
        f"Service: `{service}`",
        f"Job: `{job_id or 'n/a'}`",
        f"Verdict: **{verdict}**",
        "",
        "## Evidence",
        "",
    ]
    lines.extend(f"- {n}" for n in notes)
    lines.extend(
        [
            "",
            "## Gate",
            "",
            "- Product pack match + skipped/failed extract → `EIC_FORBID_SCRATCH`",
            "- Productish intent + `scaffold_profile=generic` without "
            "`allow_generic` → `EIC_ASSEMBLY_GENERIC`",
            "- Empty `extract_roots` for product packs → hard refuse",
            "",
            "## Notes",
            "",
            "- Production path only; `eic_skip_mechanical_extract` is smoke-only "
            "(default off).",
            "",
        ]
    )
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    notes: list[str] = []
    ok = True
    print("P15 compose-not-invent smoke", flush=True)

    # Unit gate (host) — empty extract_roots + productish helper
    unit = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "services/empery_intelligence_core/tests/test_p1_atom_extract.py::test_forbid_scratch_empty_extract_roots",
            "services/empery_intelligence_core/tests/test_p1_atom_extract.py::test_forbid_scratch_stats",
            "services/empery_intelligence_core/tests/test_p1_atom_extract.py::test_intent_looks_productish",
            "-q",
            "--tb=line",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if unit.returncode == 0:
        notes.append("unit forbid_scratch + productish: ok")
        print("  unit: ok", flush=True)
    else:
        ok = False
        notes.append(f"unit FAILED rc={unit.returncode}")
        print(unit.stdout[-800:], flush=True)
        print(unit.stderr[-800:], flush=True)

    errors: list[str] = []
    _ensure_autonomous(errors)
    if errors:
        ok = False
        notes.extend(errors)
        _write_report(ok=False, notes=notes, service="", job_id="")
        print("P15 FAILED (preflight)", flush=True)
        return 1
    notes.append("EIC health + autonomous: ok")

    suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    service = f"p15_refuse_{suffix}"
    print(f"Step 1: enqueue companion with eic_skip_mechanical_extract service={service}")
    code, body = _post_json(
        f"{EIC_BASE}/api/v1/autonomous/intentions",
        {
            "intention": (
                f"Create companion chat service {service} with Nervas and identity"
            ),
            "service_name": service,
            "features": ["health", "companion_chat"],
            "metadata": {
                "scaffold_profile": "companion_chat",
                "eic_skip_mechanical_extract": True,
            },
        },
        timeout=60.0,
    )
    if code not in (200, 201):
        ok = False
        notes.append(f"enqueue FAILED HTTP {code}: {body}")
        _write_report(ok=False, notes=notes, service=service, job_id="")
        print(f"P15 FAILED enqueue HTTP {code}", flush=True)
        return 1
    job_id = str(
        (body.get("job") or {}).get("id")
        or body.get("job_id")
        or (body.get("intention") or {}).get("job_id")
        or ""
    )
    if not job_id:
        # Some responses nest differently
        job_id = str(body.get("id") or "")
    notes.append(f"enqueue HTTP {code} job_id={job_id or 'missing'}")
    if not job_id:
        ok = False
        notes.append("enqueue missing job_id")
        _write_report(ok=False, notes=notes, service=service, job_id="")
        return 1

    print(f"Step 2: poll until failed (expect EIC_FORBID_SCRATCH) job={job_id}")
    try:
        job = _poll_job(job_id)
    except (TimeoutError, RuntimeError, urllib.error.URLError, OSError) as exc:
        ok = False
        notes.append(f"poll FAILED: {exc}")
        _write_report(ok=False, notes=notes, service=service, job_id=job_id)
        print(f"P15 FAILED poll: {exc}", flush=True)
        return 1

    status = str(job.get("status") or "")
    blob = _job_error_blob(job)
    notes.append(f"terminal status={status}")
    if status != "failed":
        ok = False
        notes.append(f"expected failed, got {status}")
    else:
        notes.append("job failed as required: ok")

    markers = (
        "forbid_scratch",
        "eic_forbid_scratch",
        "extract_adapt did not run",
        "compose from atoms",
    )
    if any(m in blob for m in markers):
        notes.append("error mentions forbid_scratch / extract gate: ok")
    else:
        ok = False
        notes.append(f"error blob missing forbid_scratch markers: {blob[:400]!r}")

    # Step 3: productish + forced generic profile → EIC_ASSEMBLY_GENERIC
    service_g = f"p15_generic_{suffix}"
    print(
        f"Step 3: enqueue companion intent with scaffold_profile=generic "
        f"service={service_g}",
        flush=True,
    )
    code, body = _post_json(
        f"{EIC_BASE}/api/v1/autonomous/intentions",
        {
            "intention": (
                f"Create companion chat service {service_g} with Nervas and identity"
            ),
            "service_name": service_g,
            "features": ["health", "companion_chat"],
            "metadata": {
                "scaffold_profile": "generic",
                # do NOT set allow_generic
            },
        },
        timeout=60.0,
    )
    if code not in (200, 201):
        ok = False
        notes.append(f"generic enqueue FAILED HTTP {code}: {body}")
    else:
        job_g = str(
            (body.get("job") or {}).get("id")
            or body.get("job_id")
            or ""
        )
        notes.append(f"generic enqueue job_id={job_g or 'missing'}")
        if not job_g:
            ok = False
            notes.append("generic enqueue missing job_id")
        else:
            print(
                f"Step 4: poll until failed (expect EIC_ASSEMBLY_GENERIC) job={job_g}",
                flush=True,
            )
            try:
                job2 = _poll_job(job_g)
            except (TimeoutError, RuntimeError, urllib.error.URLError, OSError) as exc:
                ok = False
                notes.append(f"generic poll FAILED: {exc}")
                job2 = {}
            status2 = str(job2.get("status") or "")
            blob2 = _job_error_blob(job2)
            notes.append(f"generic terminal status={status2}")
            if status2 != "failed":
                ok = False
                notes.append(f"generic expected failed, got {status2}")
            else:
                notes.append("generic job failed as required: ok")
            g_markers = (
                "assembly_generic",
                "eic_assembly_generic",
                "scaffold_profile=generic",
            )
            if any(m in blob2 for m in g_markers):
                notes.append("error mentions assembly_generic refuse: ok")
            else:
                ok = False
                notes.append(
                    f"error blob missing assembly_generic markers: {blob2[:400]!r}"
                )

    _write_report(ok=ok, notes=notes, service=service, job_id=job_id)
    if ok:
        print(f"P15 PASSED — report: {REPORT}", flush=True)
        return 0
    print(f"P15 FAILED — report: {REPORT}", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
