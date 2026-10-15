"""
Install SET module from adapter staging (data/set-adapter-staging/{moduleId}/)
"""

from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.importer.naming import validate_module_name

from .adapter.gate import assert_adapter_ready_for_install
from .adapter.staging import read_adapter_manifest, staging_module_root
from .bootstrap import bootstrap_set_runtime
from .entry_detect import detect_module_runtime
from .fe_build import build_module_frontend
from .inventory import get_set_inventory
from .module_files import collect_frontend_files
from .paths import runtime_modules_root, runtime_root
from .registry_sync import sync_runtime_registry
from .requirements_merge import merge_module_requirements
from .router_reconcile import _collect_backend_files, _resolve_matched_routes
from .runtime import restart_set_backend
from .runtime_manifest import (
    build_runtime_manifest,
    runtime_summary_for_registry,
    write_module_manifest,
)
from .snapshots import install_snapshot_guard
from .volume_permissions import ensure_module_volume_access


def _copy_staging_tree(source: Path, target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(
        source,
        target,
        ignore=shutil.ignore_patterns("__pycache__", "node_modules", "dist", ".set"),
    )


def install_from_adapter_staging(
    module_id: str,
    *,
    overwrite: bool = False,
    build_frontend: bool = False,
    build_backend: bool = True,
    require_adapter_ready: bool = True,
) -> Dict[str, Any]:
    """
    Copy adapter staging into set-runtime/modules/{moduleId}/ and register slot.
    """
    bootstrap_set_runtime()

    adapter_manifest = read_adapter_manifest(module_id)
    if require_adapter_ready:
        gate = assert_adapter_ready_for_install(module_id=module_id)
    else:
        from .adapter.gate import evaluate_adapter_gate

        gate = evaluate_adapter_gate(module_id=module_id)

    staging_root = staging_module_root(module_id)
    if not staging_root.is_dir():
        raise ValueError(f"Adapter staging not found: {module_id}")

    display_name = str((adapter_manifest or {}).get("moduleName") or module_id)
    name_error = validate_module_name(display_name)
    if name_error:
        raise ValueError(name_error)

    warsmith_catalog_id = str((adapter_manifest or {}).get("warsmithCatalogId", "")).strip()
    inventory = get_set_inventory()
    existing = inventory.get_module(module_id)
    if existing and not overwrite:
        raise FileExistsError(f"Module slot already exists: {module_id}")

    prior_status = str(existing.get("status", "enabled")) if existing else "enabled"
    installed_at = str(existing.get("installedAt", "")) if existing else ""
    now_iso = datetime.now(timezone.utc).isoformat()

    module_root = runtime_modules_root() / module_id
    needs_snapshot = bool(existing or module_root.exists())

    fe_build_result: Dict[str, Any] = {"buildStatus": "pending"}
    detection: Dict[str, Any] = {}
    manifest: Dict[str, Any] = {}
    req_merge = None
    fe_files: List[Dict[str, str]] = []
    be_files: List[Dict[str, str]] = []

    with install_snapshot_guard(
        module_id,
        reason="pre-adapter-staging-install",
        enabled=needs_snapshot,
    ) as snapshot:
        _copy_staging_tree(staging_root, module_root)

        fe_root = module_root / "frontend"
        be_root = module_root / "backend"
        fe_files = collect_frontend_files(fe_root) if fe_root.is_dir() else []
        be_files = _collect_backend_files(be_root) if be_root.is_dir() else []

        router_build = {
            "mountMode": (adapter_manifest or {}).get("mountMode", "stub"),
            "mountedRouterCount": (
                ((adapter_manifest or {}).get("routerBuild") or {}).get("mountedRouterCount", 0)
            ),
        }
        if (be_root / "router.py").is_file():
            router_build["mountMode"] = str(
                (adapter_manifest or {}).get("mountMode")
                or router_build.get("mountMode", "scavenger"),
            )

        detection = detect_module_runtime(
            {
                "layers": {
                    "frontend": {"files": fe_files},
                    "backend": {"files": be_files},
                },
            },
            router_build=router_build,
        )
        fe_entry_from_manifest = str((adapter_manifest or {}).get("frontendEntryPoint") or "").strip()
        if fe_entry_from_manifest and detection.get("frontend"):
            detection["frontend"]["entryPoint"] = fe_entry_from_manifest
        else:
            entry_override = ((adapter_manifest or {}).get("integration") or {}).get("entryPointOverride")
            if entry_override and detection.get("frontend"):
                override_path = fe_root / str(entry_override).replace("\\", "/").lstrip("/")
                if override_path.is_file():
                    detection["frontend"]["entryPoint"] = entry_override

        if build_frontend:
            entry_point = (detection.get("frontend") or {}).get("entryPoint")
            api_base = f"/api/modules/{module_id}/proxy"
            fe_build_result = build_module_frontend(
                module_id,
                fe_root,
                entry_point=entry_point,
                api_base=api_base,
            )

        if build_backend:
            req_merge = merge_module_requirements(
                module_id,
                be_files,
                module_root=module_root,
            )

        manifest = build_runtime_manifest(
            module_id,
            display_name=display_name,
            source="warsmith",
            detection=detection,
            router_build=router_build,
            fe_build=fe_build_result,
            source_catalog_id=warsmith_catalog_id or None,
        )
        manifest["adapter"] = {
            "adapterVersion": (adapter_manifest or {}).get("adapterVersion"),
            "transformedAt": (adapter_manifest or {}).get("transformedAt"),
            "stagingPath": str(staging_root),
        }
        write_module_manifest(module_root, manifest)
        volume_access = ensure_module_volume_access(
            module_root,
            modules_root=runtime_modules_root(),
        )

    runtime_summary = runtime_summary_for_registry(manifest)
    contract_v2 = detection.get("contract") or {}
    matched: List[str] = list(contract_v2.get("overlap") or [])

    slot_entry = {
        "moduleId": module_id,
        "displayName": display_name,
        "source": "warsmith",
        "sourceCatalogId": warsmith_catalog_id or (existing.get("sourceCatalogId") if existing else None),
        "status": prior_status,
        "installedAt": installed_at or now_iso,
        "lastSyncedAt": now_iso,
        "fe": {
            "mount": f"/app/{module_id}",
            "root": f"modules/{module_id}/frontend",
        },
        "be": {
            "prefix": f"/api/modules/{module_id}",
            "root": f"modules/{module_id}/backend",
        },
        "contract": {
            "matchedRouteCount": len(matched),
            "overlapCount": contract_v2.get("overlapCount", len(matched)),
            "grade": detection.get("runtimeGrade", (adapter_manifest or {}).get("grade")),
            "compatVersion": "2.0.0",
            "warnings": gate.get("warnings") or [],
        },
        "runtime": runtime_summary,
        "stats": {
            "frontendFiles": len(fe_files),
            "backendFiles": len(be_files),
            "mountMode": router_build.get("mountMode"),
            "mountedRouterCount": router_build.get("mountedRouterCount", 0),
            "feBuildStatus": fe_build_result.get("buildStatus", "pending"),
        },
    }
    inventory.upsert_module(slot_entry)
    sync_runtime_registry(inventory.list_modules())
    backend_reload = restart_set_backend() if build_backend else {"success": True, "skipped": True}

    return {
        "success": True,
        "moduleId": module_id,
        "moduleName": display_name,
        "warsmithCatalogId": warsmith_catalog_id,
        "runtimePath": str(runtime_root()),
        "slot": slot_entry,
        "manifest": manifest,
        "detection": detection,
        "feBuild": fe_build_result,
        "requirementsMerge": req_merge,
        "adapterGate": gate,
        "backendReload": backend_reload,
        "snapshot": snapshot,
        "installedFrom": "adapter-staging",
        "volumeAccess": volume_access,
    }
