"""
SET runtime volume permissions for Podman :Z bind mounts.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any, Dict, Iterable

from .paths import runtime_root


def _is_selinux_enforcing() -> bool:
    try:
        result = subprocess.run(
            ['getenforce'], capture_output=True, text=True, check=False, timeout=2,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0 and result.stdout.strip().lower() == 'enforcing'


def _selinux_reference_path(modules_root: Path) -> Path | None:
    """Prefer set-runtime/backend — it shares the container mount label with /app."""
    runtime_root_path = modules_root.parent
    backend = runtime_root_path / 'backend'
    if backend.is_dir():
        return backend
    registry = modules_root / 'registry.json'
    if registry.is_file():
        return registry
    for candidate in sorted(modules_root.iterdir()) if modules_root.is_dir() else []:
        if candidate.is_dir():
            return candidate
    return None


def _relabel_tree(target: Path, reference: Path | None) -> Dict[str, Any]:
    detail: Dict[str, Any] = {'applied': False, 'method': None, 'error': None}
    if not _is_selinux_enforcing() or not target.is_dir():
        return detail
    try:
        if reference and reference.exists():
            result = subprocess.run(
                ['chcon', '-R', '--reference', str(reference), str(target)],
                capture_output=True, text=True, check=False, timeout=180,
            )
            detail['method'] = 'chcon-reference'
        else:
            result = subprocess.run(
                ['chcon', '-Rt', 'container_file_t', str(target)],
                capture_output=True, text=True, check=False, timeout=180,
            )
            detail['method'] = 'chcon-container_file_t'
        if result.returncode == 0:
            detail['applied'] = True
        else:
            detail['error'] = (result.stderr or result.stdout or 'chcon failed').strip()
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired) as exc:
        detail['error'] = str(exc)
    return detail


def _normalize_mode_bits(target: Path) -> int:
    changed = 0
    if not target.exists():
        return changed
    for walk_root, dirs, files in os.walk(target):
        root_path = Path(walk_root)
        for path in [root_path, *[root_path / name for name in dirs], *[root_path / name for name in files]]:
            try:
                mode = path.stat().st_mode & 0o777
                expected = 0o755 if path.is_dir() else 0o644
                if mode != expected:
                    path.chmod(expected)
                    changed += 1
            except OSError:
                continue
    return changed


def _ensure_tree(target: Path, reference: Path | None) -> Dict[str, Any]:
    if not target.is_dir():
        return {'success': False, 'path': str(target), 'error': 'not a directory'}
    return {
        'success': True,
        'path': str(target),
        'modeChanges': _normalize_mode_bits(target),
        'selinux': _relabel_tree(target, reference),
    }


def ensure_module_volume_access(
    module_root: Path,
    *,
    modules_root: Path | None = None,
) -> Dict[str, Any]:
    parent = modules_root or module_root.parent
    reference = _selinux_reference_path(parent)
    result = _ensure_tree(module_root.resolve(), reference)
    return {
        'success': result.get('success', False),
        'moduleRoot': str(module_root),
        'modeChanges': result.get('modeChanges', 0),
        'selinux': result.get('selinux', {}),
        'error': result.get('error'),
    }


def ensure_registry_volume_access(registry_path: Path | None = None) -> Dict[str, Any]:
    """Relabel modules/registry.json after host-side writes (Podman :Z category drift)."""
    registry = (registry_path or (runtime_root() / 'modules' / 'registry.json')).resolve()
    modules_root = registry.parent
    reference = _selinux_reference_path(modules_root)
    relabel = _relabel_tree(modules_root, reference)
    mode_changes = _normalize_mode_bits(modules_root)
    return {
        'success': relabel.get('applied', False) or not _is_selinux_enforcing(),
        'registryPath': str(registry),
        'modeChanges': mode_changes,
        'selinux': relabel,
    }


def ensure_runtime_volume_access(
  runtime: Path | None = None,
  *,
  include_modules: bool = True,
) -> Dict[str, Any]:
    root = (runtime or runtime_root()).resolve()
    modules_root = root / 'modules'
    reference = _selinux_reference_path(modules_root)
    targets: Iterable[Path] = [root / 'frontend', root / 'backend']
    if include_modules and modules_root.is_dir():
        targets = [*targets, modules_root]
    applied: list[Dict[str, Any]] = []
    for target in targets:
        if target.is_dir():
            applied.append(_ensure_tree(target, reference))
    return {
        'success': all(item.get('success') for item in applied) if applied else False,
        'runtimeRoot': str(root),
        'targets': applied,
    }
