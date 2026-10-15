"""
Fortune Seaker - Static asset discovery for monorepo imports
"""

from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from .path_filters import is_blocked_path, is_build_artifact_path

ASSET_EXTENSIONS = {".css", ".html", ".svg", ".ico"}
ASSET_MODULE_TYPE = "asset"


def is_asset_path(path: str) -> bool:
    """Return True when path points to a static frontend asset."""
    return Path(path).suffix.lower() in ASSET_EXTENSIONS


def infer_project_roots(source_paths: List[str]) -> List[str]:
    """
    Infer project roots from selected source paths (longest prefixes first).
    """
    roots: Set[str] = set()

    for path in source_paths:
        normalized = path.lstrip("./")
        parts = normalized.split("/")
        if not parts:
            continue

        for index in range(len(parts), 0, -1):
            roots.add("/".join(parts[:index]) + "/")

        if len(parts) >= 2:
            roots.add(f"{parts[0]}/{parts[1]}/")

    return sorted(roots, key=len, reverse=True)


def collect_asset_candidates(
    archive_names: List[str],
    source_paths: List[str],
    size_map: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    """
    Discover CSS/HTML/SVG assets under the same project roots as source files.
    """
    if not source_paths:
        return []

    roots = infer_project_roots(source_paths)
    sizes = size_map or {}
    assets: List[Dict[str, Any]] = []
    seen: Set[str] = set()

    for name in archive_names:
        if name.endswith("/") or name in seen:
            continue

        suffix = Path(name).suffix.lower()
        if suffix not in ASSET_EXTENSIONS:
            continue

        if is_blocked_path(name) or is_build_artifact_path(name):
            continue

        if not any(name.startswith(root) for root in roots):
            continue

        seen.add(name)
        assets.append({
            "path": name,
            "exports": [],
            "suggestedModuleType": ASSET_MODULE_TYPE,
            "size": int(sizes.get(name, 0)),
            "assetType": suffix.lstrip("."),
        })

    return assets
