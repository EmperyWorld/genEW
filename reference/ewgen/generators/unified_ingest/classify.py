# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Lightweight ZIP namelist classification for unified ingest (no full decode).
# Invariants:
# - Suggested tracks are fortune_seaker (FE) and/or scavenger (BE) only.
# Related:
# - generators/unified_ingest/orchestrate.py
# ---

"""Classify archive contents from ZIP namelist / path list."""

from __future__ import annotations

import zipfile
from io import BytesIO
from typing import Any, Dict, Iterable, List, Sequence

from generators.importer.path_filters import is_blocked_path

TRACK_FORTUNE_SEAKER = "fortune_seaker"
TRACK_SCAVENGER = "scavenger"

_FE_SUFFIXES = (".ts", ".tsx", ".js", ".jsx")
_PY_SUFFIX = ".py"


def _normalize_path(name: str) -> str:
    return name.replace("\\", "/").lstrip("./")


def _is_file_entry(name: str) -> bool:
    return bool(name) and not name.endswith("/")


def _basename(path: str) -> str:
    return path.rsplit("/", 1)[-1].lower()


def classify_paths(paths: Sequence[str]) -> Dict[str, Any]:
    """
    Classify a list of archive paths (ZIP namelist style).

    Returns classification dict with hasFrontend, hasBackend, suggestedTracks, stats.
    Noise paths (node_modules, .git, …) are ignored for track detection.
    """
    py_files = 0
    fe_source_files = 0
    package_json = 0
    python_manifests = 0
    noise_skipped = 0
    path_count = 0

    for raw in paths:
        if not _is_file_entry(raw):
            continue
        path = _normalize_path(raw)
        if is_blocked_path(path):
            noise_skipped += 1
            continue
        path_count += 1
        lower = path.lower()
        base = _basename(path)

        if lower.endswith(_PY_SUFFIX):
            py_files += 1
        if lower.endswith(_FE_SUFFIXES):
            fe_source_files += 1
        if base == "package.json":
            package_json += 1
        if base == "pyproject.toml" or (
            base.startswith("requirements") and base.endswith(".txt")
        ):
            python_manifests += 1

    has_frontend = fe_source_files > 0 or package_json > 0
    has_backend = py_files > 0 or python_manifests > 0

    suggested: List[str] = []
    if has_frontend:
        suggested.append(TRACK_FORTUNE_SEAKER)
    if has_backend:
        suggested.append(TRACK_SCAVENGER)

    return {
        "hasFrontend": has_frontend,
        "hasBackend": has_backend,
        "suggestedTracks": suggested,
        "stats": {
            "pyFiles": py_files,
            "feSourceFiles": fe_source_files,
            "packageJson": package_json,
            "pythonManifests": python_manifests,
            "pathCount": path_count,
            "noiseSkipped": noise_skipped,
        },
    }


def classify_zip_bytes(data: bytes) -> Dict[str, Any]:
    """Open ZIP in memory and classify from namelist only."""
    with zipfile.ZipFile(BytesIO(data)) as archive:
        return classify_paths(archive.namelist())


def classify_zip_namelist(names: Iterable[str]) -> Dict[str, Any]:
    """Classify from an already-read namelist."""
    return classify_paths(list(names))
