"""
SET Adapter — analyze Warsmith bundle against SET Module Standard v1
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from generators.importer.naming import to_kebab, validate_module_name
from generators.importer.slice_completeness import scan_fe_slice_missing
from generators.scavenger.integration_snippets import (
    detect_fastapi_routers,
    validate_router_mount_readiness,
)
from generators.warsmith.catalog import get_warsmith_catalog
from generators.warsmith.compose import hydrate_warsmith_entry
from generators.warsmith.integration_validate import validate_integration_pack
from generators.warsmith.quality import validate_compose

from generators.set.contract_gate import evaluate_install_contract
from generators.set.entry_detect import detect_module_runtime

from .constants import ADAPTER_VERSION, GRADE_ORDER, SET_MODULE_STANDARD_VERSION


def _grade_at_least(grade: str, minimum: str) -> bool:
    try:
        return GRADE_ORDER.index(grade.upper()) <= GRADE_ORDER.index(minimum.upper())
    except ValueError:
        return False


def _check(
    check_id: str,
    passed: bool,
    *,
    severity: str = "error",
    message: str = "",
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "id": check_id,
        "passed": passed,
        "severity": severity,
        "message": message,
        "details": details or {},
    }


def _load_hydrated(
    warsmith_catalog_id: Optional[str] = None,
    hydrated: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if hydrated is not None:
        return hydrated
    if not warsmith_catalog_id:
        raise ValueError("warsmith_catalog_id or hydrated entry required")
    catalog = get_warsmith_catalog()
    entry = catalog.get_entry(warsmith_catalog_id)
    if not entry:
        raise ValueError(f"Warsmith catalog entry not found: {warsmith_catalog_id}")
    return hydrate_warsmith_entry(entry)


def analyze_for_set(
    warsmith_catalog_id: Optional[str] = None,
    *,
    hydrated: Optional[Dict[str, Any]] = None,
    require_set_ready: bool = True,
    min_grade: Optional[str] = None,
    allow_weak_contract: bool = False,
    overwrite: bool = False,
) -> Dict[str, Any]:
    """
    Analyze a Warsmith fullstack bundle for SET readiness.

    Returns unified checklist, blockers, and adapter readiness flag.
    """
    data = _load_hydrated(warsmith_catalog_id, hydrated)
    catalog_id = warsmith_catalog_id or str(data.get("id", ""))
    resolved_min_grade = min_grade or ("B" if require_set_ready else "C")

    module_name = str(data.get("moduleName", "ImportedModule"))
    module_id = to_kebab(module_name)
    name_error = validate_module_name(module_name)

    layers = data.get("layers") or {}
    fe_meta = layers.get("frontend") or {}
    be_meta = layers.get("backend") or {}
    fe_files = list(fe_meta.get("files") or [])
    be_files = list(be_meta.get("files") or [])

    fe_entry = {
        "files": fe_files,
        "bundleQuality": fe_meta.get("bundleQuality") or {},
        "sourceRef": fe_meta.get("sourceRef", ""),
    }
    be_entry = {
        "files": be_files,
        "bundleQuality": be_meta.get("bundleQuality") or {},
        "sourceRef": be_meta.get("sourceRef", ""),
    }

    checks: List[Dict[str, Any]] = []
    blockers: List[str] = []
    warnings: List[str] = []
    recommendations: List[str] = []

    checks.append(_check(
        "module-name-valid",
        name_error is None,
        message=name_error or "Module name is valid",
    ))
    if name_error:
        blockers.append(name_error)

    checks.append(_check(
        "fe-files-present",
        bool(fe_files),
        message="Frontend layer has files" if fe_files else "Frontend bundle is empty",
    ))
    if not fe_files:
        blockers.append("Frontend bundle has no files")

    checks.append(_check(
        "be-files-present",
        bool(be_files),
        message="Backend layer has files" if be_files else "Backend bundle is empty",
    ))
    if not be_files:
        blockers.append("Backend bundle has no files")

    compose = validate_compose(
        fe_entry,
        be_entry,
        module_name,
        require_set_ready=require_set_ready,
        skip_duplicate_name_check=(catalog_id or None) if catalog_id else None,
        overwrite=overwrite,
    )
    for error in compose.get("errors") or []:
        checks.append(_check("warsmith-compose", False, message=str(error)))
        blockers.append(str(error))
    for warning in compose.get("warnings") or []:
        checks.append(_check("warsmith-compose", True, severity="warning", message=str(warning)))
        warnings.append(str(warning))

    integration = data.get("integrationPack") or {}
    pack_validation = validate_integration_pack(integration)
    checks.append(_check(
        "integration-pack",
        bool(pack_validation.get("passed")),
        severity="warning" if pack_validation.get("passed") else "error",
        message="Integration pack valid" if pack_validation.get("passed") else "Integration pack issues",
        details=pack_validation,
    ))
    for issue in pack_validation.get("errors") or []:
        warnings.append(str(issue))

    runtime_detection = detect_module_runtime(
        {"layers": {"frontend": {"files": fe_files}, "backend": {"files": be_files}}},
    )
    entry_point = (runtime_detection.get("frontend") or {}).get("entryPoint")
    if entry_point and "node_modules" in str(entry_point).replace("\\", "/"):
        entry_point = None
    checks.append(_check(
        "fe-entry-point",
        entry_point is not None,
        message=f"Entry: {entry_point}" if entry_point else "No valid FE entry point",
        details={"entryPoint": entry_point},
    ))
    if not entry_point:
        blockers.append("No valid frontend entry point")
        recommendations.append("Re-prepare Fortune Seaker cluster with a page/App entry")

    slice_scan = scan_fe_slice_missing(
        fe_files,
        entry_path=entry_point,
        module_name=module_name,
    )
    critical = int(slice_scan.get("criticalMissingCount", 0))
    checks.append(_check(
        "fe-slice-complete",
        critical == 0,
        message=(
            f"FE slice complete ({critical} critical missing)"
            if critical == 0
            else f"FE slice incomplete: {critical} critical missing imports"
        ),
        details=slice_scan,
    ))
    if critical > 0:
        preview = ", ".join(slice_scan.get("criticalMissing") or [])[:120]
        blockers.append(f"FE slice incomplete ({preview})")
        recommendations.append(
            "Run SET Adapter transform with expandClosure or re-prepare Fortune Seaker cluster",
        )
        if fe_meta.get("sourceRef"):
            recommendations.append(
                f"Archive available at sourceRef: {fe_meta.get('sourceRef')}",
            )

    routers = detect_fastapi_routers(be_files)
    router_mount = validate_router_mount_readiness(routers)
    mount_mode = "scavenger" if routers else "stub"
    checks.append(_check(
        "be-routers-importable",
        bool(router_mount.get("ready")),
        message=(
            f"{len(routers)} router(s), mountMode={mount_mode}"
            if router_mount.get("ready")
            else "Backend routers not importable"
        ),
        details=router_mount,
    ))
    if require_set_ready and not routers:
        blockers.append(
            "No FastAPI routers — use Scavenger SET Backend preset (routers+services)",
        )
        recommendations.append("Scavenger prepare with SET Backend labels preset")
    elif routers and not router_mount.get("ready"):
        blockers.append("Backend router modulePath(s) are not importable")
        recommendations.append("Re-prepare Scavenger bundle with clean package paths")

    gate = evaluate_install_contract(
        data,
        allow_weak_contract=allow_weak_contract or not require_set_ready,
    )
    contract = gate.get("contract") or {}
    grade = str(gate.get("grade") or contract.get("grade") or "D")
    overlap_count = int(contract.get("overlapCount", 0))

    checks.append(_check(
        "route-contract",
        bool(gate.get("allowed")),
        severity="warning" if gate.get("allowed") else "error",
        message=f"Contract grade {grade}, overlap={overlap_count}",
        details={"gate": gate, "contract": contract},
    ))
    if not gate.get("allowed"):
        for error in gate.get("errors") or []:
            blockers.append(str(error))
    for warning in gate.get("warnings") or []:
        warnings.append(str(warning))

    grade_ok = _grade_at_least(grade, resolved_min_grade)
    checks.append(_check(
        "contract-grade",
        grade_ok,
        severity="warning" if grade_ok else "error",
        message=f"Grade {grade} (min {resolved_min_grade})",
    ))
    if not grade_ok:
        blockers.append(f"Contract grade {grade} below minimum {resolved_min_grade}")

    ready = len(blockers) == 0

    if not fe_meta.get("sourceRef") or not be_meta.get("sourceRef"):
        recommendations.append("Ensure FE and BE share the same sourceRef in Warsmith")

    return {
        "success": True,
        "adapterVersion": ADAPTER_VERSION,
        "standardVersion": SET_MODULE_STANDARD_VERSION,
        "warsmithCatalogId": catalog_id,
        "moduleName": module_name,
        "moduleId": module_id,
        "ready": ready,
        "adapterStatus": "ready" if ready else "failed",
        "grade": grade,
        "mountMode": mount_mode,
        "checks": checks,
        "blockers": blockers,
        "warnings": warnings,
        "recommendations": recommendations,
        "frontend": {
            "fileCount": len(fe_files),
            "entryPoint": entry_point,
            "sliceScan": slice_scan,
        },
        "backend": {
            "fileCount": len(be_files),
            "routerCount": len(routers),
            "routerMount": router_mount,
            "mountMode": mount_mode,
        },
        "contract": contract,
        "composeValidation": {
            "passed": compose.get("passed"),
            "errors": compose.get("errors"),
            "warnings": compose.get("warnings"),
        },
    }
