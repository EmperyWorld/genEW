"""
EWGen — normalize imported FE/BE bundles to canonical module layout.

See docs/EWGEN_MODULE_LAYOUT.md
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from generators.importer.naming import to_kebab
from generators.importer.slice_completeness import scan_fe_slice_missing

from .docs import generate_module_docs

_IMPORT_SPEC_RE = re.compile(
    r"""((?:from|import)\s+['"])([^'"]+)(['"])""",
)
_DYNAMIC_IMPORT_RE = re.compile(
    r"""(import\s*\(\s*['"])([^'"]+)(['"])""",
)

_MONOREPO_BE_PREFIXES = (
    "EliteEW2/api/",
    "api-services/",
    "api/backend/",
    "api/",
)


def _norm_path(path: str) -> str:
    return path.replace("\\", "/").lstrip("/")


def _infer_bundle_id_from_files(
    frontend_files: List[Dict[str, Any]],
    backend_files: List[Dict[str, Any]],
) -> Optional[str]:
    """Infer kebab id embedded in raw importer/scavenger paths."""
    for item in list(frontend_files) + list(backend_files):
        path = _norm_path(str(item.get("path", "")))
        fe_marker = "src/imported/"
        if path.startswith(fe_marker):
            kebab = path[len(fe_marker):].split("/", 1)[0]
            if kebab:
                return kebab
        be_marker = "generators/imported_python/"
        if path.startswith(be_marker):
            kebab = path[len(be_marker):].split("/", 1)[0]
            if kebab:
                return kebab
    return None


def _rewrite_import_spec(spec: str, module_id: str) -> Tuple[str, bool]:
    """Rewrite @imported/{module_id}/… aliases to @/…"""
    changed = False
    updated = spec
    for prefix in (
        f"@imported/{module_id}/frontend/src/",
        f"@imported/{module_id}/frontend/",
        f"@imported/{module_id}/",
    ):
        if updated.startswith(prefix):
            suffix = updated[len(prefix):].lstrip("/")
            updated = f"@/{suffix}"
            changed = True
            break
    if updated.startswith("@/"):
        return updated, changed or updated != spec
    return spec, changed


def _rewrite_file_imports(content: str, module_id: str) -> Tuple[str, int]:
    rewrite_count = 0

    def _replace_import(match: re.Match[str]) -> str:
        nonlocal rewrite_count
        prefix, spec, suffix = match.group(1), match.group(2), match.group(3)
        new_spec, changed = _rewrite_import_spec(spec, module_id)
        if changed:
            rewrite_count += 1
        return f"{prefix}{new_spec}{suffix}"

    updated = _IMPORT_SPEC_RE.sub(_replace_import, content)
    updated = _DYNAMIC_IMPORT_RE.sub(_replace_import, updated)
    return updated, rewrite_count


def canonical_frontend_path(path: str, module_id: str) -> str:
    normalized = _norm_path(path)
    if normalized.startswith("frontend/"):
        return normalized

    bundle_markers = (
        f"src/imported/{module_id}/frontend/src/",
        f"src/imported/{module_id}/frontend/",
        f"src/imported/{module_id}/",
    )
    for marker in bundle_markers:
        if normalized.startswith(marker):
            suffix = normalized[len(marker):].lstrip("/")
            return f"frontend/src/{suffix}"

    if normalized.startswith("manifests/") or normalized.startswith("snippets/"):
        return f"integration/{normalized}"

    stripped = normalized.removeprefix("src/")
    return f"frontend/src/{stripped}"


def canonical_backend_path(path: str, module_id: str) -> str:
    normalized = _norm_path(path)
    if normalized.startswith("backend/"):
        return normalized

    bundle_prefix = f"generators/imported_python/{module_id}/"
    if normalized.startswith(bundle_prefix):
        normalized = normalized[len(bundle_prefix):]

    for junk in _MONOREPO_BE_PREFIXES:
        if normalized.startswith(junk):
            normalized = normalized[len(junk):]
            break

    if normalized.startswith("manifests/") or normalized.startswith("snippets/"):
        return f"integration/{normalized}"

    routers_idx = normalized.find("routers/")
    if routers_idx >= 0:
        return f"backend/{normalized[routers_idx:]}"

    if normalized.startswith(("services/", "models/", "schemas/", "core/", "repositories/")):
        return f"backend/{normalized}"

    return f"backend/{normalized}"


def _dedupe_files(files: List[Dict[str, str]]) -> List[Dict[str, str]]:
    by_path: Dict[str, Dict[str, str]] = {}
    for item in files:
        path = _norm_path(str(item.get("path", "")))
        if not path:
            continue
        by_path[path] = {
            "path": path,
            "content": str(item.get("content", "")),
            "language": str(item.get("language", "")),
        }
    return list(by_path.values())


def normalize_module_bundle(
    *,
    module_name: str,
    module_id: Optional[str] = None,
    entry_point: Optional[str] = None,
    frontend_files: Optional[List[Dict[str, Any]]] = None,
    backend_files: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Normalize raw importer/scavenger paths to canonical module layout.
    Returns normalized file lists, path mappings, and slice scan on FE.
    """
    fe_in = list(frontend_files or [])
    be_in = list(backend_files or [])
    bundle_id = _infer_bundle_id_from_files(fe_in, be_in) or (module_id or to_kebab(module_name)).strip() or "module"
    slot_id = (module_id or to_kebab(module_name)).strip() or bundle_id
    rewrite_id = bundle_id

    path_mappings: List[Dict[str, str]] = []
    import_rewrites = 0
    normalized_fe: List[Dict[str, str]] = []
    normalized_be: List[Dict[str, str]] = []

    for file in fe_in:
        raw_path = _norm_path(str(file.get("path", "")))
        if not raw_path:
            continue
        canonical = canonical_frontend_path(raw_path, rewrite_id)
        content = str(file.get("content", ""))
        if raw_path.endswith((".ts", ".tsx", ".js", ".jsx")):
            content, count = _rewrite_file_imports(content, rewrite_id)
            import_rewrites += count
        if canonical != raw_path:
            path_mappings.append({"from": raw_path, "to": canonical, "layer": "frontend"})
        normalized_fe.append({
            "path": canonical,
            "content": content,
            "language": str(file.get("language", "typescript")),
        })

    for file in be_in:
        raw_path = _norm_path(str(file.get("path", "")))
        if not raw_path:
            continue
        canonical = canonical_backend_path(raw_path, rewrite_id)
        if canonical != raw_path:
            path_mappings.append({"from": raw_path, "to": canonical, "layer": "backend"})
        normalized_be.append({
            "path": canonical,
            "content": str(file.get("content", "")),
            "language": str(file.get("language", "python")),
        })

    normalized_fe = _dedupe_files(normalized_fe)
    normalized_be = _dedupe_files(normalized_be)
    slice_entry = entry_point.strip() if entry_point and entry_point.strip() else None
    slice_scan = scan_fe_slice_missing(
        normalized_fe,
        entry_path=slice_entry,
        module_name=module_name,
    )

    return {
        "moduleName": module_name,
        "moduleId": slot_id,
        "bundleId": bundle_id,
        "frontend": {
            "files": normalized_fe,
            "fileCount": len(normalized_fe),
        },
        "backend": {
            "files": normalized_be,
            "fileCount": len(normalized_be),
        },
        "pathMappings": path_mappings[:200],
        "pathMappingCount": len(path_mappings),
        "importRewriteCount": import_rewrites,
        "sliceCompleteness": slice_scan,
    }


def staging_relative_path(path: str, layer: str) -> str:
    """Strip canonical layer prefix for adapter staging (frontend/src → src)."""
    normalized = _norm_path(path)
    prefix = f"{layer}/"
    if normalized.startswith(prefix):
        return normalized[len(prefix):]
    return normalized


def to_staging_layer_files(
    files: List[Dict[str, Any]],
    layer: str,
) -> List[Dict[str, str]]:
    """Convert canonical layout paths to layer-root-relative paths for write_layer_files."""
    staging: List[Dict[str, str]] = []
    for file in files:
        raw_path = _norm_path(str(file.get("path", "")))
        if not raw_path or raw_path.startswith("integration/"):
            continue
        staging.append({
            "path": staging_relative_path(raw_path, layer),
            "content": str(file.get("content", "")),
            "language": str(file.get("language", "")),
        })
    return staging


def extract_integration_files(
    *file_groups: List[Dict[str, Any]],
) -> List[Dict[str, str]]:
    """Pull integration/* artifacts from normalized file lists."""
    integration: List[Dict[str, str]] = []
    for files in file_groups:
        for file in files:
            raw_path = _norm_path(str(file.get("path", "")))
            if not raw_path.startswith("integration/"):
                continue
            integration.append({
                "path": raw_path,
                "content": str(file.get("content", "")),
                "language": str(file.get("language", "")),
            })
    return integration


def preview_normalize_module(
    *,
    module_name: str,
    module_id: Optional[str] = None,
    entry_point: Optional[str] = None,
    frontend_files: Optional[List[Dict[str, Any]]] = None,
    backend_files: Optional[List[Dict[str, Any]]] = None,
    generate_readme: bool = False,
    generate_architecture: bool = False,
    source_ref: Optional[str] = None,
) -> Dict[str, Any]:
    """Dry-run wrapper with summary for API/UI."""
    result = normalize_module_bundle(
        module_name=module_name,
        module_id=module_id,
        entry_point=entry_point,
        frontend_files=frontend_files,
        backend_files=backend_files,
    )
    slice_info = result.get("sliceCompleteness") or {}
    docs = generate_module_docs(
        module_name=module_name,
        module_id=result["moduleId"],
        frontend_files=list(result["frontend"]["files"]),
        backend_files=list(result["backend"]["files"]),
        entry_point=entry_point,
        source_ref=source_ref,
        slice_completeness=slice_info,
        generate_readme=generate_readme,
        generate_architecture=generate_architecture,
    )
    doc_files = [
        {"path": path, "content": content, "language": "markdown"}
        for path, content in docs.items()
    ]
    return {
        **result,
        "docs": doc_files,
        "summary": {
            "frontendFiles": result["frontend"]["fileCount"],
            "backendFiles": result["backend"]["fileCount"],
            "pathsRemapped": result["pathMappingCount"],
            "importsRewritten": result["importRewriteCount"],
            "criticalMissingCount": int(slice_info.get("criticalMissingCount") or 0),
            "slicePassed": bool(slice_info.get("passed")),
            "docCount": len(doc_files),
        },
    }
