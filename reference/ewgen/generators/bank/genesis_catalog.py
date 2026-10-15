# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# File-backed catalog of Genesis-approved artifact bundles (Stage 8).
# Invariants:
# - Writes only after operator approve; never on pending proposals.
# - Does not replace SET Standard or scavenger/importer catalogs.
# Related:
# - generators/factory/genesis_pipeline.py
# - generators/bank/search.py
# ---

"""Genesis-approved module catalog for the unified piggy bank."""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

MAX_CATALOG_ENTRIES = 100
DEFAULT_MAX_ENTRY_SIZE_BYTES = 12_000_000
MAX_ENTRY_SIZE_BYTES = int(
    os.getenv(
        "EWGEN_GENESIS_MAX_CATALOG_ENTRY_SIZE",
        str(DEFAULT_MAX_ENTRY_SIZE_BYTES),
    ),
)


def _default_catalog_path() -> Path:
    configured = os.getenv("EWGEN_GENESIS_CATALOG_PATH", "").strip()
    if configured:
        return Path(configured)
    return Path(__file__).parent.parent.parent / "data" / "genesis-catalog.json"


class GenesisCatalog:
    """Catalog of operator-approved Genesis artifact bundles."""

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
        data = json.loads(self.catalog_path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            data = []
        self._cache_entries = data
        self._cache_mtime = mtime
        return data

    def _write_entries(self, entries: List[Dict[str, Any]]) -> None:
        self._ensure_file()
        self.catalog_path.write_text(
            json.dumps(entries, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        self._cache_mtime = self.catalog_path.stat().st_mtime
        self._cache_entries = entries

    def list_entries(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [
                {
                    "id": entry.get("id"),
                    "moduleName": entry.get("moduleName"),
                    "displayLabel": entry.get("displayLabel"),
                    "moduleType": entry.get("moduleType"),
                    "source": entry.get("source"),
                    "sourceRef": entry.get("sourceRef"),
                    "fileCount": len(entry.get("files") or []),
                    "tags": entry.get("tags") or [],
                    "qualityScore": (entry.get("bundleQuality") or {}).get(
                        "qualityScore",
                    ),
                    "qualityGrade": (entry.get("bundleQuality") or {}).get(
                        "qualityGrade",
                    ),
                    "readyForRegistry": (entry.get("bundleQuality") or {}).get(
                        "readyForRegistry",
                        True,
                    ),
                    "proposalId": entry.get("proposalId"),
                    "runId": entry.get("runId"),
                    "templateId": entry.get("templateId"),
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

    def find_by_proposal(self, proposal_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            for entry in self._read_entries():
                if entry.get("proposalId") == proposal_id:
                    return entry
        return None

    def save_entry(
        self,
        *,
        module_name: str,
        module_type: str,
        files: List[Dict[str, Any]],
        proposal_id: str,
        run_id: str,
        template_id: str = "",
        source_ref: Optional[str] = None,
        tags: Optional[List[str]] = None,
        display_label: Optional[str] = None,
    ) -> Dict[str, Any]:
        size = sum(
            len(str(item.get("content", "")).encode("utf-8")) for item in files
        )
        if size > MAX_ENTRY_SIZE_BYTES:
            raise ValueError("Genesis catalog entry exceeds size limit")

        with self._lock:
            entries = [
                item
                for item in self._read_entries()
                if item.get("proposalId") != proposal_id
            ]
            now = datetime.now(timezone.utc).isoformat()
            entry = {
                "id": str(uuid.uuid4()),
                "moduleName": module_name,
                "displayLabel": display_label or module_name,
                "moduleType": module_type,
                "files": files,
                "source": "genesis",
                "sourceRef": source_ref or f"proposal:{proposal_id}",
                "tags": tags
                or ["genesis", "approved", "python", module_type],
                "bundleQuality": {
                    "qualityScore": 0.8,
                    "qualityGrade": "B",
                    "readyForRegistry": True,
                    "sourceFileCount": len(files),
                },
                "proposalId": proposal_id,
                "runId": run_id,
                "templateId": template_id,
                "createdAt": now,
                "updatedAt": now,
            }
            entries.insert(0, entry)
            if len(entries) > MAX_CATALOG_ENTRIES:
                entries = entries[:MAX_CATALOG_ENTRIES]
            self._write_entries(entries)
            return entry


_catalog: Optional[GenesisCatalog] = None


def get_genesis_catalog() -> GenesisCatalog:
    global _catalog
    if _catalog is None:
        _catalog = GenesisCatalog()
    return _catalog
