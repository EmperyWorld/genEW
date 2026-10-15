"""
Fortune Seaker - Source import coverage during analyze
Detects imports that reference files missing from the uploaded archive.
"""

from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional, Set

from generators.analysis_cache import (
    fingerprint_entries,
    fingerprint_path_set,
    get_cached_graph_result,
    get_or_compute_file_specs,
    graph_result_cache_key,
    set_cached_graph_result,
)

from .import_graph import CODE_EXTENSIONS, IMPORT_SPEC_RE
from .path_rewriter import PROJECT_PATH_ALIASES, detect_src_alias_prefix


def _normalize_relative_path(base_dir: str, import_path: str) -> str:
    base = PurePosixPath(base_dir or ".")
    target = (base / import_path).as_posix()
    parts: List[str] = []

    for segment in target.split("/"):
        if segment in ("", "."):
            continue
        if segment == "..":
            if parts:
                parts.pop()
            continue
        parts.append(segment)

    return "/".join(parts)


def _path_candidates(target: str) -> List[str]:
    normalized = PurePosixPath(target).as_posix()
    return [
        normalized,
        f"{normalized}.ts",
        f"{normalized}.tsx",
        f"{normalized}.js",
        f"{normalized}.jsx",
        f"{normalized}/index.ts",
        f"{normalized}/index.tsx",
        f"{normalized}/index.js",
    ]


def _path_exists(target: str, indexed: Set[str]) -> bool:
    return any(candidate in indexed for candidate in _path_candidates(target))


def _first_existing_path(target: str, indexed: Set[str]) -> Optional[str]:
    for candidate in _path_candidates(target):
        if candidate in indexed:
            return candidate
    return None


def resolve_source_import(
    spec: str,
    importer_path: str,
    indexed: Set[str],
) -> Optional[bool]:
    """
    Return True if resolved in archive, False if missing, None if external package.
    """
    importer = importer_path.replace("\\", "/")
    src_prefix = detect_src_alias_prefix(importer)

    if spec.startswith("."):
        target = _normalize_relative_path(str(PurePosixPath(importer).parent), spec)
        return _path_exists(target, indexed)

    if spec.startswith("@/"):
        target = f"{src_prefix}/{spec[2:].lstrip('/')}"
        return _path_exists(target, indexed)

    for alias in PROJECT_PATH_ALIASES:
        alias_token = f"@{alias}/"
        if spec.startswith(alias_token):
            rest = spec[len(alias_token):]
            target = f"{src_prefix}/{alias}/{rest}"
            return _path_exists(target, indexed)

    return None


def resolve_source_import_path(
    spec: str,
    importer_path: str,
    indexed: Set[str],
) -> Optional[str]:
    """Return resolved archive path for an internal import, or None if external/missing."""
    importer = importer_path.replace("\\", "/")
    src_prefix = detect_src_alias_prefix(importer)

    if spec.startswith("."):
        target = _normalize_relative_path(str(PurePosixPath(importer).parent), spec)
        return _first_existing_path(target, indexed)

    if spec.startswith("@/"):
        target = f"{src_prefix}/{spec[2:].lstrip('/')}"
        return _first_existing_path(target, indexed)

    for alias in PROJECT_PATH_ALIASES:
        alias_token = f"@{alias}/"
        if spec.startswith(alias_token):
            rest = spec[len(alias_token):]
            target = f"{src_prefix}/{alias}/{rest}"
            return _first_existing_path(target, indexed)

    return None


def _parse_source_import_specs(content: str) -> List[str]:
    specs: List[str] = []
    for match in IMPORT_SPEC_RE.finditer(content):
        spec = match.group(1) or match.group(2) or match.group(3)
        if spec:
            specs.append(spec)
    return specs


def validate_source_import_graph(
    entries: List[Dict[str, Any]],
    scope_paths: Optional[Set[str]] = None,
    archive_paths: Optional[Set[str]] = None,
    partial: bool = False,
    cache_session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Validate import coverage for raw archive source entries.
    """
    entries_fp = fingerprint_entries(entries)
    scope_fp = fingerprint_path_set(scope_paths)
    archive_fp = fingerprint_path_set(archive_paths)
    mode = "archive" if archive_paths else "bundle"
    cache_key = graph_result_cache_key(
        language="source",
        entries_fp=entries_fp,
        scope_fp=scope_fp,
        archive_fp=archive_fp,
        partial=partial,
        mode=mode,
        session_id=cache_session_id,
    )
    cached = get_cached_graph_result(cache_key)
    if cached is not None:
        return cached

    indexed: Set[str] = set()
    if archive_paths:
        indexed.update(
            path.replace("\\", "/")
            for path in archive_paths
            if path
        )
    code_files: List[str] = []

    for entry in entries:
        path = str(entry.get("path", "")).replace("\\", "/")
        if not path:
            continue
        indexed.add(path)
        suffix = PurePosixPath(path).suffix.lower()
        if suffix in CODE_EXTENSIONS:
            if scope_paths is None or path in scope_paths:
                code_files.append(path)

    broken: List[Dict[str, str]] = []
    missing_targets: Set[str] = set()
    resolved_internal = 0
    external_specs = 0
    files_with_issues: Set[str] = set()

    for path in sorted(code_files):
        entry = next((item for item in entries if item.get("path") == path), None)
        if not entry:
            continue

        content = str(entry.get("content", ""))
        specs = get_or_compute_file_specs(
            language="source",
            content=content,
            parse_fn=_parse_source_import_specs,
        )

        for spec in specs:
            resolution = resolve_source_import(spec, path, indexed)
            if resolution is None:
                external_specs += 1
                continue
            if resolution:
                resolved_internal += 1
                continue

            target = spec
            if spec.startswith("@/"):
                target = f"{detect_src_alias_prefix(path)}/{spec[2:].lstrip('/')}"
            elif spec.startswith("."):
                target = _normalize_relative_path(
                    str(PurePosixPath(path).parent),
                    spec,
                )

            broken.append({
                "file": path,
                "spec": spec,
                "target": target,
            })
            missing_targets.add(target)
            files_with_issues.add(path)

    total_code_files = len(code_files)
    clean_files = total_code_files - len(files_with_issues)
    broken_count = len(broken)

    result = {
        "codeFileCount": total_code_files,
        "cleanCodeFiles": clean_files,
        "filesWithMissingImports": len(files_with_issues),
        "missingTargetCount": len(missing_targets),
        "resolvedInternalImports": resolved_internal,
        "externalImportSpecs": external_specs,
        "brokenImportCount": broken_count,
        "brokenImports": broken[:50],
        "missingTargets": sorted(missing_targets)[:30],
        "passed": broken_count == 0,
        "partial": partial,
        "coverageRate": round(
            (clean_files / total_code_files) * 100
        ) if total_code_files else 100,
    }
    set_cached_graph_result(cache_key, result)
    return result
