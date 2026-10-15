# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Atom-bank N-way compatibility scoring for ASE craft layer (W4).
# Mirrors Warsmith route/strength signals using EvidencePack interfaces.
# Invariants:
# - Deterministic; no LLM; scores from interfaces.json routes/feFetches.
# Related:
# - generators/warsmith/craft_suggest.py
# - generators/synthesis/mission_intent.py
# - documentation/platform/EWGEN-PROJECT-MEANING-CANON.md
# ---

"""Cross-bank compatibility scoring for ArchitecturePlan module sets."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Mapping, Sequence, Tuple

_PATH_TOKEN_RE = re.compile(r"/([a-z0-9_\-]{2,})", re.IGNORECASE)


def _interfaces(cand: Mapping[str, Any]) -> Mapping[str, Any]:
    raw = cand.get("interfaces")
    if isinstance(raw, dict):
        return raw
    return {}


def _route_paths(cand: Mapping[str, Any]) -> set[str]:
    paths: set[str] = set()
    for row in _interfaces(cand).get("routes") or []:
        if not isinstance(row, dict):
            continue
        path = str(row.get("path") or "").strip()
        if path:
            paths.add(path.split("{")[0].rstrip("/") or "/")
    return paths


def _fetch_paths(cand: Mapping[str, Any]) -> set[str]:
    paths: set[str] = set()
    for row in _interfaces(cand).get("feFetches") or []:
        if not isinstance(row, dict):
            continue
        path = str(row.get("path") or "").strip()
        if path:
            paths.add(path.split("{")[0].rstrip("/") or "/")
    return paths


def _path_tokens(*paths: str) -> set[str]:
    tokens: set[str] = set()
    skip = {"api", "v1", "v2", "modules"}
    for path in paths:
        for match in _PATH_TOKEN_RE.findall(path or ""):
            key = match.lower()
            if key not in skip:
                tokens.add(key)
    return tokens


def _role_bucket(cand: Mapping[str, Any]) -> str:
    role = str(cand.get("role") or "").strip().lower()
    if role in {"ui", "frontend"}:
        return "ui"
    if role in {"db", "database"}:
        return "db"
    caps = " ".join(str(c) for c in (cand.get("capabilities") or [])).lower()
    if "db_handling" in caps or "migration" in caps:
        return "db"
    if "docs_processing" in caps:
        return "docs"
    if role in {"api", "mixed", "backend"}:
        return "api"
    if _fetch_paths(cand) and not _route_paths(cand):
        return "ui"
    return "api"


def score_atom_pair_compat(
    left: Mapping[str, Any],
    right: Mapping[str, Any],
) -> Dict[str, Any]:
    """Compatibility between two bank atoms (route overlap + path tokens + strength)."""
    left_routes = _route_paths(left)
    right_routes = _route_paths(right)
    left_fetch = _fetch_paths(left)
    right_fetch = _fetch_paths(right)

    overlap_paths: set[str] = set()
    for fetch in left_fetch:
        for route in right_routes:
            if fetch == route or fetch.endswith(route) or route.endswith(fetch):
                overlap_paths.add(route)
    for fetch in right_fetch:
        for route in left_routes:
            if fetch == route or fetch.endswith(route) or route.endswith(fetch):
                overlap_paths.add(route)

    token_overlap = _path_tokens(*left_routes, *left_fetch) & _path_tokens(
        *right_routes, *right_fetch
    )
    score = min(0.45, 0.12 * len(overlap_paths))
    score += min(0.2, 0.04 * len(token_overlap))

    left_grade = str(left.get("qualityGrade") or "").lower()
    right_grade = str(right.get("qualityGrade") or "").lower()
    if left_grade == "strong" and right_grade == "strong":
        score += 0.08
    elif left_grade == "weak" or right_grade == "weak":
        score -= 0.06

    left_ref = str(left.get("sourceRef") or left.get("catalogId") or "")
    right_ref = str(right.get("sourceRef") or right.get("catalogId") or "")
    cross_archive = bool(left_ref and right_ref and left_ref != right_ref)
    if cross_archive:
        score += 0.06

    return {
        "score": round(score, 4),
        "routeOverlap": sorted(overlap_paths)[:8],
        "tokenOverlap": sorted(token_overlap)[:8],
        "crossArchive": cross_archive,
        "leftRole": _role_bucket(left),
        "rightRole": _role_bucket(right),
    }


def score_nway_compat(
    selected: Sequence[Mapping[str, Any]],
) -> Dict[str, Any]:
    """Aggregate pairwise compatibility for a module set."""
    pairs: List[Dict[str, Any]] = []
    total = 0.0
    for i, left in enumerate(selected):
        for right in selected[i + 1 :]:
            meta = score_atom_pair_compat(left, right)
            total += float(meta.get("score") or 0)
            pairs.append(
                {
                    "fromAtomId": str(left.get("atomId") or ""),
                    "toAtomId": str(right.get("atomId") or ""),
                    **meta,
                }
            )
    return {
        "nwayScore": round(total, 4),
        "pairCount": len(pairs),
        "pairs": pairs,
    }


def pick_nway_with_compat(
    mission: Mapping[str, Any],
    candidates: Sequence[Mapping[str, Any]],
    caps: Sequence[str],
    *,
    score_fn,
    weights: Mapping[str, float],
    min_weight: float = 0.35,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Greedy N-way pick: per cap slot, maximize intent + compat with prior picks."""
    selected_cands: List[Dict[str, Any]] = []
    modules: List[Dict[str, Any]] = []
    used: set[str] = set()

    for cap in caps:
        if float(weights.get(cap, 0.7)) < min_weight:
            continue
        best_cand: Dict[str, Any] | None = None
        best_total = -999.0
        for cand in candidates:
            aid = str(cand.get("atomId") or "")
            if not aid or aid in used:
                continue
            intent = float(score_fn(cand, mission, needed_caps=[cap]))
            compat_bonus = 0.0
            for prior in selected_cands:
                compat_bonus += float(
                    score_atom_pair_compat(cand, prior).get("score") or 0
                )
            total = intent + compat_bonus
            if total > best_total:
                best_total = total
                best_cand = dict(cand)
                best_cand["intentMatchScore"] = intent
                best_cand["_pickTotal"] = round(total, 4)
                best_cand["_compatBonus"] = round(compat_bonus, 4)
        if not best_cand:
            continue
        aid = str(best_cand.get("atomId") or "")
        used.add(aid)
        selected_cands.append(best_cand)
        modules.append(
            {
                "atomId": aid,
                "role": best_cand.get("role") or "mixed",
                "capability": cap,
                "mount": f"/api/modules/{aid}",
                "strengthScore": best_cand.get("intentMatchScore"),
                "craftScore": best_cand.get("_pickTotal"),
                "compatBonus": best_cand.get("_compatBonus"),
                "selection": "nway_compat_craft",
            }
        )

    nway = score_nway_compat(selected_cands)
    return modules, nway


