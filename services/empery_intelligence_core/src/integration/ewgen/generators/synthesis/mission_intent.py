# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Mission brief → semantic capabilities + intent-aware atom ranking (ASE W1–W4).
# Invariants:
# - Deterministic keyword inference; no LLM in this module.
# - Manifest-only bank rows score lower than production scavenger bundles.
# Related:
# - documentation/platform/EWGEN-PROJECT-MEANING-CANON.md
# - generators/synthesis/plan_schema.py
# ---

"""Intent parsing and atom ranking for ArchitecturePlan."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from .atom_compat import pick_nway_with_compat

# (capability_id, weight_level, positive_regex, negative_regex)
_INTENT_PROFILES: Tuple[Tuple[str, str, str, str], ...] = (
    (
        "chat_messaging",
        "high",
        r"\b(chat|chats|messenger|gaf|conversation|диалог|чат)\b",
        r"\b(voice\s*center|tts|speech\s*only)\b",
    ),
    (
        "ai_assistant",
        "high",
        r"\b(ai|llm|gpt|companion|assistant|оркест|спутник|нейро)\b",
        "",
    ),
    (
        "api_surface",
        "high",
        r"\b(api|python|fastapi|flask|backend|rest)\b",
        "",
    ),
    (
        "db_handling",
        "high",
        r"\b(postgres|postgresql|database|db\b|sql|redis)\b",
        "",
    ),
    (
        "docs_processing",
        "high",
        r"\b(docs|pdf|ocr|document|paperless)\b",
        "",
    ),
    (
        "ui_polish",
        "medium",
        r"\b(ui|react|frontend|spa|vite|interface)\b",
        "",
    ),
    (
        "auth_service",
        "high",
        r"\b(auth|login|oidc|keycloak|sso)\b",
        "",
    ),
    (
        "voice_audio",
        "medium",
        r"\b(voice|tts|audio|speech|transcri)\b",
        "",
    ),
    (
        "worker_jobs",
        "medium",
        r"\b(worker|celery|queue|job|task)\b",
        "",
    ),
)

_WEIGHT_LEVEL = {"high": 1.0, "medium": 0.6, "low": 0.3}

# Planner picks distinct domain stacks in this order when multi-module.
_CAP_PLAN_ORDER: Tuple[str, ...] = (
    "docs_processing",
    "db_handling",
    "chat_messaging",
    "ai_assistant",
    "auth_service",
    "ui_polish",
    "api_surface",
    "voice_audio",
    "worker_jobs",
)

# Semantic caps satisfied by a module with this primary capability tag.
_CAP_ALIASES: Dict[str, Tuple[str, ...]] = {
    "chat_messaging": ("chat_messaging", "api_surface", "ai_assistant"),
    "ai_assistant": ("ai_assistant", "chat_messaging", "api_surface"),
    "auth_service": ("auth_service", "auth_readiness", "api_surface"),
}


def _mission_text(mission: Mapping[str, Any]) -> str:
    parts = [
        str(mission.get("intent") or ""),
        str(mission.get("name") or ""),
        str(mission.get("description") or ""),
    ]
    return " ".join(parts).lower()


def infer_intent_capabilities(
    mission: Mapping[str, Any],
) -> Tuple[List[str], Dict[str, float]]:
    """
    Derive semantic capabilities from free-text mission when operator did not
    specify enough structured caps (e.g. «Чат с AI» → chat_messaging + ai_assistant).
    """
    text = _mission_text(mission)
    caps: List[str] = []
    weights: Dict[str, float] = {}
    for cap_id, level, pos_pat, neg_pat in _INTENT_PROFILES:
        if not re.search(pos_pat, text, re.IGNORECASE):
            continue
        if neg_pat and re.search(neg_pat, text, re.IGNORECASE):
            continue
        if cap_id not in weights:
            caps.append(cap_id)
        weights[cap_id] = max(weights.get(cap_id, 0.0), _WEIGHT_LEVEL[level])
    if not caps:
        caps = ["api_surface"]
        weights = {"api_surface": 0.7}
    return caps, weights


def merge_mission_capabilities(mission: Dict[str, Any]) -> Dict[str, Any]:
    """Merge operator caps with inferred intent caps (operator wins on conflict)."""
    out = dict(mission or {})
    existing = [str(c).strip().lower() for c in (out.get("capabilities") or [])]
    existing_weights = dict(out.get("capabilityWeights") or out.get("weights") or {})
    inferred_caps, inferred_weights = infer_intent_capabilities(out)

    merged_caps: List[str] = []
    merged_weights: Dict[str, float] = {}
    seen: set[str] = set()

    for cap in existing + inferred_caps:
        key = cap.strip().lower().replace(" ", "_").replace("-", "_")
        if not key or key in seen:
            continue
        seen.add(key)
        merged_caps.append(key)
        if key in existing_weights:
            val = existing_weights[key]
            if isinstance(val, (int, float)):
                merged_weights[key] = float(val)
            else:
                merged_weights[key] = _WEIGHT_LEVEL.get(str(val).lower(), 0.7)
        elif key in inferred_weights:
            merged_weights[key] = inferred_weights[key]
        else:
            merged_weights[key] = 0.7

    out["capabilities"] = merged_caps
    out["capabilityWeights"] = merged_weights
    out["intentProfile"] = {
        "inferred": inferred_caps,
        "textSample": _mission_text(out)[:120],
    }
    return out


def _candidate_text_blob(cand: Mapping[str, Any]) -> str:
    parts = [
        str(cand.get("moduleName") or ""),
        str(cand.get("semanticName") or ""),
        str(cand.get("purpose") or ""),
        " ".join(str(c) for c in (cand.get("capabilities") or [])[:12]),
    ]
    routes = (cand.get("interfaces") or {}).get("routes") or []
    for route in routes[:24]:
        if isinstance(route, dict):
            parts.append(str(route.get("path") or ""))
            parts.append(str(route.get("file") or ""))
    paths = cand.get("paths") or []
    parts.extend(str(p) for p in paths[:16])
    return " ".join(parts).lower()


def _quality_grade_bonus(cand: Mapping[str, Any]) -> float:
    grade = str(cand.get("qualityGrade") or "").strip().lower()
    if grade == "strong":
        return 0.35
    if grade == "weak":
        return -0.12
    if grade == "broken":
        return -2.0
    return 0.0


def mission_wants_multi_module(mission: Mapping[str, Any]) -> bool:
    """True when brief explicitly needs distinct domain stacks (docs + db, etc.)."""
    weights = mission.get("capabilityWeights") or {}
    heavy = 0
    for key in (
        "api_surface",
        "db_handling",
        "docs_processing",
        "ui_polish",
        "auth_service",
    ):
        val = weights.get(key, 0)
        if isinstance(val, (int, float)) and float(val) >= 0.6:
            heavy += 1
        elif str(val).lower() in {"high", "medium"}:
            heavy += 1
    return heavy >= 2


def _caps_for_planning(mission: Mapping[str, Any]) -> List[str]:
    mission_n = merge_mission_capabilities(dict(mission))
    weights = dict(mission_n.get("capabilityWeights") or {})
    caps = list(mission_n.get("capabilities") or ["api_surface"])

    def sort_key(cap: str) -> tuple[float, int]:
        order = _CAP_PLAN_ORDER.index(cap) if cap in _CAP_PLAN_ORDER else 99
        return (-float(weights.get(cap, 0.7)), order)

    if mission_wants_multi_module(mission_n):
        return sorted(caps, key=sort_key)

    # Single-domain: merge chat + ai into one primary pick.
    merged: List[str] = []
    skip = {"chat_messaging", "ai_assistant"}
    for cap in sorted(caps, key=sort_key):
        if cap in skip and any(c in merged for c in skip):
            continue
        merged.append(cap)
    return merged or ["api_surface"]


def _manifest_only_penalty(cand: Mapping[str, Any]) -> float:
    source = str(cand.get("catalogSource") or "").lower()
    backend_n = int(cand.get("backendFileCount") or 0)
    paths = cand.get("paths") or []
    has_backend_path = any(str(p).startswith("backend/") for p in paths)
    if source == "importer" and backend_n == 0 and not has_backend_path:
        return -2.5
    if backend_n == 0 and not has_backend_path and source in {"", "importer"}:
        return -1.0
    return 0.0


def _broken_import_penalty(cand: Mapping[str, Any]) -> float:
    """
    Deprioritize scavenger bundles with unresolved imports (post-ladder P2).

    Capability strings from prepare often embed ``broken spec(s)`` / unresolved
    counts — those atoms must not win intent ranking over clean modules with
    real backend/router trees.
    """
    blob = " ".join(str(c) for c in (cand.get("capabilities") or [])).lower()
    blob += " " + str(cand.get("summary") or "").lower()
    penalty = 0.0
    if re.search(r"\bbroken\s+spec", blob) or "unresolved" in blob:
        penalty -= 1.8
    if re.search(r"\b(\d{2,}|[1-9]\d+)\s+broken\b", blob):
        penalty -= 0.6
    return penalty


def _api_router_mount_bonus(cand: Mapping[str, Any]) -> float:
    """
    Prefer atoms with real ``APIRouter(`` constructors (P3 runnable).

    Fat trees with interfaces-only routes but no ctor become stub shells —
    demote them when backend is large. Missing evidence fields → no-op
    (unit fixtures / legacy packs).
    """
    if "apiRouterCtorCount" not in cand and "hasApiRouter" not in cand:
        return 0.0
    ctor = int(cand.get("apiRouterCtorCount") or 0)
    if cand.get("hasApiRouter") is True:
        ctor = max(ctor, 1)
    backend_n = int(cand.get("backendFileCount") or 0)
    dangling = int(cand.get("danglingEwgenBundleCount") or 0)
    # Neutral Contract incomplete: imports point at missing ewgen_bundle tree.
    dangling_penalty = -min(2.5, 0.15 * dangling) if dangling else 0.0
    if ctor > 0:
        return 1.4 + min(0.3, 0.05 * ctor) + dangling_penalty
    if backend_n >= 40:
        return -1.2 + dangling_penalty
    if backend_n >= 10:
        return -0.4 + dangling_penalty
    return dangling_penalty


def score_atom_for_mission(
    cand: Mapping[str, Any],
    mission: Mapping[str, Any],
    *,
    needed_caps: Optional[Sequence[str]] = None,
) -> float:
    """Keyword + capability match score for one bank candidate."""
    mission_n = merge_mission_capabilities(dict(mission))
    needed = list(needed_caps or mission_n.get("capabilities") or [])
    weights = dict(mission_n.get("capabilityWeights") or {})
    text = _mission_text(mission_n)
    blob = _candidate_text_blob(cand)

    score = float((cand.get("strength") or {}).get("overall") or 0) * 0.15
    score += _manifest_only_penalty(cand)
    score += _broken_import_penalty(cand)
    score += _api_router_mount_bonus(cand)
    score += _quality_grade_bonus(cand)

    caps = [str(c).lower() for c in (cand.get("capabilities") or [])]
    dims = (cand.get("strength") or {}).get("dimensions") or {}

    for cap in needed:
        w = float(weights.get(cap, 0.7))
        if cap in caps:
            score += (0.45 + float(dims.get(cap, 0.0))) * w
        elif float(dims.get(cap, 0.0)) > 0:
            score += float(dims.get(cap, 0.0)) * w * 0.4

    # Intent keyword boosts — any bank module matching mission terms
    # (not a fixed allowlist of known product names).
    if re.search(r"\b(chat|chats|gaf|companion|диалог|чат)\b", text, re.I):
        if re.search(
            r"(/chats(?:/|$)|/chat(?:/|$)|gaf.?chat|gaf_chat)",
            blob,
            re.I,
        ):
            score += 1.2
        elif re.search(r"\b\w*chat\w*\b", blob, re.I) and not re.search(
            r"voice.?center", blob, re.I
        ):
            # Unknown chat-named components (AcmeChat, TeamChat, …)
            score += 1.15
        elif re.search(r"\b(companion)\b", blob):
            score += 0.9
        elif re.search(r"\bewa.?platform\b", blob):
            score += 0.35
        if re.search(r"\bvoice.?center\b", blob) and not re.search(
            r"\b(voice|tts|audio|speech)\b", text, re.I
        ):
            score -= 0.8

    if re.search(r"\b(ai|llm|companion|assistant|спутник)\b", text, re.I):
        if re.search(r"\b(companion|llm|orchestr)\b", blob):
            score += 0.6
        elif re.search(r"\bewa.?platform\b", blob):
            score += 0.25

    if re.search(r"\b(doc|pdf|ocr|document)\b", text, re.I):
        if re.search(r"\b(doc|paperless|ocr|ultimate.?doc)\b", blob):
            score += 0.5

    if re.search(r"\b(db|postgres|database|sql)\b", text, re.I):
        if re.search(r"\b(db|postgres|database|migration)\b", blob):
            score += 0.5

    backend_n = int(cand.get("backendFileCount") or 0)
    if backend_n >= 20:
        score += 0.15
    elif backend_n >= 5:
        score += 0.05

    return round(score, 4)


def pick_best_atom_for_capability(
    capability: str,
    mission: Mapping[str, Any],
    candidates: Sequence[Mapping[str, Any]],
    *,
    used: set[str],
) -> Optional[Dict[str, Any]]:
    """Best bank atom for one capability slot (best-of-breed)."""
    best: Optional[Dict[str, Any]] = None
    best_score = -999.0
    for cand in candidates:
        aid = str(cand.get("atomId") or "")
        if not aid or aid in used:
            continue
        score = score_atom_for_mission(cand, mission, needed_caps=[capability])
        if score > best_score:
            best_score = score
            best = dict(cand)
            best["intentMatchScore"] = score
    if best is None or best_score <= -1.0:
        return None
    return best


def build_best_of_breed_modules(
    mission: Mapping[str, Any],
    candidates: Sequence[Mapping[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Deterministic best-of-breed module list for ArchitecturePlan (W2).

    One primary atom for single-domain missions; per-capability picks when
    mission explicitly combines domains (e.g. API + Postgres, docs + db).
    """
    mission_n = merge_mission_capabilities(dict(mission))
    caps = _caps_for_planning(mission_n)

    if not mission_wants_multi_module(mission_n):
        primary = pick_primary_atom(mission_n, candidates)
        if primary:
            aid = str(primary.get("atomId") or "")
            cap = next(
                (c for c in caps if c in ("chat_messaging", "ai_assistant")),
                caps[0] if caps else "api_surface",
            )
            return [
                {
                    "atomId": aid,
                    "role": primary.get("role") or "mixed",
                    "capability": cap,
                    "mount": f"/api/modules/{aid}",
                    "strengthScore": primary.get("intentMatchScore"),
                    "intentPrimary": True,
                    "selection": "best_of_breed_primary",
                }
            ]
        return []

    return build_nway_craft_modules(mission_n, candidates)


def build_nway_craft_modules(
    mission: Mapping[str, Any],
    candidates: Sequence[Mapping[str, Any]],
) -> List[Dict[str, Any]]:
    """W4 — N-way module picks with cross-bank compatibility scoring."""
    mission_n = merge_mission_capabilities(dict(mission))
    caps = _caps_for_planning(mission_n)
    weights = dict(mission_n.get("capabilityWeights") or {})
    modules, nway = pick_nway_with_compat(
        mission_n,
        candidates,
        caps,
        score_fn=score_atom_for_mission,
        weights=weights,
    )
    if modules:
        craft_meta = {"nwayScore": nway.get("nwayScore"), "pairs": nway.get("pairs")}
        for mod in modules:
            mod["craft"] = craft_meta
        return modules
    return []


def reconcile_plan_modules(
    plan: Dict[str, Any],
    mission: Mapping[str, Any],
    candidates: Sequence[Mapping[str, Any]],
) -> Dict[str, Any]:
    """
    Replace LLM/heuristic module picks that rank far below best-of-breed (W2).
    """
    out = dict(plan)
    ranked = {str(c.get("atomId")): c for c in candidates if c.get("atomId")}
    modules: List[Dict[str, Any]] = []
    used: set[str] = set()

    for mod in out.get("modules") or []:
        if not isinstance(mod, dict):
            continue
        cap = str(mod.get("capability") or "api_surface")
        aid = str(mod.get("atomId") or "")
        best = pick_best_atom_for_capability(cap, mission, candidates, used=set())
        if best:
            best_id = str(best.get("atomId") or "")
            cur = ranked.get(aid)
            cur_score = (
                score_atom_for_mission(cur, mission, needed_caps=[cap])
                if cur
                else -999.0
            )
            best_score = float(best.get("intentMatchScore") or 0)
            if (
                best_id
                and best_id not in used
                and (not aid or best_score > cur_score + 0.25)
            ):
                mod = {
                    **mod,
                    "atomId": best_id,
                    "mount": f"/api/modules/{best_id}",
                    "reconciledFrom": aid or None,
                    "strengthScore": best_score,
                    "selection": "reconciled_best_of_breed",
                }
                aid = best_id
        if aid:
            used.add(aid)
        modules.append(mod)

    if not modules:
        modules = build_best_of_breed_modules(mission, candidates)
    out["modules"] = modules
    return out


def pick_primary_atom(
    mission: Mapping[str, Any],
    candidates: Sequence[Mapping[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Best single atom for mission primary intent (heuristic plan anchor)."""
    if not candidates:
        return None
    scored = [(score_atom_for_mission(c, mission), dict(c)) for c in candidates]
    scored.sort(key=lambda t: t[0], reverse=True)
    best_score, best = scored[0]
    if best_score <= -1.0:
        return None
    best["intentMatchScore"] = best_score
    return best
