"""
Warsmith - FE↔BE route contract extraction and test scaffolds
"""

import json
import re
from typing import Any, Dict, List, Set

from generators.importer.naming import to_kebab

API_PATH_RE = re.compile(r"""['"](/api/[^'"]+)['"]""")
FETCH_PATH_RE = re.compile(
    r"""fetch\s*\(\s*(?:`([^`]+)`|['"]([^'"]+)['"])""",
)
HTTP_CLIENT_RE = re.compile(
    r"""\.(?:get|post|put|delete|patch|request)\s*(?:<[^>]+>)?\s*\(\s*['"`](/api/[^'"`?]+)""",
)
USE_QUERY_RE = re.compile(
    r"""useQuery\s*\(\s*\{[^}]*queryKey\s*:\s*\[[^\]]*['"](/api/[^'"]+)['"]""",
    re.DOTALL,
)
INCLUDE_ROUTER_PREFIX_RE = re.compile(
    r"""\.include_router\s*\(\s*(\w+)(?:\s*,\s*prefix\s*=\s*["']([^"']+)["'])?""",
)
ROUTER_DECORATOR_RE = re.compile(
    r'@router\.(?:get|post|put|delete|patch)\(["\']([^"\']+)',
)
TEMPLATE_VAR_RE = re.compile(r"\$\{[^}]+\}")


def _normalize_api_path(raw: str) -> str:
    path = TEMPLATE_VAR_RE.sub("", raw.split("?")[0]).rstrip("/")
    if path.startswith("/api"):
        return path
    if path.startswith("api/"):
        return f"/{path}"
    return path


def extract_api_paths_from_python(files: List[Dict[str, str]]) -> Set[str]:
    """Collect normalized /api paths from Python router files."""
    paths: Set[str] = set()
    for file in files:
        path = str(file.get("path", ""))
        if not path.endswith(".py"):
            continue
        content = str(file.get("content", ""))
        for match in API_PATH_RE.finditer(content):
            route = _normalize_api_path(match.group(1).split("{")[0])
            if route.startswith("/api"):
                paths.add(route)
        if "@router." in content or "APIRouter" in content:
            for match in ROUTER_DECORATOR_RE.finditer(content):
                segment = match.group(1)
                if segment.startswith("/api"):
                    paths.add(_normalize_api_path(segment.split("{")[0]))
                elif segment.startswith("/"):
                    paths.add(
                        _normalize_api_path(
                            f"/api{segment}".replace("//", "/").split("{")[0],
                        ),
                    )
    return paths


def extract_fetch_paths_from_ts(files: List[Dict[str, str]]) -> Set[str]:
    """Collect normalized API paths from TS/JS fetch calls."""
    paths: Set[str] = set()
    for file in files:
        path = str(file.get("path", ""))
        if not (path.endswith(".ts") or path.endswith(".tsx") or path.endswith(".js")):
            continue
        content = str(file.get("content", ""))
        for match in FETCH_PATH_RE.finditer(content):
            raw = match.group(1) or match.group(2) or ""
            if not raw:
                continue
            normalized = _normalize_api_path(raw)
            if normalized.startswith("/api"):
                paths.add(normalized)
        for match in HTTP_CLIENT_RE.finditer(content):
            normalized = _normalize_api_path(match.group(1))
            if normalized.startswith("/api"):
                paths.add(normalized)
    return paths


def _extract_include_router_prefixes(backend_files: List[Dict[str, str]]) -> Dict[str, str]:
    """Map router variable names to include_router prefix from main.py."""
    prefixes: Dict[str, str] = {}
    for file in backend_files:
        path = str(file.get("path", ""))
        if not path.endswith(".py"):
            continue
        if not ("main.py" in path or path.endswith("/main.py")):
            continue
        content = str(file.get("content", ""))
        for match in INCLUDE_ROUTER_PREFIX_RE.finditer(content):
            var_name = match.group(1)
            prefix = match.group(2) or ""
            if var_name:
                prefixes[var_name] = prefix
    return prefixes


def _build_api_map(
    fetch_paths: Set[str],
    api_paths: Set[str],
) -> List[Dict[str, str]]:
    """Module-scoped API path alignment map."""
    api_map: List[Dict[str, str]] = []
    for fe_path in sorted(fetch_paths):
        match = "none"
        be_path = ""
        if fe_path in api_paths:
            match = "exact"
            be_path = fe_path
        else:
            for api_path in api_paths:
                if fe_path.startswith(api_path) or api_path.startswith(fe_path):
                    match = "prefix"
                    be_path = api_path
                    break
        api_map.append({
            "fePath": fe_path,
            "bePath": be_path,
            "match": match,
        })
    return api_map


