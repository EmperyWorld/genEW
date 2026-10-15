"""
Install EWGen fullstack templates into SET runtime slots
"""

import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from generators.importer.naming import to_kebab, validate_module_name

from .inventory import get_set_inventory
from .paths import runtime_modules_root, set_module_templates_root
from .registry_sync import sync_runtime_registry
from .runtime import restart_set_backend
from .snapshots import install_snapshot_guard
from .template_catalog import get_set_template
from .template_proxy_routes import proxy_routes_for_template


def _proxy_api_paths(module_id: str, template_id: str) -> list[str]:
    prefix = f"/api/modules/{module_id}"
    return proxy_routes_for_template(template_id, prefix)


def _try_apply_module_migrations(module_id: str) -> Optional[Dict[str, Any]]:
    """Apply pending SQL migrations when SET Postgres is reachable."""
    try:
        from .migrations import apply_module_migrations, get_migration_status

        status = get_migration_status(module_id)
        if not status.get("dbReady"):
            return None
        if int(status.get("pendingCount") or 0) <= 0:
            return None
        return apply_module_migrations(module_id)
    except Exception:
        return None

def _to_sql_slug(module_id: str) -> str:
    """SQL identifiers cannot contain hyphens — use snake_case."""
    return module_id.replace("-", "_")


def _replace_placeholders(
    content: str,
    *,
    module_id: str,
    module_sql_id: str,
    module_name: str,
    entity_name: str,
) -> str:
    return (
        content.replace("__MODULE_ID__", module_id)
        .replace("__MODULE_SQL_ID__", module_sql_id)
        .replace("__MODULE_NAME__", module_name)
        .replace("__ENTITY_NAME__", entity_name)
    )


def _copy_template_tree(
    source_root: Path,
    target_root: Path,
    *,
    module_id: str,
    module_sql_id: str,
    module_name: str,
    entity_name: str,
) -> int:
    written = 0
    for source_path in source_root.rglob("*"):
        if not source_path.is_file():
            continue
        rel = source_path.relative_to(source_root)
        target_path = target_root / rel
        target_path.parent.mkdir(parents=True, exist_ok=True)
        if source_path.suffix in {".py", ".sql", ".tsx", ".ts", ".json", ".md"}:
            raw = source_path.read_text(encoding="utf-8")
            target_path.write_text(
                _replace_placeholders(
                    raw,
                    module_id=module_id,
                    module_sql_id=module_sql_id,
                    module_name=module_name,
                    entity_name=entity_name,
                ),
                encoding="utf-8",
            )
        else:
            shutil.copy2(source_path, target_path)
        written += 1
    return written


def _resolve_entity_name(
    template: Dict[str, Any],
    module_name: str,
    entity_name: Optional[str],
) -> str:
    if entity_name and entity_name.strip():
        return entity_name.strip()
    default_entity = str(template.get("defaultEntityName", "")).strip()
    if default_entity:
        return default_entity
    return module_name.rstrip("s") or "Item"


