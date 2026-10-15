"""
Scavenger - Rewrite relative Python imports to absolute archive paths
"""

import re
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional

from .import_graph import _normalize_relative

FROM_IMPORT_RE = re.compile(
    r"^(\s*from\s+)([\w.]+)(\s+import\s+)",
    re.MULTILINE,
)
IMPORT_RE = re.compile(
    r"^(\s*import\s+)([\w.]+)",
    re.MULTILINE,
)
_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_ARCHIVE_SUBPROJECT_MARKERS = frozenset({"api", "src", "frontend", "backend", "web"})
RELATIVE_IMPORT_RE = re.compile(
    r"^\s*(?:from\s+(\.+[\w.]*)\s+import|import\s+(\.+[\w.]*))",
    re.MULTILINE,
)


def _path_to_module(path: str) -> str:
    normalized = path.replace("\\", "/")
    if normalized.endswith(".py"):
        normalized = normalized[:-3]
    if normalized.endswith("/__init__"):
        normalized = normalized[:-9]
    return normalized.replace("/", ".")


def _rewrite_spec(spec: str, importer_path: str) -> str:
    if not spec.startswith("."):
        return spec

    importer_dir = str(PurePosixPath(importer_path.replace("\\", "/")).parent)
    target_path = _normalize_relative(importer_dir, spec)
    if not target_path:
        return spec
    return _path_to_module(target_path)


def detect_monorepo_prefix_from_files(files: List[Dict[str, Any]]) -> Optional[str]:
    """
    Detect monorepo root directory (e.g. EliteEW2) from archive paths.
    """
    for file in files:
        path = str(file.get("path", "")).replace("\\", "/")
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 2 and parts[1] == "api":
            return parts[0]
    return None


def _should_prefix_api_spec(spec: str, monorepo_dir: str) -> bool:
    if not spec or spec.startswith("."):
        return False
    if spec.startswith(f"{monorepo_dir}."):
        return False
    return spec == "api" or spec.startswith("api.")


def _prefix_api_spec(spec: str, monorepo_dir: str) -> str:
    if spec == "api":
        return monorepo_dir
    return f"{monorepo_dir}.{spec}"


def _rewrite_monorepo_api_imports(content: str, monorepo_dir: str) -> str:
    """
    Prefix bare api.* absolute imports with monorepo directory (api.X → EliteEW2.api.X).
    """

    def replace_from(match: re.Match[str]) -> str:
        prefix, spec, suffix = match.group(1), match.group(2), match.group(3)
        if _should_prefix_api_spec(spec, monorepo_dir):
            return f"{prefix}{_prefix_api_spec(spec, monorepo_dir)}{suffix}"
        return match.group(0)

    def replace_import(match: re.Match[str]) -> str:
        prefix, spec = match.group(1), match.group(2)
        if _should_prefix_api_spec(spec, monorepo_dir):
            return f"{prefix}{_prefix_api_spec(spec, monorepo_dir)}"
        return match.group(0)

    updated = FROM_IMPORT_RE.sub(replace_from, content)
    return IMPORT_RE.sub(replace_import, updated)


def rewrite_python_imports(
    content: str,
    file_path: str,
    monorepo_prefix: Optional[str] = None,
) -> str:
    """
    Convert relative import specs to absolute module paths based on file location.
    Optionally prefix bare api.* imports with monorepo directory.
    """
    normalized_path = file_path.replace("\\", "/")

    def replace_from(match: re.Match[str]) -> str:
        prefix, spec, suffix = match.group(1), match.group(2), match.group(3)
        return f"{prefix}{_rewrite_spec(spec, normalized_path)}{suffix}"

    def replace_import(match: re.Match[str]) -> str:
        prefix, spec = match.group(1), match.group(2)
        return f"{prefix}{_rewrite_spec(spec, normalized_path)}"

    updated = FROM_IMPORT_RE.sub(replace_from, content)
    updated = IMPORT_RE.sub(replace_import, updated)
    if monorepo_prefix:
        updated = _rewrite_monorepo_api_imports(updated, monorepo_prefix)
    return updated


def _count_relative_import_specs(content: str) -> int:
    count = 0
    for match in RELATIVE_IMPORT_RE.finditer(content):
        spec = match.group(1) or match.group(2)
        if spec:
            count += 1
    return count


