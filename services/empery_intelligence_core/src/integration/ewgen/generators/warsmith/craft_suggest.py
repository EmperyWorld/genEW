# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Stage 10/16 capability N-way craft suggestions — heuristic + optional LLM.
# Invariants:
# - LLM failure → heuristic fallback (never empty invent outside bank).
# - Manifests are dry-run validate-able via project_shell.manifest.
# - Stage 16: prefer qualityGrade=strong; expose strength + compat on crafts.
# - Stage 17: prefer ui+api from different sourceRef (cross-archive); bankRefs hydrate.
# Related:
# - generators/bank/search.py
# - generators/warsmith/llm_rank.py
# - generators/unified_ingest/layout_grade.py
# - generators/bank/hydrate.py
# - documentation/platform/EWGEN-COMPONENT-FACTORY-VISION.md
# ---

"""Capability-filtered N-way craft suggest (Component Factory Stage 10)."""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Dict, List, Optional, Protocol, Sequence

from generators.bank.search import search_bank
from generators.factory.llama_client import (
    LlamaClientError,
    extract_json_object,
    get_llama_client,
)
from generators.project_shell.manifest import validate_project_manifest

logger = logging.getLogger("ewgen.warsmith.craft_suggest")

PROTOCOL_V1 = "ewgen_project_suggest_v1"
MAX_CRAFTS = 12
TOKEN_RE = re.compile(r"[a-z0-9]{2,}", re.IGNORECASE)

ROLE_SLOT = {
    "frontend": "ui",
    "backend": "api",
    "fullstack": "fullstack",
}


class Completer(Protocol):
    def complete(self, prompt: str, *, temperature: float = 0.1) -> str:
        ...


def llm_craft_enabled_by_env() -> bool:
    raw = os.getenv("EWGEN_PROJECT_LLM_CRAFT", "0").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _tokens(*parts: str) -> List[str]:
    found: List[str] = []
    seen: set[str] = set()
    for part in parts:
        for match in TOKEN_RE.findall(part or ""):
            key = match.lower()
            if key in seen or len(key) < 2:
                continue
            seen.add(key)
            found.append(key)
    return found


def _capability_overlap(
    entry: Dict[str, Any],
    needles: Sequence[str],
) -> float:
    if not needles:
        return 0.5
    hay = " ".join(
        [
            str(entry.get("moduleName") or ""),
            " ".join(entry.get("capabilities") or []),
            " ".join(entry.get("tags") or []),
            " ".join(entry.get("integrationHints") or []),
        ]
    ).lower()
    hits = sum(1 for n in needles if n in hay)
    return hits / max(1, len(needles))


def _entry_quality_grade(entry: Dict[str, Any]) -> Optional[str]:
    grade = entry.get("qualityGrade")
    if not grade and isinstance(entry.get("quality"), dict):
        grade = entry["quality"].get("grade")
    if not grade:
        return None
    key = str(grade).strip().lower()
    if key in {"strong", "weak"}:
        return key
    return None


def _layout_grade_bonus(entry: Dict[str, Any]) -> float:
    """Stage 16: strong layout preferred over weak for craft ranking."""
    grade = _entry_quality_grade(entry)
    if grade == "strong":
        return 0.25
    if grade == "weak":
        return -0.15
    return 0.0


def _domain_strength_bonus(
    entry: Dict[str, Any],
    needles: Sequence[str],
) -> float:
    """
    Extra weight when entry capabilities align with domain intent tokens
    (docs / db / auth / chat) — explainable domain-strength signal.
    """
    if not needles:
        return 0.0
    domain_keys = ("docs", "db", "sql", "auth", "chat", "music", "content")
    hay = " ".join(
        [
            str(entry.get("moduleName") or ""),
            " ".join(entry.get("capabilities") or []),
            " ".join(entry.get("tags") or []),
        ]
    ).lower()
    bonus = 0.0
    for needle in needles:
        if needle not in domain_keys:
            continue
        if needle in hay:
            bonus += 0.08
    return min(0.24, bonus)


