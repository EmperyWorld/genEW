"""
Scavenger - Infer Python bundle metadata
"""

import re
from typing import Any, Dict, List, Optional

from generators.importer.naming import (
    _parts_to_pascal,
    normalize_module_name,
    to_kebab,
    validate_module_name,
)


def _segments_to_module_name(*segments: str) -> str:
    parts: List[str] = []
    for segment in segments:
        parts.extend(part for part in re.split(r"[-_./]+", segment) if part)
    return normalize_module_name(_parts_to_pascal(parts) or "PythonModule", None)


def _prefer_label_module_name(label: str, label_name: str, root: str) -> bool:
    """Use clustered group label for FastAPI monorepo bundles, not docker sub-services."""
    if not label or not label_name or validate_module_name(label_name) is not None:
        return False
    normalized_root = root.replace("\\", "/").lower()
    if "/api/" in normalized_root or normalized_root.rstrip("/").endswith("/api"):
        return True
    if "_" in label and "-" not in label:
        return True
    if label in {"api_bootstrap", "middleware", "core", "utils", "monitoring", "workers", "migrations"}:
        return True
    return False


def infer_python_bundle(
    candidates: List[Dict[str, Any]],
    root: str,
    label: str,
    dependency_paths: Optional[List[str]] = None,
    dependency_preview: Optional[Dict[str, List[str]]] = None,
) -> Dict[str, Any]:
    """
    Infer module name and integration hints for a Python package group.
    """
    label_name = _segments_to_module_name(label) if label else ""

    parts = [part for part in root.rstrip("/").split("/") if part]
    if parts:
        leaf = parts[-1]
        if len(parts) >= 2 and parts[-2] in ("api", "src", "lib", "app"):
            root_name = _segments_to_module_name(leaf)
        elif len(parts) >= 2:
            root_name = _segments_to_module_name(parts[-2], parts[-1])
        else:
            root_name = _segments_to_module_name(label)
    else:
        root_name = _segments_to_module_name(label)

    if _prefer_label_module_name(label, label_name, root):
        module_name = label_name
    else:
        module_name = root_name
        if module_name == "ImportedModule" and label_name:
            module_name = label_name

    module_name = normalize_module_name(module_name or "PythonModule", None)
    if module_name == "ImportedModule" and label_name:
        module_name = label_name

    kebab = to_kebab(module_name)
    hints = [
        f"Review Python bundle under generators/imported_python/{kebab}/",
        "Register FastAPI router includes manually after security review",
        "Align requirements with EWGen backend pins before deployment",
        "Run pytest on imported package before enabling in api_server",
    ]

    if "router" in root.lower():
        hints.insert(0, "Mount routers under routers/imported/ with explicit prefixes")
    if "service" in root.lower():
        hints.insert(0, "Wire services through dependency injection — avoid global state")

    if dependency_paths:
        hints.append(
            f"Dependency manifests found: {', '.join(dependency_paths[:3])}"
        )
    if dependency_preview:
        for dep_path, packages in dependency_preview.items():
            if packages and packages != ["pyproject.toml"]:
                sample = ", ".join(packages[:6])
                hints.append(f"Review {dep_path}: {sample}")
                break

    return {
        "suggestedModuleName": module_name,
        "suggestedModuleType": "imported",
        "integrationHints": hints,
    }
