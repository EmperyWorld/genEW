# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Post-compose readiness gate for Component Factory shells (routes + boot smoke
# + deep adapter artifacts).
# Invariants:
# - Blockers prevent success registration; warnings are operator-visible.
# - Weak deep contracts need allow_weak_contracts; does not start containers.
# Related:
# - generators/factory/component_factory_run.py
# - generators/factory/boot_smoke.py
# - generators/warsmith/contract_tests.py
# ---

"""Validate a materialized factory project shell."""

from __future__ import annotations

import py_compile
from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.factory.boot_smoke import run_boot_smoke
from generators.warsmith.contract_tests import build_route_contract

REQUIRED_RELATIVE = (
    "compose.yaml",
    "backend/main.py",
    "frontend/package.json",
    "project.manifest.json",
)


def _deep_grade(probe: Any) -> str:
    if not isinstance(probe, dict):
        return ""
    return str(probe.get("contractGrade") or probe.get("status") or "").strip()


def validate_factory_shell(
    *,
    project_path: Optional[str],
    project_id: str,
    boot_ready: bool,
    frontend_files: Optional[List[Dict[str, Any]]] = None,
    backend_files: Optional[List[Dict[str, Any]]] = None,
    deep: Optional[Dict[str, Any]] = None,
    allow_weak_contracts: bool = False,
) -> Dict[str, Any]:
    """
    Deterministic readiness checks after compose/resolve.

    Stage 18: boot smoke + deep adapter file presence; weak deep grades
    require ``allow_weak_contracts``.
    """
    blockers: List[str] = []
    warnings: List[str] = []
    checks: Dict[str, Any] = {
        "projectId": project_id or None,
        "bootReady": bool(boot_ready),
        "allowWeakContracts": bool(allow_weak_contracts),
    }

    if not project_id:
        blockers.append("missing_project_id")
    if not project_path:
        blockers.append("missing_project_path")
        return {
            "success": False,
            "ok": False,
            "blockers": blockers,
            "warnings": warnings,
            "checks": checks,
        }

    root = Path(project_path)
    checks["projectPathExists"] = root.is_dir()
    if not root.is_dir():
        blockers.append("project_path_not_a_directory")
        return {
            "success": False,
            "ok": False,
            "blockers": blockers,
            "warnings": warnings,
            "checks": checks,
        }

    missing = [
        rel for rel in REQUIRED_RELATIVE if not (root / rel).is_file()
    ]
    checks["missingFiles"] = missing
    if missing:
        blockers.append(f"missing_files:{','.join(missing)}")

    if not boot_ready:
        blockers.append("boot_ready_false")

    py_errors: List[str] = []
    for path in sorted((root / "backend").rglob("*.py")):
        try:
            py_compile.compile(str(path), doraise=True)
        except py_compile.PyCompileError as exc:
            py_errors.append(f"{path.name}:{exc.msg[:80]}")
            if len(py_errors) >= 5:
                break
    checks["pythonCompileErrors"] = py_errors
    if py_errors:
        blockers.append("backend_python_syntax")

    route: Dict[str, Any] = {}
    if frontend_files is not None and backend_files is not None:
        route = build_route_contract(
            list(frontend_files),
            list(backend_files),
        )
        checks["routeOverlapCount"] = route.get("overlapCount", 0)
        checks["routeAligned"] = bool(route.get("aligned"))
        if (
            route.get("fetchPaths")
            and route.get("apiPaths")
            and not route.get("overlap")
        ):
            warnings.append("ui_api_route_no_overlap")
        elif route.get("overlap"):
            checks["routeOverlap"] = list(route.get("overlap") or [])[:8]

    smoke = run_boot_smoke(root)
    checks["bootSmoke"] = smoke
    if not smoke.get("ok"):
        blockers.append(
            "boot_smoke_failed:" + ",".join(smoke.get("missing") or ["unknown"])
        )

    deep_payload = deep if isinstance(deep, dict) else {}
    checks["deep"] = {
        "db": _deep_grade(deep_payload.get("db")),
        "auth": _deep_grade(deep_payload.get("auth")),
        "events": _deep_grade(deep_payload.get("events")),
    }
    weak_kinds: List[str] = []
    for kind in ("db", "auth", "events"):
        probe = deep_payload.get(kind)
        if not isinstance(probe, dict):
            continue
        grade = str(probe.get("contractGrade") or "").strip().lower()
        if grade in {"weak", "blocked"}:
            weak_kinds.append(kind)

    if weak_kinds and not allow_weak_contracts:
        blockers.append("weak_deep_contracts:" + ",".join(weak_kinds))
    elif weak_kinds and allow_weak_contracts:
        warnings.append("weak_deep_contracts_allowed:" + ",".join(weak_kinds))

    adapter: Dict[str, Any] = {}
    auth_probe = deep_payload.get("auth") if isinstance(
        deep_payload.get("auth"), dict
    ) else {}
    db_probe = deep_payload.get("db") if isinstance(
        deep_payload.get("db"), dict
    ) else {}
    events_probe = deep_payload.get("events") if isinstance(
        deep_payload.get("events"), dict
    ) else {}

    if auth_probe.get("envKeys"):
        auth_ok = (root / ".env.auth.example").is_file()
        adapter["authEnvExample"] = auth_ok
        if not auth_ok:
            blockers.append("missing_auth_env_example")

    if list(db_probe.get("sqlFiles") or []):
        db_ok = (root / "backend" / "db").is_dir() and any(
            (root / "backend" / "db").glob("*.sql")
        )
        adapter["dbSqlWired"] = db_ok
        if not db_ok:
            blockers.append("missing_db_sql_wired")

    if events_probe.get("events") or events_probe.get("status") == "mapped":
        ev_ok = (root / "events" / "map.json").is_file()
        adapter["eventsMap"] = ev_ok
        if not ev_ok:
            blockers.append("missing_events_map")

    # After successful resolve, docs/INTEGRATION.md should exist when deep ran
    if deep_payload:
        docs_ok = (root / "docs" / "INTEGRATION.md").is_file()
        adapter["docsIntegration"] = docs_ok
        if not docs_ok:
            warnings.append("missing_docs_integration")

    checks["deepAdapters"] = adapter

    ok = len(blockers) == 0
    return {
        "success": ok,
        "ok": ok,
        "blockers": blockers,
        "warnings": warnings,
        "checks": checks,
        "routeContract": route or None,
        "bootSmoke": smoke,
    }