def _pair_strength(
    ui: Dict[str, Any],
    api: Dict[str, Any],
) -> Dict[str, Any]:
    ui_grade = _entry_quality_grade(ui) or "ungraded"
    api_grade = _entry_quality_grade(api) or "ungraded"
    if ui_grade == "strong" and api_grade == "strong":
        pair = "strong"
    elif ui_grade == "weak" or api_grade == "weak":
        pair = "weak"
    elif ui_grade == "ungraded" and api_grade == "ungraded":
        pair = "ungraded"
    else:
        pair = "mixed"
    return {
        "ui": ui_grade,
        "api": api_grade,
        "pair": pair,
    }


def _slot_for_entry(entry: Dict[str, Any]) -> Optional[str]:
    role = str(entry.get("role") or "").strip().lower()
    return ROLE_SLOT.get(role)


def _module_from_entry(entry: Dict[str, Any], slot: str) -> Dict[str, Any]:
    return {
        "role": slot,
        "catalogSource": entry.get("catalogSource"),
        "catalogId": entry.get("catalogId"),
        "moduleId": str(entry.get("moduleName") or slot).strip() or slot,
        "displayName": entry.get("displayLabel") or entry.get("moduleName"),
        "sourceRef": entry.get("sourceRef"),
        "qualityGrade": _entry_quality_grade(entry),
    }


def _cross_archive_meta(
    ui: Dict[str, Any],
    api: Dict[str, Any],
) -> tuple[float, Dict[str, Any]]:
    """
    Stage 17: bonus when ui and api come from different ingest archives.

    sourceRef is typically the ZIP filename from prepare/catalog.
    """
    a = str(ui.get("sourceRef") or "").strip()
    b = str(api.get("sourceRef") or "").strip()
    sources = [s for s in (a, b) if s]
    if a and b and a != b:
        return 0.22, {
            "crossArchive": True,
            "sources": sources,
            "uiSourceRef": a,
            "apiSourceRef": b,
        }
    return 0.0, {
        "crossArchive": False,
        "sources": sources,
        "uiSourceRef": a or None,
        "apiSourceRef": b or None,
    }


def _catalog_files(
    catalog_source: str,
    catalog_id: str,
) -> List[Dict[str, Any]]:
    source = (catalog_source or "").strip().lower()
    entry_id = (catalog_id or "").strip()
    if not source or not entry_id:
        return []
    raw: Optional[Dict[str, Any]] = None
    if source == "importer":
        from generators.importer.catalog import get_import_catalog

        raw = get_import_catalog().get_entry(entry_id)
    elif source == "scavenger":
        from generators.scavenger.catalog import get_scavenger_catalog

        raw = get_scavenger_catalog().get_entry(entry_id)
    if not raw:
        return []
    files = raw.get("files") or []
    return [f for f in files if isinstance(f, dict)]


def _route_pair_score(
    ui: Dict[str, Any],
    api: Dict[str, Any],
) -> tuple[float, Dict[str, Any]]:
    """Bonus/penalty from FE↔BE route overlap when catalog files exist."""
    try:
        from generators.warsmith.contract_tests import build_route_contract
    except ImportError:
        return 0.0, {}
    fe_files = _catalog_files(
        str(ui.get("catalogSource") or ""),
        str(ui.get("catalogId") or ""),
    )
    be_files = _catalog_files(
        str(api.get("catalogSource") or ""),
        str(api.get("catalogId") or ""),
    )
    if not fe_files or not be_files:
        return 0.0, {"status": "skipped", "reason": "no_files"}
    contract = build_route_contract(fe_files, be_files)
    overlap = int(contract.get("overlapCount") or 0)
    meta = {
        "status": "scored",
        "overlapCount": overlap,
        "aligned": bool(contract.get("aligned")),
    }
    if overlap > 0:
        return min(0.5, 0.15 * overlap), meta
    if contract.get("fetchPaths") and contract.get("apiPaths"):
        return -0.35, meta
    return 0.0, meta


