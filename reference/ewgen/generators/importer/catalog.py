"""
Fortune Seaker - Import Catalog
Persistent storage for prepared import bundles
"""

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

MAX_CATALOG_ENTRIES = 50
DEFAULT_MAX_ENTRY_SIZE_BYTES = 12_000_000
MAX_ENTRY_SIZE_BYTES = int(
    os.getenv("EWGEN_IMPORT_MAX_CATALOG_ENTRY_SIZE", str(DEFAULT_MAX_ENTRY_SIZE_BYTES)),
)


def _default_catalog_path() -> Path:
    configured = os.getenv("EWGEN_IMPORT_CATALOG_PATH", "")
    if configured:
        return Path(configured)
    return Path(__file__).parent.parent.parent / "data" / "import-catalog.json"


class ImportCatalog:
    """
    File-backed catalog of prepared import bundles.
    """

    def __init__(self, catalog_path: Optional[Path] = None) -> None:
        self.catalog_path = catalog_path or _default_catalog_path()
        self._lock = threading.Lock()
        self._cache_mtime: Optional[float] = None
        self._cache_entries: Optional[List[Dict[str, Any]]] = None

    def _ensure_file(self) -> None:
        self.catalog_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.catalog_path.exists():
            self.catalog_path.write_text("[]", encoding="utf-8")

    def _read_entries(self) -> List[Dict[str, Any]]:
        self._ensure_file()
        mtime = self.catalog_path.stat().st_mtime
        if self._cache_mtime == mtime and self._cache_entries is not None:
            return self._cache_entries
        raw = self.catalog_path.read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, list):
            data = []
        self._cache_entries = data
        self._cache_mtime = mtime
        return data

    def _write_entries(self, entries: List[Dict[str, Any]]) -> None:
        self._ensure_file()
        self.catalog_path.write_text(
            json.dumps(entries, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        self._cache_mtime = self.catalog_path.stat().st_mtime
        self._cache_entries = entries

    def _entry_size(self, files: List[Dict[str, Any]]) -> int:
        total = 0
        for item in files:
            content = item.get("content", "")
            total += len(content.encode("utf-8"))
        return total

    def list_entries(self) -> List[Dict[str, Any]]:
        with self._lock:
            entries = self._read_entries()
            return [
                {
                    "id": entry.get("id"),
                    "moduleName": entry.get("moduleName"),
                    "displayLabel": entry.get("displayLabel"),
                    "moduleType": entry.get("moduleType"),
                    "source": entry.get("source"),
                    "sourceRef": entry.get("sourceRef"),
                    "fileCount": len(entry.get("files", [])),
                    "sourceFileCount": (entry.get("bundleQuality") or {}).get(
                        "sourceFileCount",
                    ),
                    "tags": entry.get("tags", []),
                    "integrationHints": entry.get("integrationHints", []),
                    "qualityScore": (entry.get("bundleQuality") or {}).get("qualityScore"),
                    "qualityGrade": (entry.get("bundleQuality") or {}).get("qualityGrade"),
                    "readyForRegistry": (entry.get("bundleQuality") or {}).get(
                        "readyForRegistry",
                        False,
                    ),
                    "createdAt": entry.get("createdAt"),
                    "updatedAt": entry.get("updatedAt"),
                }
                for entry in entries
            ]

    def load_entries(self) -> List[Dict[str, Any]]:
        """Load all catalog entries once (cached by file mtime)."""
        with self._lock:
            return self._read_entries()

    def get_entry(self, entry_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            for entry in self._read_entries():
                if entry.get("id") == entry_id:
                    return entry
        return None

    def save_entry(
        self,
        module_name: str,
        module_type: str,
        files: List[Dict[str, Any]],
        source: str = "zip",
        source_ref: Optional[str] = None,
        integration_hints: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        bundle_quality: Optional[Dict[str, Any]] = None,
        display_label: Optional[str] = None,
    ) -> Dict[str, Any]:
        entry_size = self._entry_size(files)
        if entry_size > MAX_ENTRY_SIZE_BYTES:
            raise ValueError(
                f"Import bundle too large: {entry_size} > {MAX_ENTRY_SIZE_BYTES}"
            )

        now = datetime.now(timezone.utc).isoformat()
        entry: Dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "moduleName": module_name,
            "displayLabel": display_label or module_name,
            "moduleType": module_type,
            "source": source,
            "sourceRef": source_ref,
            "files": files,
            "integrationHints": integration_hints or [],
            "tags": tags or ["imported"],
            "bundleQuality": bundle_quality,
            "createdAt": now,
            "updatedAt": now,
        }

        with self._lock:
            entries = self._read_entries()
            entries.insert(0, entry)
            entries = entries[:MAX_CATALOG_ENTRIES]
            self._write_entries(entries)

        return entry

    def update_entry(
        self,
        entry_id: str,
        *,
        module_name: Optional[str] = None,
        module_type: Optional[str] = None,
        files: Optional[List[Dict[str, Any]]] = None,
        source: Optional[str] = None,
        source_ref: Optional[str] = None,
        integration_hints: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        bundle_quality: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            entries = self._read_entries()
            for index, entry in enumerate(entries):
                if entry.get("id") != entry_id:
                    continue
                if files is not None:
                    entry_size = self._entry_size(files)
                    if entry_size > MAX_ENTRY_SIZE_BYTES:
                        raise ValueError(
                            f"Import bundle too large: {entry_size} > {MAX_ENTRY_SIZE_BYTES}"
                        )
                updated = {
                    **entry,
                    **{
                        key: value
                        for key, value in {
                            "moduleName": module_name,
                            "moduleType": module_type,
                            "files": files,
                            "source": source,
                            "sourceRef": source_ref,
                            "integrationHints": integration_hints,
                            "tags": tags,
                            "bundleQuality": bundle_quality,
                        }.items()
                        if value is not None
                    },
                    "id": entry_id,
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
                entries[index] = updated
                self._write_entries(entries)
                return updated
        raise ValueError(f"Import catalog entry not found: {entry_id}")

    def delete_entry(self, entry_id: str) -> bool:
        with self._lock:
            entries = self._read_entries()
            filtered = [e for e in entries if e.get("id") != entry_id]
            if len(filtered) == len(entries):
                return False
            self._write_entries(filtered)
            return True

    def delete_entries(self, entry_ids: List[str]) -> Dict[str, Any]:
        """Delete multiple catalog entries in one write."""
        requested = {entry_id.strip() for entry_id in entry_ids if entry_id.strip()}
        if not requested:
            return {"deleted": [], "notFound": []}

        with self._lock:
            entries = self._read_entries()
            existing_ids = {str(entry.get("id", "")) for entry in entries}
            deleted = sorted(requested & existing_ids)
            if not deleted:
                return {"deleted": [], "notFound": sorted(requested)}

            deleted_set = set(deleted)
            self._write_entries([
                entry for entry in entries
                if str(entry.get("id", "")) not in deleted_set
            ])
            return {
                "deleted": deleted,
                "notFound": sorted(requested - deleted_set),
            }

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


_catalog_instance: Optional[ImportCatalog] = None
_catalog_lock = threading.Lock()


def get_import_catalog() -> ImportCatalog:
    global _catalog_instance
    with _catalog_lock:
        if _catalog_instance is None:
            _catalog_instance = ImportCatalog()
        return _catalog_instance
