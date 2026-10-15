"""
SET inventory — installed module slots
"""

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .paths import inventory_path, runtime_root


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SetInventory:
    """File-backed inventory of SET module slots."""

    def __init__(self, path: Optional[os.PathLike[str] | str] = None) -> None:
        self.path = Path(path) if path else inventory_path()
        self._lock = threading.Lock()

    def _ensure_file(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write({
                "schemaVersion": "1.0.0",
                "runtimePath": str(runtime_root()),
                "modules": [],
                "updatedAt": _now_iso(),
            })

    def _read(self) -> Dict[str, Any]:
        self._ensure_file()
        data = json.loads(Path(self.path).read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
        return {
            "schemaVersion": "1.0.0",
            "runtimePath": str(runtime_root()),
            "modules": data if isinstance(data, list) else [],
            "updatedAt": _now_iso(),
        }

    def _write(self, payload: Dict[str, Any]) -> None:
        payload["updatedAt"] = _now_iso()
        payload["runtimePath"] = str(runtime_root())
        Path(self.path).write_text(
            json.dumps(payload, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    def list_modules(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._read().get("modules") or [])

    def get_module(self, module_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            for entry in self._read().get("modules") or []:
                if entry.get("moduleId") == module_id:
                    return entry
        return None

    def upsert_module(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        module_id = str(entry.get("moduleId", "")).strip()
        if not module_id:
            raise ValueError("moduleId is required")

        with self._lock:
            payload = self._read()
            modules: List[Dict[str, Any]] = list(payload.get("modules") or [])
            replaced = False
            for index, existing in enumerate(modules):
                if existing.get("moduleId") == module_id:
                    merged = {**existing, **entry, "moduleId": module_id}
                    if "installedAt" not in merged:
                        merged["installedAt"] = _now_iso()
                    modules[index] = merged
                    replaced = True
                    entry = merged
                    break
            if not replaced:
                new_entry = {**entry, "moduleId": module_id, "installedAt": _now_iso()}
                modules.append(new_entry)
                entry = new_entry
            payload["modules"] = modules
            self._write(payload)
            return entry

    def remove_module(self, module_id: str) -> bool:
        with self._lock:
            payload = self._read()
            modules = list(payload.get("modules") or [])
            filtered = [item for item in modules if item.get("moduleId") != module_id]
            if len(filtered) == len(modules):
                return False
            payload["modules"] = filtered
            self._write(payload)
            return True

    def to_summary(self) -> Dict[str, Any]:
        with self._lock:
            payload = self._read()
            modules = payload.get("modules") or []
            return {
                "schemaVersion": payload.get("schemaVersion", "1.0.0"),
                "runtimePath": payload.get("runtimePath", str(runtime_root())),
                "moduleCount": len(modules),
                "modules": modules,
                "updatedAt": payload.get("updatedAt"),
            }


_inventory: Optional[SetInventory] = None


def get_set_inventory() -> SetInventory:
    global _inventory
    if _inventory is None:
        _inventory = SetInventory()
    return _inventory