def suggest_adapter_kinds(
    modules: Sequence[Mapping[str, Any]],
    pair_compat: Sequence[Mapping[str, Any]],
) -> List[Dict[str, Any]]:
    """Build adapter rows from module set + pairwise compat evidence (W4)."""
    if len(modules) < 2:
        return []
    adapters: List[Dict[str, Any]] = []
    by_pair = {
        (
            str(row.get("fromAtomId") or ""),
            str(row.get("toAtomId") or ""),
        ): row
        for row in pair_compat
    }

    for i in range(len(modules) - 1):
        left = modules[i]
        right = modules[i + 1]
        left_id = str(left.get("atomId") or "")
        right_id = str(right.get("atomId") or "")
        meta = (
            by_pair.get((left_id, right_id)) or by_pair.get((right_id, left_id)) or {}
        )
        left_cap = str(left.get("capability") or "")
        right_cap = str(right.get("capability") or "")
        overlap = meta.get("routeOverlap") or []
        kind = "http_client"
        if "docs" in left_cap and "db" in right_cap:
            kind = "library_shim"
        elif overlap:
            kind = "http_client"
        adapters.append(
            {
                "intent": (
                    f"Craft wire {left_cap} ({left_id}) → {right_cap} ({right_id}) "
                    f"compat={meta.get('score', 0)}"
                ),
                "fromAtomId": left_id,
                "toAtomId": right_id,
                "kind": kind,
                "fromInterface": "api",
                "toInterface": "library" if kind == "library_shim" else "api",
                "compat": meta or None,
            }
        )
    return adapters


def glue_from_adapters(adapters: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    glue: List[Dict[str, Any]] = []
    for ad in adapters:
        if not isinstance(ad, dict):
            continue
        glue.append(
            {
                "gap": ad.get("kind") or "cross_module",
                "strategy": ad.get("kind") or "http_client",
                "fromAtomId": ad.get("fromAtomId"),
                "toAtomId": ad.get("toAtomId"),
            }
        )
    return glue
