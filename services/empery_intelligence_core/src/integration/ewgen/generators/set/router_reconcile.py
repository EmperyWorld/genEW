"""
Regenerate SET module router.py from on-disk backend files
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from generators.warsmith.catalog import get_warsmith_catalog
from generators.warsmith.compose import hydrate_warsmith_entry

from .contract_gate import evaluate_install_contract
from .entry_detect import detect_module_runtime
from .inventory import get_set_inventory
from .paths import runtime_modules_root
from .registry_sync import sync_runtime_registry
from .module_files import collect_backend_files, collect_frontend_files
from .router_mount import build_set_module_router
from .runtime import restart_set_backend
from .runtime_manifest import (
    build_runtime_manifest,
    read_module_manifest,
    runtime_summary_for_registry,
    write_module_manifest,
)


def _collect_backend_files(be_root: Path) -> List[Dict[str, str]]:
    return collect_backend_files(be_root)


def _resolve_matched_routes(slot: Dict[str, Any]) -> List[str]:
    catalog_id = str(slot.get("sourceCatalogId", "")).strip()
    if slot.get("source") == "warsmith" and catalog_id:
        entry = get_warsmith_catalog().get_entry(catalog_id)
        if entry:
            hydrated = hydrate_warsmith_entry(entry)
            gate = evaluate_install_contract(hydrated, allow_weak_contract=True)
            contract = gate.get("contract") or {}
            overlap = contract.get("overlap") or []
            if isinstance(overlap, list):
                return [str(item) for item in overlap if str(item).strip()]

    integration = slot.get("integrationPack") or {}
    matched = integration.get("matchedRoutes")
    if isinstance(matched, dict):
        items = matched.get("matched") or matched.get("matches") or []
        if isinstance(items, list):
            return [str(item.get("path", item) if isinstance(item, dict) else item) for item in items]
    return []


def reconcile_module_router(module_id: str) -> Dict[str, Any]:
    """Rewrite router.py for an installed slot using current backend files."""
    inventory = get_set_inventory()
    slot = inventory.get_module(module_id)
    if not slot:
        raise ValueError(f"SET module slot not found: {module_id}")

    module_root = runtime_modules_root() / module_id
    be_root = module_root / "backend"
    if not be_root.is_dir():
        raise ValueError(f"Backend directory not found: {be_root}")

    be_files = _collect_backend_files(be_root)
    fe_root = module_root / "frontend"
    fe_files = collect_frontend_files(fe_root)
    display_name = str(slot.get("displayName", module_id))
    matched_routes = _resolve_matched_routes(slot)

    router_build = build_set_module_router(
        module_id,
        display_name,
        be_files,
        matched_routes,
    )
    router_path = be_root / "router.py"
    router_path.write_text(router_build["content"], encoding="utf-8")

    existing_manifest = read_module_manifest(module_id) or {}
    fe_build = (existing_manifest.get("runtime") or {}).get("fe") or {}
    fe_status = fe_build.get("buildStatus", "pending")

    detection = detect_module_runtime(
        {"layers": {"frontend": {"files": fe_files}, "backend": {"files": be_files}}},
        router_build=router_build,
    )
    if existing_manifest.get("detection"):
        preserved_fe = existing_manifest["detection"].get("frontend") or {}
        preserved_entry = preserved_fe.get("entryPoint")
        if preserved_entry:
            preserved_path = fe_root / str(preserved_entry).replace("\\", "/").lstrip("/")
            if preserved_path.is_file():
                detection.setdefault("frontend", {}).update({
                    "entryPoint": preserved_entry,
                    "framework": preserved_fe.get("framework", detection.get("frontend", {}).get("framework")),
                })

    manifest = build_runtime_manifest(
        module_id,
        display_name=display_name,
        source=str(slot.get("source", "warsmith")),
        detection=detection,
        router_build=router_build,
        fe_build={"buildStatus": fe_status, "buildError": fe_build.get("buildError")},
        source_catalog_id=slot.get("sourceCatalogId"),
    )
    write_module_manifest(module_root, manifest)

    stats = dict(slot.get("stats") or {})
    stats.update({
        "backendFiles": len(be_files),
        "mountMode": router_build.get("mountMode"),
        "mountedRouterCount": router_build.get("mountedRouterCount", 0),
    })
    slot["stats"] = stats
    slot["runtime"] = runtime_summary_for_registry(manifest)
    contract = detection.get("contract") or {}
    slot["contract"] = {
        **(slot.get("contract") or {}),
        "overlapCount": contract.get("overlapCount", 0),
        "grade": detection.get("runtimeGrade", "C"),
        "compatVersion": "2.0.0",
    }
    inventory.upsert_module(slot)
    sync_runtime_registry(inventory.list_modules())
    backend_reload = restart_set_backend()

    return {
        "success": True,
        "moduleId": module_id,
        "mountMode": router_build.get("mountMode"),
        "mountedRouterCount": router_build.get("mountedRouterCount", 0),
        "matchedRouteCount": len(matched_routes),
        "backendReload": backend_reload,
    }


def reconcile_all_module_routers(*, source: str | None = "warsmith") -> Dict[str, Any]:
    """Regenerate routers for all matching inventory slots."""
    inventory = get_set_inventory()
    reconciled: List[Dict[str, Any]] = []
    errors: List[str] = []

    for slot in inventory.list_modules():
        module_id = str(slot.get("moduleId", "")).strip()
        if not module_id:
            continue
        if source and str(slot.get("source", "")) != source:
            continue
        try:
            result = reconcile_module_router(module_id)
            reconciled.append({
                "moduleId": module_id,
                "mountMode": result.get("mountMode"),
                "mountedRouterCount": result.get("mountedRouterCount"),
            })
        except (ValueError, OSError) as error:
            errors.append(f"{module_id}: {error}")

    return {
        "success": len(errors) == 0,
        "reconciledCount": len(reconciled),
        "reconciled": reconciled,
        "errors": errors,
    }
