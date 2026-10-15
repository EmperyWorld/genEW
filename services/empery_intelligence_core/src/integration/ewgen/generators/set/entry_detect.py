"""
SET — detect FE/BE entry points from Warsmith layer files
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from generators.scavenger.integration_snippets import (
    detect_fastapi_routers,
    detect_monorepo_root_dir,
)

from .contract_gate import _extract_contract
from generators.warsmith.contract_tests import build_route_contract_v2

_PACKAGE_JSON_RE = re.compile(r"package\.imported.*\.json$|package\.json$", re.I)
_VITE_CONFIG_RE = re.compile(r"vite\.config\.(ts|js|mts)$", re.I)
_MAIN_TSX_RE = re.compile(r"(?:^|/)src/main\.tsx?$", re.I)
_APP_TSX_RE = re.compile(r"(?:^|/)src/(?:App|app)\.tsx?$", re.I)
_EXPORT_DEFAULT_RE = re.compile(
    r"export\s+default\s+(?:function\s+)?(\w+)",
    re.MULTILINE,
)
_NAMED_EXPORT_RE = re.compile(
    r"export\s+(?:function|const)\s+(\w+Page|\w+App|\w+Module)\b",
    re.MULTILINE,
)
_REQUIREMENTS_RE = re.compile(r"requirements.*\.txt$|pyproject\.toml$", re.I)


def _norm(path: str) -> str:
    return path.replace("\\", "/").lstrip("/")


def _is_test_path(path: str) -> bool:
    return (
        "/__tests__/" in path
        or "/__test__/" in path
        or ".test." in path
        or ".spec." in path
    )


def _find_fe_entry(files: List[Dict[str, str]]) -> Optional[str]:
    candidates: List[str] = []
    for file in files:
        path = _norm(str(file.get("path", "")))
        if not path or _is_test_path(path):
            continue
        if _MAIN_TSX_RE.search(path):
            candidates.insert(0, path)
        elif _APP_TSX_RE.search(path):
            candidates.append(path)
        else:
            content = str(file.get("content", ""))
            if _EXPORT_DEFAULT_RE.search(content) or _NAMED_EXPORT_RE.search(content):
                if path.endswith((".tsx", ".jsx")):
                    candidates.append(path)
    return candidates[0] if candidates else None


def _find_package_json(files: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
    for file in files:
        path = _norm(str(file.get("path", "")))
        if not _PACKAGE_JSON_RE.search(path):
            continue
        try:
            data = json.loads(str(file.get("content", "{}")))
            if isinstance(data, dict):
                return {"path": path, "data": data}
        except json.JSONDecodeError:
            continue
    return None


def _find_requirements_file(files: List[Dict[str, str]]) -> Optional[str]:
    for file in files:
        path = _norm(str(file.get("path", "")))
        if _REQUIREMENTS_RE.search(path):
            return path
    return None


def _router_file_paths(files: List[Dict[str, str]]) -> List[str]:
    paths: List[str] = []
    for file in files:
        path = _norm(str(file.get("path", "")))
        if not path.endswith(".py"):
            continue
        content = str(file.get("content", ""))
        if "APIRouter" in content or "@router." in path or "/routers/" in path:
            paths.append(path)
    routers = detect_fastapi_routers(files)
    for router in routers:
        router_path = router.get("path")
        if router_path and router_path not in paths:
            paths.append(router_path)
    return sorted(set(paths))


def _compute_runtime_grade(
    contract: Dict[str, Any],
    router_count: int,
    fe_entry: Optional[str],
) -> str:
    overlap = int(contract.get("overlapCount", 0))
    if overlap >= 5 and router_count > 0 and fe_entry:
        return "A"
    if overlap >= 1 and router_count > 0:
        return "B"
    if router_count > 0 or fe_entry:
        return "C"
    return "D"


def detect_module_runtime(
    hydrated: Dict[str, Any],
    *,
    router_build: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Detect FE/BE runtime metadata from a hydrated Warsmith module.
    """
    layers = hydrated.get("layers") or {}
    fe_files = list((layers.get("frontend") or {}).get("files") or [])
    be_files = list((layers.get("backend") or {}).get("files") or [])

    fe_entry = _find_fe_entry(fe_files)
    package_json = _find_package_json(fe_files)
    has_vite = any(
        _VITE_CONFIG_RE.search(_norm(str(file.get("path", ""))))
        for file in fe_files
    )

    routers = detect_fastapi_routers(be_files)
    monorepo_dir = detect_monorepo_root_dir(be_files)
    requirements_file = _find_requirements_file(be_files)

    contract = build_route_contract_v2(fe_files, be_files)
    router_count = int((router_build or {}).get("mountedRouterCount", len(routers)))

    integration = hydrated.get("integrationPack") or {}
    preview_entry = None
    for snippet in integration.get("aggregatedSnippets") or []:
        if not isinstance(snippet, dict):
            continue
        path = str(snippet.get("path", ""))
        if "previewEntrypoint" in path or "registry.merge" in path:
            try:
                data = json.loads(str(snippet.get("content", "{}")))
                if isinstance(data, dict):
                    entry = data.get("entry") or {}
                    preview_entry = entry.get("previewEntrypoint")
            except json.JSONDecodeError:
                continue

    return {
        "frontend": {
            "fileCount": len(fe_files),
            "entryPoint": fe_entry or preview_entry,
            "framework": "react-vite" if has_vite or package_json else "react-unknown",
            "packageJsonPath": (package_json or {}).get("path"),
            "hasViteConfig": has_vite,
        },
        "backend": {
            "fileCount": len(be_files),
            "routerCount": len(routers),
            "routerFiles": _router_file_paths(be_files),
            "monorepoDir": monorepo_dir,
            "requirementsFile": requirements_file,
        },
        "contract": contract,
        "contractV1": _extract_contract(hydrated),
        "runtimeGrade": _compute_runtime_grade(contract, router_count, fe_entry),
    }
