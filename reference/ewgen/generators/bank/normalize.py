# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Normalize per-track catalog summaries into UnifiedBankEntry rows.
# Invariants:
# - Role is derived from catalogSource (importer→frontend, …).
# - capabilities are derived from tags + moduleType + integrationHints.
# - Stage 8: genesis→backend (approved Python/artifact bundles).
# - Stage 10: richer capabilities feed N-way craft suggest.# Related:
# - generators/bank/search.py
# - generators/bank/genesis_catalog.py
# ---

"""Normalize catalog summaries into unified bank entries."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

CatalogSource = Literal["importer", "scavenger", "warsmith", "genesis"]
BankRole = Literal["frontend", "backend", "fullstack"]

SOURCE_TO_ROLE: Dict[str, BankRole] = {
    "importer": "frontend",
    "scavenger": "backend",
    "warsmith": "fullstack",
    "genesis": "backend",
}

VALID_SOURCES = frozenset(SOURCE_TO_ROLE.keys())
VALID_ROLES = frozenset(SOURCE_TO_ROLE.values())


def role_for_source(catalog_source: str) -> BankRole:
    role = SOURCE_TO_ROLE.get(catalog_source)
    if role is None:
        raise ValueError(f"Unknown catalogSource: {catalog_source}")
    return role


def _as_str_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def derive_capabilities(summary: Dict[str, Any], role: BankRole) -> List[str]:
    """
    Capability tokens for bank filters and Stage 10 craft.

    Prefer tags + moduleType + integrationHints (when present on summary).
    """
    tokens: List[str] = []
    tokens.extend(_as_str_list(summary.get("tags")))
    tokens.extend(_as_str_list(summary.get("integrationHints")))
    module_type = str(summary.get("moduleType") or "").strip()
    if module_type:
        tokens.append(module_type)
    tokens.append(role)
    # Dedup preserving order
    seen: set[str] = set()
    unique: List[str] = []
    for token in tokens:
        key = token.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(token)
    return unique


def normalize_summary(
    catalog_source: CatalogSource,
    summary: Dict[str, Any],
) -> Dict[str, Any]:
    role = role_for_source(catalog_source)
    catalog_id = str(summary.get("id") or "").strip()
    module_name = str(summary.get("moduleName") or "").strip()
    tags = _as_str_list(summary.get("tags"))
    capabilities = derive_capabilities(summary, role)

    entry: Dict[str, Any] = {
        "catalogSource": catalog_source,
        "catalogId": catalog_id,
        "role": role,
        "moduleName": module_name,
        "displayLabel": summary.get("displayLabel"),
        "moduleType": summary.get("moduleType"),
        "sourceRef": summary.get("sourceRef"),
        "tags": tags,
        "integrationHints": _as_str_list(summary.get("integrationHints")),
        "capabilities": capabilities,
        "qualityScore": summary.get("qualityScore"),
        "qualityGrade": summary.get("qualityGrade"),
        "readyForRegistry": summary.get("readyForRegistry"),
        "fileCount": summary.get("fileCount"),
        "createdAt": summary.get("createdAt"),
        "updatedAt": summary.get("updatedAt"),
        "frontendCatalogId": summary.get("frontendCatalogId"),
        "backendCatalogId": summary.get("backendCatalogId"),
        "frontendModuleName": summary.get("frontendModuleName"),
        "backendModuleName": summary.get("backendModuleName"),
        "pairingConfidence": summary.get("pairingConfidence"),
        "importRoot": summary.get("importRoot"),
        "proposalId": summary.get("proposalId"),
        "runId": summary.get("runId"),
        "templateId": summary.get("templateId"),
    }
    return entry


def collect_bank_entries(
    *,
    importer_entries: Optional[List[Dict[str, Any]]] = None,
    scavenger_entries: Optional[List[Dict[str, Any]]] = None,
    warsmith_entries: Optional[List[Dict[str, Any]]] = None,
    genesis_entries: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for summary in importer_entries or []:
        rows.append(normalize_summary("importer", summary))
    for summary in scavenger_entries or []:
        rows.append(normalize_summary("scavenger", summary))
    for summary in warsmith_entries or []:
        rows.append(normalize_summary("warsmith", summary))
    for summary in genesis_entries or []:
        rows.append(normalize_summary("genesis", summary))
    return rows
