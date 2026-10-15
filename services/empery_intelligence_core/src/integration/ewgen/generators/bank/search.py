# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Read-through piggy bank search — fan-out list_entries + in-memory filters.
# Invariants:
# - Dual filters (role + catalogSource) are AND; conflict → empty, not override.
# - Default limit 100; max 500.
# Related:
# - generators/bank/normalize.py
# - routers/bank.py
# ---

"""Search unified piggy bank across ingest catalogs."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from generators.importer.catalog import get_import_catalog
from generators.scavenger.catalog import get_scavenger_catalog
from generators.warsmith.catalog import get_warsmith_catalog

from .genesis_catalog import get_genesis_catalog
from .normalize import (
    VALID_ROLES,
    VALID_SOURCES,
    collect_bank_entries,
    role_for_source,
)

PROTOCOL_V1 = "ewgen_bank_search_v1"
DEFAULT_LIMIT = 100
MAX_LIMIT = 500


def _haystack(entry: Dict[str, Any]) -> str:
    parts = [
        str(entry.get("moduleName") or ""),
        str(entry.get("displayLabel") or ""),
        str(entry.get("sourceRef") or ""),
        str(entry.get("moduleType") or ""),
        " ".join(entry.get("tags") or []),
        " ".join(entry.get("capabilities") or []),
        str(entry.get("frontendModuleName") or ""),
        str(entry.get("backendModuleName") or ""),
    ]
    return " ".join(parts).lower()


def _matches_capability(entry: Dict[str, Any], capability: str) -> bool:
    needle = capability.strip().lower()
    if not needle:
        return True
    for token in entry.get("capabilities") or []:
        if needle in str(token).lower():
            return True
    for token in entry.get("tags") or []:
        if needle in str(token).lower():
            return True
    return False


def _matches_tag(entry: Dict[str, Any], tag: str) -> bool:
    needle = tag.strip().lower()
    if not needle:
        return True
    for token in entry.get("tags") or []:
        if needle == str(token).lower() or needle in str(token).lower():
            return True
    return False


def filter_bank_entries(
    entries: List[Dict[str, Any]],
    *,
    role: Optional[str] = None,
    catalog_source: Optional[str] = None,
    q: Optional[str] = None,
    capability: Optional[str] = None,
    tag: Optional[str] = None,
    ready_for_registry: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    """
    Apply AND filters. role + catalogSource conflict → empty list.
    """
    role_norm = (role or "").strip().lower() or None
    source_norm = (catalog_source or "").strip().lower() or None

    if role_norm and role_norm not in VALID_ROLES:
        raise ValueError(
            f"Invalid role={role_norm!r}; "
            f"expected one of {sorted(VALID_ROLES)}"
        )
    if source_norm and source_norm not in VALID_SOURCES:
        raise ValueError(
            f"Invalid catalogSource={source_norm!r}; "
            f"expected one of {sorted(VALID_SOURCES)}"
        )
    if role_norm and source_norm:
        expected = role_for_source(source_norm)
        if role_norm != expected:
            # Dual-flag conflict: AND semantics → no silent override
            return []

    q_norm = (q or "").strip().lower() or None
    matched: List[Dict[str, Any]] = []
    for entry in entries:
        if role_norm and entry.get("role") != role_norm:
            continue
        if source_norm and entry.get("catalogSource") != source_norm:
            continue
        if q_norm and q_norm not in _haystack(entry):
            continue
        if capability and not _matches_capability(entry, capability):
            continue
        if tag and not _matches_tag(entry, tag):
            continue
        if ready_for_registry is not None:
            if bool(entry.get("readyForRegistry")) is not ready_for_registry:
                continue
        matched.append(entry)
    return matched


def search_bank(
    *,
    role: Optional[str] = None,
    catalog_source: Optional[str] = None,
    q: Optional[str] = None,
    capability: Optional[str] = None,
    tag: Optional[str] = None,
    ready_for_registry: Optional[bool] = None,
    limit: int = DEFAULT_LIMIT,
    importer_entries: Optional[List[Dict[str, Any]]] = None,
    scavenger_entries: Optional[List[Dict[str, Any]]] = None,
    warsmith_entries: Optional[List[Dict[str, Any]]] = None,
    genesis_entries: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Fan-out catalog list_entries (or injected lists for tests) and filter.
    """
    capped = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))

    if importer_entries is None:
        importer_entries = get_import_catalog().list_entries()
    if scavenger_entries is None:
        scavenger_entries = get_scavenger_catalog().list_entries()
    if warsmith_entries is None:
        warsmith_entries = get_warsmith_catalog().list_entries()
    if genesis_entries is None:
        genesis_entries = get_genesis_catalog().list_entries()

    all_entries = collect_bank_entries(
        importer_entries=importer_entries,
        scavenger_entries=scavenger_entries,
        warsmith_entries=warsmith_entries,
        genesis_entries=genesis_entries,
    )
    filtered = filter_bank_entries(
        all_entries,
        role=role,
        catalog_source=catalog_source,
        q=q,
        capability=capability,
        tag=tag,
        ready_for_registry=ready_for_registry,
    )
    # Newest first when timestamps present
    filtered.sort(
        key=lambda row: str(row.get("updatedAt") or row.get("createdAt") or ""),
        reverse=True,
    )
    page = filtered[:capped]

    sources = {
        "importer": 0,
        "scavenger": 0,
        "warsmith": 0,
        "genesis": 0,
    }
    for row in page:
        key = str(row.get("catalogSource") or "")
        if key in sources:
            sources[key] += 1

    return {
        "protocol": PROTOCOL_V1,
        "success": True,
        "query": {
            "role": role,
            "catalogSource": catalog_source,
            "q": q,
            "capability": capability,
            "tag": tag,
            "readyForRegistry": ready_for_registry,
            "limit": capped,
        },
        "entries": page,
        "count": len(page),
        "totalMatched": len(filtered),
        "sources": sources,
    }