def _heuristic_crafts(
    entries: List[Dict[str, Any]],
    *,
    intent: str,
    capabilities: Sequence[str],
    limit: int,
    prefer_cross_archive: bool = True,
) -> List[Dict[str, Any]]:
    needles = _tokens(intent, *capabilities)
    scored: List[tuple[float, Dict[str, Any]]] = []
    for entry in entries:
        score = _capability_overlap(entry, needles)
        quality = entry.get("qualityScore")
        if isinstance(quality, (int, float)):
            score += min(0.2, float(quality) / 500.0)
        score += _layout_grade_bonus(entry)
        score += _domain_strength_bonus(entry, needles)
        scored.append((score, entry))
    scored.sort(key=lambda row: (-row[0], str(row[1].get("moduleName") or "")))

    by_slot: Dict[str, List[Dict[str, Any]]] = {
        "ui": [],
        "api": [],
        "docs": [],
        "db": [],
        "fullstack": [],
    }
    for score, entry in scored:
        slot = _slot_for_entry(entry)
        if not slot:
            continue
        # Map tags hinting docs/db into optional slots
        caps = " ".join(entry.get("capabilities") or []).lower()
        tags = " ".join(entry.get("tags") or []).lower()
        if slot == "api" and ("docs" in caps or "docs" in tags):
            by_slot["docs"].append(entry)
        if slot == "api" and ("db" in caps or "migration" in caps or "sql" in tags):
            by_slot["db"].append(entry)
        by_slot[slot].append(entry)

    crafts: List[Dict[str, Any]] = []
    ui_pool = by_slot["ui"] or []
    api_pool = by_slot["api"] or []
    fullstack_pool = by_slot["fullstack"] or []

    # Prefer ui+api combinations
    for ui in ui_pool[:8]:
        for api in api_pool[:8]:
            modules = [
                _module_from_entry(ui, "ui"),
                _module_from_entry(api, "api"),
            ]
            if by_slot["docs"]:
                docs = by_slot["docs"][0]
                modules.append(
                    {
                        **_module_from_entry(docs, "docs"),
                        "moduleId": "docs",
                        "displayName": docs.get("moduleName") or "Docs",
                    }
                )
            if by_slot["db"]:
                db = by_slot["db"][0]
                modules.append(
                    {
                        **_module_from_entry(db, "db"),
                        "moduleId": "db",
                        "displayName": db.get("moduleName") or "Db",
                    }
                )
            route_bonus, route_meta = _route_pair_score(ui, api)
            strength = _pair_strength(ui, api)
            cross_bonus, provenance = _cross_archive_meta(ui, api)
            if not prefer_cross_archive:
                cross_bonus = 0.0
            score = (
                _capability_overlap(ui, needles)
                + _capability_overlap(api, needles)
            ) / 2.0
            score += route_bonus
            score += _layout_grade_bonus(ui) + _layout_grade_bonus(api)
            score += (
                _domain_strength_bonus(ui, needles)
                + _domain_strength_bonus(api, needles)
            ) / 2.0
            if strength.get("pair") == "strong":
                score += 0.1
            score += cross_bonus
            rationale_parts = [
                f"ui={ui.get('moduleName')}",
                f"api={api.get('moduleName')}",
            ]
            if route_meta.get("overlapCount"):
                rationale_parts.append(
                    f"routes={route_meta.get('overlapCount')}"
                )
            if strength.get("pair") and strength["pair"] != "ungraded":
                rationale_parts.append(f"strength={strength['pair']}")
            if provenance.get("crossArchive"):
                rationale_parts.append("cross-archive")
            if needles:
                rationale_parts.append(
                    "caps=" + ",".join(needles[:6])
                )
            crafts.append(
                {
                    "score": round(score, 4),
                    "rationale": "; ".join(rationale_parts),
                    "forgeMode": "capability-heuristic",
                    "routeContract": route_meta or None,
                    "strength": strength,
                    "compat": {
                        "routes": route_meta or {"status": "skipped"},
                        "layout": strength,
                    },
                    "provenance": provenance,
                    "modules": modules,
                }
            )
            if len(crafts) >= limit * 2:
                break
        if len(crafts) >= limit * 2:
            break

    # Fullstack + complementary role if needed
    if len(crafts) < limit:
        for fs in fullstack_pool[:4]:
            modules = [_module_from_entry(fs, "fullstack")]
            partner = (ui_pool or api_pool or [None])[0]
            if partner is None:
                continue
            slot = _slot_for_entry(partner) or "api"
            if slot == "fullstack":
                continue
            modules.append(_module_from_entry(partner, slot))
            crafts.append(
                {
                    "score": round(_capability_overlap(fs, needles), 4),
                    "rationale": f"fullstack={fs.get('moduleName')}",
                    "forgeMode": "capability-heuristic",
                    "modules": modules,
                }
            )
            if len(crafts) >= limit:
                break

    crafts.sort(key=lambda c: (-float(c.get("score") or 0),))
    return crafts[:limit]


