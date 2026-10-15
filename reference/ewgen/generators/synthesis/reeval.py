# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# TemplateReevaluator — BankEvent → shadow synthesis → upgrade_available.
# Invariants:
# - Never auto-applies to registered projects (human gate).
# - Shadow dry-run is Core-only; Overlay may only add upgradeReason text.
# Related:
# - generators/bank/events.py
# - generators/synthesis/shadow_synthesis.py
# ---

"""Bank-driven project template re-evaluation."""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

PROTOCOL = "ewgen_reeval_v1"


def _offers_path() -> Path:
    root = Path(
        os.getenv("EWGEN_DATA_DIR")
        or Path(__file__).resolve().parents[2] / "data"
    )
    root.mkdir(parents=True, exist_ok=True)
    return root / "upgrade-offers.json"


def _load_offers() -> Dict[str, Any]:
    path = _offers_path()
    if not path.is_file():
        return {"schemaVersion": PROTOCOL, "offers": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    return {"schemaVersion": PROTOCOL, "offers": []}


def _save_offers(data: Dict[str, Any]) -> None:
    _offers_path().write_text(
        json.dumps(data, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def make_offer_id(project_id: str, new_atom_id: str) -> str:
    return str(
        uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"ewgen-upgrade:{project_id}:{new_atom_id}",
        )
    )


def on_bank_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Capability intersect + shadow synthesis → upgrade offers."""
    from generators.atomizer.esal_layout import atoms_root
    from generators.project_shell.paths import project_shells_root
    from generators.synthesis.shadow_synthesis import propose_shadow_plan

    caps = {str(c).lower() for c in (event.get("capabilities") or [])}
    atom_id = str(event.get("atom_id") or "")
    etype = str(event.get("type") or "")
    if etype not in {
        "atom_upserted",
        "strength_changed",
        "atom_retired",
    } or not atom_id:
        return {"ok": True, "touched": 0}

    offers_doc = _load_offers()
    offers: List[Dict[str, Any]] = list(offers_doc.get("offers") or [])

    if etype == "atom_retired":
        before = len(offers)
        offers = [o for o in offers if o.get("newAtomId") != atom_id]
        offers_doc["offers"] = offers[-200:]
        _save_offers(offers_doc)
        return {
            "ok": True,
            "touched": before - len(offers),
            "offers": offers_doc["offers"],
            "retired": atom_id,
        }

    offers = [o for o in offers if o.get("newAtomId") != atom_id]
    touched = 0
    root = project_shells_root()
    atoms = atoms_root()

    if root.is_dir():
        for shell in sorted(root.iterdir()):
            proj = shell / ".ewgen" / "project.json"
            if not proj.is_file():
                continue
            try:
                meta = json.loads(proj.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            mission_caps = {
                str(c).lower()
                for c in (meta.get("mission") or {}).get("capabilities") or []
            }
            # Also accept capabilityWeights keys
            weights = (meta.get("mission") or {}).get("capabilityWeights") or {}
            if isinstance(weights, dict):
                mission_caps |= {str(k).lower() for k in weights}
            atom_refs = {str(a) for a in (meta.get("atom_refs") or [])}
            intersects = bool(caps & mission_caps) or not mission_caps
            if not intersects:
                continue

            project_id = str(meta.get("projectId") or shell.name)
            if atom_id in atom_refs:
                status = "no_change"
                shadow: Dict[str, Any] = {
                    "canUpgrade": False,
                    "mode": "already_present",
                }
            else:
                shadow = propose_shadow_plan(
                    shell,
                    atom_id,
                    atoms_dir=atoms,
                    capabilities=sorted(caps),
                )
                status = (
                    "upgrade_available"
                    if shadow.get("canUpgrade")
                    else "upgrade_blocked"
                )

            offer = {
                "offerId": make_offer_id(project_id, atom_id),
                "projectId": project_id,
                "status": status,
                "newAtomId": atom_id,
                "capabilities": sorted(caps),
                "eventType": etype,
                "autoApply": False,
                "shadow": {
                    "canUpgrade": bool(shadow.get("canUpgrade")),
                    "mode": shadow.get("mode"),
                    "diff": shadow.get("diff"),
                    "errors": shadow.get("errors") or [],
                },
                "upgradeReason": shadow.get("upgradeReason")
                or (
                    "Capability intersection with project mission"
                    if status == "upgrade_available"
                    else "Shadow synthesis blocked or no-op"
                ),
            }
            offers.append(offer)
            touched += 1

            if status == "upgrade_available":
                hint = shell / ".ewgen" / "upgrade_hint.json"
                hint.write_text(
                    json.dumps(
                        {
                            "lifecycleStatus": "upgrade_available",
                            "newAtomId": atom_id,
                            "offerId": offer["offerId"],
                            "upgradeReason": offer["upgradeReason"],
                        },
                        indent=2,
                        sort_keys=True,
                    )
                    + "\n",
                    encoding="utf-8",
                )

    offers_doc["offers"] = offers[-200:]
    _save_offers(offers_doc)
    return {"ok": True, "touched": touched, "offers": offers_doc["offers"]}


def list_upgrade_offers(project_id: Optional[str] = None) -> Dict[str, Any]:
    doc = _load_offers()
    offers = list(doc.get("offers") or [])
    if project_id:
        offers = [o for o in offers if o.get("projectId") == project_id]
    return {
        "schemaVersion": PROTOCOL,
        "offers": offers,
    }
