"""
SET Adapter — verify step (SET Module Standard / Component Standard)
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.warsmith.catalog import get_warsmith_catalog
from generators.warsmith.compose import hydrate_warsmith_entry

from .component_standard import verify_set_component_standard
from .constants import (
    ADAPTER_STATUS_PARTIAL,
    ADAPTER_STATUS_READY,
    SET_COMPONENT_MODULE_KIND,
    SET_COMPONENT_STANDARD_VERSION,
)
from .staging import now_iso, read_adapter_manifest, staging_module_root, write_adapter_manifest
from generators.set.module_files import collect_backend_files, collect_frontend_files


def verify_adapter_staging(
    module_id: str,
    *,
    module_kind: Optional[str] = None,
    verify_fe_build: bool = False,
) -> Dict[str, Any]:
    """
    Run SET standard verification on adapter staging before install.
    """
    module_root = staging_module_root(module_id)
    if not module_root.is_dir():
        raise ValueError(f"Adapter staging not found: {module_id}")

    manifest = read_adapter_manifest(module_id) or {}
    resolved_kind = module_kind or str(manifest.get("moduleKind") or "")
    fe_root = module_root / "frontend"
    be_root = module_root / "backend"
    fe_files = collect_frontend_files(fe_root)
    be_files = collect_backend_files(be_root)

    module_name = str(manifest.get("moduleName") or module_id)
    warsmith_id = str(manifest.get("warsmithCatalogId") or "").strip()
    if warsmith_id:
        entry = get_warsmith_catalog().get_entry(warsmith_id)
        if entry:
            hydrated = hydrate_warsmith_entry(entry)
            module_name = str(hydrated.get("moduleName") or module_name)

    if not resolved_kind:
        if any("set_stubs/" in str(item.get("path", "")) for item in be_files):
            resolved_kind = SET_COMPONENT_MODULE_KIND
        if any("component-stub.manifest" in str(item.get("path", "")) for item in be_files):
            resolved_kind = SET_COMPONENT_MODULE_KIND

    if resolved_kind == SET_COMPONENT_MODULE_KIND:
        result = verify_set_component_standard(
            fe_files,
            be_files,
            module_name=module_name,
            module_id=module_id,
            require_fe_build=verify_fe_build,
            fe_root=fe_root if verify_fe_build else None,
        )
    else:
        from .analyze import analyze_for_set

        analysis = analyze_for_set(
            hydrated={"layers": {"frontend": {"files": fe_files}, "backend": {"files": be_files}}},
            warsmith_catalog_id=warsmith_id or None,
            require_set_ready=True,
        )
        result = {
            "moduleKind": "warsmith-import",
            "moduleId": module_id,
            "moduleName": module_name,
            "ready": bool(analysis.get("ready")),
            "verifyStatus": "ready" if analysis.get("ready") else "failed",
            "checks": analysis.get("checks") or [],
            "blockers": analysis.get("blockers") or [],
            "warnings": analysis.get("warnings") or [],
            "contract": analysis.get("contract") or {},
            "analysis": analysis,
            "feBuild": None,
        }

    frontend_entry = (
        result.get("entryPoint")
        or ((result.get("frontend") or {}).get("entryPoint") if isinstance(result.get("frontend"), dict) else None)
    )
    manifest.update({
        "moduleKind": result.get("moduleKind") or resolved_kind or "warsmith-import",
        "verifyStatus": result.get("verifyStatus"),
        "verifiedAt": now_iso(),
        "componentStandardVersion": SET_COMPONENT_STANDARD_VERSION,
        "verifyBlockers": result.get("blockers") or [],
        "verifyWarnings": result.get("warnings") or [],
        "verifyChecks": result.get("checks") or [],
    })
    if frontend_entry:
        manifest["frontendEntryPoint"] = str(frontend_entry)
    if result.get("ready"):
        manifest["adapterStatus"] = ADAPTER_STATUS_READY
        manifest["ready"] = True
    elif manifest.get("adapterStatus") != ADAPTER_STATUS_READY:
        manifest["adapterStatus"] = ADAPTER_STATUS_PARTIAL
    write_adapter_manifest(module_root, manifest)

    return {
        **result,
        "stagingPath": str(module_root),
        "manifestPath": str(module_root / "set.adapter.manifest.json"),
    }


def merge_verify_blockers(existing: List[str], verify: Dict[str, Any]) -> List[str]:
    combined = list(existing)
    for item in verify.get("blockers") or []:
        text = str(item).strip()
        if text and text not in combined:
            combined.append(text)
    return combined
