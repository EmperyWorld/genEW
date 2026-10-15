# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Rewrite Scavenger Python archives into self-contained ewgen_bundle.* packages
# without product monorepo path prefixes (EG-01 S2).
# Invariants:
# - Output paths live under ewgen_bundle/<module_slug>/…; no EliteEW/ on sys.path.
# Related:
# - generators/scavenger/boundary_gate.py
# - generators/scavenger/prepare.py
# ---

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from generators.importer.naming import to_kebab

from .boundary_gate import detect_product_monorepo_root
from .import_rewriter import FROM_IMPORT_RE, IMPORT_RE

_EWGEN_BUNDLE_TOP = "ewgen_bundle"


def detect_archive_api_root(source_files: List[Dict[str, str]]) -> Optional[str]:
    """
    Detect `{ArchiveRoot}/api/` layout (EliteEW, EliteEW2, …) for path stripping.
    """
    for file in source_files:
        path = str(file.get("path", "")).replace("\\", "/")
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 2 and parts[1] == "api" and parts[0] != _EWGEN_BUNDLE_TOP:
            return parts[0]
    return None


def bundle_module_slug(module_name: str) -> str:
    return to_kebab(module_name).replace("-", "_")


def bundle_package_prefix(module_name: str) -> str:
    return f"{_EWGEN_BUNDLE_TOP}.{bundle_module_slug(module_name)}"


def bundle_package_path(module_name: str) -> str:
    return bundle_package_prefix(module_name).replace(".", "/")


def is_self_contained_path(path: str) -> bool:
    normalized = path.replace("\\", "/").lstrip("/")
    return normalized.startswith(f"{_EWGEN_BUNDLE_TOP}/")


def _should_rewrite_api_spec(spec: str, archive_root: Optional[str]) -> bool:
    if not spec or spec.startswith("."):
        return False
    if spec.startswith(f"{_EWGEN_BUNDLE_TOP}."):
        return False
    if archive_root and (spec == archive_root or spec.startswith(f"{archive_root}.")):
        return True
    return spec == "api" or spec.startswith("api.")


def _rewrite_api_spec(spec: str, package_prefix: str, archive_root: Optional[str]) -> str:
    if archive_root and spec == archive_root:
        spec = "api"
    elif archive_root and spec.startswith(f"{archive_root}."):
        spec = spec[len(archive_root) + 1 :]
    if spec == "api":
        return f"{package_prefix}.api"
    if spec.startswith("api."):
        return f"{package_prefix}.{spec}"
    return spec


def _rewrite_content_imports(
    content: str,
    package_prefix: str,
    archive_root: Optional[str],
) -> str:
    def replace_from(match: re.Match[str]) -> str:
        prefix, spec, suffix = match.group(1), match.group(2), match.group(3)
        if _should_rewrite_api_spec(spec, archive_root):
            return f"{prefix}{_rewrite_api_spec(spec, package_prefix, archive_root)}{suffix}"
        return match.group(0)

    def replace_import(match: re.Match[str]) -> str:
        prefix, spec = match.group(1), match.group(2)
        if _should_rewrite_api_spec(spec, archive_root):
            return f"{prefix}{_rewrite_api_spec(spec, package_prefix, archive_root)}"
        return match.group(0)

    updated = FROM_IMPORT_RE.sub(replace_from, content)
    return IMPORT_RE.sub(replace_import, updated)


def _strip_archive_root_from_path(path: str, archive_root: Optional[str]) -> str:
    normalized = path.replace("\\", "/").lstrip("/")
    if archive_root and normalized.startswith(f"{archive_root}/"):
        return normalized[len(archive_root) + 1 :]
    return normalized


def rewrite_to_self_contained_bundle(
    files: List[Dict[str, str]],
    module_name: str,
) -> Tuple[List[Dict[str, str]], Dict[str, Any]]:
    """
    Move archive sources under ewgen_bundle.<slug> and rewrite api.* imports.
    """
    package_prefix = bundle_package_prefix(module_name)
    package_path = bundle_package_path(module_name)
    archive_root = detect_archive_api_root(files)
    product_root = detect_product_monorepo_root(files)

    if all(is_self_contained_path(str(file.get("path", ""))) for file in files if file.get("path")):
        return files, {
            "applied": False,
            "alreadySelfContained": True,
            "packagePrefix": package_prefix,
            "archiveRootStripped": archive_root,
            "productMonorepoRoot": product_root,
        }

    rewritten: List[Dict[str, str]] = []
    for file in files:
        path = str(file.get("path", "")).replace("\\", "/")
        content = str(file.get("content", ""))
        if not path:
            rewritten.append(file)
            continue

        if is_self_contained_path(path):
            rewritten.append({"path": path, "content": content})
            continue

        relative_path = _strip_archive_root_from_path(path, archive_root)
        new_path = f"{package_path}/{relative_path}" if relative_path else path
        if path.endswith(".py"):
            content = _rewrite_content_imports(content, package_prefix, archive_root)

        rewritten.append({"path": new_path, "content": content})

    return rewritten, {
        "applied": True,
        "alreadySelfContained": False,
        "packagePrefix": package_prefix,
        "packagePath": package_path,
        "archiveRootStripped": archive_root,
        "productMonorepoRoot": product_root,
        "fileCount": len(rewritten),
    }
