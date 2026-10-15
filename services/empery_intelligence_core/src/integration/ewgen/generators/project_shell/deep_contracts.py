# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Stage 11 deep contract helpers — db schema, auth env, event map.
# Invariants:
# - Weak db/auth without allow_weak_contracts → blocked signal.
# - Does not configure Keycloak realms or apply migrations.
# Related:
# - generators/project_shell/resolver.py
# - generators/set/contract_gate.py
# ---

"""Deep integration contract probes for project shells."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Set

SQL_FILE_RE = re.compile(r"\.(sql)$", re.IGNORECASE)
MIGRATION_HINT_RE = re.compile(
    r"(alembic|sqlalchemy|Base\.metadata|CREATE TABLE|op\.create_table)",
    re.IGNORECASE,
)
AUTH_ENV_RE = re.compile(
    r"\b(KEYCLOAK_[A-Z0-9_]+|OIDC_[A-Z0-9_]+|JWT_[A-Z0-9_]+|"
    r"AUTH_[A-Z0-9_]+)\b"
)
EVENT_HINT_RE = re.compile(
    r"\b(publish|subscribe|emit_event|EventBus|rabbitmq|kafka|"
    r"socket\.io|SocketIO)\b",
    re.IGNORECASE,
)


def _iter_text_files(root: Path) -> List[Path]:
    if not root.is_dir():
        return []
    files: List[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() in {
            ".py",
            ".ts",
            ".tsx",
            ".js",
            ".sql",
            ".md",
            ".env",
            ".txt",
            ".yml",
            ".yaml",
            ".json",
        }:
            files.append(path)
    return files


def _read_safe(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def probe_db_contract(shell_root: Path, grouped: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    """
    Grade db↔api schema readiness.

    strong: db slot has real .sql/migration files OR api has migration hints
            and db catalog hydrated
    weak: api has schema hints but db is placeholder-only
    strong (n/a): no db role and no schema hints
    """
    db_modules = grouped.get("db") or []
    api_modules = (grouped.get("api") or []) + (grouped.get("fullstack") or [])

    sql_files: List[str] = []
    api_schema_hits = 0
    for module in db_modules:
        mid = str(module.get("moduleId") or "")
        db_dir = shell_root / "modules" / mid / "db"
        for path in _iter_text_files(db_dir):
            if SQL_FILE_RE.search(path.name) or "migration" in path.name.lower():
                content = _read_safe(path)
                if (
                    "placeholder" in path.name.lower()
                    or "placeholder" in content.lower()
                ):
                    continue
                sql_files.append(str(path.relative_to(shell_root)))

    for module in api_modules:
        mid = str(module.get("moduleId") or "")
        be_dir = shell_root / "modules" / mid / "backend"
        for path in _iter_text_files(be_dir):
            content = _read_safe(path)
            if MIGRATION_HINT_RE.search(content) or path.suffix.lower() == ".sql":
                api_schema_hits += 1

    if not db_modules and api_schema_hits == 0:
        return {
            "kind": "db",
            "contractGrade": "strong",
            "status": "not_applicable",
            "sqlFiles": [],
            "apiSchemaHits": 0,
            "warnings": [],
            "errors": [],
            "allowed": True,
        }

    if sql_files:
        return {
            "kind": "db",
            "contractGrade": "strong",
            "status": "hydrated",
            "sqlFiles": sql_files[:40],
            "apiSchemaHits": api_schema_hits,
            "warnings": [],
            "errors": [],
            "allowed": True,
        }

    if api_schema_hits > 0 and db_modules:
        return {
            "kind": "db",
            "contractGrade": "weak",
            "status": "api_schema_without_db_files",
            "sqlFiles": [],
            "apiSchemaHits": api_schema_hits,
            "warnings": [
                "API has schema/migration hints but db slot has no real SQL"
            ],
            "errors": [],
            "allowed": False,
        }

    if db_modules and not sql_files:
        return {
            "kind": "db",
            "contractGrade": "weak",
            "status": "placeholder_db",
            "sqlFiles": [],
            "apiSchemaHits": api_schema_hits,
            "warnings": ["db role present but only placeholders"],
            "errors": [],
            "allowed": False,
        }

    return {
        "kind": "db",
        "contractGrade": "strong",
        "status": "api_only_hints",
        "sqlFiles": [],
        "apiSchemaHits": api_schema_hits,
        "warnings": ["API schema hints without db role — deferred"],
        "errors": [],
        "allowed": True,
    }


def probe_auth_contract(shell_root: Path) -> Dict[str, Any]:
    """Collect shared auth env keys across modules."""
    keys: Set[str] = set()
    per_module: Dict[str, List[str]] = {}
    modules_root = shell_root / "modules"
    if modules_root.is_dir():
        for module_dir in modules_root.iterdir():
            if not module_dir.is_dir() or module_dir.name == "registry.json":
                continue
            found: Set[str] = set()
            for path in _iter_text_files(module_dir):
                for match in AUTH_ENV_RE.findall(_read_safe(path)):
                    found.add(match)
                    keys.add(match)
            if found:
                per_module[module_dir.name] = sorted(found)

    if not keys:
        return {
            "kind": "auth",
            "contractGrade": "strong",
            "status": "not_applicable",
            "envKeys": [],
            "perModule": {},
            "warnings": [],
            "errors": [],
            "allowed": True,
        }

    # Conflict: disjoint KEYCLOAK vs JWT-only across modules → weak
    has_kc = any(k.startswith("KEYCLOAK_") or k.startswith("OIDC_") for k in keys)
    has_jwt = any(k.startswith("JWT_") for k in keys)
    grade = "strong"
    warnings: List[str] = []
    if has_kc and has_jwt and len(per_module) > 1:
        # Still strong if both present — shared contract documents both
        warnings.append("Mixed KEYCLOAK/OIDC and JWT env refs — shared example lists both")

    return {
        "kind": "auth",
        "contractGrade": grade,
        "status": "detected",
        "envKeys": sorted(keys),
        "perModule": per_module,
        "warnings": warnings,
        "errors": [],
        "allowed": True,
    }


def probe_events_contract(shell_root: Path) -> Dict[str, Any]:
    """Build event map stub from publish/subscribe hints."""
    events: List[Dict[str, str]] = []
    modules_root = shell_root / "modules"
    if modules_root.is_dir():
        for module_dir in modules_root.iterdir():
            if not module_dir.is_dir():
                continue
            for path in _iter_text_files(module_dir):
                content = _read_safe(path)
                for match in EVENT_HINT_RE.finditer(content):
                    events.append(
                        {
                            "moduleId": module_dir.name,
                            "hint": match.group(0),
                            "path": str(path.relative_to(shell_root)),
                        }
                    )
                    if len(events) >= 40:
                        break
            if len(events) >= 40:
                break

    return {
        "kind": "events",
        "contractGrade": "strong",
        "status": "mapped" if events else "empty",
        "events": events,
        "warnings": [] if events else ["No event bus hints found — empty map stub"],
        "errors": [],
        "allowed": True,
    }


def apply_deep_side_effects(
    shell_root: Path,
    *,
    auth: Dict[str, Any],
    events: Dict[str, Any],
    db: Dict[str, Any],
    dry_run: bool,
) -> List[str]:
    """Write auth env example, event map, and wire db SQL into backend/db."""
    actions: List[str] = []
    if dry_run:
        return ["deep_dry_run"]

    if auth.get("envKeys"):
        lines = [
            "# Shared auth env contract (Stage 11 — example only)",
            "# Fill values in operator env; do not commit secrets.",
        ]
        for key in auth["envKeys"]:
            lines.append(f"{key}=")
        path = shell_root / ".env.auth.example"
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        actions.append("auth_env_example_written")

    events_dir = shell_root / "events"
    events_dir.mkdir(parents=True, exist_ok=True)
    map_path = events_dir / "map.json"
    map_path.write_text(
        json.dumps(
            {
                "schema": "ewgen.project.events.map.v1",
                "events": events.get("events") or [],
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    actions.append("events_map_written")

    sql_files = list(db.get("sqlFiles") or [])
    if sql_files:
        dest = shell_root / "backend" / "db"
        dest.mkdir(parents=True, exist_ok=True)
        for rel in sql_files:
            src = shell_root / rel
            if not src.is_file():
                continue
            target = dest / src.name
            target.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
            actions.append(f"db_sql_wired:{src.name}")

    docs_dir = shell_root / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)
    docs_path = docs_dir / "INTEGRATION.md"
    docs_lines = [
        "# Integration contract (Stage 18)",
        "",
        "Auto-generated after deep resolve. Not a substitute for operator env.",
        "",
        f"- **db:** grade=`{db.get('contractGrade')}` "
        f"sqlFiles={len(list(db.get('sqlFiles') or []))}",
        f"- **auth:** grade=`{auth.get('contractGrade')}` "
        f"status=`{auth.get('status')}` "
        f"envKeys={len(list(auth.get('envKeys') or []))}",
        f"- **events:** grade=`{events.get('contractGrade')}` "
        f"status=`{events.get('status')}` "
        f"hints={len(list(events.get('events') or []))}",
        "",
    ]
    if auth.get("envKeys"):
        docs_lines.append("Auth env example: `.env.auth.example`")
        docs_lines.append("")
    if (shell_root / "events" / "map.json").is_file() or events.get("events"):
        docs_lines.append("Event map: `events/map.json`")
        docs_lines.append("")
    if sql_files:
        docs_lines.append("DB SQL wired under `backend/db/`.")
        docs_lines.append("")
    docs_path.write_text("\n".join(docs_lines), encoding="utf-8")
    actions.append("docs_integration_written")

    return actions
