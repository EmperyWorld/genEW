"""
SET component pipeline — one Fortune Seaker cluster + contract stub BE.

Extract a single UI component from a zip (not the whole monorepo).
"""

from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.importer.analyze import analyze_zip as fe_analyze
from generators.importer.catalog import get_import_catalog
from generators.importer.path_filters import is_blocked_path
from generators.importer.prepare import prepare_import_bundle
from generators.importer.security import security_gate
from generators.scavenger.catalog import get_scavenger_catalog
from generators.scavenger.prepare import prepare_python_bundle
from generators.set.adapter.fe_closure import expand_fe_closure
from generators.set.adapter.constants import SET_COMPONENT_MODULE_KIND
from generators.set.adapter.pipeline import run_adapter_pipeline
from generators.set.component_stub import build_component_stub_bundle, collect_component_fetch_paths
from generators.set.volume_permissions import ensure_module_volume_access
from generators.warsmith.compose import compose_warsmith_module
from generators.warsmith.contract_tests import build_route_contract

from .paths import runtime_modules_root


def _load_group_files_from_zip(
    archive: Path,
    group: Dict[str, Any],
    fe_root_prefix: str,
) -> List[Dict[str, str]]:
    paths = list(group.get("candidatePaths") or []) + list(group.get("assetPaths") or [])
    selected: List[Dict[str, str]] = []
    with zipfile.ZipFile(archive, "r") as zf:
        if not paths:
            paths = [
                name
                for name in zf.namelist()
                if name.startswith(fe_root_prefix) and not name.endswith("/")
                and not is_blocked_path(name)
            ]
        for path in paths:
            if is_blocked_path(path):
                continue
            try:
                content = zf.read(path).decode("utf-8", errors="ignore")
            except KeyError:
                continue
            rel = path
            if rel.startswith(fe_root_prefix):
                rel = rel[len(fe_root_prefix):]
            selected.append({"path": rel, "content": content})
    return selected


def run_component_pipeline(
    archive_path: Path,
    component_group_id: str,
    *,
    module_name: str,
    fe_root_prefix: str = "122/frontend/",
    source_ref: Optional[str] = None,
    license_text: str = "MIT License",
    run_install: bool = True,
    overwrite: bool = True,
    expand_closure: bool = True,
    verify_fe_build: bool = True,
    build_frontend: bool = True,
) -> Dict[str, Any]:
    """
    Run SET pipeline for a single component cluster from a zip archive.
    """
    archive = archive_path.resolve()
    if not archive.is_file():
        raise FileNotFoundError(f"Archive not found: {archive}")

    ref = source_ref or archive.name
    analysis = fe_analyze(archive.read_bytes())
    group = next(
        (item for item in (analysis.get("componentGroups") or []) if item.get("id") == component_group_id),
        None,
    )
    if group is None:
        raise ValueError(f"Component group not found: {component_group_id}")

    selected = _load_group_files_from_zip(archive, group, fe_root_prefix)
    if not selected:
        raise ValueError(f"No files loaded for component group: {component_group_id}")

    pkg_path = group.get("packageJsonPath")
    package_json = None
    if pkg_path:
        with zipfile.ZipFile(archive, "r") as zf:
            try:
                package_json = zf.read(str(pkg_path)).decode("utf-8", errors="ignore")
            except KeyError:
                package_json = None

    security = security_gate(selected, package_json, license_text)
    if security.get("blocked"):
        raise ValueError(f"Security gate blocked component import: {security}")

    fe_bundle = prepare_import_bundle(
        selected_files=selected,
        module_name=module_name,
        module_type=str(group.get("suggestedModuleType") or "imported"),
        package_json=package_json,
        source="zip",
        source_ref=ref,
    )
    fe_files = list(fe_bundle.get("files") or [])
    closure: Dict[str, Any] = {"addedCount": 0}

    if expand_closure:
        closure = expand_fe_closure(
            fe_files,
            module_name,
            ref,
            archive_fe_prefix=fe_root_prefix,
        )
        fe_files = list(closure.get("files") or fe_files)
        fe_bundle["files"] = fe_files

    fe_entry = get_import_catalog().save_entry(
        module_name=fe_bundle["moduleName"],
        module_type=fe_bundle["moduleType"],
        files=fe_files,
        source="zip",
        source_ref=ref,
        integration_hints=fe_bundle.get("integrationHints"),
        tags=["imported", "set-component", fe_bundle["moduleType"]],
        bundle_quality=fe_bundle.get("bundleQuality"),
    )

    stub_files = build_component_stub_bundle(module_name, fe_files)
    be_bundle = prepare_python_bundle(
        selected_files=[{"path": f["path"], "content": f["content"]} for f in stub_files if f["path"].endswith(".py")],
        module_name=f"{module_name}Stub",
        source="zip",
        source_ref=ref,
    )
    for extra in stub_files:
        if not extra["path"].endswith(".py"):
            be_bundle["files"].append(extra)

    be_entry = get_scavenger_catalog().save_entry(
        module_name=be_bundle["moduleName"],
        module_type="imported-python",
        files=be_bundle["files"],
        source="zip",
        source_ref=ref,
        bundle_quality=be_bundle.get("bundleQuality"),
        tags=["scavenger", "set-component-stub"],
    )

    stack_name = module_name if module_name.endswith("Component") else f"{module_name}Component"
    compose = compose_warsmith_module(
        frontend_catalog_id=fe_entry["id"],
        backend_catalog_id=be_entry["id"],
        module_name=stack_name,
        require_set_ready=False,
        save_to_catalog=True,
        overwrite=overwrite,
    )
    ws_id = compose.get("catalogId")
    if not ws_id:
        raise ValueError("Warsmith compose did not return catalogId")

    contract = build_route_contract(fe_files, be_bundle["files"])
    pipeline = run_adapter_pipeline(
        ws_id,
        run_transform=True,
        run_install=run_install,
        overwrite=overwrite,
        require_set_ready=True,
        allow_shims=True,
        allow_weak_contract=False,
        expand_closure=expand_closure,
        build_frontend=build_frontend,
        build_backend=False,
        module_kind=SET_COMPONENT_MODULE_KIND,
        run_verify=True,
        verify_fe_build=verify_fe_build,
    )

    module_id = pipeline.get("moduleId")
    if run_install and module_id:
        ensure_module_volume_access(runtime_modules_root() / module_id)

    return {
        "success": pipeline.get("success"),
        "componentGroupId": component_group_id,
        "componentLabel": group.get("label"),
        "moduleName": stack_name,
        "moduleId": module_id,
        "feFileCount": len(fe_files),
        "beFileCount": len(be_bundle.get("files") or []),
        "fetchPaths": collect_component_fetch_paths(fe_files),
        "contractOverlap": contract.get("overlap") or [],
        "frontendCatalogId": fe_entry["id"],
        "backendCatalogId": be_entry["id"],
        "warsmithCatalogId": ws_id,
        "closureAdded": (closure.get("addedCount", 0) if expand_closure else 0),
        "pipeline": pipeline,
    }
