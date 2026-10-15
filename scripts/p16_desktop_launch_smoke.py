#!/usr/bin/env python3
"""P16 desktop launch — peer + mount + catalog live matrix.

For each P12 product-pack golden (+ companion):
  - filesystem D1–D3 (verify_service_desktop)
  - deploy health
  - live peer HTTP
  - launch catalog presence
  - baked Desktop UI (:5174) mount symbol

Hygiene:
  - Tear down failed-retry / refuse smoke capsules (not goldens)
  - Launch catalog must exclude p4_golden_* / p8_notes_* / p15_refuse_* / p15_generic_*
  - notes_tool launch DoD = seed doc_editor (catalog + bake + open-window); lab p8_notes_* excluded
  - Re-runs p4/p8 golden against existing capsules
  - Open-window deep-link ?launch=doc_editor + Nervas peer

Usage (stack up):
  python3 scripts/p16_desktop_launch_smoke.py
"""

from __future__ import annotations

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
REPORT = ROOT / ".cursor" / "orchestration" / "reports" / "p16_desktop_launch.md"

EIC = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
DEPLOY = os.environ.get("EMPERY_SMOKE_DEPLOY_BASE", "http://127.0.0.1:8010").rstrip("/")
SHELL = os.environ.get("EMPERY_SMOKE_SHELL_BASE", "http://127.0.0.1:8020").rstrip("/")
DESKTOP_UI = os.environ.get("EMPERY_SMOKE_DESKTOP_UI", "http://127.0.0.1:5174").rstrip(
    "/"
)

# Failed retries / refuse debris — remove from tree + launch catalog.
JUNK_TEARDOWN = (
    "p12_research_20260725075342",
    "p12_research_20260725080617",
    "p12_sitestudio_20260725084048",
    "p15_refuse_20260725112332",
    "p8_notes_20260725014752",  # non-golden notes attempt
)
# Phantom catalog IDs (no service tree) — DELETE only.
JUNK_CATALOG_ONLY = (
    "p12_taskboard_20260725070158",
    "p12_vidstudio_20260725100927",
)

# Lab / negative-smoke IDs that must NOT appear in launch catalog.
_LAB_RE = re.compile(r"^(p4_golden_|p8_notes_|p15_refuse_|p15_generic_)\d")
# Glob prefixes torn down every P16 run (negative debris).
_JUNK_PREFIXES = ("p15_refuse_", "p15_generic_")


@dataclass(frozen=True)
class LaunchRow:
    pack: str
    service: str
    profile: str
    peer_path: str
    expect_launch: bool = True
    peer_ok_substr: str | None = None  # optional body marker
    # Seed Desktop apps (doc_editor): no services/ tree / deploy overlay.
    seed_desktop: bool = False
    peer_host_port: int | None = None  # override deploy-yml port
    mount_symbol: str | None = None


MATRIX: tuple[LaunchRow, ...] = (
    LaunchRow(
        "companion_chat",
        "p3_comp_live",
        "companion_chat",
        "/api/v1/health",
    ),
    # Product notes/editor window on Desktop (seed) — not lab p8_notes_*.
    LaunchRow(
        "notes_tool",
        "doc_editor",
        "editor_local",
        "/api/v1/health",
        seed_desktop=True,
        peer_host_port=8007,  # Doc Editor → living EIC Nervas assist
        mount_symbol="DocEditorMount",
    ),
    # Golden notes capsule remains lab (peer/FS); must stay out of launch catalog.
    LaunchRow(
        "notes_tool_lab",
        "p8_notes_20260725015514",
        "editor_local",
        "/api/v1/health",
        expect_launch=False,
    ),
    LaunchRow(
        "task_board",
        "p12_taskboard_20260725071317",
        "task_board",
        "/api/v1/tasks?limit=5",
        peer_ok_substr="tasks",
    ),
    LaunchRow(
        "ops_dashboard",
        "p12_opsdash_retry",
        "ops_dashboard",
        "/api/v1/metrics?limit=5",
        peer_ok_substr="metrics",
    ),
    LaunchRow(
        "research_report",
        "p12_research_20260725081954",
        "research_report",
        "/api/v1/reports?limit=5",
        peer_ok_substr="reports",
    ),
    LaunchRow(
        "site_studio",
        "p12_sitestudio_20260725084956",
        "site_studio",
        "/api/v1/drafts",
    ),
    LaunchRow(
        "image_studio",
        "p12_imgstudio_20260725092656",
        "image_studio",
        "/api/v1/health",
    ),
    LaunchRow(
        "video_studio",
        "p12_vidstudio_20260725100701",
        "video_studio",
        "/api/v1/health",
    ),
    LaunchRow(
        "music_forge",
        "p12_musicforge_20260725103151",
        "music_forge",
        "/api/v1/health",
    ),
)