def install_from_ewgen_template(
    template_id: str,
    *,
    module_name: Optional[str] = None,
    entity_name: Optional[str] = None,
    overwrite: bool = False,
    restart_backend: bool = True,
    build_frontend: bool = True,
) -> Dict[str, Any]:
    """Materialize an EWGen fullstack template into set-runtime/modules/{id}/."""
    from .bootstrap import is_runtime_bootstrapped, materialize_set_runtime
    from .generator_materialize import materialize_generator_frontend
    from .runtime_manifest import (
        build_runtime_manifest,
        runtime_summary_for_registry,
        write_module_manifest,
    )

    if not is_runtime_bootstrapped():
        materialize_set_runtime()

    template = get_set_template(template_id)
    if not template:
        raise ValueError(f"SET template not found: {template_id}")
    if not template.get("available"):
        raise FileNotFoundError(f"SET template files missing: {template_id}")

    resolved_name = module_name or str(template.get("defaultModuleName", "SetModule"))
    name_error = validate_module_name(resolved_name)
    if name_error:
        raise ValueError(name_error)

    module_id = to_kebab(resolved_name)
    module_sql_id = _to_sql_slug(module_id)
    resolved_entity = _resolve_entity_name(template, resolved_name, entity_name)

    inventory = get_set_inventory()
    existing = inventory.get_module(module_id)
    if existing and not overwrite:
        raise FileExistsError(f"Module slot already exists: {module_id}")

    prior_status = str(existing.get("status", "enabled")) if existing else "enabled"
    installed_at = str(existing.get("installedAt", "")) if existing else ""
    now_iso = datetime.now(timezone.utc).isoformat()

    source_root = set_module_templates_root() / template_id
    module_root = runtime_modules_root() / module_id
    needs_snapshot = bool(existing or module_root.exists())
    snapshot_meta = None
    fe_materialize: Dict[str, Any] = {}

    with install_snapshot_guard(
        module_id,
        reason="pre-template-install",
        enabled=needs_snapshot,
    ) as snapshot:
        snapshot_meta = snapshot
        if module_root.exists() and overwrite:
            shutil.rmtree(module_root)

        files_written = _copy_template_tree(
            source_root,
            module_root,
            module_id=module_id,
            module_sql_id=module_sql_id,
            module_name=resolved_name,
            entity_name=resolved_entity,
        )

        if build_frontend:
            fe_root = module_root / "frontend"
            fe_materialize = materialize_generator_frontend(
                module_id=module_id,
                template_id=template_id,
                module_name=resolved_name,
                fe_root=fe_root,
                entity_name=resolved_entity,
            )

    router_build = {
        "mountMode": "template-router",
        "mountedRouterCount": 1,
    }
    detection: Dict[str, Any] = {
        "frontend": fe_materialize.get("frontend") or {
            "entryPoint": None,
            "framework": "react-vite",
        },
        "runtimeGrade": fe_materialize.get("runtimeGrade", "C"),
        "contract": {
            "templateId": template_id,
            "apiPaths": _proxy_api_paths(module_id, template_id),
        },
    }
    fe_build_result: Dict[str, Any] = {
        "buildStatus": fe_materialize.get("buildStatus", "pending"),
    }
    if fe_materialize.get("buildError"):
        fe_build_result["buildError"] = fe_materialize["buildError"]

    manifest = build_runtime_manifest(
        module_id,
        display_name=resolved_name,
        source="ewgen-template",
        detection=detection,
        router_build=router_build,
        fe_build=fe_build_result,
    )
    write_module_manifest(module_root, manifest)
    runtime_summary = runtime_summary_for_registry(manifest)

    slot_entry = {
        "moduleId": module_id,
        "displayName": resolved_name,
        "source": "ewgen-template",
        "templateId": template_id,
        "entityName": resolved_entity,
        "status": prior_status,
        "installedAt": installed_at or now_iso,
        "fe": {
            "mount": f"/app/{module_id}",
            "root": f"modules/{module_id}/frontend",
        },
        "be": {
            "prefix": f"/api/modules/{module_id}",
            "root": f"modules/{module_id}/backend",
        },
        "contract": {
            "matchedRouteCount": 0,
            "overlapCount": 0,
            "grade": detection.get("runtimeGrade", "A"),
            "compatVersion": "1.0.0",
            "warnings": [],
            "templateId": template_id,
        },
        "runtime": runtime_summary,
        "stats": {
            "templateFiles": files_written,
            "hasMigrations": (module_root / "migrations").exists(),
            "generatedFileCount": fe_materialize.get("generatedFileCount"),
            "feBuildStatus": fe_build_result.get("buildStatus", "pending"),
        },
    }
    inventory.upsert_module(slot_entry)
    sync_runtime_registry(inventory.list_modules())
    backend_reload = (
        restart_set_backend()
        if restart_backend
        else {"success": True, "skipped": True}
    )

    migrations_applied = None
    if (module_root / "migrations").exists():
        migrations_applied = _try_apply_module_migrations(module_id)

    return {
        "success": True,
        "moduleId": module_id,
        "moduleName": resolved_name,
        "templateId": template_id,
        "entityName": resolved_entity,
        "slot": slot_entry,
        "filesWritten": files_written,
        "feBuild": fe_build_result,
        "backendReload": backend_reload,
        "migrationsApplied": migrations_applied,
        "snapshot": snapshot_meta,
    }
