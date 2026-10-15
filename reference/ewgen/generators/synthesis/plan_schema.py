# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# ArchitecturePlan JSON schema + MissionBrief normalize + heuristic plan.
# Invariants:
# - Core hard-gates schema; Overlay may only propose known atomIds.
# - Adapters declare intent/kind only — Core implements via templates.
# Related:
# - generators/synthesis/architect_overlay.py
# - generators/synthesis/resolver_core.py
# ---

"""ArchitecturePlan schema helpers."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from .mission_intent import (
    build_best_of_breed_modules,
    merge_mission_capabilities,
)
from .atom_compat import glue_from_adapters, suggest_adapter_kinds

PROTOCOL = "ewgen_architecture_plan_v1"
ADAPTER_KINDS = frozenset({"http_client", "library_shim", "event_bridge"})
WEIGHT_MAP = {"high": 1.0, "medium": 0.6, "low": 0.3, "none": 0.0}


def normalize_mission(mission: Dict[str, Any]) -> Dict[str, Any]:
    """
    Accept list capabilities and/or capabilityWeights map.

    Example weights: {\"docs_processing\": \"high\", \"db_handling\": \"high\"}
    """
    out = dict(mission or {})
    weights_in = out.get("capabilityWeights") or out.get("weights") or {}
    caps: List[str] = []
    weights: Dict[str, float] = {}

    if isinstance(weights_in, dict) and weights_in:
        for key, val in weights_in.items():
            name = str(key).strip().lower().replace(" ", "_").replace("-", "_")
            if not name:
                continue
            if isinstance(val, (int, float)):
                w = float(val)
            else:
                w = WEIGHT_MAP.get(str(val).strip().lower(), 0.5)
            if w <= 0:
                continue
            caps.append(name)
            weights[name] = w

    for c in out.get("capabilities") or []:
        if isinstance(c, str):
            name = c.strip().lower().replace(" ", "_").replace("-", "_")
            if name and name not in weights:
                caps.append(name)
                weights[name] = 0.7
        elif isinstance(c, dict):
            name = str(c.get("name") or c.get("id") or "").strip().lower()
            level = str(c.get("level") or c.get("weight") or "medium")
            if name:
                caps.append(name)
                weights[name] = WEIGHT_MAP.get(level.lower(), 0.5)

    # de-dupe preserving order
    seen: set[str] = set()
    ordered: List[str] = []
    for name in caps:
        if name not in seen:
            seen.add(name)
            ordered.append(name)

    out["capabilities"] = ordered or ["api_surface"]
    out["capabilityWeights"] = {k: weights.get(k, 0.7) for k in out["capabilities"]}
    out.setdefault("intent", out.get("intent") or "")
    out.setdefault("name", out.get("name") or "mission")
    return merge_mission_capabilities(out)


def validate_architecture_plan(plan: Dict[str, Any]) -> Tuple[bool, List[str]]:
    errors: List[str] = []
    if plan.get("schemaVersion") != PROTOCOL:
        errors.append("BAD_SCHEMA_VERSION")
    if not plan.get("mission"):
        errors.append("MISSING_MISSION")
    modules = plan.get("modules")
    if not isinstance(modules, list) or not modules:
        errors.append("MISSING_MODULES")
    else:
        for idx, mod in enumerate(modules):
            if not isinstance(mod, dict):
                errors.append(f"MODULE_NOT_OBJECT:{idx}")
                continue
            if not mod.get("atomId"):
                errors.append(f"MODULE_MISSING_ATOM:{idx}")
            if not mod.get("role"):
                errors.append(f"MODULE_MISSING_ROLE:{idx}")
            if not mod.get("mount"):
                errors.append(f"MODULE_MISSING_MOUNT:{idx}")
    adapters = plan.get("adapters")
    if adapters is not None and not isinstance(adapters, list):
        errors.append("ADAPTERS_NOT_LIST")
    elif isinstance(adapters, list):
        for idx, ad in enumerate(adapters):
            if not isinstance(ad, dict):
                errors.append(f"ADAPTER_NOT_OBJECT:{idx}")
                continue
            kind = str(ad.get("kind") or "")
            if kind and kind not in ADAPTER_KINDS:
                errors.append(f"ADAPTER_KIND_INVALID:{idx}:{kind}")
            if not ad.get("fromAtomId") or not ad.get("toAtomId"):
                errors.append(f"ADAPTER_MISSING_ENDS:{idx}")
            if not ad.get("intent"):
                errors.append(f"ADAPTER_MISSING_INTENT:{idx}")
    return (not errors), errors


def heuristic_plan(
    mission: Dict[str, Any],
    candidates: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Core fallback when Overlay offline — W2 best-of-breed module picks."""
    mission_n = normalize_mission(mission)
    modules = build_best_of_breed_modules(mission_n, candidates)

    adapters: List[Dict[str, Any]] = []
    glue: List[Dict[str, Any]] = []
    craft_pairs = []
    if modules and isinstance(modules[0].get("craft"), dict):
        craft_pairs = modules[0]["craft"].get("pairs") or []
    if len(modules) >= 2 and craft_pairs:
        adapters = suggest_adapter_kinds(modules, craft_pairs)
        glue = glue_from_adapters(adapters)
    elif len(modules) >= 2:
        a0, a1 = modules[0], modules[1]
        adapters.append(
            {
                "intent": (
                    f"Wire {a0['capability']} ({a0['atomId']}) to "
                    f"{a1['capability']} ({a1['atomId']}) via HTTP client shim"
                ),
                "fromAtomId": a0["atomId"],
                "toAtomId": a1["atomId"],
                "kind": "http_client",
                "fromInterface": "api",
                "toInterface": "api",
            }
        )
        glue.append(
            {
                "gap": "cross_module_http",
                "strategy": "http_client",
                "fromAtomId": a0["atomId"],
                "toAtomId": a1["atomId"],
            }
        )
        # If docs → db pattern, add library_shim intent for Core template
        caps_joined = " ".join(m.get("capability") or "" for m in modules)
        if "docs" in caps_joined and "db" in caps_joined:
            adapters.append(
                {
                    "intent": (
                        "Docs atom produces results; DB atom is a library — "
                        "library_shim maps call sites"
                    ),
                    "fromAtomId": a0["atomId"],
                    "toAtomId": a1["atomId"],
                    "kind": "library_shim",
                    "fromInterface": "api",
                    "toInterface": "library",
                }
            )
            glue.append(
                {
                    "gap": "api_to_library",
                    "strategy": "library_shim",
                    "fromAtomId": a0["atomId"],
                    "toAtomId": a1["atomId"],
                }
            )

    return {
        "schemaVersion": PROTOCOL,
        "mission": mission_n,
        "modules": modules,
        "adapters": adapters,
        "glueStrategies": glue,
        "overlay": {"used": False, "status": "heuristic"},
    }