def _get(url: str, timeout: float = 30.0) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        return exc.code, raw


def _post_json(url: str, payload: dict, timeout: float = 120.0) -> tuple[int, dict]:
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


def _delete(url: str, timeout: float = 15.0) -> tuple[int, str]:
    req = urllib.request.Request(url, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


def _pascal(service: str) -> str:
    return "".join(p.capitalize() for p in service.split("_") if p)


def _host_port(service: str) -> int | None:
    yml = ROOT / "deploy" / "services" / f"{service}.yml"
    if not yml.is_file():
        # peer_env_matrix fallback
        matrix = ROOT / ".cursor/orchestration/eic/peer_env_matrix.json"
        if matrix.is_file():
            data = json.loads(matrix.read_text(encoding="utf-8"))
            peer = (data.get("peers") or {}).get(service) or {}
            port = peer.get("port")
            if isinstance(port, int):
                return port
        return None
    text = yml.read_text(encoding="utf-8")
    m = re.search(r'ports:\s*\n\s*-\s*"(\d+):\d+"', text)
    if not m:
        m = re.search(r'SERVICE_PORT:\s*"(\d+)"', text)
    return int(m.group(1)) if m else None


def _catalog_ids() -> set[str]:
    _, raw = _get(f"{SHELL}/api/v1/catalog/apps", timeout=20)
    data = json.loads(raw)
    apps = data if isinstance(data, list) else (
        data.get("apps") or data.get("items") or data.get("catalog") or []
    )
    ids: set[str] = set()
    if isinstance(apps, list):
        for a in apps:
            if isinstance(a, dict):
                ids.add(
                    str(
                        a.get("app_id")
                        or a.get("id")
                        or a.get("app_component")
                        or a.get("name")
                        or ""
                    )
                )
            elif isinstance(a, str):
                ids.add(a)
    return {x for x in ids if x}


def _baked_has(service: str, mount_symbol: str | None = None) -> bool:
    symbol = mount_symbol or f"{_pascal(service)}Mount"
    _, index = _get(f"{DESKTOP_UI}/", timeout=20)
    asset_urls: list[str] = []
    for part in index.split('src="')[1:]:
        src = part.split('"', 1)[0]
        if src.startswith("/"):
            asset_urls.append(f"{DESKTOP_UI}{src}")
    for url in asset_urls[:10]:
        try:
            _, js = _get(url, timeout=45)
        except (urllib.error.URLError, TimeoutError, OSError):
            continue
        if service in js or symbol in js:
            return True
    return False


def _check_seed_desktop_fs(service: str) -> tuple[bool, str]:
    mount = ROOT / "apps/empery_desktop/src/shell/mounts" / f"{service}.tsx"
    registry = ROOT / "apps/empery_desktop/src/shell/mounts/registry.ts"
    if not mount.is_file():
        return False, "MISSING mount"
    reg = registry.read_text(encoding="utf-8") if registry.is_file() else ""
    if f'from "./{service}"' not in reg:
        return False, "MISSING registry"
    if "Scaffolded desktop mount" in mount.read_text(encoding="utf-8"):
        return False, "stub mount"
    return True, "seed mount+registry"


def _check_row(row: LaunchRow) -> tuple[bool, dict[str, str]]:
    sys.path.insert(0, str(ROOT))
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        verify_service_desktop,
    )

    cells: dict[str, str] = {
        "fs": "—",
        "deploy": "—",
        "peer": "—",
        "catalog": "—",
        "baked": "—",
    }
    ok = True

    if row.seed_desktop:
        fs_ok, fs_msg = _check_seed_desktop_fs(row.service)
        cells["fs"] = fs_msg
        if not fs_ok:
            ok = False
    else:
        if not (ROOT / "services" / row.service).is_dir():
            cells["fs"] = "MISSING svc"
            return False, cells
        status, _detail = verify_service_desktop(
            ROOT, row.service, ui_profile=row.profile
        )
        if status == "PASSED":
            cells["fs"] = "PASSED"
        else:
            ok = False
            cells["fs"] = f"{status}"

    if row.seed_desktop:
        cells["deploy"] = "n/a (seed)"
    else:
        try:
            code, body = _post_json(
                f"{DEPLOY}/api/v1/deploy",
                {"service_name": row.service, "action": "health"},
                timeout=120.0,
            )
            if code in (200, 201) and body.get("ok"):
                cells["deploy"] = "ok"
            else:
                cells["deploy"] = f"FAIL HTTP {code}"
                if row.expect_launch:
                    ok = False
                else:
                    cells["deploy"] = f"down HTTP {code}"
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            cells["deploy"] = f"err {exc}"
            if row.expect_launch:
                ok = False

    port = row.peer_host_port or _host_port(row.service)
    if not port:
        cells["peer"] = "no port"
        if row.expect_launch:
            ok = False
    else:
        try:
            if row.seed_desktop:
                h_code, h_raw = _get(
                    f"http://127.0.0.1:{port}{row.peer_path}", timeout=20
                )
                health_ok = h_code == 200 and (
                    '"status"' in h_raw or "ok" in h_raw.lower()
                )
                if health_ok:
                    cells["peer"] = f"ok :{port}{row.peer_path}"
                else:
                    cells["peer"] = f"HTTP {h_code}"
                    ok = False
            else:
                h_code, h_raw = _get(
                    f"http://127.0.0.1:{port}/api/v1/health", timeout=20
                )
                health_ok = h_code == 200 and (
                    '"status"' in h_raw or "ok" in h_raw.lower()
                )
                product_ok = True
                product_note = ""
                if row.peer_path.rstrip("/") != "/api/v1/health":
                    # Retry: shared Postgres AdminShutdown during hygiene can
                    # leave one stale pooled connection (first hit 500, then OK).
                    p_code, p_raw = 0, ""
                    for attempt in range(3):
                        p_code, p_raw = _get(
                            f"http://127.0.0.1:{port}{row.peer_path}", timeout=20
                        )
                        if p_code == 200:
                            break
                        if attempt < 2:
                            time.sleep(1.0)
                    marker_ok = True
                    if row.peer_ok_substr and row.peer_ok_substr not in p_raw:
                        marker_ok = False
                    product_ok = p_code == 200 and marker_ok
                    product_note = f" +{row.peer_path.split('?',1)[0]}={p_code}"
                if health_ok and product_ok:
                    cells["peer"] = f"ok :{port}{product_note}"
                elif health_ok and not product_ok:
                    cells["peer"] = f"health ok product fail{product_note}"
                    if row.expect_launch:
                        ok = False
                else:
                    cells["peer"] = f"health HTTP {h_code}"
                    if row.expect_launch:
                        ok = False
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            cells["peer"] = str(exc)[:40]
            if row.expect_launch:
                ok = False

    try:
        ids = _catalog_ids()
        present = row.service in ids
        if row.expect_launch:
            if present:
                cells["catalog"] = "ok"
            else:
                cells["catalog"] = "MISSING"
                ok = False
        else:
            if present:
                cells["catalog"] = "LEAK (lab)"
                ok = False
            else:
                cells["catalog"] = "lab-excluded"
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        cells["catalog"] = f"err {exc}"
        ok = False

    if row.expect_launch:
        try:
            if _baked_has(row.service, row.mount_symbol):
                cells["baked"] = "ok"
            else:
                cells["baked"] = "MISSING"
                ok = False
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            cells["baked"] = f"err {exc}"
            ok = False
    else:
        cells["baked"] = "n/a (lab)"

    return ok, cells