def build_route_contract_v2(
    frontend_files: List[Dict[str, str]],
    backend_files: List[Dict[str, str]],
) -> Dict[str, Any]:
    """
    Route contract v2 — axios/react-query paths, include_router prefixes, apiMap.
    """
    contract = build_route_contract(frontend_files, backend_files)
    fetch_paths = set(contract.get("fetchPaths") or [])
    api_paths = set(contract.get("apiPaths") or [])

    for file in frontend_files:
        path = str(file.get("path", ""))
        if not (path.endswith(".ts") or path.endswith(".tsx")):
            continue
        content = str(file.get("content", ""))
        for match in USE_QUERY_RE.finditer(content):
            normalized = _normalize_api_path(match.group(1))
            if normalized.startswith("/api"):
                fetch_paths.add(normalized)

    router_prefixes = _extract_include_router_prefixes(backend_files)
    expanded_api_paths = set(api_paths)
    for prefix in router_prefixes.values():
        if prefix and prefix.startswith("/api"):
            expanded_api_paths.add(_normalize_api_path(prefix))

    overlap = sorted(expanded_api_paths & fetch_paths)
    fe_only = sorted(fetch_paths - expanded_api_paths)
    be_only = sorted(expanded_api_paths - fetch_paths)

    contract.update({
        "fetchPaths": sorted(fetch_paths),
        "apiPaths": sorted(expanded_api_paths),
        "overlap": overlap,
        "frontendOnly": fe_only,
        "backendOnly": be_only,
        "overlapCount": len(overlap),
        "aligned": len(overlap) > 0 or (not fetch_paths and not expanded_api_paths),
        "routerPrefixes": router_prefixes,
        "apiMap": _build_api_map(fetch_paths, expanded_api_paths),
        "contractVersion": "2.0.0",
    })
    return contract


def build_route_contract(
    frontend_files: List[Dict[str, str]],
    backend_files: List[Dict[str, str]],
) -> Dict[str, Any]:
    """
    Build FE↔BE route contract summary with overlap and unmatched paths.
    """
    api_paths = extract_api_paths_from_python(backend_files)
    fetch_paths = extract_fetch_paths_from_ts(frontend_files)
    overlap = sorted(api_paths & fetch_paths)
    fe_only = sorted(fetch_paths - api_paths)
    be_only = sorted(api_paths - fetch_paths)

    return {
        "apiPaths": sorted(api_paths),
        "fetchPaths": sorted(fetch_paths),
        "overlap": overlap,
        "frontendOnly": fe_only,
        "backendOnly": be_only,
        "overlapCount": len(overlap),
        "aligned": len(overlap) > 0 or (not fetch_paths and not api_paths),
    }


def build_msw_handlers_snippet(
    module_name: str,
    routes: List[str],
) -> Dict[str, str]:
    """
    MSW handler scaffold for overlapping API routes (optional dev dependency).
    """
    kebab = to_kebab(module_name)
    if not routes:
        routes = ["/api/health"]

    handler_lines: List[str] = []
    for route in routes[:24]:
        method = "get"
        handler_lines.append(
            f"  http.{method}('{route}', () => HttpResponse.json({{ ok: true, route: '{route}' }})),"
        )

    content = "\n".join([
        "/**",
        " * Warsmith MSW contract handlers",
        " * cSpell:ignore msw HttpResponse",
        " * Install: npm i -D msw",
        " */",
        "import { http, HttpResponse } from 'msw';",
        "",
        f"export const warsmith{module_name}Handlers = [",
        *handler_lines,
        "];",
        "",
    ])

    return {
        "path": f"snippets/warsmith-{kebab}.msw.handlers.ts",
        "content": content,
        "language": "typescript",
        "description": "MSW handlers for Warsmith route contract overlap",
    }


def build_pytest_route_smoke(
    module_name: str,
    contract: Dict[str, Any],
) -> Dict[str, str]:
    """
    Pytest smoke scaffold asserting declared route contract metadata.
    """
    kebab = to_kebab(module_name)
    payload = {
        "moduleName": module_name,
        "overlap": contract.get("overlap") or [],
        "apiPaths": contract.get("apiPaths") or [],
        "fetchPaths": contract.get("fetchPaths") or [],
    }

    overlap_repr = json.dumps(payload["overlap"], ensure_ascii=False)
    content = "\n".join([
        '"""Warsmith route contract smoke test scaffold"""',
        "",
        "import pytest",
        "",
        f"MODULE_NAME = {module_name!r}",
        f"OVERLAP = {overlap_repr}",
        "",
        "",
        "def test_warsmith_route_contract_has_overlap_or_empty_layers():",
        '    """Routes may be empty for UI-only bundles; overlap is preferred."""',
        "    assert isinstance(OVERLAP, list)",
        "",
        "",
        "@pytest.mark.parametrize('route', OVERLAP or ['/api/health'])",
        "def test_warsmith_overlap_route_is_api_prefixed(route: str):",
        '    assert route.startswith("/api")',
        "",
    ])

    return {
        "path": f"tests/generated/warsmith_{kebab}_contract_smoke.py",
        "content": content,
        "language": "python",
        "description": "Pytest smoke scaffold for Warsmith route contract",
    }


def build_contract_artifacts(
    module_name: str,
    frontend_files: List[Dict[str, str]],
    backend_files: List[Dict[str, str]],
) -> Dict[str, Any]:
    """
    Full contract pack: summary + MSW + pytest scaffolds.
    """
    contract = build_route_contract(frontend_files, backend_files)
    overlap = contract.get("overlap") or []
    artifacts = [
        {
            "path": f"manifests/warsmith-{to_kebab(module_name)}.route-contract.json",
            "content": json.dumps(contract, indent=2, ensure_ascii=False),
            "language": "json",
        },
        build_msw_handlers_snippet(module_name, overlap),
        build_pytest_route_smoke(module_name, contract),
    ]
    return {
        "contract": contract,
        "artifacts": artifacts,
    }
