"""
Factory module catalog — local registration for completed pipeline runs.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def factory_catalog_path() -> Path:
    configured = os.getenv("EWGEN_FACTORY_CATALOG_PATH", "").strip()
    if configured:
        path = Path(configured)
        if not path.is_absolute():
            return PROJECT_ROOT / path
        return path
    return PROJECT_ROOT / "data" / "factory-catalog.json"


class FactoryCatalog:
    """File-backed catalog of modules produced by the factory pipeline."""

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path or factory_catalog_path()
        self._lock = threading.Lock()

    def _ensure_file(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.is_file():
            self._write(
                {
                    "schemaVersion": "1.0.0",
                    "modules": [],
                    "updatedAt": _now_iso(),
                }
            )

    def _read(self) -> Dict[str, Any]:
        self._ensure_file()
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
        return {"schemaVersion": "1.0.0", "modules": [], "updatedAt": _now_iso()}

    def _write(self, payload: Dict[str, Any]) -> None:
        payload["updatedAt"] = _now_iso()
        self.path.write_text(
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
            saved: Dict[str, Any]
            replaced = False
            for index, existing in enumerate(modules):
                if existing.get("moduleId") == module_id:
                    merged = {**existing, **entry, "moduleId": module_id}
                    if "registeredAt" not in merged:
                        merged["registeredAt"] = _now_iso()
                    modules[index] = merged
                    saved = merged
                    replaced = True
                    break
            if not replaced:
                saved = {**entry, "moduleId": module_id, "registeredAt": _now_iso()}
                modules.append(saved)
            payload["modules"] = modules
            self._write(payload)
            return saved

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


_catalog_instance: Optional[FactoryCatalog] = None


def get_factory_catalog(*, force_new: bool = False) -> FactoryCatalog:
    global _catalog_instance
    if _catalog_instance is None or force_new:
        _catalog_instance = FactoryCatalog()
    return _catalog_instance


def reset_factory_catalog() -> None:
    global _catalog_instance
    _catalog_instance = None
