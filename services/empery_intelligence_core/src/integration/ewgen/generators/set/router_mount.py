"""
Generate SET backend router.py with scavenger FastAPI router mounts (v2)
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List

from generators.scavenger.integration_snippets import (
    detect_fastapi_routers,
    detect_python_import_root,
    is_importable_module_path,
)
from generators.warsmith.contract_tests import _extract_include_router_prefixes

_INCLUDE_ROUTER_CALL_RE = re.compile(
    r"""include_router\s*\(\s*(\w+)(?:\s*,\s*prefix\s*=\s*["']([^"']+)["'])?""",
)
def _resolve_router_prefixes(be_files: List[Dict[str, str]]) -> Dict[str, str]:
    """Map router var names to prefix from main.py include_router calls."""
    prefixes = _extract_include_router_prefixes(be_files)
    for file in be_files:
        path = str(file.get("path", ""))
        if not path.endswith(".py"):
            continue
        content = str(file.get("content", ""))
        for match in _INCLUDE_ROUTER_CALL_RE.finditer(content):
            var_name = match.group(1)
            prefix = match.group(2) or prefixes.get(var_name, "")
            if var_name:
                prefixes[var_name] = prefix
    return prefixes


def build_set_module_router(
    module_id: str,
    module_name: str,
    be_files: List[Dict[str, str]],
    matched_routes: List[str],
) -> Dict[str, Any]:
    """Build router.py content for a SET module slot."""
    routers = detect_fastapi_routers(be_files)
    import_root = detect_python_import_root(be_files, routers)
    router_prefixes = _resolve_router_prefixes(be_files)
    routes_preview = ", ".join(matched_routes[:5]) if matched_routes else "none"
    matched_routes_literal = json.dumps(matched_routes[:20], ensure_ascii=False)
    mount_mode = "scavenger" if routers else "stub"
    mounted_routes: List[Dict[str, str]] = []

    lines = [
        f'"""Auto-generated SET module router for {module_name}"""',
        "import importlib.util",
        "import sys",
        "from pathlib import Path",
        "",
        "from fastapi import APIRouter",
        "",
        "router = APIRouter()",
        "_IMPORT_ERRORS: list[str] = []",
        "_MOUNTED_ROUTES: list[dict[str, str]] = []",
        "",
        "_MODULE_BACKEND_ROOT = Path(__file__).parent",
        "if str(_MODULE_BACKEND_ROOT) not in sys.path:",
        "    sys.path.insert(0, str(_MODULE_BACKEND_ROOT))",
    ]

    if import_root is not None:
        if import_root:
            lines.extend([
                f"_IMPORT_ROOT = _MODULE_BACKEND_ROOT / {json.dumps(import_root)}",
                "if _IMPORT_ROOT.is_dir() and str(_IMPORT_ROOT) not in sys.path:",
                "    sys.path.insert(0, str(_IMPORT_ROOT))",
            ])

    if routers:
        lines.append("")
        for index, router_info in enumerate(routers):
            alias = f"_mounted_router_{index}"
            module_path = router_info["modulePath"]
            file_path = str(router_info.get("path", "")).replace("\\", "/")
            var_name = router_info["varName"]
            prefix = router_prefixes.get(var_name, "")
            mounted_routes.append({
                "modulePath": module_path,
                "varName": var_name,
                "prefix": prefix,
            })
            import_lines: List[str]
            if is_importable_module_path(module_path):
                import_lines = [
                    f"    from {module_path} import {var_name} as {alias}",
                ]
            else:
                import_lines = [
                    f"    _spec_path = _MODULE_BACKEND_ROOT / {json.dumps(file_path)}",
                    "    _spec = importlib.util.spec_from_file_location(",
                    f'        "_set_mount_{index}", _spec_path)',
                    "    if _spec is None or _spec.loader is None:",
                    '        raise ImportError(f"Cannot load router spec: {_spec_path}")',
                    "    _mod = importlib.util.module_from_spec(_spec)",
                    "    _spec.loader.exec_module(_mod)",
                    f"    {alias} = getattr(_mod, {json.dumps(var_name)})",
                ]
            if prefix:
                lines.extend([
                    "try:",
                    *import_lines,
                    f"    router.include_router({alias}, prefix=\"{prefix}\")",
                    f"    _MOUNTED_ROUTES.append({{\"modulePath\": \"{module_path}\", \"varName\": \"{var_name}\", \"prefix\": \"{prefix}\"}})",
                    "except Exception as error:  # noqa: BLE001",
                    f"    _IMPORT_ERRORS.append('{module_path}:{var_name}: ' + str(error))",
                    "",
                ])
            else:
                lines.extend([
                    "try:",
                    *import_lines,
                    f"    router.include_router({alias})",
                    f"    _MOUNTED_ROUTES.append({{\"modulePath\": \"{module_path}\", \"varName\": \"{var_name}\", \"prefix\": \"\"}})",
                    "except Exception as error:  # noqa: BLE001",
                    f"    _IMPORT_ERRORS.append('{module_path}:{var_name}: ' + str(error))",
                    "",
                ])

    note = ""
    if not routers:
        note = "No FastAPI routers detected in backend bundle"

    mounted_routes_literal = json.dumps(mounted_routes, ensure_ascii=False)

    lines.extend([
        "",
        "@router.get(\"/health\")",
        "async def module_health() -> dict[str, str]:",
        "    status = \"degraded\" if _IMPORT_ERRORS else \"ok\"",
        f"    return {{\"status\": status, \"moduleId\": \"{module_id}\"}}",
        "",
        "",
        "@router.get(\"/contract\")",
        "async def module_contract() -> dict[str, object]:",
        "    return {",
        f"        \"moduleId\": \"{module_id}\",",
        f"        \"mountMode\": \"{mount_mode}\",",
        f"        \"mountedRouterCount\": {len(routers)},",
        f"        \"matchedRoutesPreview\": \"{routes_preview}\",",
        f"        \"matchedRoutes\": {matched_routes_literal},",
        "        \"mountedRoutes\": _MOUNTED_ROUTES,",
        "        \"importErrors\": _IMPORT_ERRORS,",
        f"        \"note\": \"{note}\",",
        "    }",
        "",
    ])

    return {
        "content": "\n".join(lines),
        "mountMode": mount_mode,
        "mountedRouterCount": len(routers),
        "importRoot": import_root,
        "mountedRoutes": mounted_routes,
    }
