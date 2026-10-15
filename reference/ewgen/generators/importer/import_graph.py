"""
Fortune Seaker - Import graph validation for prepared bundles
"""

import re
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional, Set

from .naming import to_kebab

IMPORT_SPEC_RE = re.compile(
    r"""(?:from|import|export\s+[^'"]+from)\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\)|require\s*\(\s*['"]([^'"]+)['"]\)"""
)

CODE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}


def _bundle_root_marker(kebab_name: str) -> str:
    return f"src/imported/{kebab_name}/"


def _bundle_relative_path(path: str, kebab_name: str) -> Optional[str]:
    marker = _bundle_root_marker(kebab_name)
    normalized = path.replace("\\", "/").lstrip("./")
    if marker in normalized:
        return normalized.split(marker, 1)[1]
    return None


def _index_bundle_files(files: List[Dict[str, Any]], kebab_name: str) -> Set[str]:
    indexed: Set[str] = set()
    for file in files:
        path = str(file.get("path", "")).replace("\\", "/")
        relative = _bundle_relative_path(path, kebab_name)
        if relative:
            indexed.add(relative)
    return indexed


def _resolve_in_bundle(relative_target: str, indexed: Set[str]) -> bool:
    normalized = PurePosixPath(relative_target).as_posix()
    candidates = [
        normalized,
        f"{normalized}.ts",
        f"{normalized}.tsx",
        f"{normalized}.js",
        f"{normalized}.jsx",
        f"{normalized}/index.ts",
        f"{normalized}/index.tsx",
        f"{normalized}/index.js",
    ]
    return any(candidate in indexed for candidate in candidates)


def _resolve_spec(
    spec: str,
    importer_relative: str,
    target_base: str,
    indexed: Set[str],
) -> Optional[bool]:
    """
    Return True if resolved, False if broken internal import, None if external.
    """
    if spec.startswith(f"{target_base}/"):
        target = spec[len(target_base):].lstrip("/")
        return _resolve_in_bundle(target, indexed)

    if spec.startswith("."):
        base = PurePosixPath(importer_relative).parent
        target = (base / spec).as_posix()
        parts: List[str] = []
        for segment in target.split("/"):
            if segment in ("", "."):
                continue
            if segment == "..":
                if parts:
                    parts.pop()
                continue
            parts.append(segment)
        return _resolve_in_bundle("/".join(parts), indexed)

    if spec.startswith("@/") or any(
        spec.startswith(f"@{alias}/") for alias in ("hooks", "utils", "components", "services", "stores", "types")
    ):
        return False

    return None


def validate_import_graph(
    files: List[Dict[str, Any]],
    module_name: str,
) -> Dict[str, Any]:
    """
    Validate internal import resolution inside a prepared bundle.
    """
    kebab_name = to_kebab(module_name)
    target_base = f"@imported/{kebab_name}"
    indexed = _index_bundle_files(files, kebab_name)

    code_files: List[str] = []
    for file in files:
        path = str(file.get("path", ""))
        relative = _bundle_relative_path(path, kebab_name)
        if not relative:
            continue
        suffix = PurePosixPath(relative).suffix.lower()
        if suffix in CODE_EXTENSIONS:
            code_files.append(relative)

    broken: List[Dict[str, str]] = []
    resolved_internal = 0
    external_specs = 0
    files_with_issues: Set[str] = set()

    for relative in sorted(code_files):
        file_entry = next(
            (
                item
                for item in files
                if _bundle_relative_path(str(item.get("path", "")), kebab_name) == relative
            ),
            None,
        )
        if not file_entry:
            continue

        content = str(file_entry.get("content", ""))
        specs: List[str] = []
        for match in IMPORT_SPEC_RE.finditer(content):
            spec = match.group(1) or match.group(2) or match.group(3)
            if spec:
                specs.append(spec)

        for spec in specs:
            resolution = _resolve_spec(spec, relative, target_base, indexed)
            if resolution is None:
                external_specs += 1
                continue
            if resolution:
                resolved_internal += 1
                continue

            broken.append({
                "file": relative,
                "spec": spec,
            })
            files_with_issues.add(relative)

    total_code_files = len(code_files)
    clean_files = total_code_files - len(files_with_issues)
    broken_count = len(broken)

    return {
        "moduleName": module_name,
        "importAlias": target_base,
        "codeFileCount": total_code_files,
        "cleanCodeFiles": clean_files,
        "filesWithBrokenImports": len(files_with_issues),
        "resolvedInternalImports": resolved_internal,
        "externalImportSpecs": external_specs,
        "brokenImportCount": broken_count,
        "brokenImports": broken[:50],
        "passed": broken_count == 0,
        "resolutionRate": round(
            (clean_files / total_code_files) * 100
        ) if total_code_files else 100,
    }
