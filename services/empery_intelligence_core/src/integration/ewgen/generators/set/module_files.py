"""
Collect on-disk module layer files for SET runtime operations
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List

_TEXT_SUFFIXES = {".py", ".sql", ".ts", ".tsx", ".json", ".md", ".txt", ".yaml", ".yml", ".jsx", ".js"}
_SKIP_DIR_NAMES = frozenset({
    "node_modules",
    "dist",
    ".set",
    "__pycache__",
    ".git",
    ".venv",
    "venv",
})


def _should_skip_path(path: Path, layer_root: Path) -> bool:
    try:
        rel_parts = path.relative_to(layer_root).parts
    except ValueError:
        return True
    return any(part in _SKIP_DIR_NAMES for part in rel_parts)


def collect_layer_files(layer_root: Path, *, skip_names: frozenset[str] | None = None) -> List[Dict[str, str]]:
    """Read text files under a module layer directory."""
    if not layer_root.is_dir():
        return []
    skip = skip_names or frozenset()
    files: List[Dict[str, str]] = []
    for path in sorted(layer_root.rglob("*")):
        if not path.is_file():
            continue
        if _should_skip_path(path, layer_root):
            continue
        if path.name in skip:
            continue
        if path.suffix.lower() not in _TEXT_SUFFIXES:
            continue
        rel = path.relative_to(layer_root).as_posix()
        files.append({
            "path": rel,
            "content": path.read_text(encoding="utf-8"),
        })
    return files


def collect_backend_files(be_root: Path) -> List[Dict[str, str]]:
    return collect_layer_files(be_root, skip_names=frozenset({"router.py"}))


def collect_frontend_files(fe_root: Path) -> List[Dict[str, str]]:
    skip = frozenset({"SetModuleStub.tsx"})
    return collect_layer_files(fe_root, skip_names=skip)
