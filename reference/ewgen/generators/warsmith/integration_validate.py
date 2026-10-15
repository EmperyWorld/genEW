"""
Warsmith - Integration pack validation for compose and CI
"""

from typing import Any, Dict, List


def validate_integration_pack(integration_pack: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate integration pack structure and required content.
    """
    errors: List[str] = []
    warnings: List[str] = []

    env_example = str(integration_pack.get("envExample", ""))
    docker_compose = str(integration_pack.get("dockerCompose", ""))
    readme_section = str(integration_pack.get("readmeSection", ""))
    matched_routes = integration_pack.get("matchedRoutes")

    if not env_example.strip():
        errors.append("envExample is empty")
    elif "VITE_API_URL" not in env_example:
        errors.append("envExample missing VITE_API_URL")

    if not docker_compose.strip():
        errors.append("dockerCompose is empty")
    else:
        if "services:" not in docker_compose:
            errors.append("dockerCompose missing services block")
        if "backend:" not in docker_compose or "frontend:" not in docker_compose:
            warnings.append("dockerCompose should define backend and frontend services")

    if not readme_section.strip():
        errors.append("readmeSection is empty")
    elif "Warsmith integration" not in readme_section:
        warnings.append("readmeSection missing Warsmith integration heading")

    if not isinstance(matched_routes, dict):
        errors.append("matchedRoutes must be an object")
    else:
        if "pairingStrategy" not in matched_routes:
            warnings.append("matchedRoutes missing pairingStrategy")

    contract = integration_pack.get("routeContract") or {}
    overlap_count = contract.get("overlapCount", 0)
    if contract and overlap_count == 0:
        fetch_count = len(contract.get("fetchPaths") or [])
        api_count = len(contract.get("apiPaths") or [])
        if fetch_count > 0 and api_count > 0:
            warnings.append("No route overlap between frontend fetch and backend API paths")

    return {
        "passed": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }


def validate_compose_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate a compose_warsmith_module result for CI smoke checks.
    """
    errors: List[str] = []
    warnings: List[str] = []

    if not result.get("success"):
        errors.append("compose result success=false")

    manifest = result.get("manifest") or {}
    if manifest.get("schemaVersion") != 1:
        errors.append("manifest schemaVersion must be 1")
    if manifest.get("moduleType") != "fullstack-imported":
        errors.append("manifest moduleType must be fullstack-imported")

    integration_pack = result.get("integrationPack") or {}
    pack_validation = validate_integration_pack(integration_pack)
    errors.extend(pack_validation["errors"])
    warnings.extend(pack_validation["warnings"])

    validation = result.get("validation") or {}
    if not validation.get("passed"):
        errors.append("compose validation gate failed")

    layers = result.get("layers") or {}
    if not (layers.get("frontend") or {}).get("files"):
        errors.append("frontend layer has no files")
    if not (layers.get("backend") or {}).get("files"):
        errors.append("backend layer has no files")

    return {
        "passed": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "integrationPack": pack_validation,
    }
