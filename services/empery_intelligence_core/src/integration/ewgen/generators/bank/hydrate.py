# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Hydrate prepare bank refs (catalogSource+catalogId) into full bank entries.
# Invariants:
# - Missing catalog rows are skipped with a reason (never invent modules).
# - Output is normalize_summary shape for craft_suggest.
# - Stage 15 qualityGrade from prepare refs is preserved for Stage 16 craft.
# Related:
# - generators/bank/normalize.py
# - generators/factory/component_factory_run.py
# ---

"""Resolve prepare bank refs to full piggy-bank entries."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from generators.bank.genesis_catalog import get_genesis_catalog
from generators.bank.normalize import normalize_summary
from generators.importer.catalog import get_import_catalog
from generators.scavenger.catalog import get_scavenger_catalog
from generators.warsmith.catalog import get_warsmith_catalog


def _raw_entry(catalog_source: str, catalog_id: str) -> Dict[str, Any] | None:
    source = (catalog_source or "").strip().lower()
    entry_id = (catalog_id or "").strip()
    if not source or not entry_id:
        return None
    if source == "importer":
        return get_import_catalog().get_entry(entry_id)
    if source == "scavenger":
        return get_scavenger_catalog().get_entry(entry_id)
    if source == "warsmith":
        return get_warsmith_catalog().get_entry(entry_id)
    if source == "genesis":
        return get_genesis_catalog().get_entry(entry_id)
    return None


def hydrate_bank_refs(
    refs: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, str]]]:
    """
    Turn prepare bankEntries refs into normalized bank rows.

    Returns (entries, skipped) where skipped items have catalogId + reason.
    """
    hydrated: List[Dict[str, Any]] = []
    skipped: List[Dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for ref in refs:
        if not isinstance(ref, dict):
            continue
        source = str(ref.get("catalogSource") or "").strip().lower()
        catalog_id = str(ref.get("catalogId") or "").strip()
        if not source or not catalog_id:
            skipped.append(
                {
                    "catalogId": catalog_id or "?",
                    "reason": "missing_source_or_id",
                }
            )
            continue
        key = (source, catalog_id)
        if key in seen:
            continue
        seen.add(key)
        raw = _raw_entry(source, catalog_id)
        if raw is None:
            skipped.append(
                {
                    "catalogSource": source,
                    "catalogId": catalog_id,
                    "reason": "catalog_miss",
                }
            )
            continue
        summary = dict(raw)
        if "id" not in summary:
            summary["id"] = catalog_id
        try:
            entry = normalize_summary(source, summary)  # type: ignore[arg-type]
        except ValueError as exc:
            skipped.append(
                {
                    "catalogSource": source,
                    "catalogId": catalog_id,
                    "reason": str(exc)[:120],
                }
            )
            continue
        # Stage 15/16: preserve prepare-time layout grade on hydrated rows.
        grade = ref.get("qualityGrade")
        if not grade and isinstance(ref.get("quality"), dict):
            grade = ref["quality"].get("grade")
        if grade:
            entry["qualityGrade"] = str(grade).strip().lower()
        if isinstance(ref.get("quality"), dict):
            entry["quality"] = ref["quality"]
        ref_source = str(ref.get("sourceRef") or "").strip()
        if ref_source:
            entry["sourceRef"] = ref_source
        hydrated.append(entry)

    return hydrated, skipped
