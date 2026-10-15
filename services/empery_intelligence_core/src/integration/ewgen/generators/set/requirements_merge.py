"""
SET — merge module backend requirements into shell requirements.modules.txt
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Set

from .paths import runtime_root

_REQUIREMENT_LINE_RE = re.compile(r"^([a-zA-Z0-9_.-]+)", re.MULTILINE)


def _parse_requirement_names(content: str) -> List[str]:
    names: List[str] = []
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("-"):
            continue
        match = _REQUIREMENT_LINE_RE.match(stripped)
        if match:
            names.append(match.group(1).lower())
    return names


def _read_requirements_file(path: Path) -> List[str]:
    if not path.is_file():
        return []
    return _parse_requirement_names(path.read_text(encoding="utf-8"))


def _collect_from_be_files(be_files: List[Dict[str, str]]) -> List[str]:
    packages: Set[str] = set()
    for file in be_files:
        path = str(file.get("path", "")).replace("\\", "/")
        if not (path.endswith("requirements.txt") or "requirements" in path.lower()):
            continue
        for name in _parse_requirement_names(str(file.get("content", ""))):
            packages.add(name)
    return sorted(packages)


def modules_requirements_path() -> Path:
    return runtime_root() / "backend" / "requirements.modules.txt"


def read_modules_requirements() -> List[str]:
    return _read_requirements_file(modules_requirements_path())


def merge_module_requirements(
    module_id: str,
    be_files: List[Dict[str, str]],
    *,
    module_root: Path | None = None,
    target_path: Path | None = None,
) -> Dict[str, Any]:
    """
    Merge requirements from BE bundle into requirements.modules.txt.

    Default target: set-runtime/backend/requirements.modules.txt.
    Stage 6 project shells pass target_path under data/project-shells/.
    """
    target = target_path or modules_requirements_path()
    existing = set(_read_requirements_file(target))
    from_bundle = set(_collect_from_be_files(be_files))

    if module_root is not None:
        req_path = module_root / "backend" / "requirements.txt"
        if req_path.is_file():
            from_bundle.update(_read_requirements_file(req_path))

    added = sorted(from_bundle - existing)
    merged = sorted(existing | from_bundle)

    target.parent.mkdir(parents=True, exist_ok=True)
    header = [
        "# Auto-generated SET module requirements — do not edit manually",
        f"# Last merge: module={module_id}",
        "",
    ]
    target.write_text(
        "\n".join(header + merged) + "\n",
        encoding="utf-8",
    )

    return {
        "requirementsFile": str(target),
        "addedCount": len(added),
        "addedPackages": added,
        "totalPackages": len(merged),
    }