def _count_monorepo_api_specs(content: str, monorepo_dir: str) -> int:
    count = 0
    for match in FROM_IMPORT_RE.finditer(content):
        spec = match.group(2)
        if spec and _should_prefix_api_spec(spec, monorepo_dir):
            count += 1
    for match in IMPORT_RE.finditer(content):
        spec = match.group(2)
        if spec and _should_prefix_api_spec(spec, monorepo_dir):
            count += 1
    return count


def summarize_import_rewrites(
    original_files: List[Dict[str, str]],
    rewritten_files: List[Dict[str, str]],
    monorepo_prefix: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Summarize relative import rewrites applied during prepare.
    """
    original_by_path = {
        str(file.get("path", "")).replace("\\", "/"): str(file.get("content", ""))
        for file in original_files
    }
    relative_specs = 0
    monorepo_api_specs = 0
    files_rewritten = 0
    files_with_relative = 0
    files_with_monorepo_api = 0

    for file in rewritten_files:
        path = str(file.get("path", "")).replace("\\", "/")
        if not path.endswith(".py"):
            continue
        original = original_by_path.get(path, "")
        updated = str(file.get("content", ""))
        relative_count = _count_relative_import_specs(original)
        if relative_count > 0:
            files_with_relative += 1
            relative_specs += relative_count
        if monorepo_prefix:
            mono_count = _count_monorepo_api_specs(original, monorepo_prefix)
            if mono_count > 0:
                files_with_monorepo_api += 1
                monorepo_api_specs += mono_count
        if original != updated:
            files_rewritten += 1

    return {
        "relativeImportSpecs": relative_specs,
        "filesWithRelativeImports": files_with_relative,
        "monorepoApiImportSpecs": monorepo_api_specs,
        "filesWithMonorepoApiImports": files_with_monorepo_api,
        "monorepoPrefix": monorepo_prefix,
        "monorepoPrefixApplied": bool(monorepo_prefix and monorepo_api_specs > 0),
        "filesRewritten": files_rewritten,
        "applied": files_rewritten > 0,
    }


def _detect_non_importable_archive_root(files: List[Dict[str, Any]]) -> Optional[str]:
    roots: set[str] = set()
    for file in files:
        path = str(file.get("path", "")).replace("\\", "/")
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 2 and parts[1] in _ARCHIVE_SUBPROJECT_MARKERS:
            roots.add(parts[0])
    if len(roots) != 1:
        return None
    root = next(iter(roots))
    if _IDENT_RE.match(root):
        return None
    return root


def _strip_archive_root_from_import_spec(spec: str, archive_root: str) -> str:
    prefix = f"{archive_root}."
    if spec == archive_root:
        return spec
    if spec.startswith(prefix):
        return spec[len(prefix):]
    return spec


def strip_non_importable_archive_prefix(
    files: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Strip numeric/non-ident archive folder prefix (e.g. 122/api → api).
    """
    archive_root = _detect_non_importable_archive_root(files)
    if not archive_root:
        return files

    path_prefix = f"{archive_root}/"
    stripped: List[Dict[str, Any]] = []
    for file in files:
        path = str(file.get("path", "")).replace("\\", "/")
        content = str(file.get("content", ""))
        if path.startswith(path_prefix):
            path = path[len(path_prefix):]

        if path.endswith(".py"):
            def replace_from(match: re.Match[str]) -> str:
                prefix, spec, suffix = match.group(1), match.group(2), match.group(3)
                return f"{prefix}{_strip_archive_root_from_import_spec(spec, archive_root)}{suffix}"

            def replace_import(match: re.Match[str]) -> str:
                prefix, spec = match.group(1), match.group(2)
                return f"{prefix}{_strip_archive_root_from_import_spec(spec, archive_root)}"

            content = FROM_IMPORT_RE.sub(replace_from, content)
            content = IMPORT_RE.sub(replace_import, content)

        stripped.append({**file, "path": path, "content": content})
    return stripped


def rewrite_python_files(
    files: List[dict],
    monorepo_prefix: Optional[str] = None,
    rewrite_monorepo_api_imports: bool = False,
) -> List[dict]:
    """
    Rewrite imports for a list of {path, content} file dicts.
    """
    prefix = monorepo_prefix
    if rewrite_monorepo_api_imports and not prefix:
        prefix = detect_monorepo_prefix_from_files(files)

    rewritten: List[dict] = []
    for file in files:
        path = str(file.get("path", ""))
        content = str(file.get("content", ""))
        if not path.endswith(".py"):
            rewritten.append(file)
            continue
        rewritten.append({
            **file,
            "content": rewrite_python_imports(content, path, monorepo_prefix=prefix),
        })
    return rewritten
