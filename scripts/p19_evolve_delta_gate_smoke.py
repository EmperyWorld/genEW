#!/usr/bin/env python3
"""P19 evolve-delta gate smoke — prove UI evolve cannot fake-green.

Offline (always):
  1. UI-surface intent + atom dump only → verify_evolve_delta FAILED
  2. mount write + atom wired → PASSED
  3. auto-wire is import-only (no bare <Atom /> JSX)

Optional live (EMPERY_SMOKE_LIVE=1): enqueue marketing_cabinet JTBD evolve and
assert terminal verify is FAIL-closed without mount delta OR PASSED with mount change.

Usage:
  python3 scripts/p19_evolve_delta_gate_smoke.py
  EMPERY_SMOKE_LIVE=1 python3 scripts/p19_evolve_delta_gate_smoke.py
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / ".cursor" / "orchestration" / "reports" / "p19_evolve_delta_gate.md"

EIC = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
LIVE = os.environ.get("EMPERY_SMOKE_LIVE", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
# Live evolve target — must be an existing capsule (no invent). Default historical golden.
LIVE_SERVICE = os.environ.get(
    "EMPERY_SMOKE_SERVICE", "marketing_cabinet"
).strip() or "marketing_cabinet"
POLL_TIMEOUT_S = float(os.environ.get("EMPERY_SMOKE_POLL_TIMEOUT_S", str(25 * 60)))
POLL_INTERVAL_S = float(os.environ.get("EMPERY_SMOKE_POLL_INTERVAL_S", "12"))
TERMINAL = frozenset({"completed", "failed", "cancelled"})

sys.path.insert(0, str(ROOT))


def _get(url: str, timeout: float = 30.0) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def _post_json(url: str, payload: dict[str, Any], timeout: float = 60.0) -> tuple[int, dict]:
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
            return exc.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return exc.code, {"message": raw}


def _put_json(url: str, payload: dict[str, Any], timeout: float = 30.0) -> tuple[int, dict]:
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


def _offline_cases() -> list[str]:
    from services.empery_intelligence_core.src.integration.evolve_delta_gate import (
        accumulate_evolve_written_paths,
        snapshot_evolve_baseline,
        verify_evolve_delta,
    )
    from services.empery_intelligence_core.src.integration.extract_wire import (
        try_wire_single_presentational_atom,
    )

    notes: list[str] = []
    service = "marketing_cabinet"
    intent = "Добавить JTBD вкладку и улучшить UI"

    with tempfile.TemporaryDirectory(prefix="p19_delta_") as td:
        root = Path(td)
        mount = (
            root
            / "apps"
            / "empery_desktop"
            / "src"
            / "shell"
            / "mounts"
            / f"{service}.tsx"
        )
        mount.parent.mkdir(parents=True)
        mount.write_text("// baseline mount\nexport function M(){return null}\n")
        atoms = root / "apps" / "empery_desktop" / "atoms" / service
        atoms.mkdir(parents=True)
        (atoms / "ReportCardBody.tsx").write_text(
            "export function ReportCardBody(){return null}\n"
        )

        meta = snapshot_evolve_baseline(root, service, {})
        meta = accumulate_evolve_written_paths(
            meta,
            [f"apps/empery_desktop/atoms/{service}/ReportCardBody.tsx"],
        )
        st, detail = verify_evolve_delta(
            root,
            service,
            intent=intent,
            metadata=meta,
            touch_gates={"factory": True, "ui": True, "desktop": True},
        )
        if st != "FAILED":
            raise AssertionError(f"atom-dump-only expected FAILED, got {st}: {detail}")
        notes.append(f"FAIL-closed atom dump only → {st} ({detail[:120]})")

        meta2 = snapshot_evolve_baseline(root, service, {})
        mount.write_text(
            'import { ReportCardBody } from "../../../atoms/marketing_cabinet/ReportCardBody";\n'
            'export function M(){ return <ReportCardBody topic="x" />; }\n'
        )
        meta2 = accumulate_evolve_written_paths(
            meta2,
            [
                f"apps/empery_desktop/src/shell/mounts/{service}.tsx",
                f"apps/empery_desktop/atoms/{service}/ReportCardBody.tsx",
            ],
        )
        st2, detail2 = verify_evolve_delta(
            root,
            service,
            intent=intent,
            metadata=meta2,
            touch_gates={"ui": True, "desktop": True, "factory": False},
        )
        if st2 != "PASSED":
            raise AssertionError(f"wired mount expected PASSED, got {st2}: {detail2}")
        notes.append(f"PASS with mount+wire → {st2} ({detail2[:120]})")

        # Import-only auto-wire (no bare JSX).
        mount.write_text(
            'import { peerApiBase } from "@/api/peerBase";\n'
            "export function M(){ return null; }\n"
        )
        ok = try_wire_single_presentational_atom(
            root, service, f"apps/empery_desktop/atoms/{service}/ReportCardBody.tsx"
        )
        text = mount.read_text(encoding="utf-8")
        if not ok or "ReportCardBody" not in text:
            raise AssertionError("auto-wire did not add import")
        if "<ReportCardBody" in text:
            raise AssertionError("auto-wire must not emit bare <ReportCardBody JSX")
        if "eic:extract-wire:ReportCardBody" not in text:
            raise AssertionError("auto-wire missing wire marker comment")
        notes.append("auto-wire import-only (no bare JSX) OK")

    return notes


def _ensure_autonomous() -> None:
    code, _ = _get(f"{EIC}/api/v1/health", timeout=15)
    if code != 200:
        raise RuntimeError(f"EIC health HTTP {code}")
    code, raw = _get(f"{EIC}/api/v1/autonomous/mode", timeout=15)
    if code != 200:
        raise RuntimeError(f"autonomous mode GET HTTP {code}")
    mode = json.loads(raw)
    if mode.get("enabled"):
        return
    put_code, put_body = _put_json(f"{EIC}/api/v1/autonomous/mode", {"enabled": True})
    if put_code != 200 or not put_body.get("enabled"):
        raise RuntimeError(f"failed to enable autonomous: {put_body}")


def _mount_fp(service: str | None = None) -> str:
    name = service or LIVE_SERVICE
    p = ROOT / "apps/empery_desktop/src/shell/mounts" / f"{name}.tsx"
    if not p.is_file():
        return "-"
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


def _poll_job(job_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + POLL_TIMEOUT_S
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        code, raw = _get(f"{EIC}/api/v1/autonomous/jobs/{job_id}", timeout=120.0)
        if code != 200:
            raise RuntimeError(f"job poll HTTP {code}: {raw}")
        last = json.loads(raw).get("job") or {}
        status = str(last.get("status") or "")
        print(f"    job {job_id} status={status} stage={last.get('stage')}", flush=True)
        if status in TERMINAL:
            return last
        time.sleep(POLL_INTERVAL_S)
    raise TimeoutError(f"job {job_id} not terminal within {POLL_TIMEOUT_S}s")


def _job_verify(job: dict[str, Any]) -> str:
    meta = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    raw = (
        meta.get("verify_status")
        or job.get("verify_status")
        or (job.get("checkpoint") or {}).get("verify_status")
        or ""
    )
    return str(raw or "").strip().upper()


def _live_jtbd() -> list[str]:
    notes: list[str] = []
    service = LIVE_SERVICE
    capsule = ROOT / "services" / service / "manifest.json"
    if not capsule.is_file():
        raise RuntimeError(
            f"evolve requires existing capsule services/{service}/ "
            f"(set EMPERY_SMOKE_SERVICE); refuse invent"
        )
    _ensure_autonomous()
    before = _mount_fp(service)
    intent = (
        f"evolve {service}: добавить JTBD вкладку и улучшить Desktop UI "
        f"(видимое изменение mount)"
    )
    code, body = _post_json(
        f"{EIC}/api/v1/autonomous/intentions",
        {
            "intention": intent,
            "service_name": service,
            "metadata": {
                "kind": "evolve",
                "selected_option": {
                    "id": "p19_jtbd_ui",
                    "title": "JTBD tab + Desktop UI",
                    "delta_summary": f"Add JTBD surface and refresh {service} mount",
                    "risk": "medium",
                    "touches": ["ui", "desktop", "factory"],
                },
            },
        },
        timeout=60.0,
    )
    if code >= 300:
        raise RuntimeError(f"enqueue HTTP {code}: {body}")
    job_id = str((body.get("job") or {}).get("id") or "")
    if not job_id:
        raise RuntimeError(f"no job id: {body}")
    notes.append(
        f"service={service} enqueued job_id={job_id} mount_fp_before={before}"
    )
    job = _poll_job(job_id)
    after = _mount_fp(service)
    verify = _job_verify(job)
    status = str(job.get("status") or "")
    notes.append(
        f"terminal status={status} verify={verify or 'MISSING'} "
        f"mount_fp_after={after} mount_changed={before != after}"
    )
    err = str(job.get("error_message") or "")[:240]
    if err:
        notes.append(f"error: {err}")
    # Fake-green is the only hard fail: PASSED without mount/ECC delivery.
    if verify == "PASSED" and before == after:
        raise AssertionError(
            "fake-green: verify PASSED but Desktop mount fingerprint unchanged"
        )
    # Fail-closed paths: FAILED verify, or job failed before verify with no mount delta.
    if verify == "PASSED":
        notes.append("live JTBD evolve PASSED with mount delta")
        return notes
    if verify == "FAILED" or (
        status == "failed"
        and before == after
        and verify in {"", "PENDING", "UNKNOWN", "MISSING"}
    ):
        notes.append("live JTBD evolve fail-closed (no fake-green)")
        return notes
    raise AssertionError(
        f"unexpected terminal status={status!r} verify={verify!r}"
    )

def _write_report(offline: list[str], live: list[str] | None, ok: bool) -> None:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    # Preserve prior live section when offline-only re-run.
    prior_live: list[str] = []
    if live is None and REPORT.is_file():
        text = REPORT.read_text(encoding="utf-8")
        if "## Live JTBD evolve" in text:
            chunk = text.split("## Live JTBD evolve", 1)[1]
            chunk = chunk.split("## Gates proven", 1)[0]
            prior_live = [
                ln[2:].strip()
                for ln in chunk.splitlines()
                if ln.startswith("- ")
            ]
    live_lines = live if live is not None else (prior_live or None)
    lines = [
        "# P19 evolve-delta gate smoke",
        "",
        f"- Date: {datetime.now(timezone.utc).isoformat()}",
        f"- Verdict: {'PASS' if ok else 'FAIL'}",
        f"- Live: {'ran' if live is not None else ('preserved' if prior_live else 'skipped (set EMPERY_SMOKE_LIVE=1)')}",
        "",
        "## Offline",
        "",
    ]
    for n in offline:
        lines.append(f"- {n}")
    if live_lines:
        lines.extend(["", "## Live JTBD evolve", ""])
        for n in live_lines:
            lines.append(f"- {n}")
    lines.extend(
        [
            "",
            "## Gates proven",
            "",
            "- UI evolve without mount/ECC write → FAILED",
            "- Mount write + wired atom → PASSED",
            "- Auto-wire is import-only (no invalid bare JSX)",
            "",
        ]
    )
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    print("P19 evolve-delta gate smoke", flush=True)
    try:
        offline = _offline_cases()
        for n in offline:
            print(f"  OK {n}", flush=True)
        live: list[str] | None = None
        if LIVE:
            print(
                f"EMPERY_SMOKE_LIVE=1 — JTBD evolve on {LIVE_SERVICE}",
                flush=True,
            )
            live = _live_jtbd()
            for n in live:
                print(f"  OK {n}", flush=True)
        _write_report(offline, live, ok=True)
        print(f"P19 PASSED — report: {REPORT}", flush=True)
        return 0
    except Exception as exc:  # noqa: BLE001 — smoke boundary
        _write_report([], None, ok=False)
        print(f"P19 FAILED: {exc}", flush=True)
        print(f"partial report: {REPORT}", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