def _build_llm_prompt(crafts: List[Dict[str, Any]], intent: str) -> str:
    lines = [
        "Rank these N-way craft manifests for the operator intent.",
        f"Intent: {intent or '(none)'}",
        "Prefer crafts with strength.pair=strong (layout quality) and route overlap.",
        "Prefer cross-archive crafts (provenance.crossArchive=true) when combining domains.",
        "Return JSON: {\"ranked\":[{\"index\":0,\"score\":0.9,\"rationale\":\"...\"}]}",
        "Do not invent modules; only reorder given crafts.",
        "Crafts:",
    ]
    for index, craft in enumerate(crafts):
        mods = ", ".join(
            f"{m.get('role')}:{m.get('moduleId')}"
            for m in (craft.get("modules") or [])
        )
        strength = craft.get("strength") or {}
        lines.append(
            f"{index}: score={craft.get('score')} modules=[{mods}] "
            f"strength={strength.get('pair')} "
            f"rationale={craft.get('rationale')}"
        )
    return "\n".join(lines)


def _rerank_with_llm(
    crafts: List[Dict[str, Any]],
    *,
    intent: str,
    client: Optional[Completer],
) -> Dict[str, Any]:
    if not crafts:
        return {
            "crafts": [],
            "llmRanking": {
                "status": "skipped",
                "reason": "no_crafts",
            },
        }
    window = crafts[:MAX_CRAFTS]
    completer: Completer = client or get_llama_client()
    try:
        completion = completer.complete(
            _build_llm_prompt(window, intent),
            temperature=0.1,
        )
        payload = extract_json_object(completion)
        ranked = payload.get("ranked") if isinstance(payload, dict) else None
        if not isinstance(ranked, list):
            raise ValueError("LLM craft rank missing ranked[]")
        ordered: List[Dict[str, Any]] = []
        used: set[int] = set()
        for row in ranked:
            if not isinstance(row, dict):
                continue
            try:
                index = int(row.get("index"))
            except (TypeError, ValueError):
                continue
            if index < 0 or index >= len(window) or index in used:
                continue
            item = dict(window[index])
            if row.get("score") is not None:
                try:
                    item["score"] = float(row["score"])
                except (TypeError, ValueError):
                    pass
            if row.get("rationale"):
                item["rationale"] = str(row["rationale"])
            item["forgeMode"] = "capability-llm"
            ordered.append(item)
            used.add(index)
        for index, item in enumerate(window):
            if index not in used:
                ordered.append(dict(item))
        return {
            "crafts": ordered,
            "llmRanking": {
                "status": "applied",
                "rankedCount": len(used),
                "windowSize": len(window),
            },
        }
    except (LlamaClientError, ValueError, TypeError, KeyError, OSError) as error:
        logger.warning("[STEP] project_craft_llm_skip reason=%s", error)
        return {
            "crafts": list(crafts),
            "llmRanking": {
                "status": "failed",
                "reason": str(error)[:200],
                "fallback": "heuristic",
            },
        }
    except Exception as error:  # noqa: BLE001 — never fail suggest
        logger.warning("[STEP] project_craft_llm_skip reason=%s", error)
        return {
            "crafts": list(crafts),
            "llmRanking": {
                "status": "failed",
                "reason": str(error)[:200],
                "fallback": "heuristic",
            },
        }


