"""
SET install snapshots — rollback support
"""

from __future__ import annotations

import json
import shutil
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from .inventory import get_set_inventory
from .paths import runtime_modules_root, snapshots_root
from .registry_sync import sync_runtime_registry
from .runtime import restart_set_backend


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _snapshot_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _module_snapshots_dir(module_id: str) -> Path:
    return snapshots_root() / module_id


def create_install_snapshot(
    module_id: str,
    *,
    reason: str,
) -> Optional[Dict[str, Any]]:
    """Snapshot module files and inventory slot before destructive install."""
    module_root = runtime_modules_root() / module_id
    inventory = get_set_inventory()
    slot = inventory.get_module(module_id)
    if not slot and not module_root.exists():
        return None

    snapshot_id = _snapshot_timestamp()
    snap_dir = _module_snapshots_dir(module_id) / snapshot_id
    snap_dir.mkdir(parents=True, exist_ok=False)

    if module_root.exists():
        shutil.copytree(module_root, snap_dir / "module")

    if slot:
        (snap_dir / "slot.json").write_text(
            json.dumps(slot, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    metadata = {
        "moduleId": module_id,
        "snapshotId": snapshot_id,
        "createdAt": _now_iso(),
        "reason": reason,
        "hasModuleFiles": module_root.exists(),
        "hasSlot": slot is not None,
    }
    (snap_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return metadata


def list_module_snapshots(module_id: str) -> List[Dict[str, Any]]:
    base = _module_snapshots_dir(module_id)
    if not base.is_dir():
        return []
    snapshots: List[Dict[str, Any]] = []
    for entry in sorted(base.iterdir(), reverse=True):
        if not entry.is_dir():
            continue
        metadata_path = entry / "metadata.json"
        if metadata_path.exists():
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if isinstance(metadata, dict):
                snapshots.append(metadata)
                continue
        snapshots.append({
            "moduleId": module_id,
            "snapshotId": entry.name,
            "createdAt": "",
            "reason": "unknown",
        })
    return snapshots


def restore_snapshot(module_id: str, snapshot_id: Optional[str] = None) -> Dict[str, Any]:
    """Restore module files and inventory slot from a snapshot."""
    snapshots = list_module_snapshots(module_id)
    if not snapshots:
        raise ValueError(f"No snapshots found for module: {module_id}")

    target_id = snapshot_id or str(snapshots[0].get("snapshotId", ""))
    snap_dir = _module_snapshots_dir(module_id) / target_id
    if not snap_dir.is_dir():
        raise ValueError(f"Snapshot not found: {module_id}/{target_id}")

    module_root = runtime_modules_root() / module_id
    if module_root.exists():
        shutil.rmtree(module_root)

    module_backup = snap_dir / "module"
    if module_backup.is_dir():
        shutil.copytree(module_backup, module_root)

    slot_path = snap_dir / "slot.json"
    inventory = get_set_inventory()
    if slot_path.exists():
        slot = json.loads(slot_path.read_text(encoding="utf-8"))
        if isinstance(slot, dict):
            inventory.upsert_module(slot)
    else:
        inventory.remove_module(module_id)

    sync_runtime_registry(inventory.list_modules())
    backend_reload = restart_set_backend()

    return {
        "success": True,
        "moduleId": module_id,
        "snapshotId": target_id,
        "restoredFiles": module_backup.is_dir(),
        "restoredSlot": slot_path.exists(),
        "backendReload": backend_reload,
    }


@contextmanager
def install_snapshot_guard(
    module_id: str,
    *,
    reason: str,
    enabled: bool,
) -> Iterator[Optional[Dict[str, Any]]]:
    snapshot = create_install_snapshot(module_id, reason=reason) if enabled else None
    try:
        yield snapshot
    except Exception:
        if snapshot:
            restore_snapshot(module_id, str(snapshot.get("snapshotId", "")))
        raise
