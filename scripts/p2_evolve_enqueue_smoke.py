#!/usr/bin/env python3
"""P2 evolve enqueue smoke — genesis not blocked; product evolve pick gate enforced.

Against live EIC (default :8007):
  1. create_service-style enqueue WITHOUT selected_option → 2xx (genesis not blocked)
  2. product evolve (metadata.kind=evolve) WITHOUT pick → 422 EIC_EVOLVE_PICK_REQUIRED
  3. evolve WITH selected_option OR evolve_skip_propose → 2xx enqueue

Does not wait for full job completion unless EMPERY_SMOKE_WAIT=1.

Usage (stack up, Autonomous Mode on):
  python3 scripts/p2_evolve_enqueue_smoke.py
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / ".cursor" / "orchestration" / "reports" / "p2_evolve_enqueue_smoke.md"

EIC_BASE = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
POLL_TIMEOUT_S = float(os.environ.get("EMPERY_SMOKE_POLL_TIMEOUT_S", str(20 * 60)))
POLL_INTERVAL_S = float(os.environ.get("EMPERY_SMOKE_POLL_INTERVAL_S", "15"))
WAIT_FOR_JOB = os.environ.get("EMPERY_SMOKE_WAIT", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

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


def _ensure_autonomous_mode(errors: list[str]) -> None:
    try:
        code, raw = _get(f"{EIC_BASE}/api/v1/health", timeout=15)
        if code != 200:
            errors.append(f"EIC health HTTP {code}")
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
            errors.append(f"Autonomous mode disabled and enable failed: {put_body}")
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        errors.append(f"Autonomous mode probe failed: {exc}")


def _enqueue(payload: dict) -> tuple[int, dict]:
    return _post_json(f"{EIC_BASE}/api/v1/autonomous/intentions", payload, timeout=60.0)


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


def _write_report(results: list[str]) -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines = [
        "# P2 evolve enqueue smoke",
        "",
        f"Date: {ts}",
        f"EIC: {EIC_BASE}",
        "",
        "## Verdict",
        "",
        "**PASS** — genesis enqueue succeeds without pick; product evolve requires pick.",
        "",
        "## Steps",
        "",
    ]
    lines.extend(f"- {row}" for row in results)
    lines.extend(["", "## Notes", "", "- Production path only; no FakeAI/demo stubs.", ""])
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    errors: list[str] = []
    results: list[str] = []
    suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    create_service = f"p2_smoke_create_{suffix}"
    evolve_target = f"p2_smoke_evolve_{suffix}"

    print("P2 evolve enqueue smoke — preflight")
    _ensure_autonomous_mode(errors)
    if errors:
        print("P2 evolve enqueue smoke FAILED (preflight):")
        for err in errors:
            print(f"  - {err}")
        return 1

    print("Step 1: create_service enqueue without selected_option")
    code, body = _enqueue(
        {
            "intention": (
                f"create_service {create_service} health probe verify genesis not blocked"
            ),
            "service_name": create_service,
            "features": ["health"],
        }
    )
    if code not in (200, 201):
        print(f"P2 evolve enqueue smoke FAILED: create_service HTTP {code}: {body}")
        return 1
    create_job_id = str((body.get("job") or {}).get("id") or "")
    results.append(f"create_service enqueue HTTP {code} job_id={create_job_id or 'n/a'}")
    print(f"  OK HTTP {code} job_id={create_job_id}")

    print("Step 2: product evolve without pick → expect 422 EIC_EVOLVE_PICK_REQUIRED")
    code, body = _enqueue(
        {
            "intention": f"evolve service {evolve_target}: improve API endpoints",
            "service_name": evolve_target,
            "metadata": {"kind": "evolve"},
        }
    )
    if code != 422:
        print(
            f"P2 evolve enqueue smoke FAILED: expected 422, got HTTP {code}: {body}"
        )
        return 1
    if body.get("error_code") != "EIC_EVOLVE_PICK_REQUIRED":
        print(
            "P2 evolve enqueue smoke FAILED: expected error_code "
            f"EIC_EVOLVE_PICK_REQUIRED, got {body.get('error_code')!r}: {body}"
        )
        return 1
    results.append("product evolve without pick → 422 EIC_EVOLVE_PICK_REQUIRED")
    print("  OK HTTP 422 EIC_EVOLVE_PICK_REQUIRED")

    print("Step 3: evolve with selected_option → expect 2xx enqueue")
    code, body = _enqueue(
        {
            "intention": f"evolve service {evolve_target}: improve API endpoints",
            "service_name": evolve_target,
            "metadata": {
                "kind": "evolve",
                "selected_option": {
                    "id": "opt-smoke-1",
                    "title": "Improve REST endpoints",
                    "touches": ["api"],
                },
            },
        }
    )
    if code not in (200, 201):
        print(f"P2 evolve enqueue smoke FAILED: evolve with pick HTTP {code}: {body}")
        return 1
    evolve_job_id = str((body.get("job") or {}).get("id") or "")
    results.append(f"evolve with selected_option HTTP {code} job_id={evolve_job_id or 'n/a'}")
    print(f"  OK HTTP {code} job_id={evolve_job_id}")

    if WAIT_FOR_JOB and evolve_job_id:
        print(f"EMPERY_SMOKE_WAIT=1 — polling evolve job {evolve_job_id}")
        before_fp = None
        design = (
            ROOT
            / ".cursor"
            / "orchestration"
            / "designs"
            / f"{evolve_target}_design.md"
        )
        if design.is_file():
            before_fp = hashlib.sha256(design.read_bytes()).hexdigest()[:16]
        try:
            terminal = _poll_job(evolve_job_id)
            results.append(f"evolve job terminal status={terminal.get('status')}")
        except (TimeoutError, RuntimeError, urllib.error.URLError, OSError) as exc:
            print(f"P2 evolve enqueue smoke FAILED: job wait: {exc}")
            return 1
        artifacts = terminal.get("artifact_paths") or []
        after_fp = None
        if design.is_file():
            after_fp = hashlib.sha256(design.read_bytes()).hexdigest()[:16]
        delta_ok = bool(artifacts) or (
            before_fp is not None and after_fp is not None and before_fp != after_fp
        ) or str(terminal.get("status") or "") == "completed"
        if not delta_ok:
            print(
                "P2 evolve enqueue smoke FAILED: EMPERY_SMOKE_WAIT assert — "
                "no artifact/tree delta after evolve job"
            )
            return 1
        results.append(
            f"evolve delta assert ok artifacts={len(artifacts)} "
            f"design_fp={before_fp}->{after_fp}"
        )

    _write_report(results)
    print(f"P2 evolve enqueue smoke PASSED — report: {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
