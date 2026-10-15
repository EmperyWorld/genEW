"""
Scavenger - Compare imported requirements against EWGen backend pins
"""

import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from .deps import merge_packages_from_dependency_files, parse_pyproject_dependency_specs, parse_requirements_preview


def _project_root() -> Path:
    return Path(__file__).parent.parent.parent


def _normalize_package_name(name: str) -> str:
    return name.lower().split("[")[0].strip()


def parse_requirement_line(line: str) -> Optional[Dict[str, str]]:
    """
    Parse a single requirements.txt line into package name and version spec.
    """
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or stripped.startswith("-"):
        return None

    match = re.match(
        r"^([a-zA-Z0-9][a-zA-Z0-9._-]*(?:\[[^\]]+\])?)\s*(.*)$",
        stripped,
    )
    if not match:
        return None

    name = _normalize_package_name(match.group(1))
    spec = match.group(2).strip()
    return {
        "name": name,
        "spec": spec,
        "raw": stripped,
    }


def parse_requirements_specs(content: str) -> Dict[str, str]:
    """
    Extract package name → version spec map from requirements.txt content.
    """
    specs: Dict[str, str] = {}
    for line in content.splitlines():
        parsed = parse_requirement_line(line)
        if not parsed:
            continue
        specs[parsed["name"]] = parsed["spec"]
    return specs


def merge_dependency_specs(
    dependency_files: Optional[List[Dict[str, str]]],
) -> Dict[str, str]:
    """
    Merge version specs from bundled dependency manifests (last file wins per package).
    """
    if not dependency_files:
        return {}

    merged: Dict[str, str] = {}
    for file in dependency_files:
        path = str(file.get("path", ""))
        content = str(file.get("content", ""))
        if not content:
            continue
        if path.endswith("requirements.txt") or path.endswith("requirements-dev.txt"):
            merged.update(parse_requirements_specs(content))
        elif path.endswith("pyproject.toml"):
            for name, spec in parse_pyproject_dependency_specs(content).items():
                merged[name] = spec
    return merged


def load_backend_requirements(project_root: Optional[Path] = None) -> Dict[str, str]:
    """
    Load EWGen backend requirements.txt pins.
    """
    root = project_root or _project_root()
    req_path = root / "requirements.txt"
    if not req_path.exists():
        return {}
    return parse_requirements_specs(req_path.read_text(encoding="utf-8"))


def analyze_requirements_against_backend(
    dependency_files: Optional[List[Dict[str, str]]],
    project_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Compare merged imported requirements against EWGen backend requirements.txt.
    """
    imported_specs = merge_dependency_specs(dependency_files)
    backend_specs = load_backend_requirements(project_root)

    new_packages: List[Dict[str, str]] = []
    conflicts: List[Dict[str, str]] = []
    aligned: List[str] = []
    unpinned_existing: List[str] = []

    for name, imported_spec in sorted(imported_specs.items()):
        backend_spec = backend_specs.get(name)
        if backend_spec is None:
            new_packages.append({
                "package": name,
                "importedSpec": imported_spec or "(unpinned)",
            })
            continue

        if not imported_spec:
            unpinned_existing.append(name)
            continue

        if _specs_conflict(imported_spec, backend_spec):
            conflicts.append({
                "package": name,
                "importedSpec": imported_spec,
                "backendSpec": backend_spec,
            })
        else:
            aligned.append(name)

    package_names = merge_packages_from_dependency_files(dependency_files, limit=500)
    if not package_names:
        package_names = parse_requirements_preview(
            "\n".join(f"{name}{spec}" if spec else name for name, spec in imported_specs.items()),
            limit=500,
        )

    return {
        "backendPackageCount": len(backend_specs),
        "importedPackageCount": len(imported_specs),
        "packageNames": package_names,
        "newPackages": new_packages,
        "conflicts": conflicts,
        "aligned": aligned,
        "unpinnedExisting": unpinned_existing,
        "passed": len(conflicts) == 0,
    }


def _specs_conflict(imported_spec: str, backend_spec: str) -> bool:
    return imported_spec.strip().lower() != backend_spec.strip().lower()
