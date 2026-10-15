"""
Warsmith - Fullstack composed module catalog
"""

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

MAX_CATALOG_ENTRIES = 50


def _default_catalog_path() -> Path:
    configured = os.getenv("EWGEN_WARSMITH_CATALOG_PATH", "")
    if configured:
        return Path(configured)
    return Path(__file__).parent.parent.parent / "data" / "warsmith-catalog.json"


class WarsmithCatalog:
    """File-backed catalog of composed fullstack modules."""

    def __init__(self, catalog_path: Optional[Path] = None) -> None:
        self.catalog_path = catalog_path or _default_catalog_path()
        self._lock = threading.Lock()

    def _ensure_file(self) -> None:
        self.catalog_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.catalog_path.exists():
            self.catalog_path.write_text("[]", encoding="utf-8")

    def _read_entries(self) -> List[Dict[str, Any]]:
        self._ensure_file()
        data = json.loads(self.catalog_path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []

    def _write_entries(self, entries: List[Dict[str, Any]]) -> None:
        self._ensure_file()
        self.catalog_path.write_text(
            json.dumps(entries, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    def list_entries(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [
                {
                    "id": entry.get("id"),
                    "moduleName": entry.get("moduleName"),
                    "moduleType": entry.get("moduleType", "fullstack-imported"),
                    "sourceRef": entry.get("sourceRef"),
                    "frontendModuleName": (entry.get("layers") or {}).get(
                        "frontend", {},
                    ).get("moduleName"),
                    "backendModuleName": (entry.get("layers") or {}).get(
                        "backend", {},
                    ).get("moduleName"),
                    "frontendCatalogId": (entry.get("layers") or {}).get(
                        "frontend", {},
                    ).get("catalogId"),
                    "backendCatalogId": (entry.get("layers") or {}).get(
                        "backend", {},
                    ).get("catalogId"),
                    "pairingConfidence": (entry.get("manifest") or {}).get(
                        "pairing", {},
                    ).get("confidence"),
                    "createdAt": entry.get("createdAt"),
                    "updatedAt": entry.get("updatedAt"),
                }
                for entry in self._read_entries()
            ]

    def get_entry(self, entry_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            for entry in self._read_entries():
                if entry.get("id") == entry_id:
                    return entry
        return None

    def has_module_name(self, module_name: str) -> bool:
        with self._lock:
            normalized = module_name.strip().lower()
            for entry in self._read_entries():
                if str(entry.get("moduleName", "")).strip().lower() == normalized:
                    return True
        return False

    def save_entry(
        self,
        module_name: str,
        source_ref: Optional[str],
        manifest: Dict[str, Any],
        integration_pack: Dict[str, Any],
        layers: Dict[str, Any],
    ) -> Dict[str, Any]:
        with self._lock:
            entries = self._read_entries()
            now = datetime.now(timezone.utc).isoformat()
            entry = {
                "id": str(uuid.uuid4()),
                "moduleName": module_name,
                "moduleType": "fullstack-imported",
                "sourceRef": source_ref,
                "manifest": manifest,
                "integrationPack": integration_pack,
                "layers": layers,
                "createdAt": now,
                "updatedAt": now,
            }
            entries.insert(0, entry)
            if len(entries) > MAX_CATALOG_ENTRIES:
                entries = entries[:MAX_CATALOG_ENTRIES]
            self._write_entries(entries)
            return entry

    def update_entry(self, entry_id: str, **fields: Any) -> Dict[str, Any]:
        with self._lock:
            entries = self._read_entries()
            for index, entry in enumerate(entries):
                if entry.get("id") != entry_id:
                    continue
                updated = {
                    **entry,
                    **fields,
                    "id": entry_id,
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
                entries[index] = updated
                self._write_entries(entries)
                return updated
        raise ValueError(f"Warsmith catalog entry not found: {entry_id}")

    def delete_entry(self, entry_id: str) -> bool:
        with self._lock:
            entries = self._read_entries()
            filtered = [entry for entry in entries if entry.get("id") != entry_id]
            if len(filtered) == len(entries):
                return False
            self._write_entries(filtered)
            return True

    def clear_catalog(self) -> Dict[str, Any]:
        """Remove all catalog entries in one write."""
        with self._lock:
            entries = self._read_entries()
            deleted = [
                str(entry.get("id", ""))
                for entry in entries
                if entry.get("id")
            ]
            if not deleted:
                return {"deleted": [], "deletedCount": 0}
            self._write_entries([])
            return {"deleted": deleted, "deletedCount": len(deleted)}


_catalog: Optional[WarsmithCatalog] = None


def get_warsmith_catalog() -> WarsmithCatalog:
    global _catalog
    if _catalog is None:
        _catalog = WarsmithCatalog()
    return _catalog
