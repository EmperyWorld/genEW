# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Shadow synthesis — dry-run ArchitecturePlan check for Bank upgrades.
# Invariants:
# - Never writes project shells; Core-only structural check.
# - Overlay may supply upgradeReason text only (optional).
# Related:
# - generators/synthesis/reeval.py
# ---

"""Shadow synthesis dry-run for TemplateReevaluator."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from .plan_schema import PROTOCOL, validate_architecture_plan


def _load_atom_meta(atoms_dir: Path, atom_id: str) -> Optional[Dict[str, Any]]:
    meta = atoms_dir / atom_id / "META" / "atom.json"
    if not meta.is_file():
        return None
    try:
        data = json.loads(meta.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def _load_plan(shell: Path) -> Optional[Dict[str, Any]]:
    path = shell / ".ewgen" / "architecture_plan.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def propose_shadow_plan(
    shell: Path,
    new_atom_id: str,
    *,
    atoms_dir: Path,
    capabilities: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Dry-run: can ``new_atom_id`` enter this shell's ArchitecturePlan?

    Returns canUpgrade + proposedPlan without touching the filesystem.
    """
    meta = _load_atom_meta(atoms_dir, new_atom_id)
    if meta is None:
        # No on-disk atom yet: capability-only offer if shell has no plan.
        # ArchitecturePlan shells require atom META for structural dry-run.
        if _load_plan(shell) is None and (capabilities or []):
            return {
                "ok": True,
                "canUpgrade": True,
                "mode": "capability_only",
                "errors": [f"ATOM_META_PENDING:{new_atom_id}"],
                "proposedPlan": None,
                "diff": {
                    "action": "capability_flag",
                    "newAtomId": new_atom_id,
                },
                "upgradeReason": (
                    f"Atom {new_atom_id} intersects mission; "
                    "META not on disk yet — rematerialize after atomize"
                ),
            }
        return {
            "ok": False,
            "canUpgrade": False,
            "mode": "shadow",
            "errors": [f"ATOM_MISSING:{new_atom_id}"],
        }
    grade = str(meta.get("qualityGrade") or "weak")
    if grade == "broken":
        return {
            "ok": False,
            "canUpgrade": False,
            "mode": "shadow",
            "errors": [f"ATOM_BROKEN:{new_atom_id}"],
        }

    atom_caps = {
        str(c).lower() for c in (meta.get("capabilities") or [])
    }
    event_caps = {str(c).lower() for c in (capabilities or [])}
    plan = _load_plan(shell)
    if plan is None:
        # ASE shells without plan — capability intersection only
        return {
            "ok": True,
            "canUpgrade": True,
            "mode": "capability_only",
            "errors": [],
            "proposedPlan": None,
            "diff": {
                "action": "capability_flag",
                "newAtomId": new_atom_id,
                "atomCapabilities": sorted(atom_caps),
            },
            "upgradeReason": (
                f"Atom {new_atom_id} intersects mission capabilities; "
                "no ArchitecturePlan on disk — operator rematerialize advised"
            ),
        }

    proposed = copy.deepcopy(plan)
    proposed.setdefault("schemaVersion", PROTOCOL)
    modules = list(proposed.get("modules") or [])
    atom_refs = {
        str(m.get("atomId")) for m in modules if isinstance(m, dict)
    }
    if new_atom_id in atom_refs:
        return {
            "ok": True,
            "canUpgrade": False,
            "mode": "shadow",
            "errors": [],
            "proposedPlan": plan,
            "diff": {"action": "already_present", "newAtomId": new_atom_id},
            "upgradeReason": "Atom already in ArchitecturePlan",
        }

    # Prefer replace module whose capability matches new atom
    replaced = False
    target_caps = atom_caps or event_caps
    for idx, mod in enumerate(modules):
        if not isinstance(mod, dict):
            continue
        cap = str(mod.get("capability") or "").lower()
        if cap and cap in target_caps:
            old_id = str(mod.get("atomId"))
            modules[idx] = {
                **mod,
                "atomId": new_atom_id,
                "role": meta.get("role") or mod.get("role") or "mixed",
                "mount": f"/api/modules/{new_atom_id}",
            }
            # Retarget adapters
            adapters = []
            for ad in proposed.get("adapters") or []:
                if not isinstance(ad, dict):
                    continue
                ad = dict(ad)
                if ad.get("fromAtomId") == old_id:
                    ad["fromAtomId"] = new_atom_id
                if ad.get("toAtomId") == old_id:
                    ad["toAtomId"] = new_atom_id
                adapters.append(ad)
            proposed["adapters"] = adapters
            proposed["modules"] = modules
            replaced = True
            diff = {
                "action": "replace_module",
                "oldAtomId": old_id,
                "newAtomId": new_atom_id,
                "capability": cap,
            }
            break

    if not replaced:
        # Append as additional module
        pick_cap = next(iter(target_caps), "mixed")
        modules.append(
            {
                "atomId": new_atom_id,
                "role": meta.get("role") or "mixed",
                "capability": pick_cap,
                "mount": f"/api/modules/{new_atom_id}",
            }
        )
        proposed["modules"] = modules
        if len(modules) >= 2:
            adapters = list(proposed.get("adapters") or [])
            adapters.append(
                {
                    "intent": (
                        f"Shadow wire existing → {new_atom_id} "
                        f"({pick_cap})"
                    ),
                    "fromAtomId": str(modules[0].get("atomId")),
                    "toAtomId": new_atom_id,
                    "kind": "http_client",
                    "fromInterface": "api",
                    "toInterface": "api",
                }
            )
            proposed["adapters"] = adapters
        diff = {
            "action": "append_module",
            "newAtomId": new_atom_id,
            "capability": pick_cap,
        }

    ok, errors = validate_architecture_plan(proposed)
    # Ensure atom directory exists (already checked meta)
    can = ok and grade != "broken"
    reason = (
        f"Shadow plan {diff.get('action')} with {new_atom_id} "
        f"(grade={grade}); structural validation "
        f"{'ok' if ok else 'failed'}"
    )
    return {
        "ok": ok,
        "canUpgrade": can,
        "mode": "shadow",
        "errors": errors,
        "proposedPlan": proposed if can else None,
        "diff": diff,
        "upgradeReason": reason,
        "qualityGrade": grade,
    }
