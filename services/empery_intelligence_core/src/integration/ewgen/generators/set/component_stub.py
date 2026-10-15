"""
SET — lightweight contract stub backend for a single FE component.

Production routers from legacy monorepos are NOT copied into SET slots.
The FE Contract Crafter analyzes axios + TypeScript types and generates
demo responses that match what any component UI expects.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Set, Tuple

from generators.importer.naming import to_kebab
from generators.set.fe_contract_crafter import (
    craft_route_mock_payload,
    resolve_route_response_spec,
    _normalize_route_path,
)
from generators.warsmith.contract_tests import extract_fetch_paths_from_ts

_HTTP_METHOD_PATH_RE = re.compile(
    r"""\.(?P<method>get|post|put|patch|delete)\s*(?:<[^>]+>)?\s*\(\s*(?:['"](?P<path>/api/[^'"]+)['"]|`(?P<tpath>/api/[^`]+?)`)""",
    re.I,
)
_AIOS_TYPED_MUTATION_RE = re.compile(
    r"""axios\.(?P<method>post|put|patch|delete)\s*<\s*(?P<type>\w+)\s*>\s*\(\s*['"](?P<path>/api/[^'"]+)['"]""",
    re.I,
)


def collect_component_http_routes(fe_files: List[Dict[str, str]]) -> List[Tuple[str, str]]:
    """Collect (method, path) pairs from axios calls in the FE slice."""
    routes: List[Tuple[str, str]] = []
    seen: Set[Tuple[str, str]] = set()

    for file in fe_files:
        path = str(file.get("path", ""))
        if not path.endswith((".ts", ".tsx", ".js", ".jsx")):
            continue
        content = str(file.get("content", ""))

        for match in _HTTP_METHOD_PATH_RE.finditer(content):
            method = str(match.group("method")).lower()
            raw_path = match.group("path") or match.group("tpath") or ""
            if not raw_path.startswith("/api"):
                continue
            normalized = _normalize_route_path(raw_path)
            key = (method, normalized)
            if key not in seen:
                seen.add(key)
                routes.append(key)

        for match in _AIOS_TYPED_MUTATION_RE.finditer(content):
            method = str(match.group("method")).lower()
            raw_path = str(match.group("path") or "")
            if not raw_path.startswith("/api"):
                continue
            normalized = _normalize_route_path(raw_path)
            key = (method, normalized)
            if key not in seen:
                seen.add(key)
                routes.append(key)

    if not routes:
        for fetch_path in sorted(extract_fetch_paths_from_ts(fe_files)):
            routes.append(("get", fetch_path))

    return sorted(routes, key=lambda item: (item[1], item[0]))


def collect_component_fetch_paths(fe_files: List[Dict[str, str]]) -> List[str]:
    paths = sorted({path for _, path in collect_component_http_routes(fe_files)})
    if not paths:
        paths = ["/api/health"]
    return paths


_ECHO_BODY_HELPER = '''
def _echo_body_stub(
    body: dict[str, Any] | None,
    defaults: dict[str, Any],
    *,
    record_id: str | None = None,
) -> dict[str, Any]:
    """Merge request body over crafted defaults for mutation routes."""
    payload = {**defaults, **(body or {})}
    if record_id is not None:
        payload["id"] = record_id
    elif not payload.get("id"):
        payload["id"] = f"stub-{uuid.uuid4().hex[:8]}"
    payload["stub"] = True
    return payload
'''.strip()


def _route_params(path: str) -> List[str]:
    return re.findall(r"\{(\w+)\}", path)


def _route_accepts_body(method: str, shape: str) -> bool:
    return shape == "echo_body" and method in {"post", "patch", "put"}


def _stub_route_return(
    path: str,
    method: str,
    module_name: str,
    fe_files: List[Dict[str, str]],
) -> tuple[str, str, List[str], str, dict[str, Any] | None]:
    """Return (annotation, return_expression, extra_imports, shape, echo_defaults)."""
    spec = resolve_route_response_spec(fe_files, method, path)
    shape = str(spec.get("shape", "generic"))
    extra_imports: List[str] = []

    if shape == "echo_body":
        extra_imports.append("import uuid")
        _, defaults = craft_route_mock_payload(fe_files, method, path)
        defaults_dict = defaults if isinstance(defaults, dict) else {"ok": True, "stub": True}
        defaults_name = (
            "_DEFAULTS_"
            + re.sub(r"[^a-zA-Z0-9]+", "_", f"{method}_{path}").strip("_").upper()
        )
        path_params = _route_params(path)
        if path_params and method in {"patch", "put"}:
            id_param = path_params[-1]
            return (
                "dict[str, Any]",
                f"_echo_body_stub(body, {defaults_name}, record_id={id_param})",
                extra_imports,
                shape,
                defaults_dict,
            )
        return (
            "dict[str, Any]",
            f"_echo_body_stub(body, {defaults_name})",
            extra_imports,
            shape,
            defaults_dict,
        )

    if method == "delete":
        return "dict[str, Any]", repr({"ok": True, "stub": True}), extra_imports, "ok", None

    annotation, value = craft_route_mock_payload(fe_files, method, path)
    if shape == "generic" and isinstance(value, dict) and "route" not in value:
        value = {**value, "module": module_name, "route": path}
    return annotation, repr(value), extra_imports, shape, None


def build_component_stub_router_content(
    module_name: str,
    fetch_paths: List[str],
    fe_files: List[Dict[str, str]],
) -> str:
    """Generate a single importable APIRouter module (no third-party deps beyond FastAPI)."""
    routes = collect_component_http_routes(fe_files)
    extra_imports: Set[str] = set()
    needs_echo_helper = False
    default_constants: List[str] = []
    lines = [
        '"""SET component contract stub — mock responses for FE fetch paths."""',
        "from typing import Any",
        "",
        "from fastapi import APIRouter",
        "",
        "router = APIRouter()",
        "",
    ]

    seen_routes: Set[Tuple[str, str]] = set()
    for method, normalized in routes:
        if (method, normalized) in seen_routes:
            continue
        seen_routes.add((method, normalized))

        return_type, return_expr, route_imports, shape, echo_defaults = _stub_route_return(
            normalized, method, module_name, fe_files,
        )
        extra_imports.update(route_imports)
        if shape == "echo_body":
            needs_echo_helper = True
            if echo_defaults is not None:
                defaults_name = (
                    "_DEFAULTS_"
                    + re.sub(r"[^a-zA-Z0-9]+", "_", f"{method}_{normalized}").strip("_").upper()
                )
                default_constants.append(f"{defaults_name} = {repr(echo_defaults)}")

        func_name = "route_" + re.sub(r"[^a-zA-Z0-9]+", "_", f"{method}_{normalized}").strip("_")
        params = _route_params(normalized)
        param_parts = [f"{param}: str" for param in params]
        if _route_accepts_body(method, shape):
            param_parts.append("body: dict[str, Any] | None = None")
        param_sig = ", ".join(param_parts)
        if param_sig:
            signature = f"async def {func_name}({param_sig}) -> {return_type}:"
        else:
            signature = f"async def {func_name}() -> {return_type}:"

        decorator = f'@router.{method}("{normalized}")'
        lines.extend([
            "",
            decorator,
            signature,
            f"    return {return_expr}",
        ])

    if not seen_routes and fetch_paths:
        for path in fetch_paths:
            return_type, return_expr, route_imports, _shape, _defaults = _stub_route_return(
                path, "get", module_name, fe_files,
            )
            extra_imports.update(route_imports)
            func_name = "route_" + re.sub(r"[^a-zA-Z0-9]+", "_", path).strip("_")
            lines.extend([
                "",
                f'@router.get("{path}")',
                f"async def {func_name}() -> {return_type}:",
                f"    return {return_expr}",
            ])

    import_block = sorted(extra_imports)
    if import_block:
        lines = lines[:4] + import_block + [""] + lines[4:]

    if needs_echo_helper:
        insert_at = next(
            (idx for idx, line in enumerate(lines) if line == "router = APIRouter()"),
            len(lines) - 1,
        ) + 2
        helper_block = ["", _ECHO_BODY_HELPER]
        if default_constants:
            helper_block.extend(["", *default_constants])
        helper_block.append("")
        lines[insert_at:insert_at] = helper_block

    lines.append("")
    return "\n".join(lines)


def build_component_stub_bundle(
    module_name: str,
    fe_files: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    fetch_paths = collect_component_fetch_paths(fe_files)
    router_content = build_component_stub_router_content(module_name, fetch_paths, fe_files)
    kebab = to_kebab(module_name)
    router_module = f"set_component_{kebab.replace('-', '_')}"
    return [
        {"path": "set_stubs/__init__.py", "content": "", "language": "python"},
        {
            "path": f"set_stubs/{router_module}.py",
            "content": router_content,
            "language": "python",
        },
        {
            "path": "manifests/component-stub.manifest.json",
            "content": json.dumps({
                "moduleName": module_name,
                "kind": "set-component-stub",
                "fetchPaths": fetch_paths,
                "httpRoutes": [
                    {"method": method, "path": path}
                    for method, path in collect_component_http_routes(fe_files)
                ],
            }, indent=2),
            "language": "json",
        },
    ]
