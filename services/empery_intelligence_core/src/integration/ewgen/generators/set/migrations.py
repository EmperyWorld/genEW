"""
SET per-module SQL migration orchestration
"""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .inventory import get_set_inventory
from .paths import runtime_modules_root
from .runtime import get_runtime_status

_DB_CONTAINER = "ewgen-set-db"
_MIGRATION_GLOB = "*.sql"


def _db_env() -> Dict[str, str]:
    return {
        "user": os.getenv("SET_DB_USER", "set"),
        "password": os.getenv("SET_DB_PASSWORD", "set"),
        "database": os.getenv("SET_DB_NAME", "ewgen_set"),
        "host": os.getenv("SET_DB_HOST", "127.0.0.1"),
        "port": os.getenv("SET_DB_PORT", "5433"),
    }


def _checksum(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _to_sql_slug(module_id: str) -> str:
    return module_id.replace("-", "_")


def _normalize_migration_sql(content: str, module_id: str) -> str:
    """Fix legacy migrations that used kebab-case module_id in SQL identifiers."""
    sql_slug = _to_sql_slug(module_id)
    if sql_slug == module_id:
        return content
    return content.replace(f"{module_id}_", f"{sql_slug}_")


def _is_db_running() -> bool:
    status = get_runtime_status()
    for service in status.get("services") or []:
        if service.get("name") == _DB_CONTAINER:
            return bool(service.get("running"))
    return False


def _run_psql(sql: str, *, timeout: int = 60) -> Dict[str, Any]:
    db = _db_env()
    if shutil.which("podman") and _is_db_running():
        command = [
            "podman", "exec", "-i", _DB_CONTAINER,
            "psql",
            "-U", db["user"],
            "-d", db["database"],
            "-v", "ON_ERROR_STOP=1",
        ]
        result = subprocess.run(
            command,
            input=sql,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return {
            "success": result.returncode == 0,
            "exitCode": result.returncode,
            "stdout": (result.stdout or "").strip(),
            "stderr": (result.stderr or "").strip(),
            "via": "podman",
        }

    if shutil.which("psql"):
        env = {**os.environ, "PGPASSWORD": db["password"]}
        command = [
            "psql",
            "-h", db["host"],
            "-p", db["port"],
            "-U", db["user"],
            "-d", db["database"],
            "-v", "ON_ERROR_STOP=1",
        ]
        result = subprocess.run(
            command,
            input=sql,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env=env,
        )
        return {
            "success": result.returncode == 0,
            "exitCode": result.returncode,
            "stdout": (result.stdout or "").strip(),
            "stderr": (result.stderr or "").strip(),
            "via": "psql",
        }

    return {
        "success": False,
        "exitCode": -1,
        "stdout": "",
        "stderr": "Neither podman exec nor psql client is available",
        "via": "none",
    }


def ensure_migration_table() -> Dict[str, Any]:
    sql = """
    CREATE TABLE IF NOT EXISTS set_schema_migrations (
        id SERIAL PRIMARY KEY,
        module_id VARCHAR(128) NOT NULL,
        migration_file VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(module_id, migration_file)
    );
    """
    return _run_psql(sql)


def _fetch_applied_migrations() -> Dict[str, Dict[str, str]]:
    result = _run_psql(
        "SELECT module_id, migration_file, checksum FROM set_schema_migrations ORDER BY id;"
    )
    applied: Dict[str, Dict[str, str]] = {}
    if not result.get("success"):
        return applied
    for line in (result.get("stdout") or "").splitlines():
        parts = [part.strip() for part in line.split("|")]
        if len(parts) != 3:
            continue
        module_id, migration_file, checksum = parts
        if module_id == "module_id":
            continue
        applied.setdefault(module_id, {})[migration_file] = checksum
    return applied


def _discover_migration_files(module_id: str) -> List[Path]:
    migrations_dir = runtime_modules_root() / module_id / "migrations"
    if not migrations_dir.is_dir():
        return []
    return sorted(migrations_dir.glob(_MIGRATION_GLOB))


def _scan_module_migrations(
    module_id: str,
    applied_for_module: Dict[str, str],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    pending: List[Dict[str, Any]] = []
    applied: List[Dict[str, Any]] = []
    for migration_path in _discover_migration_files(module_id):
        rel_name = migration_path.name
        content = migration_path.read_text(encoding="utf-8")
        digest = _checksum(content)
        record = {
            "moduleId": module_id,
            "file": rel_name,
            "checksum": digest,
            "path": str(migration_path),
        }
        known = applied_for_module.get(rel_name)
        if known is None:
            pending.append(record)
        elif known != digest:
            record["status"] = "checksum-mismatch"
            pending.append(record)
        else:
            applied.append({**record, "status": "applied"})
    return pending, applied


def get_migration_status(module_id: Optional[str] = None) -> Dict[str, Any]:
    inventory = get_set_inventory()
    modules = inventory.list_modules()
    if module_id:
        modules = [item for item in modules if item.get("moduleId") == module_id]

    table_bootstrap = ensure_migration_table()
    applied = _fetch_applied_migrations() if table_bootstrap.get("success") else {}

    module_reports: List[Dict[str, Any]] = []
    total_pending = 0
    for entry in modules:
        slot_id = str(entry.get("moduleId", "")).strip()
        if not slot_id:
            continue
        pending, applied_rows = _scan_module_migrations(
            slot_id,
            applied.get(slot_id, {}),
        )
        total_pending += len(pending)
        module_reports.append({
            "moduleId": slot_id,
            "displayName": entry.get("displayName", slot_id),
            "pendingCount": len(pending),
            "appliedCount": len(applied_rows),
            "pending": pending,
            "applied": applied_rows,
        })

    return {
        "success": True,
        "dbReady": table_bootstrap.get("success", False),
        "dbRunning": _is_db_running(),
        "moduleCount": len(module_reports),
        "pendingCount": total_pending,
        "modules": module_reports,
        "tableBootstrap": table_bootstrap,
    }


def apply_module_migrations(
    module_id: Optional[str] = None,
    *,
    dry_run: bool = False,
) -> Dict[str, Any]:
    status = get_migration_status(module_id)
    if not status.get("dbReady"):
        raise RuntimeError(
            status.get("tableBootstrap", {}).get("stderr")
            or "SET database is not reachable — start runtime first",
        )

    applied_rows: List[Dict[str, Any]] = []
    for module_report in status.get("modules") or []:
        slot_id = str(module_report.get("moduleId", ""))
        for pending in module_report.get("pending") or []:
            migration_file = str(pending.get("file", ""))
            migration_path = Path(str(pending.get("path", "")))
            if not migration_path.exists():
                continue
            if dry_run:
                applied_rows.append({
                    "moduleId": slot_id,
                    "file": migration_file,
                    "dryRun": True,
                })
                continue

            raw_content = migration_path.read_text(encoding="utf-8")
            content = _normalize_migration_sql(raw_content, slot_id)
            digest = _checksum(content)
            safe_module_id = slot_id.replace("'", "''")
            safe_file = migration_file.replace("'", "''")
            wrapped = (
                "BEGIN;\n"
                f"{content.rstrip()}\n"
                "INSERT INTO set_schema_migrations (module_id, migration_file, checksum, applied_at)\n"
                f"VALUES ('{safe_module_id}', '{safe_file}', '{digest}', NOW())\n"
                "ON CONFLICT (module_id, migration_file) DO UPDATE "
                "SET checksum = EXCLUDED.checksum, applied_at = NOW();\n"
                "COMMIT;\n"
            )
            result = _run_psql(wrapped)
            if not result.get("success"):
                raise RuntimeError(
                    f"Migration failed for {slot_id}/{migration_file}: "
                    f"{result.get('stderr') or result.get('stdout')}",
                )
            applied_rows.append({
                "moduleId": slot_id,
                "file": migration_file,
                "checksum": digest,
                "appliedAt": datetime.now(timezone.utc).isoformat(),
            })

    return {
        "success": True,
        "dryRun": dry_run,
        "appliedCount": len(applied_rows),
        "applied": applied_rows,
        "status": get_migration_status(module_id),
    }