def suggest_project_crafts(
    *,
    intent: str = "",
    capabilities: Optional[Sequence[str]] = None,
    limit: int = 8,
    use_llm: Optional[bool] = None,
    dry_run_validate: bool = True,
    client: Optional[Completer] = None,
    bank_entries: Optional[List[Dict[str, Any]]] = None,
    bank_refs: Optional[List[Dict[str, Any]]] = None,
    prefer_cross_archive: bool = True,
) -> Dict[str, Any]:
    """
    Intent/capabilities → ranked N-module craft manifests.

    Stage 17: pass bank_refs from multiple prepare runs to craft across archives;
    prefer_cross_archive boosts ui+api pairs with different sourceRef.
    """
    caps = [str(c).strip() for c in (capabilities or []) if str(c).strip()]
    limit = max(1, min(int(limit or 8), MAX_CRAFTS))
    hydrate_skipped: List[Dict[str, str]] = []

    if bank_entries is not None:
        entries = list(bank_entries)
        candidate_scope = "provided"
    elif bank_refs:
        from generators.bank.hydrate import hydrate_bank_refs

        entries, hydrate_skipped = hydrate_bank_refs(list(bank_refs))
        candidate_scope = "bank_refs"
    else:
        candidate_scope = "global_bank"
        # Broad search then filter by capability tokens
        search = search_bank(limit=200)
        entries = list(search.get("entries") or [])
        if caps:
            filtered: List[Dict[str, Any]] = []
            for entry in entries:
                if any(
                    _capability_overlap(entry, [c.lower()]) > 0
                    for c in caps
                ):
                    filtered.append(entry)
            # If capability filter empties bank, fall back to full set
            if filtered:
                entries = filtered

    crafts = _heuristic_crafts(
        entries,
        intent=intent,
        capabilities=caps,
        limit=limit,
        prefer_cross_archive=prefer_cross_archive,
    )

    want_llm = llm_craft_enabled_by_env() if use_llm is None else bool(use_llm)
    llm_meta: Dict[str, Any] = {"status": "skipped", "reason": "disabled"}
    if want_llm:
        ranked = _rerank_with_llm(crafts, intent=intent, client=client)
        crafts = ranked["crafts"]
        llm_meta = ranked["llmRanking"]

    validated: List[Dict[str, Any]] = []
    for craft in crafts:
        item = dict(craft)
        if dry_run_validate:
            try:
                manifest = validate_project_manifest(
                    {
                        "projectName": "CraftPreview",
                        "modules": item.get("modules") or [],
                    }
                )
                item["manifestValid"] = True
                item["validatedRoles"] = sorted(
                    {
                        str(m.get("role"))
                        for m in (manifest.get("modules") or [])
                    }
                )
            except ValueError as exc:
                item["manifestValid"] = False
                item["manifestError"] = str(exc)[:200]
        validated.append(item)

    cross_count = sum(
        1
        for c in validated
        if (c.get("provenance") or {}).get("crossArchive")
    )

    return {
        "success": True,
        "protocol": PROTOCOL_V1,
        "intent": intent,
        "capabilities": caps,
        "candidateScope": candidate_scope,
        "candidateCount": len(entries),
        "preferCrossArchive": prefer_cross_archive,
        "crossArchiveCraftCount": cross_count,
        "hydrateSkipped": hydrate_skipped,
        "rankingMode": (
            "heuristic+llm" if llm_meta.get("status") == "applied" else "heuristic"
        ),
        "llmRanking": llm_meta,
        "crafts": validated,
        "count": len(validated),
    }
