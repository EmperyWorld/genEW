"""
SET Component Standard — verify/normalize Warsmith component modules before SET install.

Sits between Warsmith compose and SET slot install (SET Adapter verify step).
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Set

from generators.importer.slice_completeness import scan_fe_slice_missing
from generators.scavenger.integration_snippets import (
    detect_fastapi_routers,
    validate_router_mount_readiness,
)
from generators.set.component_stub import collect_component_fetch_paths
from generators.warsmith.contract_tests import build_route_contract_v2

from .analyze import _check
from .constants import SET_COMPONENT_MODULE_KIND

_ROUTER_PATH_RE = re.compile(
    r"""@router\.(?:get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]""",
    re.I,
)
_NPM_IMPORT_RE = re.compile(
    r"""(?:from|import)\s+['"]([^'"]+)['"]""",
)
_BUILTIN_PACKAGES = frozenset({
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
})


def _collect_npm_specifiers(content: str) -> List[str]:
    specs: List[str] = []
    for match in _NPM_IMPORT_RE.finditer(content):
        spec = match.group(1).strip()
        if not spec or spec.startswith(".") or spec.startswith("@"):
            continue
        root = spec.split("/", 1)[0]
        if spec.startswith("@") and "/" in spec:
            root = "/".join(spec.split("/", 2)[:2])
        specs.append(root)
    return specs


def _declared_npm_packages(fe_files: List[Dict[str, str]]) -> Set[str]:
    declared: Set[str] = set()
    for item in fe_files:
        path = str(item.get("path", "")).replace("\\", "/")
        if not path.endswith("package.json") and "package.imported" not in path:
            continue
        try:
            data = json.loads(str(item.get("content", "{}")))
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        for section in ("dependencies", "devDependencies", "peerDependencies"):
            section_data = data.get(section)
            if isinstance(section_data, dict):
                declared.update(section_data.keys())
    return declared


def scan_undeclared_npm_imports(fe_files: List[Dict[str, str]]) -> List[str]:
    """Static scan for npm packages referenced in TS but missing from bundled package.json."""
    declared = _declared_npm_packages(fe_files)
    used: Set[str] = set()
    for item in fe_files:
        path = str(item.get("path", ""))
        if not path.endswith((".ts", ".tsx", ".js", ".jsx")):
            continue
        for spec in _collect_npm_specifiers(str(item.get("content", ""))):
            if spec in _BUILTIN_PACKAGES:
                continue
            used.add(spec)
    return sorted(package for package in used if package not in declared)


def extract_stub_route_paths(be_files: List[Dict[str, str]]) -> List[str]:
    paths: Set[str] = set()
    for item in be_files:
        path = str(item.get("path", "")).replace("\\", "/")
        if not path.endswith(".py"):
            continue
        content = str(item.get("content", ""))
        for match in _ROUTER_PATH_RE.finditer(content):
            route = match.group(1).split("?")[0].rstrip("/") or match.group(1)
            paths.add(route)
    return sorted(paths)


def check_component_stub_namespace(be_files: List[Dict[str, str]]) -> List[str]:
    """Component stubs must use set_stubs/* — not api/* (sys.modules collision in SET)."""
    errors: List[str] = []
    for item in be_files:
        path = str(item.get("path", "")).replace("\\", "/")
        if path.startswith("api/"):
            errors.append(f"Component BE must not use api/ namespace: {path}")
    stub_paths = [path for path in (str(item.get("path", "")) for item in be_files) if "set_stubs/" in path]
    if not stub_paths:
        errors.append("Component BE missing set_stubs/ router module")
    return errors


def check_stub_covers_fetch_paths(
    fe_files: List[Dict[str, str]],
    be_files: List[Dict[str, str]],
) -> Dict[str, Any]:
    fetch_paths = collect_component_fetch_paths(fe_files)
    stub_paths = {path.rstrip("/") or path for path in extract_stub_route_paths(be_files)}
    normalized_fetch = {path.split("?")[0].rstrip("/") or path for path in fetch_paths}
    missing = sorted(path for path in normalized_fetch if path not in stub_paths)
    return {
        "fetchPaths": fetch_paths,
        "stubPaths": sorted(stub_paths),
        "missingInStub": missing,
        "passed": len(missing) == 0,
    }


def verify_set_component_standard(
    fe_files: List[Dict[str, str]],
    be_files: List[Dict[str, str]],
    *,
    module_name: str,
    module_id: str,
    require_fe_build: bool = False,
    fe_root: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Unified SET Component Standard checklist (between Warsmith and SET install).
    """
    checks: List[Dict[str, Any]] = []
    blockers: List[str] = []
    warnings: List[str] = []

    slice_scan = scan_fe_slice_missing(fe_files, module_name=module_name)
    entry_point = slice_scan.get("entryPoint")
    critical = int(slice_scan.get("criticalMissingCount", 0))
    checks.append(_check(
        "component-fe-entry",
        entry_point is not None,
        message=f"Entry: {entry_point}" if entry_point else "No FE entry point in component slice",
        details={"entryPoint": entry_point},
    ))
    if not entry_point:
        blockers.append("No valid frontend entry point in component slice")

    checks.append(_check(
        "component-fe-slice",
        critical == 0,
        message=(
            "FE slice complete"
            if critical == 0
            else f"FE slice incomplete: {critical} critical missing"
        ),
        details=slice_scan,
    ))
    if critical > 0:
        preview = ", ".join(slice_scan.get("criticalMissing") or [])[:120]
        blockers.append(f"FE slice incomplete ({preview})")

    namespace_errors = check_component_stub_namespace(be_files)
    checks.append(_check(
        "component-stub-namespace",
        len(namespace_errors) == 0,
        message=(
            "Stub uses isolated set_stubs/ package"
            if not namespace_errors
            else "; ".join(namespace_errors[:3])
        ),
        details={"errors": namespace_errors},
    ))
    blockers.extend(namespace_errors)

    stub_coverage = check_stub_covers_fetch_paths(fe_files, be_files)
    checks.append(_check(
        "component-stub-coverage",
        bool(stub_coverage.get("passed")),
        message=(
            f"Stub covers {len(stub_coverage.get('fetchPaths') or [])} fetch path(s)"
            if stub_coverage.get("passed")
            else f"Stub missing routes: {', '.join(stub_coverage.get('missingInStub') or [])}"
        ),
        details=stub_coverage,
    ))
    if not stub_coverage.get("passed"):
        missing = stub_coverage.get("missingInStub") or []
        blockers.append(f"Component stub missing API routes: {', '.join(missing)}")

    undeclared = scan_undeclared_npm_imports(fe_files)
    checks.append(_check(
        "fe-npm-deps-declared",
        len(undeclared) == 0,
        severity="warning" if undeclared else "error",
        message=(
            "npm imports covered by package.json"
            if not undeclared
            else f"Undeclared npm packages: {', '.join(undeclared[:8])}"
        ),
        details={"undeclared": undeclared},
    ))
    if undeclared:
        warnings.append(f"Undeclared npm packages: {', '.join(undeclared[:8])}")

    routers = detect_fastapi_routers(be_files)
    router_mount = validate_router_mount_readiness(routers)
    checks.append(_check(
        "component-be-routers",
        bool(router_mount.get("ready")) and len(routers) > 0,
        message=f"{len(routers)} component stub router(s)",
        details=router_mount,
    ))
    if not routers:
        blockers.append("Component backend has no FastAPI stub router")

    contract = build_route_contract_v2(fe_files, be_files)
    overlap_count = int(contract.get("overlapCount", 0))
    checks.append(_check(
        "component-route-contract",
        overlap_count > 0,
        message=f"FE↔BE overlap={overlap_count}",
        details={"contract": contract},
    ))
    if overlap_count <= 0:
        blockers.append("Component route contract has zero overlap")

    grade = "B" if overlap_count >= 1 else "D"
    if overlap_count >= 5 and entry_point:
        grade = "A"

    fe_build_result: Optional[Dict[str, Any]] = None
    if require_fe_build and fe_root is not None:
        from generators.set.entry_detect import detect_module_runtime
        from generators.set.fe_build import build_module_frontend
        from pathlib import Path

        detection = detect_module_runtime(
            {"layers": {"frontend": {"files": fe_files}, "backend": {"files": be_files}}},
        )
        entry_point = (detection.get("frontend") or {}).get("entryPoint")
        fe_build_result = build_module_frontend(
            module_id,
            Path(fe_root),
            entry_point=entry_point,
        )
        build_ok = fe_build_result.get("buildStatus") == "ready"
        checks.append(_check(
            "component-fe-build",
            build_ok,
            message=(
                "Vite build ready"
                if build_ok
                else str(fe_build_result.get("buildError") or "Vite build failed")
            ),
            details=fe_build_result,
        ))
        if not build_ok:
            blockers.append(str(fe_build_result.get("buildError") or "Component FE build failed"))

    unique_blockers = list(dict.fromkeys(blockers))
    ready = len(unique_blockers) == 0

    return {
        "moduleKind": SET_COMPONENT_MODULE_KIND,
        "moduleId": module_id,
        "moduleName": module_name,
        "ready": ready,
        "verifyStatus": "ready" if ready else "failed",
        "checks": checks,
        "blockers": unique_blockers,
        "warnings": warnings,
        "contract": contract,
        "grade": grade,
        "mountMode": "component-stub",
        "entryPoint": entry_point,
        "stubCoverage": stub_coverage,
        "feBuild": fe_build_result,
    }
