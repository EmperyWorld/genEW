# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Stage 18 factory boot smoke — filesystem checklist that a resolved shell can
# start operator review (registry, modules, FE/BE entry, deep adapter files).
# Invariants:
# - Does not execute containers or install deps; structural smoke only.
# - Missing registry or zero modules is always a hard fail signal for callers.
# Related:
# - generators/factory/validate_shell.py
# - documentation/platform/EWGEN-COMPONENT-FACTORY-VISION.md (Stage 18)
# ---

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List


def run_boot_smoke(shell_root: Path) -> Dict[str, Any]:
    """Return ``{ok, checks, missing}`` for structural boot readiness."""
    root = Path(shell_root)
    checks: List[Dict[str, Any]] = []
    missing: List[str] = []

    def _check(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"name": name, "ok": ok, "detail": detail})
        if not ok:
            missing.append(name)

    reg = root / "modules" / "registry.json"
    _check("modules_registry", reg.is_file(), str(reg.relative_to(root)) if reg.is_file() else "modules/registry.json")

    module_dirs = [
        p
        for p in (root / "modules").iterdir()
        if p.is_dir() and p.name not in {".", ".."} and p.name != "__pycache__"
    ] if (root / "modules").is_dir() else []
    # registry.json sibling dirs only
    module_dirs = [p for p in module_dirs if p.name != "registry.json"]
    _check(
        "modules_present",
        len(module_dirs) >= 1,
        f"count={len(module_dirs)}",
    )

    fe_ok = (root / "frontend" / "package.json").is_file() or (
        root / "frontend" / "src"
    ).is_dir()
    _check("frontend_entry", fe_ok, "frontend/package.json|src")

    be_ok = (
        (root / "backend" / "main.py").is_file()
        or (root / "backend" / "app.py").is_file()
        or (root / "backend" / "routers").is_dir()
        or (root / "backend" / "api").is_dir()
    )
    _check("backend_entry", be_ok, "backend/main|app|routers|api")

    events_map = root / "events" / "map.json"
    checks.append(
        {
            "name": "events_map",
            "ok": True,
            "detail": (
                "events/map.json"
                if events_map.is_file()
                else "absent (optional)"
            ),
        }
    )

    auth_ex = root / ".env.auth.example"
    if auth_ex.is_file():
        checks.append(
            {
                "name": "auth_env_example",
                "ok": True,
                "detail": ".env.auth.example",
            }
        )

    db_dir = root / "backend" / "db"
    if db_dir.is_dir() and any(db_dir.glob("*.sql")):
        checks.append(
            {
                "name": "db_sql_wired",
                "ok": True,
                "detail": "backend/db/*.sql",
            }
        )

    docs_int = root / "docs" / "INTEGRATION.md"
    if docs_int.is_file():
        checks.append(
            {
                "name": "docs_integration",
                "ok": True,
                "detail": "docs/INTEGRATION.md",
            }
        )

    hard = {
        "modules_registry",
        "modules_present",
        "frontend_entry",
        "backend_entry",
    }
    ok = all(c["ok"] for c in checks if c["name"] in hard)
    return {
        "ok": ok,
        "checks": checks,
        "missing": [m for m in missing if m in hard],
    }