def _hygiene(notes: list[str]) -> bool:
    sys.path.insert(0, str(ROOT))
    os.environ.setdefault("EMPERY_FORCE_DELETE_NON_USER", "1")
    os.environ.setdefault("DESKTOP_SHELL_API_BASE", SHELL)
    from core.logging import configure_logging
    from services.empery_intelligence_core.src.integration.service_factory_lifecycle import (
        teardown_service_files,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        teardown_ecc_ui_surfaces,
    )

    log = configure_logging("p16_hygiene")
    ok = True
    junk_names = list(JUNK_TEARDOWN)
    svc_root = ROOT / "services"
    if svc_root.is_dir():
        for prefix in _JUNK_PREFIXES:
            for path in sorted(svc_root.glob(f"{prefix}*")):
                if path.is_dir() and path.name not in junk_names:
                    junk_names.append(path.name)
    for name in junk_names:
        exists = (ROOT / "services" / name).is_dir() or (
            ROOT / "apps/empery_desktop/src/shell/mounts" / f"{name}.tsx"
        ).is_file()
        if not exists and name not in _catalog_ids_safe():
            notes.append(f"hygiene {name}: already gone")
            continue
        # Stop container best-effort
        try:
            code, body = _post_json(
                f"{DEPLOY}/api/v1/deploy",
                {"service_name": name, "action": "stop"},
                timeout=90.0,
            )
            notes.append(f"hygiene stop {name}: HTTP {code} ok={body.get('ok')}")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            notes.append(f"hygiene stop {name}: {exc}")
        files = teardown_service_files(ROOT, name, logger=log)
        if not files.get("ok"):
            # ECC may have already been partially stripped — still try ecc
            ecc = teardown_ecc_ui_surfaces(ROOT, name)
            notes.append(
                f"hygiene teardown {name}: files_ok={files.get('ok')} "
                f"errors={files.get('errors')[:2]} ecc_removed={len(ecc.get('removed') or [])}"
            )
            if files.get("errors"):
                ok = False
        else:
            notes.append(
                f"hygiene teardown {name}: ok removed={len(files.get('removed') or [])}"
            )
        try:
            dcode, _ = _delete(f"{SHELL}/api/v1/catalog/apps/{name}", timeout=15)
            notes.append(f"hygiene catalog DELETE {name}: HTTP {dcode}")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            notes.append(f"hygiene catalog DELETE {name}: {exc}")

    for name in JUNK_CATALOG_ONLY:
        try:
            dcode, _ = _delete(f"{SHELL}/api/v1/catalog/apps/{name}", timeout=15)
            notes.append(f"hygiene phantom DELETE {name}: HTTP {dcode}")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            notes.append(f"hygiene phantom DELETE {name}: {exc}")

    # p8_debug2 / p8_notes_test never existed — record absence
    for ghost in ("p8_debug2", "p8_notes_test"):
        mount = ROOT / "apps/empery_desktop/src/shell/mounts" / f"{ghost}.tsx"
        if mount.is_file() or ghost in _catalog_ids_safe():
            ok = False
            notes.append(f"hygiene ghost {ghost}: UNEXPECTED present")
        else:
            notes.append(f"hygiene ghost {ghost}: absent (ok)")

    return ok


