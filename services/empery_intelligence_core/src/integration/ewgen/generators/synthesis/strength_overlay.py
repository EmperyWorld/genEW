# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Overlay strength adjudication ±0.15; never invents evidence metrics.
# Invariants:
# - Offline / EWGEN_ASE_LLM=0 → return core scores unchanged.
# Related:
# - generators/synthesis/strength_core.py
# ---

"""Overlay strength adjudicator."""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, Optional

JSON_RE = re.compile(r"\{[\s\S]*\}")


def adjudicate_strength(
    core: Dict[str, Any],
    *,
    evidence: Optional[Dict[str, Any]] = None,
    atom_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if os.getenv("EWGEN_ASE_LLM", "1").strip().lower() in {
        "0",
        "false",
        "off",
        "no",
    }:
        return core

    try:
        from generators.factory.llama_client import LlamaClient
    except Exception:
        return core

    prompt = (
        "Adjust strength dimensions by at most 0.15. "
        "Do not invent evidence. Return JSON "
        '{"dimensions": {...}, "rationale": "..."}.\n'
        f"core={json.dumps(core.get('dimensions'), sort_keys=True)}\n"
        f"evidence_kinds={[e.get('kind') for e in (core.get('evidence') or [])]}\n"
    )
    try:
        raw = LlamaClient().complete(prompt, temperature=0.0)
        match = JSON_RE.search(raw)
        if not match:
            return core
        parsed = json.loads(match.group(0))
        dims = dict(core.get("dimensions") or {})
        adj = parsed.get("dimensions") or {}
        for key, value in adj.items():
            if key not in dims:
                continue
            try:
                delta = float(value) - float(dims[key])
            except (TypeError, ValueError):
                continue
            delta = max(-0.15, min(0.15, delta))
            dims[key] = round(max(0.0, min(1.0, float(dims[key]) + delta)), 4)
        overall = sum(dims.values()) / max(1, len(dims))
        out = dict(core)
        out["dimensions"] = dims
        out["overall"] = round(overall, 4)
        out["overlay"] = {
            "used": True,
            "status": "ok",
            "rationale": parsed.get("rationale"),
        }
        return out
    except Exception as exc:  # noqa: BLE001
        out = dict(core)
        out["overlay"] = {"used": False, "status": f"skip:{exc}"}
        return out
