#!/usr/bin/env python3
"""P12.1 task_board golden smoke — pack match + extract + live Desktop/ECC.

Production path only (living EIC, real identity, Redis stack). No Fake*/demo.

Strict defaults:
  - Fresh create unless ``EMPERY_SMOKE_SERVICE`` is set
  - ``verify_status=PASSED`` required (P11)
  - Profile must be ``task_board`` (not generic)
  - ``extract_adapt`` evidence required (atoms / action stats)

Usage:
  python3 scripts/p12_task_board_golden_smoke.py

Reuse:
  EMPERY_SMOKE_SERVICE=p12_taskboard_… python3 scripts/p12_task_board_golden_smoke.py
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
    ROOT / ".cursor" / "orchestration" / "reports" / "p12_task_board_golden_smoke.md"
)
MATRIX = ROOT / ".cursor" / "orchestration" / "reports" / "p12_pack_matrix.md"

EIC = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
IDENTITY = os.environ.get(
    "EMPERY_SMOKE_IDENTITY_BASE", "http://127.0.0.1:8003"
).rstrip("/")
DEPLOY = os.environ.get("EMPERY_SMOKE_DEPLOY_BASE", "http://127.0.0.1:8010").rstrip("/")
SHELL = os.environ.get("EMPERY_SMOKE_SHELL_BASE", "http://127.0.0.1:8020").rstrip("/")
DESKTOP_UI = os.environ.get("EMPERY_SMOKE_DESKTOP_UI", "http://127.0.0.1:5174").rstrip(
    "/"
)

POLL_TIMEOUT_S = float(os.environ.get("EMPERY_SMOKE_POLL_TIMEOUT_S", str(25 * 60)))
POLL_INTERVAL_S = float(os.environ.get("EMPERY_SMOKE_POLL_INTERVAL_S", "15"))
EXISTING = os.environ.get("EMPERY_SMOKE_SERVICE", "").strip()
ALLOW_POSTHOC = os.environ.get("EMPERY_SMOKE_ALLOW_POSTHOC", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
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


def _ui_feature_dir(service_name: str) -> Path:
    kebab = service_name.replace("_", "-")
    return ROOT / "apps" / "empery_control_center" / "src" / "features" / kebab


def _check_assembly(service: str, job: dict[str, Any] | None) -> tuple[bool, list[str]]:
    notes: list[str] = []
    ok = True
    design_path = (
        ROOT / ".cursor" / "orchestration" / "designs" / f"{service}_design.json"
    )
    design: dict[str, Any] = {}
    if design_path.is_file():
        try:
            design = json.loads(design_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            design = {}

    meta = (job or {}).get("metadata") if isinstance((job or {}).get("metadata"), dict) else {}
    profile = str(
        meta.get("scaffold_profile")
        or meta.get("resolved_scaffold_profile")
        or design.get("scaffold_profile")
        or design.get("assembly_profile")
        or (design.get("assembly") or {}).get("scaffold_profile")
        or ""
    ).lower()
    packs_raw = (
        meta.get("recipe_packs")
        or design.get("recipe_packs")
        or (design.get("assembly") or {}).get("recipe_packs")
        or []
    )
    packs = [str(p).lower() for p in packs_raw] if isinstance(packs_raw, list) else []

    if profile == "generic":
        ok = False
        notes.append("scaffold_profile=generic — FAIL (want task_board)")
    elif profile and profile != "task_board":
        ok = False
        notes.append(f"scaffold_profile={profile} — FAIL (want task_board)")
    elif profile == "task_board":
        notes.append("scaffold_profile=task_board")
    else:
        # Infer from intent/design text
        blob = (
            design_path.read_text(encoding="utf-8") if design_path.is_file() else ""
        ).lower()
        if "task_board" in blob or "kanban" in blob:
            notes.append("scaffold_profile: inferred task_board from design text")
        else:
            ok = False
            notes.append("scaffold_profile: MISSING (want task_board)")

    if any("task_board" in p for p in packs):
        notes.append(f"recipe_packs ok: {packs}")
    else:
        notes.append(f"recipe_packs={packs or '(none)'} — will rely on extract FS")

    stats = meta.get("eic_action_stats") if isinstance(meta.get("eic_action_stats"), dict) else {}
    extract_n = max(
        int(stats.get("extract_adapt") or 0),
        int(meta.get("eic_extract_adapt_count") or 0),
    )
    atoms_svc = (
        ROOT
        / "services"
        / service
        / "src"
        / "integration"
        / "atoms"
    )
    atoms_desk = ROOT / "apps" / "empery_desktop" / "atoms" / service
    atom_files = []
    if atoms_svc.is_dir():
        atom_files.extend(atoms_svc.rglob("*"))
    if atoms_desk.is_dir():
        atom_files.extend(atoms_desk.rglob("*"))
    atom_files = [p for p in atom_files if p.is_file()]
    if extract_n >= 1 or atom_files:
        if extract_n < 1 and atom_files:
            notes.append(
                f"extract_adapt: ok via atom files only "
                f"(stats={extract_n}, atom_files={len(atom_files)}) — "
                f"legacy job meta pre-accumulate fix"
            )
        else:
            notes.append(
                f"extract_adapt: ok (stats={extract_n}, atom_files={len(atom_files)})"
            )
        sample = [str(p.relative_to(ROOT)) for p in atom_files[:5]]
        if sample:
            notes.append(f"extract sample: {sample}")
    else:
        ok = False
        notes.append(
            "extract_adapt: MISSING (no eic_action_stats.extract_adapt and no atom files)"
        )

    return ok, notes


def _check_capsule(service: str) -> tuple[bool, list[str]]:
    notes: list[str] = []
    ok = True
    sys.path.insert(0, str(ROOT))
    from services.empery_intelligence_core.src.integration.service_factory_gates import (
        verify_factory_gates,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        verify_service_desktop,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        verify_service_ui,
    )

    manifest = ROOT / "services" / service / "manifest.json"
    if not manifest.is_file():
        return False, [f"manifest: MISSING {manifest}"]
    notes.append("manifest: ok")
    try:
        man = json.loads(manifest.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return False, [f"manifest: invalid JSON ({exc})"]
    routes = ROOT / "services" / service / "src" / "api" / "routes.py"
    if routes.is_file() and "/tasks" in routes.read_text(encoding="utf-8"):
        notes.append("peer /api/v1/tasks route: ok")
    else:
        ok = False
        notes.append("peer /api/v1/tasks route: MISSING")
    mount = ROOT / "apps" / "empery_desktop" / "src" / "shell" / "mounts" / f"{service}.tsx"
    if mount.is_file() and "/api/v1/tasks" in mount.read_text(encoding="utf-8"):
        notes.append("desktop mount /api/v1/tasks: ok")
    else:
        ok = False
        notes.append("desktop mount /api/v1/tasks: MISSING")
    col = ROOT / "apps" / "empery_desktop" / "atoms" / service / "TaskColumnBody.tsx"
    if col.is_file():
        notes.append("extract TaskColumnBody.tsx: ok")
    else:
        notes.append("extract TaskColumnBody.tsx: MISSING (warn)")
    ui = man.get("ui") if isinstance(man.get("ui"), dict) else {}
    if ui.get("required") is False:
        notes.append(f"ui.required=false skip_reason={ui.get('skip_reason')!r}")
    else:
        notes.append("ui.required: true (or default)")

    factory_status, factory_detail = verify_factory_gates(
        ROOT, service, scaffold_profile="task_board"
    )
    if factory_status != "PASSED":
        ok = False
        notes.append(f"factory: {factory_status} — {factory_detail[:300]}")
    else:
        notes.append("factory: PASSED")

    desk_status, desk_detail = verify_service_desktop(ROOT, service)
    if desk_status != "PASSED":
        ok = False
        notes.append(f"desktop fs: {desk_status} — {desk_detail[:200]}")
    else:
        notes.append(f"desktop fs: PASSED ({desk_detail[:120]})")

    ui_status, ui_detail = verify_service_ui(ROOT, service)
    if ui_status == "FAILED":
        ok = False
        notes.append(f"ecc ui: FAILED — {ui_detail[:200]}")
    else:
        notes.append(f"ecc ui: {ui_status}")

    feat = _ui_feature_dir(service)
    if feat.is_dir() and any(feat.glob("*.tsx")):
        notes.append(f"ecc feature dir: ok ({feat.relative_to(ROOT)})")
    elif ui.get("required") is False:
        notes.append("ecc feature dir: skipped (ui.required=false)")
    else:
        ok = False
        notes.append(f"ecc feature dir: MISSING {feat.relative_to(ROOT)}")

    try:
        from core.registry import discover_manifest_names

        names = discover_manifest_names(ROOT / "services")
        if service in names:
            notes.append("registry discovery: ok")
        else:
            ok = False
            notes.append(f"registry discovery: MISSING (sample={list(names)[:8]})")
    except Exception as exc:  # noqa: BLE001
        ok = False
        notes.append(f"registry discovery failed: {exc}")

    return ok, notes


def _check_live(service: str) -> tuple[bool, list[str]]:
    notes: list[str] = []
    ok = True
    pascal = "".join(part.capitalize() for part in service.split("_"))
    mount_symbol = f"{pascal}Mount"

    # deploy health
    try:
        code, body = _post_json(
            f"{DEPLOY}/api/v1/deploy",
            {"service_name": service, "action": "health"},
            timeout=120.0,
        )
        details = body if isinstance(body, dict) else {}
        if code in (200, 201) and details.get("ok"):
            notes.append("deploy health: ok")
        else:
            ok = False
            notes.append(f"deploy health: FAILED HTTP {code} {str(details)[:200]}")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        ok = False
        notes.append(f"deploy health: unreachable ({exc})")

    # desktop catalog
    try:
        _, raw = _get(f"{SHELL}/api/v1/catalog/apps", timeout=15)
        data = json.loads(raw)
        if isinstance(data, list):
            apps = data
        elif isinstance(data, dict):
            apps = data.get("apps") or data.get("items") or data.get("catalog") or []
        else:
            apps = []
        ids: set[str] = set()
        if isinstance(apps, list):
            for a in apps:
                if isinstance(a, dict):
                    ids.add(
                        str(
                            a.get("id")
                            or a.get("app_id")
                            or a.get("app_component")
                            or a.get("name")
                            or ""
                        )
                    )
                elif isinstance(a, str):
                    ids.add(a)
        elif isinstance(apps, dict):
            ids.update(str(k) for k in apps.keys())
        if service in ids:
            notes.append("desktop catalog: ok")
        else:
            # bootstrap fallback
            _, boot_raw = _get(f"{SHELL}/api/v1/shell-bootstrap", timeout=15)
            boot = json.loads(boot_raw)
            boot_ids = {
                str(i.get("app_component") or "")
                for i in boot.get("items", [])
                if isinstance(i, dict)
            }
            if service in boot_ids or mount_symbol in boot_ids:
                notes.append("desktop bootstrap: ok (catalog miss)")
            else:
                ok = False
                notes.append(
                    f"desktop catalog/bootstrap missing {service}; "
                    f"sample={sorted(x for x in ids if x)[:12]}"
                )
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        ok = False
        notes.append(f"desktop catalog failed: {exc}")

    # baked mount in Desktop UI bundle
    try:
        _, index = _get(f"{DESKTOP_UI}/", timeout=15)
        asset_urls: list[str] = []
        for part in index.split('src="')[1:]:
            src = part.split('"', 1)[0]
            if src.startswith("/"):
                asset_urls.append(f"{DESKTOP_UI}{src}")
        found = False
        for url in asset_urls[:8]:
            try:
                _, js = _get(url, timeout=45)
            except (urllib.error.URLError, TimeoutError, OSError):
                continue
            if service in js or mount_symbol in js:
                found = True
                break
        if found:
            notes.append("desktop UI baked mount: ok")
        else:
            ok = False
            notes.append(
                f"desktop UI baked mount: MISSING ({service}/{mount_symbol} not in assets)"
            )
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        ok = False
        notes.append(f"desktop UI unreachable: {exc}")

    # Live peer /api/v1/tasks (DB provisioned) — read host port from deploy overlay
    host_port: int | None = None
    yml = ROOT / "deploy" / "services" / f"{service}.yml"
    if yml.is_file():
        text = yml.read_text(encoding="utf-8")
        m = re.search(
            r"ports:\s*\n\s*-\s*\"(\d+):\d+\"",
            text,
        )
        if not m:
            m = re.search(r"SERVICE_PORT:\s*\"(\d+)\"", text)
        if m:
            host_port = int(m.group(1))
    if host_port:
        try:
            code, raw = _get(f"http://127.0.0.1:{host_port}/api/v1/tasks?limit=5", timeout=15)
            if code == 200 and "tasks" in raw:
                notes.append(f"peer tasks API: ok (:{host_port})")
            else:
                ok = False
                notes.append(f"peer tasks API: FAILED HTTP {code} {raw[:160]}")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            ok = False
            notes.append(f"peer tasks API: unreachable ({exc})")
    else:
        notes.append("peer tasks API: skipped (no deploy host port)")

    return ok, notes


def _write_report(
    *,
    ok: bool,
    service: str,
    notes: list[str],
    job_id: str | None,
    verify_status: str,
) -> None:
    lines = [
        "# P12.1 task_board golden smoke",
        "",
        f"Date: {datetime.now(timezone.utc).isoformat()}",
        f"Service: `{service}`",
        f"Verdict: **{'PASSED' if ok else 'FAILED'}**",
        "",
        "## Evidence",
        "",
        f"- job_id: `{job_id or '(reuse)'}`",
        f"- verify_status: `{verify_status or 'MISSING'}`",
        "",
        "## Notes",
        "",
        *[f"- {n}" for n in notes],
        "",
    ]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")

    # Seed / update pack matrix row for 12.1
    matrix_rows = {
        "task_board": "PASSED" if ok else "FAILED",
        "ops_dashboard": "pending",
        "research_report": "pending",
        "site_studio": "pending",
        "image_studio": "pending",
        "video_studio": "pending",
        "music_forge": "pending",
        "companion_chat": "PASSED (prior P4/P7 — p4_golden_loop_smoke.md / p7_strict_golden_loop.md)",
        "notes_tool": "PASSED (prior P8 — p8_notes_golden_smoke.md)",
    }
    if MATRIX.is_file():
        # Preserve non-task_board statuses if already set
        text = MATRIX.read_text(encoding="utf-8")
        for pack in (
            "ops_dashboard",
            "research_report",
            "site_studio",
            "image_studio",
            "video_studio",
            "music_forge",
        ):
            m = re.search(rf"\|\s*`?{pack}`?\s*\|\s*([^|]+)\|", text)
            if m:
                matrix_rows[pack] = m.group(1).strip()
    mlines = [
        "# P12 pack matrix",
        "",
        f"Updated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "| Pack | Status | Evidence |",
        "|------|--------|----------|",
        f"| task_board | {matrix_rows['task_board']} | `{REPORT.name}` / `{service}` |",
        f"| ops_dashboard | {matrix_rows['ops_dashboard']} | — |",
        f"| research_report | {matrix_rows['research_report']} | — |",
        f"| site_studio | {matrix_rows['site_studio']} | — |",
        f"| image_studio | {matrix_rows['image_studio']} | — |",
        f"| video_studio | {matrix_rows['video_studio']} | — |",
        f"| music_forge | {matrix_rows['music_forge']} | — |",
        f"| companion_chat | {matrix_rows['companion_chat']} | not re-run in P12 cycle |",
        f"| notes_tool | {matrix_rows['notes_tool']} | not re-run in P12 cycle |",
        "",
        "Rule: product pack = create → not generic → extract_adapt → live health + registry "
        "+ Desktop + ECC (if ui.required). External peers may be honest N/A.",
        "",
    ]
    MATRIX.write_text("\n".join(mlines), encoding="utf-8")


def main() -> int:
    notes: list[str] = []
    print("P12.1 task_board golden smoke — preflight")
    try:
        code, _ = _get(f"{EIC}/api/v1/health", timeout=15)
        if code != 200:
            print("FAILED: EIC health", code)
            return 1
    except Exception as exc:  # noqa: BLE001
        print("FAILED: EIC unreachable", exc)
        return 1

    # Assembly offline check
    sys.path.insert(0, str(ROOT))
    from services.empery_intelligence_core.config import ServiceConfig
    from services.empery_intelligence_core.src.integration.orchestration_paths import (
        EicOrchestrationPaths,
    )
    from services.empery_intelligence_core.src.integration.recipe_catalog import (
        resolve_assembly_selection,
    )

    cfg = ServiceConfig(workspace_root=str(ROOT))
    paths = EicOrchestrationPaths.from_config(cfg, cwd=ROOT)
    probe_intent = (
        "Create a kanban task board service probe with columns and tasks "
        "— use task_board recipe pack"
    )
    sel = resolve_assembly_selection(
        paths, service_name="p12_taskboard_probe", intent=probe_intent
    )
    if sel.scaffold_profile != "task_board":
        print(f"FAILED: offline assembly profile={sel.scaffold_profile}")
        return 1
    if not any("task_board" in r for r in sel.extract_roots):
        print(f"FAILED: offline extract_roots={sel.extract_roots}")
        return 1
    notes.append(
        f"offline assembly: profile={sel.scaffold_profile} packs={list(sel.packs)}"
    )
    print(f"  offline assembly ok: {sel.scaffold_profile}")

    _ensure_autonomous_on()

    # Login / identity soft check
    try:
        ic, _ = _get(f"{IDENTITY}/api/v1/health", timeout=15)
        notes.append(f"identity health: HTTP {ic}")
    except Exception as exc:  # noqa: BLE001
        notes.append(f"identity health: {exc}")

    suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    service = EXISTING or f"p12_taskboard_{suffix}"
    enqueue = not bool(EXISTING)
    notes.append(f"service={service} enqueue={enqueue} posthoc={ALLOW_POSTHOC}")
    print(f"Step 1: create path service={service} enqueue={enqueue}")

    job: dict[str, Any] | None = None
    job_id: str | None = None
    verify_status = ""

    if enqueue:
        intent = (
            f"Create a kanban task board service {service} with columns and tasks "
            f"for operator work tracking — use task_board recipe pack "
            f"(not generic CRUD)"
        )
        code, body = _post_json(
            f"{EIC}/api/v1/autonomous/intentions",
            {
                "intention": intent,
                "service_name": service,
                "features": ["health", "task_board"],
                "metadata": {
                    "scaffold_profile": "task_board",
                    "recipe_packs": ["task_board"],
                },
            },
            timeout=60.0,
        )
        if code != 201:
            print("FAILED enqueue", code, body)
            notes.append(f"enqueue FAILED HTTP {code}")
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
        if status != "completed" and not ALLOW_POSTHOC:
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
            print(f"FAILED: verify_status={verify_status or 'MISSING'} (want PASSED)")
            _write_report(
                ok=False,
                service=service,
                notes=notes,
                job_id=job_id,
                verify_status=verify_status,
            )
            return 1
    else:
        notes.append("create enqueue: skipped (reuse)")

    print("Step 2: assembly + extract gates")
    asm_ok, asm_notes = _check_assembly(service, job)
    notes.extend(asm_notes)
    for n in asm_notes:
        print(f"  {n}")

    print("Step 3: capsule / factory / ECC / registry")
    cap_ok, cap_notes = _check_capsule(service)
    notes.extend(cap_notes)
    for n in cap_notes:
        print(f"  {n}")

    print("Step 4: live health + Desktop catalog/bake")
    live_ok, live_notes = _check_live(service)
    notes.extend(live_notes)
    for n in live_notes:
        print(f"  {n}")

    ok = bool(asm_ok and cap_ok and live_ok)
    if enqueue and verify_status != "PASSED":
        ok = False
    _write_report(
        ok=ok,
        service=service,
        notes=notes,
        job_id=job_id,
        verify_status=verify_status or ("reuse" if not enqueue else ""),
    )
    print(("PASSED" if ok else "FAILED"), "—", REPORT)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