def _catalog_ids_safe() -> set[str]:
    try:
        return _catalog_ids()
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return set()


def _p4_p8_sanity(notes: list[str]) -> bool:
    """Re-run p4/p8 against existing capsules (full smoke, not syntax-only)."""
    import subprocess

    ok = True
    runs = (
        (
            "p4",
            [
                sys.executable,
                "scripts/p4_golden_loop_smoke.py",
            ],
            {
                "EMPERY_SMOKE_SERVICE": "p3_comp_live",
                "EMPERY_SMOKE_SKIP_EVOLVE": "1",
                "EMPERY_SMOKE_ALLOW_POSTHOC": "",
            },
        ),
        (
            "p8",
            [
                sys.executable,
                "scripts/p8_notes_golden_smoke.py",
            ],
            {
                "EMPERY_SMOKE_SERVICE": "p8_notes_20260725015514",
                "EMPERY_SMOKE_ALLOW_POSTHOC": "",
            },
        ),
    )
    for label, cmd, extra_env in runs:
        env = dict(os.environ)
        env.update(extra_env)
        print(f"  running {label} golden (reuse capsule)…", flush=True)
        proc = subprocess.run(
            cmd,
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
            timeout=1200,
        )
        tail = ((proc.stdout or "") + (proc.stderr or ""))[-600:]
        if proc.returncode == 0:
            notes.append(f"{label} golden reuse: PASSED")
            print(f"  {label}: PASSED", flush=True)
        else:
            ok = False
            notes.append(f"{label} golden reuse: FAILED rc={proc.returncode}")
            notes.append(f"{label} tail: {tail.replace(chr(10), ' ')[:300]}")
            print(f"  {label}: FAILED\n{tail}", flush=True)
    return ok


def _open_window_proof(notes: list[str]) -> bool:
    """Deep-link open a launch-catalog app and assert window DOM + living peer."""
    import shutil
    import subprocess

    chrome = shutil.which("google-chrome") or shutil.which("chromium-browser")
    if not chrome:
        notes.append("open-window: chrome missing — FAIL")
        return False
    # notes_tool product window (seed) — proves open + Nervas peer path
    app = "doc_editor"
    url = f"{DESKTOP_UI}/?launch={app}"
    try:
        code, raw = _get("http://127.0.0.1:8007/api/v1/health", timeout=20)
        if code != 200 or "ok" not in raw.lower():
            notes.append(f"open-window EIC peer: FAIL HTTP {code}")
            return False
        notes.append("open-window EIC peer (doc_editor Nervas): ok :8007")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        notes.append(f"open-window peer: {exc}")
        return False

    try:
        proc = subprocess.run(
            [
                chrome,
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                "--virtual-time-budget=20000",
                "--dump-dom",
                url,
            ],
            capture_output=True,
            text=True,
            timeout=90,
            check=False,
        )
        dom = (proc.stdout or "") + (proc.stderr or "")
        need = ("data-desktop-window-id", "Nervas ready", "doc-editor")
        hits = [m for m in need if m.lower() in dom.lower()]
        if proc.returncode == 0 and len(hits) == len(need):
            notes.append(f"open-window deep-link launch={app}: ok hits={list(hits)}")
            return True
        notes.append(
            f"open-window deep-link: FAIL rc={proc.returncode} "
            f"hits={hits} dom_len={len(dom)}"
        )
        return False
    except (OSError, subprocess.TimeoutExpired) as exc:
        notes.append(f"open-window chrome: {exc}")
        return False


