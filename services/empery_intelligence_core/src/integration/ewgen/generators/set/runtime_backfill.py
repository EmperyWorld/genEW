"""
Backfill set.module.json and inventory runtime for existing SET slots
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.warsmith.catalog import get_warsmith_catalog
from generators.warsmith.compose import hydrate_warsmith_entry

from .contract_gate import evaluate_install_contract
from .entry_detect import detect_module_runtime
from .integration_apply import apply_integration_snippets, apply_local_tsconfig_merges
from .inventory import get_set_inventory
from .module_files import collect_backend_files, collect_frontend_files
from .paths import runtime_modules_root
from .registry_sync import sync_runtime_registry
from .router_mount import build_set_module_router
from .router_reconcile import _resolve_matched_routes
from .runtime_manifest import (
    build_runtime_manifest,
    read_module_manifest,
    runtime_summary_for_registry,
    write_module_manifest,
)


def _existing_fe_build(manifest: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not manifest:
        return {"buildStatus": "pending"}
    fe = (manifest.get("runtime") or {}).get("fe") or {}
    result: Dict[str, Any] = {"buildStatus": fe.get("buildStatus", "pending")}
    if fe.get("buildError"):
        result["buildError"] = fe.get("buildError")
    return result


def backfill_module_runtime(module_id: str, *, rewrite_router: bool = False) -> Dict[str, Any]:
    """Write or refresh set.module.json from on-disk module files."""
    inventory = get_set_inventory()
    slot = inventory.get_module(module_id)
    if not slot:
        raise ValueError(f"SET module slot not found: {module_id}")

    module_root = runtime_modules_root() / module_id
    fe_root = module_root / "frontend"
    be_root = module_root / "backend"
    if not module_root.is_dir():
        raise ValueError(f"Module directory not found: {module_root}")

    fe_files = collect_frontend_files(fe_root)
    be_files = collect_backend_files(be_root)
    display_name = str(slot.get("displayName", module_id))
    matched_routes = _resolve_matched_routes(slot)

    router_build = build_set_module_router(
        module_id,
        display_name,
        be_files,
        matched_routes,
    )
    router_path = be_root / "router.py"
    if be_root.is_dir() and (rewrite_router or not router_path.is_file()):
        router_path.write_text(router_build["content"], encoding="utf-8")

    integration_pack: Dict[str, Any] = {}
    catalog_id = str(slot.get("sourceCatalogId", "")).strip()
    if slot.get("source") == "warsmith" and catalog_id:
        entry = get_warsmith_catalog().get_entry(catalog_id)
        if entry:
            hydrated = hydrate_warsmith_entry(entry)
            integration_pack = hydrated.get("integrationPack") or {}
            apply_integration_snippets(module_root, integration_pack, module_id=module_id)

    if fe_root.is_dir():
        apply_local_tsconfig_merges(fe_root)

    hydrated_layers = {
        "layers": {
            "frontend": {"files": fe_files},
            "backend": {"files": be_files},
        },
        "integrationPack": integration_pack,
    }
    detection = detect_module_runtime(hydrated_layers, router_build=router_build)

    existing = read_module_manifest(module_id)
    preserved_entry = (
        (existing.get("detection") or {}).get("frontend", {}).get("entryPoint")
        if existing
        else None
    )
    if preserved_entry:
        normalized = str(preserved_entry).replace("\\", "/")
        preserved_path = fe_root / normalized.lstrip("/")
        if preserved_path.is_file() and "node_modules" not in normalized:
            detection.setdefault("frontend", {})["entryPoint"] = preserved_entry

    fe_build = _existing_fe_build(existing)
    manifest = build_runtime_manifest(
        module_id,
        display_name=display_name,
        source=str(slot.get("source", "unknown")),
        detection=detection,
        router_build=router_build,
        fe_build=fe_build,
        source_catalog_id=catalog_id or None,
    )
    write_module_manifest(module_root, manifest)

    stats = dict(slot.get("stats") or {})
    stats.update({
        "frontendFiles": len(fe_files),
        "backendFiles": len(be_files),
        "mountMode": router_build.get("mountMode"),
        "mountedRouterCount": router_build.get("mountedRouterCount", 0),
        "feBuildStatus": fe_build.get("buildStatus", "pending"),
    })
    contract = detection.get("contract") or {}
    slot["stats"] = stats
    slot["runtime"] = runtime_summary_for_registry(manifest)
    slot["contract"] = {
        **(slot.get("contract") or {}),
        "overlapCount": contract.get("overlapCount", 0),
        "grade": detection.get("runtimeGrade", "C"),
        "compatVersion": "2.0.0",
    }
    inventory.upsert_module(slot)
    sync_runtime_registry(inventory.list_modules())

    return {
        "success": True,
        "moduleId": module_id,
        "mountMode": router_build.get("mountMode"),
        "mountedRouterCount": router_build.get("mountedRouterCount", 0),
        "runtimeGrade": detection.get("runtimeGrade"),
        "feBuildStatus": fe_build.get("buildStatus"),
        "entryPoint": (detection.get("frontend") or {}).get("entryPoint"),
    }


def backfill_all_module_runtimes(
    *,
    source: str | None = "warsmith",
    rewrite_router: bool = False,
) -> Dict[str, Any]:
    """Backfill runtime manifests for matching inventory slots."""
    inventory = get_set_inventory()
    backfilled: List[Dict[str, Any]] = []
    errors: List[str] = []

    for slot in inventory.list_modules():
        module_id = str(slot.get("moduleId", "")).strip()
        if not module_id:
            continue
        if source and str(slot.get("source", "")) != source:
            continue
        try:
            result = backfill_module_runtime(module_id, rewrite_router=rewrite_router)
            backfilled.append({
                "moduleId": module_id,
                "mountMode": result.get("mountMode"),
                "runtimeGrade": result.get("runtimeGrade"),
                "feBuildStatus": result.get("feBuildStatus"),
            })
        except (ValueError, OSError) as error:
            errors.append(f"{module_id}: {error}")

    return {
        "success": len(errors) == 0,
        "backfilledCount": len(backfilled),
        "backfilled": backfilled,
        "errors": errors,
    }
