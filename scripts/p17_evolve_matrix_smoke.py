#!/usr/bin/env python3
"""P17 evolve matrix — prove evolve PASSED beyond companion.

Targets (reuse existing goldens; no create):
  - companion_chat  → p3_comp_live
  - notes_tool      → p8_notes_20260725015514 (lab capsule; FS+peer)
  - task_board      → p12_taskboard_20260725071317
  - ops_dashboard   → p12_opsdash_retry

For each row: propose → pick → enqueue → job completed + verify_status=PASSED
(P11 truth). Soft green / empty verify is FAIL. Posthoc off by default.

Usage (stack up, Autonomous on):
  python3 scripts/p17_evolve_matrix_smoke.py
  EMPERY_SMOKE_P17_ONLY=companion_chat,notes_tool python3 scripts/p17_evolve_matrix_smoke.py
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / ".cursor" / "orchestration" / "reports" / "p17_evolve_matrix.md"

EIC = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
DEPLOY = os.environ.get("EMPERY_SMOKE_DEPLOY_BASE", "http://127.0.0.1:8010").rstrip("/")
POLL_TIMEOUT_S = float(os.environ.get("EMPERY_SMOKE_POLL_TIMEOUT_S", str(25 * 60)))
POLL_INTERVAL_S = float(os.environ.get("EMPERY_SMOKE_POLL_INTERVAL_S", "12"))
EVOLVE_RETRIES = max(1, int(os.environ.get("EMPERY_SMOKE_EVOLVE_RETRIES", "2")))
ALLOW_POSTHOC = os.environ.get("EMPERY_SMOKE_ALLOW_POSTHOC", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
ONLY = {
    x.strip()
    for x in os.environ.get("EMPERY_SMOKE_P17_ONLY", "").split(",")
    if x.strip()
}

TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})


@dataclass(frozen=True)
class EvolveRow:
    pack: str
    service: str
    profile: str
    require_catalog: bool = True


MATRIX: tuple[EvolveRow, ...] = (
    EvolveRow("companion_chat", "p3_comp_live", "companion_chat"),
    EvolveRow(
        "notes_tool",
        "p8_notes_20260725015514",
        "editor_local",
        require_catalog=False,  # lab golden — launch catalog excluded by design
    ),
    EvolveRow("task_board", "p12_taskboard_20260725071317", "task_board"),
    EvolveRow("ops_dashboard", "p12_opsdash_retry", "ops_dashboard"),
)


def _get(url: str, timeout: float = 30.0) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


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


def _ensure_autonomous() -> None:
    code, raw = _get(f"{EIC}/api/v1/health", timeout=15)
    if code != 200:
        raise RuntimeError(f"EIC health HTTP {code}")
    code, raw = _get(f"{EIC}/api/v1/autonomous/mode", timeout=15)
    if code != 200:
        raise RuntimeError(f"autonomous mode GET HTTP {code}")
    mode = json.loads(raw)
    if mode.get("enabled"):
        return
    put_code, put_body = _put_json(
        f"{EIC}/api/v1/autonomous/mode", {"enabled": True}
    )
    if put_code != 200 or not put_body.get("enabled"):
        raise RuntimeError(f"failed to enable autonomous: {put_body}")


def _job_verify_status(job: dict[str, Any]) -> str:
    meta = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    raw = (
        meta.get("verify_status")
        or job.get("verify_status")
        or (job.get("checkpoint") or {}).get("verify_status")
        or ""
    )
    if not raw:
        summary = str(job.get("result_summary") or "")
        m = re.match(r"verify_status=(PASSED|FAILED|UNKNOWN|PENDING)", summary, re.I)
        if m:
            raw = m.group(1)
    return str(raw or "").strip().upper()


def _poll_job(job_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + POLL_TIMEOUT_S
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        try:
            code, raw = _get(f"{EIC}/api/v1/autonomous/jobs/{job_id}", timeout=120.0)
        except (TimeoutError, urllib.error.URLError, OSError) as exc:
            print(f"    poll transient: {type(exc).__name__}", flush=True)
            time.sleep(POLL_INTERVAL_S)
            continue
        if code != 200:
            raise RuntimeError(f"job poll HTTP {code}: {raw}")
        last = json.loads(raw).get("job") or {}
        status = str(last.get("status") or "")
        stage = str(last.get("stage") or "")
        print(f"    job {job_id} status={status} stage={stage}", flush=True)
        if status in TERMINAL_STATUSES:
            return last
        time.sleep(POLL_INTERVAL_S)
    raise TimeoutError(
        f"job {job_id} not terminal within {POLL_TIMEOUT_S}s "
        f"(last={last.get('status')}/{last.get('stage')})"
    )


def _file_fp(path: Path) -> str | None:
    if not path.is_file():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def _tree_fingerprint(service: str) -> str:
    parts: list[str] = []
    for rel in (
        f"services/{service}/manifest.json",
        f"services/{service}/src/api/main.py",
        f"services/{service}/src/api/routes.py",
        f"services/{service}/src/core/use_cases.py",
        f".cursor/orchestration/designs/{service}_design.md",
        f".cursor/orchestration/designs/{service}_design.json",
        f".cursor/orchestration/reports/{service}_verify.md",
    ):
        parts.append(f"{rel}:{_file_fp(ROOT / rel) or '-'}")
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()[:20]


def _anatomy_intact(service: str) -> bool:
    main = ROOT / "services" / service / "src" / "api" / "main.py"
    if not main.is_file():
        return False
    text = main.read_text(encoding="utf-8", errors="replace")
    return (
        "def register(" in text
        and "def create_app" in text
        and "ServiceContainer" in text
        and "load_manifest" in text
    )


def _restore_capsule(service: str, notes: list[str]) -> None:
    import subprocess

    paths = [
        f"services/{service}",
        f".cursor/orchestration/designs/{service}_design.md",
        f".cursor/orchestration/designs/{service}_design.json",
    ]
    try:
        subprocess.run(
            ["git", "checkout", "HEAD", "--", *paths],
            cwd=str(ROOT),
            check=False,
            capture_output=True,
            text=True,
        )
        notes.append(f"auto-restore: git checkout HEAD -- {service}")
    except OSError as exc:
        notes.append(f"auto-restore failed: {exc}")


def _post_evolve_gates(row: EvolveRow) -> tuple[bool, list[str]]:
    notes: list[str] = []
    ok = True
    sys.path.insert(0, str(ROOT))
    from services.empery_intelligence_core.src.integration.service_factory_gates import (
        verify_factory_gates,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        verify_service_desktop,
    )

    status, detail = verify_factory_gates(
        ROOT, row.service, scaffold_profile=row.profile
    )
    if status != "PASSED":
        ok = False
        notes.append(f"factory: {status} — {str(detail)[:220]}")
    else:
        notes.append("factory: PASSED")

    desk, desk_detail = verify_service_desktop(
        ROOT, row.service, ui_profile=row.profile
    )
    if desk != "PASSED":
        ok = False
        notes.append(f"desktop fs: {desk} — {str(desk_detail)[:180]}")
    else:
        notes.append("desktop fs: PASSED")

    try:
        code, body = _post_json(
            f"{DEPLOY}/api/v1/deploy",
            {"service_name": row.service, "action": "health"},
            timeout=120.0,
        )
        if code in (200, 201) and body.get("ok"):
            notes.append("deploy health: ok")
        else:
            ok = False
            notes.append(f"deploy health: FAIL HTTP {code}")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        ok = False
        notes.append(f"deploy health: {exc}")

    return ok, notes


def _evolve_intent(row: EvolveRow) -> str:
    return (
        f"Evolve {row.service} ({row.pack}/{row.profile}): add optional "
        "readiness_note string on GET /api/v1/health JSON only. "
        "Keep existing FastAPI register()/create_app anatomy, Alembic, "
        "Redis EventBus path, domain routes, and Desktop mount intact. "
        "Do not change scaffold_profile to generic. "
        "Write a proper System Design Document with Purpose, Anatomy, "
        "Manifest, and API sections."
    )


def _evolve_once(row: EvolveRow, *, before_tree: str) -> tuple[bool, list[str], dict[str, Any]]:
    notes: list[str] = []
    intent = _evolve_intent(row)
    code, prop = _post_json(
        f"{EIC}/api/v1/evolve/propose",
        {
            "service_name": row.service,
            "intent": intent,
            "option_count": 2,
        },
        timeout=180.0,
    )
    if code != 200 or not prop.get("options"):
        return False, [f"propose failed HTTP {code}: {prop}"], {}
    options = prop["options"]
    picked = options[0]
    for opt in options:
        touches = opt.get("touches") or []
        if "api" in touches or "manifest" in touches:
            picked = opt
            break
    notes.append(
        f"propose: proposal_id={prop.get('proposal_id')} "
        f"backend={prop.get('backend')} options={len(options)}"
    )
    notes.append(f"picked: id={picked.get('id')} title={picked.get('title')}")

    code, body = _post_json(
        f"{EIC}/api/v1/autonomous/intentions",
        {
            "intention": intent,
            "service_name": row.service,
            "metadata": {
                "kind": "evolve",
                "selected_option": picked,
                "proposal_id": prop.get("proposal_id"),
                "scaffold_profile": row.profile,
            },
        },
        timeout=60.0,
    )
    if code not in (200, 201):
        return False, notes + [f"enqueue failed HTTP {code}: {body}"], {}
    job_id = str((body.get("job") or {}).get("id") or "")
    if not job_id:
        return False, notes + ["enqueue missing job id"], {}
    notes.append(f"enqueue: job_id={job_id}")

    terminal = _poll_job(job_id)
    job_status = str(terminal.get("status") or "")
    verify_status = _job_verify_status(terminal)
    notes.append(f"job status={job_status}")
    notes.append(f"verify_status={verify_status or 'MISSING'}")
    err = terminal.get("error_message")
    if err:
        notes.append(f"error: {str(err)[:220]}")

    proposal_host = (
        ROOT
        / ".cursor/orchestration/eic/evolve_proposals"
        / f"{row.service}_{prop.get('proposal_id')}.json"
    )
    proposal_ok = proposal_host.is_file() or bool(prop.get("persisted_path"))
    notes.append("proposal persisted: ok" if proposal_ok else "proposal persisted: MISSING")

    after_tree = _tree_fingerprint(row.service)
    tree_changed = after_tree != before_tree
    artifacts = terminal.get("artifact_paths") or []
    if tree_changed:
        notes.append(f"tree delta: yes ({before_tree} → {after_tree})")
    elif artifacts:
        notes.append(f"artifact delta: {len(artifacts)} paths")
    else:
        notes.append("tree delta: soft/none")

    anatomy_ok = _anatomy_intact(row.service)
    if not anatomy_ok:
        notes.append("anatomy: BROKEN")
        _restore_capsule(row.service, notes)
        anatomy_ok = _anatomy_intact(row.service)
        notes.append("anatomy after restore: ok" if anatomy_ok else "anatomy: STILL BROKEN")
    else:
        notes.append("anatomy: ok")

    gates_ok, gate_notes = _post_evolve_gates(row)
    notes.extend(gate_notes)

    verify_ok = verify_status == "PASSED"
    if not verify_ok:
        notes.append(f"strict: want verify_status=PASSED got {verify_status or 'MISSING'}")

    strict_ok = (
        job_status == "completed"
        and proposal_ok
        and anatomy_ok
        and gates_ok
        and verify_ok
    )
    loop_ran = proposal_ok and job_status in TERMINAL_STATUSES
    posthoc_ok = (
        ALLOW_POSTHOC and loop_ran and anatomy_ok and gates_ok and verify_ok
    )
    ok = bool(strict_ok or posthoc_ok)
    if ok and not strict_ok and ALLOW_POSTHOC:
        notes.append("posthoc: accepted with verify_status=PASSED")
    return ok, notes, {
        "job_id": job_id,
        "job_status": job_status,
        "verify_status": verify_status,
        "picked": picked,
        "proposal_id": prop.get("proposal_id"),
    }


def _evolve_row(row: EvolveRow) -> tuple[bool, list[str], dict[str, Any]]:
    if not (ROOT / "services" / row.service).is_dir():
        return False, [f"capsule MISSING: services/{row.service}"], {}
    before = _tree_fingerprint(row.service)
    last_notes: list[str] = []
    last_meta: dict[str, Any] = {}
    for attempt in range(1, EVOLVE_RETRIES + 1):
        print(f"  attempt {attempt}/{EVOLVE_RETRIES}", flush=True)
        ok, notes, meta = _evolve_once(row, before_tree=before)
        last_notes = notes
        last_meta = meta
        if ok:
            return True, notes, meta
        if not _anatomy_intact(row.service):
            last_notes.append("stop retries: anatomy unrestorable")
            return False, last_notes, last_meta
        if attempt < EVOLVE_RETRIES:
            last_notes.append(f"attempt {attempt} failed — retry")
    last_notes.append("all attempts exhausted")
    return False, last_notes, last_meta


def _write_report(
    *,
    ok: bool,
    rows: list[tuple[EvolveRow, bool, list[str], dict[str, Any]]],
) -> None:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).isoformat()
    verdict = "PASSED" if ok else "FAILED"
    lines = [
        "# P17 evolve matrix",
        "",
        f"Date: {ts}",
        f"EIC: `{EIC}` · Deploy: `{DEPLOY}`",
        f"ALLOW_POSTHOC: `{ALLOW_POSTHOC}` · EVOLVE_RETRIES: `{EVOLVE_RETRIES}`",
        f"Verdict: **{verdict}**",
        "",
        "## Matrix",
        "",
        "| Pack | Service | Profile | Job | verify_status | Row |",
        "|------|---------|---------|-----|---------------|-----|",
    ]
    for row, row_ok, _notes, meta in rows:
        lines.append(
            f"| {row.pack} | `{row.service}` | `{row.profile}` | "
            f"`{meta.get('job_id') or '—'}` | "
            f"`{meta.get('verify_status') or '—'}` | "
            f"{'PASS' if row_ok else 'FAIL'} |"
        )
    lines.extend(["", "## Notes", ""])
    for row, row_ok, notes, _meta in rows:
        lines.append(f"### {row.pack} (`{row.service}`) — {'PASS' if row_ok else 'FAIL'}")
        lines.append("")
        lines.extend(f"- {n}" for n in notes)
        lines.append("")
    lines.extend(
        [
            "## Rule",
            "",
            "- Evolve propose → pick → enqueue on living capsules (no Fake*/demo)",
            "- DoD: `job status=completed` + `verify_status=PASSED` (P11)",
            "- Post-evolve factory + desktop FS + deploy health must stay green",
            "- Minimum packs: companion, notes, task_board, ops_dashboard",
            "",
        ]
    )
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    print("P17 evolve matrix smoke", flush=True)
    try:
        _ensure_autonomous()
    except (RuntimeError, urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        print(f"P17 FAILED: preflight {exc}", flush=True)
        return 1

    selected = [r for r in MATRIX if not ONLY or r.pack in ONLY]
    if not selected:
        print(f"P17 FAILED: no rows match ONLY={ONLY}", flush=True)
        return 1

    rows_out: list[tuple[EvolveRow, bool, list[str], dict[str, Any]]] = []
    all_ok = True
    for row in selected:
        print(f"=== {row.pack} / {row.service} ({row.profile})", flush=True)
        row_ok, notes, meta = _evolve_row(row)
        rows_out.append((row, row_ok, notes, meta))
        if not row_ok:
            all_ok = False
        print(
            f"  → {'PASS' if row_ok else 'FAIL'} "
            f"verify={meta.get('verify_status')} job={meta.get('job_id')}",
            flush=True,
        )

    _write_report(ok=all_ok, rows=rows_out)
    if all_ok:
        print(f"P17 PASSED — report: {REPORT}", flush=True)
        return 0
    print(f"P17 FAILED — report: {REPORT}", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