def _write_report(
    *,
    ok: bool,
    rows: list[tuple[LaunchRow, bool, dict[str, str]]],
    notes: list[str],
) -> None:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).isoformat()
    verdict = "PASSED" if ok else "FAILED"
    lines = [
        "# P16 desktop launch",
        "",
        f"Date: {ts}",
        f"EIC: `{EIC}` · Shell: `{SHELL}` · Desktop UI: `{DESKTOP_UI}`",
        f"Verdict: **{verdict}**",
        "",
        "## Matrix",
        "",
        "| Pack | Service | FS D1–D3 | Deploy | Peer | Launch catalog | Baked :5174 | Row |",
        "|------|---------|----------|--------|------|----------------|-------------|-----|",
    ]
    for row, row_ok, cells in rows:
        lines.append(
            f"| {row.pack} | `{row.service}` | {cells['fs']} | {cells['deploy']} | "
            f"{cells['peer']} | {cells['catalog']} | {cells['baked']} | "
            f"{'PASS' if row_ok else 'FAIL'} |"
        )
    lines.extend(["", "## Hygiene / notes", ""])
    lines.extend(f"- {n}" for n in notes)
    lines.extend(
        [
            "",
            "## Rule",
            "",
            "- Product pack golden → live peer + launch catalog + baked mount",
            "- `p4_golden_*` / `p8_notes_*` / `p15_refuse_*` / `p15_generic_*` stay out of launch catalog",
            "- Failed P12 retries + P15 negative debris torn down (not left as fake windows)",
            "- notes_tool launch path = seed `doc_editor` (not lab `p8_notes_*`)",
            "- Open-window: `/?launch=doc_editor` + living EIC Nervas peer",
            "",
        ]
    )
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    notes: list[str] = []
    print("P16 desktop launch smoke", flush=True)

    # Preflight
    try:
        code, _ = _get(f"{EIC}/api/v1/health", timeout=15)
        if code != 200:
            print(f"P16 FAILED: EIC health HTTP {code}", flush=True)
            return 1
        notes.append("EIC health: ok")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"P16 FAILED: EIC unreachable {exc}", flush=True)
        return 1

    print("Step 1: hygiene teardown junk", flush=True)
    hy_ok = _hygiene(notes)

    print("Step 2: launch catalog lab exclusion", flush=True)
    try:
        ids = _catalog_ids()
        leaks = sorted(x for x in ids if _LAB_RE.match(x))
        if leaks:
            hy_ok = False
            notes.append(f"lab leak in catalog: {leaks}")
        else:
            notes.append("lab exclusion: no p4_golden_/p8_notes_/p15_refuse_/p15_generic_ in catalog")
        # retries must be gone
        for junk in (*JUNK_TEARDOWN, *JUNK_CATALOG_ONLY):
            if junk in ids:
                hy_ok = False
                notes.append(f"junk still in catalog: {junk}")
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        hy_ok = False
        notes.append(f"catalog probe failed: {exc}")

    print("Step 3: per-pack live matrix", flush=True)
    rows: list[tuple[LaunchRow, bool, dict[str, str]]] = []
    matrix_ok = True
    for row in MATRIX:
        print(f"  {row.pack} / {row.service}", flush=True)
        row_ok, cells = _check_row(row)
        rows.append((row, row_ok, cells))
        if not row_ok:
            matrix_ok = False
        print(f"    {'PASS' if row_ok else 'FAIL'} {cells}", flush=True)

    print("Step 4: p4/p8 not broken", flush=True)
    p48_ok = _p4_p8_sanity(notes)

    print("Step 5: open-window deep-link + peer", flush=True)
    open_ok = _open_window_proof(notes)

    ok = hy_ok and matrix_ok and p48_ok and open_ok
    _write_report(ok=ok, rows=rows, notes=notes)
    if ok:
        print(f"P16 PASSED — report: {REPORT}", flush=True)
        return 0
    print(f"P16 FAILED — report: {REPORT}", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
