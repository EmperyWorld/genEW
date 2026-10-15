"""
SET install route-contract quality gate
"""

from typing import Any, Dict, List

from generators.scavenger.integration_snippets import detect_fastapi_routers
from generators.warsmith.contract_tests import build_route_contract


def _sample_paths(paths: List[str], limit: int = 3) -> str:
    if not paths:
        return ""
    sample = [str(item) for item in paths[:limit]]
    suffix = f" (+{len(paths) - limit} more)" if len(paths) > limit else ""
    return ", ".join(sample) + suffix


def _extract_contract(hydrated: Dict[str, Any]) -> Dict[str, Any]:
    layers = hydrated.get("layers") or {}
    fe_files = list((layers.get("frontend") or {}).get("files") or [])
    be_files = list((layers.get("backend") or {}).get("files") or [])
    if fe_files or be_files:
        return build_route_contract(fe_files, be_files)

    integration = hydrated.get("integrationPack") or {}
    contract = integration.get("routeContract")
    if isinstance(contract, dict) and contract:
        return contract

    return build_route_contract([], [])


def evaluate_install_contract(
    hydrated: Dict[str, Any],
    *,
    allow_weak_contract: bool = False,
    min_overlap: int = 1,
) -> Dict[str, Any]:
    """
    Evaluate whether a Warsmith module is safe to install into SET.

    Blocks when FE and BE both expose API paths but overlap is below min_overlap,
    unless allow_weak_contract is True or the backend bundle has no APIRouter modules
    (services-only BE cannot satisfy route contract — install proceeds with warnings).
    """
    contract = _extract_contract(hydrated)
    overlap = list(contract.get("overlap") or [])
    overlap_count = int(contract.get("overlapCount", len(overlap)))
    fe_only = list(contract.get("frontendOnly") or [])
    be_only = list(contract.get("backendOnly") or [])
    fetch_paths = list(contract.get("fetchPaths") or [])
    api_paths = list(contract.get("apiPaths") or [])
    layers = hydrated.get("layers") or {}
    be_files = list((layers.get("backend") or {}).get("files") or [])
    router_count = len(detect_fastapi_routers(be_files))

    warnings: List[str] = []
    errors: List[str] = []

    if overlap_count < min_overlap:
        if fetch_paths and api_paths:
            message = (
                f"Route overlap {overlap_count} < {min_overlap} "
                f"(fetch={len(fetch_paths)}, api={len(api_paths)})"
            )
            fe_sample = _sample_paths(fe_only)
            be_sample = _sample_paths(be_only)
            if fe_sample:
                message = f"{message}. FE-only: {fe_sample}"
            if be_sample:
                message = f"{message}. BE-only: {be_sample}"
            if router_count == 0:
                message = (
                    f"{message}. Backend bundle has no FastAPI APIRouter modules — "
                    "installing as weak stub; re-import BE layer with routers for live APIs"
                )
                warnings.append(message)
            elif allow_weak_contract:
                warnings.append(message)
            else:
                errors.append(message)
        elif not fetch_paths and not api_paths:
            warnings.append("No API/fetch paths detected — stub install only")
        elif not fetch_paths:
            warnings.append("Frontend has no fetch('/api/...') paths")
        elif not api_paths:
            warnings.append("Backend has no /api router paths")

    if fe_only:
        warnings.append(f"Frontend-only routes: {len(fe_only)}")
    if be_only:
        warnings.append(f"Backend-only routes: {len(be_only)}")

    grade = "A"
    if overlap_count >= 5:
        grade = "A"
    elif overlap_count >= 1:
        grade = "B"
    elif fetch_paths or api_paths:
        grade = "C"
    else:
        grade = "·"

    return {
        "allowed": len(errors) == 0,
        "grade": grade,
        "overlapCount": overlap_count,
        "overlap": overlap[:20],
        "frontendOnlyCount": len(fe_only),
        "backendOnlyCount": len(be_only),
        "warnings": warnings,
        "errors": errors,
        "contract": contract,
    }
