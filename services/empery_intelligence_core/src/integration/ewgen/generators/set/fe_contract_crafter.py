"""
SET FE Contract Crafter — generic mock responses from TypeScript types + axios usage.

Works for any component slice: parses interfaces/types in FE files, resolves
axios response types per route, and crafts demo payloads that match what the UI expects.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set, Tuple


def _normalize_route_path(raw: str) -> str:
    path = raw.split("?")[0].strip()
    path = re.sub(r"\$\{[^}]+\}", "{id}", path)
    if "{" not in path:
        path = path.rstrip("/") or path
    return path

_INTERFACE_RE = re.compile(
    r"(?:export\s+)?interface\s+(\w+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}",
    re.DOTALL,
)
_TYPE_ALIAS_RE = re.compile(
    r"export\s+type\s+(\w+)\s*=\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\s*;",
    re.DOTALL,
)
_FIELD_RE = re.compile(r"(\w+)\s*\??\s*:\s*([^;\n]+)")
_AXIOS_GET_TYPE_RE = re.compile(
    r"""axios\.get\s*<\s*([^>]+)\s*>\s*\(\s*(?:['"](?P<path>/api/[^'"]+)['"]|`(?P<tpath>/api/[^`]+?)`)""",
    re.I,
)
_AXIOS_MUTATION_TYPE_RE = re.compile(
    r"""axios\.(?P<method>post|put|patch)\s*<\s*(?P<type>[^>]+)\s*>\s*\(\s*['"](?P<path>/api/[^'"]+)['"]""",
    re.I,
)
_AXIOS_UNTYPED_RE = re.compile(
    r"""axios\.(?P<method>get|post|put|patch|delete)\s*\(\s*(?:['"](?P<path>/api/[^'"]+)['"]|`(?P<tpath>/api/[^`]+?)`)""",
    re.I,
)
_USE_STATE_ARRAY_RE = re.compile(r"useState\s*<\s*(\w+)\s*\[\]\s*>")
_SET_STATE_RE = re.compile(r"set(\w+)\s*\(\s*response\.data\b")
_WRAPPED_DATA_RE = [
    (re.compile(r"response\.data\.results\b"), "results"),
    (re.compile(r"response\.data\.items\b"), "items"),
    (re.compile(r"response\.data\.activities\b"), "activities"),
    (re.compile(r"\(response\.data\s+as\s+\w+\)\.activities"), "activities"),
]
_ARRAY_IS_ARRAY_RE = re.compile(r"Array\.isArray\s*\(\s*response\.data\s*\)")
_DIRECT_ARRAY_SET_RE = re.compile(
    r"set\w+\s*\(\s*(?:Array\.isArray\(response\.data\)\s*\?\s*response\.data\s*:\s*\[\]|response\.data)\s*\)",
)
_RESPONSE_DATA_MAP_RE = re.compile(
    r"(?:response\.data|\w+)\s*\.map\s*\(",
)
_RESPONSE_DATA_ASSIGN_RE = re.compile(r"\w+\s*=\s*response\.data\s*;")


def parse_typescript_types(fe_files: List[Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    """Collect interface/type field maps from FE slice."""
    types: Dict[str, Dict[str, str]] = {}
    for file in fe_files:
        content = str(file.get("content", ""))
        for pattern in (_INTERFACE_RE, _TYPE_ALIAS_RE):
            for match in pattern.finditer(content):
                name = match.group(1)
                body = match.group(2)
                fields = _FIELD_RE.findall(body)
                if fields:
                    types[name] = {field: ftype.strip() for field, ftype in fields}
    return types


def _clean_ts_type(raw: str) -> str:
    return raw.strip().replace("\n", " ")


def _split_union(ts_type: str) -> List[str]:
    parts: List[str] = []
    current: List[str] = []
    depth = 0
    for char in ts_type:
        if char in "{<([":
            depth += 1
        elif char in "}>)]":
            depth -= 1
        if char == "|" and depth == 0:
            parts.append("".join(current).strip())
            current = []
            continue
        current.append(char)
    parts.append("".join(current).strip())
    return [part for part in parts if part and part not in {"null", "undefined"}]


def _string_mock(field_name: str) -> str:
    lowered = field_name.lower()
    if lowered == "id" or lowered.endswith("_id"):
        return "stub-1"
    if "title" in lowered or lowered == "name":
        return "Demo item"
    if "message" in lowered or "preview" in lowered or "description" in lowered:
        return "Sample content for SET preview"
    if lowered.endswith("_type") or lowered == "type":
        return "document"
    if "action" in lowered:
        return "created"
    if "email" in lowered:
        return "demo@example.com"
    if "model" in lowered:
        return "llama3"
    if lowered.endswith("_at") or "timestamp" in lowered or "date" in lowered:
        return "2025-06-07T10:00:00Z"
    if "status" in lowered:
        return "healthy"
    if "metric" in lowered:
        return "documents"
    if "content_type" in lowered or "mime" in lowered:
        return "application/pdf"
    return "demo"


def _number_mock(field_name: str) -> int | float:
    lowered = field_name.lower()
    if "percent" in lowered or "uptime" in lowered:
        return 99.5
    if "ms" in lowered or "time" in lowered:
        return 42
    if "size" in lowered or "mb" in lowered or "storage" in lowered:
        return 128
    if "count" in lowered or "total" in lowered or "requests" in lowered:
        return 12
    if lowered in {"value", "width", "height", "position_x", "position_y"}:
        return 4
    return 1


def craft_field_value(
    field_name: str,
    ts_type: str,
    types: Dict[str, Dict[str, str]],
    *,
    depth: int = 0,
) -> Any:
    if depth > 5:
        return None

    cleaned = _clean_ts_type(ts_type)
    if "|" in cleaned:
        branches = _split_union(cleaned)
        if branches:
            return craft_field_value(field_name, branches[0], types, depth=depth + 1)
        return None

    if cleaned.endswith("[]"):
        inner = cleaned[:-2].strip()
        return [
            craft_object_mock(inner, types, depth=depth + 1, variant=0),
            craft_object_mock(inner, types, depth=depth + 1, variant=1),
        ]

    if cleaned in types:
        return craft_object_mock(cleaned, types, depth=depth + 1, variant=0)

    if cleaned in {"string", "String"}:
        return _string_mock(field_name)
    if cleaned in {"number", "Number"}:
        return _number_mock(field_name)
    if cleaned == "boolean":
        return True
    if cleaned.startswith("Record<") or cleaned.startswith("{ [") or cleaned == "Settings":
        return {}
    if cleaned in {"any", "unknown", "object", "Object"}:
        return {}
    if cleaned.startswith("'") or cleaned.startswith('"'):
        return cleaned.strip("'\"")

    literal_match = re.match(r"'([^']+)'", cleaned)
    if literal_match:
        return literal_match.group(1)

    return _string_mock(field_name)


def craft_object_mock(
    type_name: str,
    types: Dict[str, Dict[str, str]],
    *,
    depth: int = 0,
    variant: int = 0,
) -> Dict[str, Any]:
    if depth > 5 or type_name not in types:
        return {"id": f"stub-{variant + 1}", "stub": True}

    payload: Dict[str, Any] = {}
    for field, field_type in types[type_name].items():
        if field == "id":
            payload["id"] = f"stub-{variant + 1}"
            continue
        payload[field] = craft_field_value(field, field_type, types, depth=depth + 1)
    payload.setdefault("stub", True)
    return payload


def _resolve_type_name(raw: str, types: Dict[str, Dict[str, str]]) -> Optional[str]:
    cleaned = _clean_ts_type(raw)
    if cleaned.endswith("[]"):
        cleaned = cleaned[:-2].strip()
    branches = _split_union(cleaned)
    for branch in branches:
        branch = branch.strip()
        if branch.endswith("[]"):
            branch = branch[:-2].strip()
        if branch in types:
            return branch
    return None


def _detect_response_wrapper(content: str, anchor: int) -> Optional[str]:
    window = content[anchor:anchor + 800]
    for pattern, key in _WRAPPED_DATA_RE:
        if pattern.search(window):
            return key
    return None


def _detect_array_response(content: str, anchor: int) -> bool:
    window = content[anchor:anchor + 800]
    if _ARRAY_IS_ARRAY_RE.search(window):
        return True
    if _DIRECT_ARRAY_SET_RE.search(window):
        return True
    if _RESPONSE_DATA_MAP_RE.search(window):
        return True
    if _RESPONSE_DATA_ASSIGN_RE.search(window) and ".map(" in window:
        return True
    for pattern, _ in _WRAPPED_DATA_RE:
        if pattern.search(window):
            return False
    if re.search(r"set\w+\s*\(\s*response\.data\s*\)", window):
        return True
    return False


def _infer_type_from_local_annotation(content: str, anchor: int) -> Optional[str]:
    window = content[anchor:anchor + 500]
    match = re.search(r":\s*(\w+)\s*\[\]\s*=\s*\w+\.map\s*\(", window)
    if match:
        return match.group(1)
    match = re.search(r"=\s*response\.data\s*;\s*\n\s*const\s+\w+:\s*(\w+)\s*\[\]", window)
    if match:
        return match.group(1)
    return None


def _infer_type_from_state_setter(content: str, anchor: int) -> Optional[str]:
    window = content[anchor:anchor + 400]
    match = _SET_STATE_RE.search(window)
    if not match:
        return None
    state_key = match.group(1)
    if not state_key:
        return None
    state_name = state_key[0].lower() + state_key[1:]
    for state_match in _USE_STATE_ARRAY_RE.finditer(content):
        type_name = state_match.group(1)
        search_from = max(0, state_match.start() - 120)
        context = content[search_from:state_match.end() + 40]
        if state_name in context or state_key in context:
            return type_name
    return None


def resolve_route_response_spec(
    fe_files: List[Dict[str, str]],
    method: str,
    path: str,
) -> Dict[str, Any]:
    """Resolve how a route response should look for the FE consumer."""
    normalized = _normalize_route_path(path.split("?")[0])
    method = method.lower()
    types = parse_typescript_types(fe_files)

    for file in fe_files:
        file_path = str(file.get("path", ""))
        if not file_path.endswith((".ts", ".tsx", ".js", ".jsx")):
            continue
        content = str(file.get("content", ""))

        for match in _AXIOS_GET_TYPE_RE.finditer(content):
            raw_path = match.group("path") or match.group("tpath") or ""
            route_norm = _normalize_route_path(raw_path)
            if route_norm != normalized and route_norm.rstrip("/") != normalized.rstrip("/"):
                continue
            type_expr = _clean_ts_type(match.group(1))
            anchor = match.end()
            wrapper = _detect_response_wrapper(content, anchor)
            is_array = type_expr.endswith("[]") or _detect_array_response(content, anchor)
            type_name = _resolve_type_name(type_expr, types)
            if not type_name and "|" in type_expr:
                for branch in _split_union(type_expr):
                    type_name = _resolve_type_name(branch, types)
                    if type_name:
                        if branch.endswith("[]"):
                            is_array = True
                        break
            return {
                "shape": "array" if is_array else ("wrapped" if wrapper else "object"),
                "type_name": type_name,
                "wrapper_key": wrapper,
                "type_expr": type_expr,
            }

        for match in _AXIOS_MUTATION_TYPE_RE.finditer(content):
            if str(match.group("method")).lower() != method:
                continue
            route_norm = _normalize_route_path(str(match.group("path") or ""))
            if route_norm != normalized and route_norm.rstrip("/") != normalized.rstrip("/"):
                continue
            type_name = _resolve_type_name(str(match.group("type") or ""), types)
            return {
                "shape": "echo_body",
                "type_name": type_name,
                "wrapper_key": None,
                "type_expr": str(match.group("type") or ""),
            }

        for match in _AXIOS_UNTYPED_RE.finditer(content):
            if str(match.group("method")).lower() != method:
                continue
            raw_path = match.group("path") or match.group("tpath") or ""
            route_norm = _normalize_route_path(raw_path)
            if route_norm != normalized and route_norm.rstrip("/") != normalized.rstrip("/"):
                continue
            anchor = match.end()
            wrapper = _detect_response_wrapper(content, anchor)
            is_array = _detect_array_response(content, anchor)
            type_name = _infer_type_from_state_setter(content, anchor)
            if not type_name:
                type_name = _infer_type_from_local_annotation(content, anchor)
            if type_name or wrapper or is_array:
                return {
                    "shape": "array" if is_array else ("wrapped" if wrapper else "object"),
                    "type_name": type_name,
                    "wrapper_key": wrapper,
                    "type_expr": type_name or "",
                }

    normalized = _normalize_route_path(path.split("?")[0])
    if method == "get" and _path_suggests_array(normalized):
        return {
            "shape": "array",
            "type_name": None,
            "wrapper_key": None,
            "type_expr": "",
        }

    return {
        "shape": "generic",
        "type_name": None,
        "wrapper_key": None,
        "type_expr": "",
    }


def _path_suggests_array(path: str) -> bool:
    lowered = path.lower()
    if lowered.endswith("/widgets"):
        return True
    markers = (
        "recent-",
        "analytics",
        "activity",
        "/list",
        "usage",
        "breakdown",
    )
    return any(marker in lowered for marker in markers)


def craft_route_mock_payload(
    fe_files: List[Dict[str, str]],
    method: str,
    path: str,
) -> Tuple[str, Any]:
    """Return (python_type_annotation, python_value) for a stub route."""
    method = method.lower()
    spec = resolve_route_response_spec(fe_files, method, path)
    types = parse_typescript_types(fe_files)
    shape = str(spec.get("shape", "generic"))
    type_name = spec.get("type_name")
    wrapper_key = spec.get("wrapper_key")

    if method == "delete":
        return "dict[str, Any]", {"ok": True, "stub": True}

    if shape == "echo_body":
        default = craft_object_mock(str(type_name), types) if type_name else {"ok": True, "stub": True}
        return "dict[str, Any]", default

    if shape == "array":
        item_type = str(type_name) if type_name else "StubItem"
        if item_type not in types:
            types[item_type] = {"id": "string", "title": "string"}
        items = [
            craft_object_mock(item_type, types, variant=0),
            craft_object_mock(item_type, types, variant=1),
            craft_object_mock(item_type, types, variant=2),
        ]
        return "list[dict[str, Any]]", items

    if shape == "wrapped" and wrapper_key:
        item_type = str(type_name) if type_name else "StubItem"
        if item_type not in types:
            types[item_type] = {"id": "string", "title": "string"}
        items = [
            craft_object_mock(item_type, types, variant=0),
            craft_object_mock(item_type, types, variant=1),
        ]
        return "dict[str, Any]", {str(wrapper_key): items, "stub": True}

    if shape == "object" and type_name:
        return "dict[str, Any]", craft_object_mock(str(type_name), types)

    normalized = _normalize_route_path(path.split("?")[0])
    if method == "get" and normalized.endswith("/health"):
        return "dict[str, Any]", {"status": "ok", "stub": True}
    if method in {"post", "put", "patch"} and normalized.endswith("/reset"):
        return "dict[str, Any]", {"ok": True, "stub": True}

    return "dict[str, Any]", {"ok": True, "stub": True, "route": normalized}


def craft_route_mock_expr(
    fe_files: List[Dict[str, str]],
    method: str,
    path: str,
) -> Tuple[str, str]:
    """Return (annotation, repr expression) for generated stub handler."""
    annotation, value = craft_route_mock_payload(fe_files, method, path)
    return annotation, repr(value)
