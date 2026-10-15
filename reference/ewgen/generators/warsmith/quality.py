"""
Warsmith - Compose quality gate
"""

from typing import Any, Dict, List, Optional

from generators.importer.naming import validate_module_name
from generators.importer.manifest_only import (
    FE_MANIFEST_ONLY_NO_RUNTIME,
    assert_frontend_runtime_for_compose,
    frontend_entry_needs_rematerialize,
)
from generators.importer.slice_completeness import scan_fe_slice_missing
from generators.scavenger.integration_snippets import (
    detect_fastapi_routers,
    validate_router_mount_readiness,
)

from .catalog import get_warsmith_catalog

SET_READY_MIN_ROUTERS = 1
SET_SLICE_CRITICAL_LIMIT = 3


def validate_compose(
    frontend_entry: Dict[str, Any],
    backend_entry: Dict[str, Any],
    module_name: str,
    allow_source_ref_mismatch: bool = False,
    skip_duplicate_name_check: Optional[str] = None,
    require_set_ready: bool = False,
    overwrite: bool = False,
    allow_manifest_only_frontend: bool = False,
) -> Dict[str, Any]:
    """
    Validate whether two catalog entries can be composed.
    """
    errors: List[str] = []
    warnings: List[str] = []

    name_error = validate_module_name(module_name)
    if name_error:
        errors.append(name_error)

    if not overwrite:
        if skip_duplicate_name_check:
            for summary in get_warsmith_catalog().list_entries():
                if (
                    str(summary.get("moduleName", "")).strip().lower() == module_name.strip().lower()
                    and str(summary.get("id", "")) != skip_duplicate_name_check
                ):
                    errors.append(f"Warsmith catalog already contains module: {module_name}")
                    break
        elif get_warsmith_catalog().has_module_name(module_name):
            errors.append(f"Warsmith catalog already contains module: {module_name}")

    fe_ref = (frontend_entry.get("sourceRef") or "").strip()
    be_ref = (backend_entry.get("sourceRef") or "").strip()
    if fe_ref and be_ref and fe_ref != be_ref and not allow_source_ref_mismatch:
        errors.append(
            f"sourceRef mismatch: frontend={fe_ref!r}, backend={be_ref!r}",
        )
    elif (not fe_ref or not be_ref) and fe_ref != be_ref:
        warnings.append("sourceRef missing on one layer — manual pairing")

    fe_quality = frontend_entry.get("bundleQuality") or {}
    be_quality = backend_entry.get("bundleQuality") or {}
    if fe_quality.get("securityBlocked"):
        errors.append("Frontend bundle blocked by security gate")
    if be_quality.get("securityBlocked"):
        errors.append("Backend bundle blocked by security gate")

    fe_files = frontend_entry.get("files") or []
    be_files = backend_entry.get("files") or []
    if not fe_files:
        errors.append("Frontend bundle has no files")
    if not be_files:
        errors.append("Backend bundle has no files")

    if frontend_entry_needs_rematerialize(frontend_entry):
        if allow_manifest_only_frontend:
            warnings.append(
                f"{FE_MANIFEST_ONLY_NO_RUNTIME}: composing metadata-only FE "
                "(allowManifestOnlyFrontend=true); SET/runtime install will still fail"
            )
        else:
            try:
                assert_frontend_runtime_for_compose(
                    frontend_entry,
                    allow_manifest_only=False,
                )
            except ValueError as exc:
                errors.append(str(exc))

    fe_has_api = any(
        "fetch(" in str(file.get("content", ""))
        or "/api/" in str(file.get("content", ""))
        for file in fe_files
        if str(file.get("path", "")).endswith((".ts", ".tsx", ".js", ".jsx"))
    )
    be_has_routers = any(
        "APIRouter" in str(file.get("content", ""))
        for file in be_files
        if str(file.get("path", "")).endswith(".py")
    )
    if fe_has_api and not be_has_routers:
        warnings.append(
            "Frontend references API but backend bundle has no FastAPI routers",
        )

    slice_scan = scan_fe_slice_missing(fe_files)
    if slice_scan.get("criticalMissingCount", 0) > 0:
        preview = ", ".join(slice_scan.get("criticalMissing") or [])[:120]
        message = (
            f"FE slice incomplete: {slice_scan.get('criticalMissingCount', 0)} "
            f"critical missing imports"
        )
        if preview:
            message = f"{message} ({preview})"
        if require_set_ready or slice_scan.get("criticalMissingCount", 0) > SET_SLICE_CRITICAL_LIMIT:
            errors.append(message)
        else:
            warnings.append(message)

    be_routers = detect_fastapi_routers(be_files)
    router_mount = validate_router_mount_readiness(be_routers)

    if require_set_ready:
        if not be_has_routers:
            errors.append(
                "SET-ready gate: backend bundle has no FastAPI routers — "
                "use Scavenger SET Backend preset",
            )
        elif be_routers and not router_mount["ready"]:
            preview = ", ".join(
                str(item.get("modulePath", ""))
                for item in (router_mount.get("nonImportableRouters") or [])[:3]
            )
            message = (
                "SET-ready gate: backend router modulePath(s) are not importable — "
                "re-prepare Scavenger bundle"
            )
            if preview:
                message = f"{message} ({preview})"
            errors.append(message)
        if not fe_files:
            errors.append("SET-ready gate: frontend bundle has no files")
        if frontend_entry_needs_rematerialize(frontend_entry) and not allow_manifest_only_frontend:
            errors.append(
                "SET-ready gate: frontend is manifest-only — rematerialize runtime sources"
            )

    return {
        "passed": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "sourceRefMatch": bool(fe_ref and be_ref and fe_ref == be_ref),
        "sliceCompleteness": slice_scan,
        "routerMountReadiness": router_mount,
        "setReady": require_set_ready and len(errors) == 0,
        "frontendNeedsRematerialize": frontend_entry_needs_rematerialize(
            frontend_entry
        ),
    }
