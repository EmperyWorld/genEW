# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Atomize bridge — Core closure/ESAL/rewrite then Overlay META then verify.
# Invariants:
# - Source trees identical with EWGEN_ASE_LLM=0 across runs (sorted writes).
# - Overlay never mutates rewrite map.
# Related:
# - documentation/platform/EWGEN-AUTONOMOUS-SYNTHESIS-ENGINE.md
# ---

"""Orchestrate hybrid atomization."""

from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Sequence

from .closure import closed_set
from .esal_layout import (
    atoms_root,
    write_esal_tree,
    write_integration_md,
    write_json,
)
from .evidence_pack import build_evidence_pack
from .import_rewrite import build_rewrite_map
from generators.core_settings.runtime import get_bool
from .meta_overlay import draft_meta_from_overlay
from .self_verify import self_verify

PROTOCOL = "ewgen_atomize_v1"
NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")


def make_atom_id(origin: str, seed: str, role: str) -> str:
    return str(uuid.uuid5(NS, f"{origin}:{seed}:{role}"))


def infer_role(files: Mapping[str, str]) -> str:
    paths = list(files.keys())
    has_py = any(p.endswith(".py") for p in paths)
    has_fe = any(p.endswith((".tsx", ".ts", ".jsx", ".js")) for p in paths)
    if has_py and has_fe:
        return "mixed"
    if has_fe:
        return "ui"
    if any("migrat" in p.lower() for p in paths):
        return "db"
    if has_py:
        return "api"
    return "mixed"


def atomize_files(
    files: Mapping[str, str],
    *,
    seeds: Optional[Sequence[str]] = None,
    closed_paths: Optional[Sequence[str]] = None,
    origin: str = "local",
    role: Optional[str] = None,
    atom_id: Optional[str] = None,
    max_files: int = 200,
    base: Optional[Path] = None,
    emit_bank_event: bool = True,
) -> Dict[str, Any]:
    """
    Deterministic Core atomize + Overlay META.
    `files`: path → content (closed universe for this atom).
    """
    normalized = {k.replace("\\", "/").lstrip("./"): v for k, v in files.items()}
    seed_list = list(seeds) if seeds else sorted(normalized.keys())[:1]
    if not seed_list and normalized:
        seed_list = [sorted(normalized.keys())[0]]
    if not seed_list:
        raise ValueError("ATOMIZE_EMPTY: no files")

    role_v = role or infer_role(normalized)
    atom_id_v = atom_id or make_atom_id(origin, seed_list[0], role_v)

    if closed_paths is not None:
        capped: list[str] = []
        seen: set[str] = set()
        for path in closed_paths:
            norm = path.replace("\\", "/").lstrip("./")
            if norm in normalized and norm not in seen:
                seen.add(norm)
                capped.append(norm)
            if len(capped) >= max_files:
                break
        if not capped:
            raise ValueError("ATOMIZE_EMPTY: closed_paths not in files map")
        closed = sorted(capped)
    else:
        closed = closed_set(seed_list, normalized, max_files=max_files)
    subset = {p: normalized[p] for p in closed}
    rewrite_map = build_rewrite_map(closed, role=role_v)

    root = write_esal_tree(atom_id_v, subset, rewrite_map, base=base)
    evidence = build_evidence_pack(atom_id_v, subset, closed, role=role_v)
    write_json(root / "META" / "evidence.json", evidence)

    # Core structural gate (sources) before Overlay META
    verify = self_verify(root)
    # Overlay: Evidence Pack → LLM JSON → Core validate/strip → write META
    atom_meta, interfaces, overlay_info = draft_meta_from_overlay(
        evidence,
        quality_grade=str(verify.get("qualityGrade") or "weak"),
    )
    atom_meta["qualityGrade"] = verify.get("qualityGrade") or atom_meta.get(
        "qualityGrade"
    )
    atom_meta["overlay"] = overlay_info

    # requirements — Core only
    reqs = {
        "schemaVersion": "ewgen_requirements_v1",
        "python": sorted(
            {
                line.strip()
                for path, content in subset.items()
                if path.endswith("requirements.txt")
                for line in content.splitlines()
                if line.strip() and not line.strip().startswith("#")
            }
        ),
        "envKeys": [],
    }
    write_json(root / "META" / "requirements.json", reqs)
    write_json(root / "META" / "atom.json", atom_meta)
    write_json(root / "META" / "interfaces.json", interfaces)
    write_integration_md(root, atom_meta)

    # strength placeholder filled by synthesis.strength_core when available
    try:
        from generators.synthesis.strength_core import score_atom_dir

        strength = score_atom_dir(root, evidence=evidence, atom_meta=atom_meta)
    except Exception:  # noqa: BLE001
        strength = {
            "schemaVersion": "ewgen_strength_v1",
            "dimensions": {"layout_quality": 1.0 if verify["ok"] else 0.0},
            "evidence": [],
            "overall": 1.0 if verify["ok"] else 0.0,
            "overlay": {"used": False, "status": "deferred"},
        }
    write_json(root / "META" / "strength.json", strength)

    result = {
        "protocol": PROTOCOL,
        "atomId": atom_id_v,
        "atomPath": str(root),
        "role": role_v,
        "closedFiles": closed,
        "rewriteMap": rewrite_map,
        "verify": verify,
        "overlay": overlay_info,
        "atom": atom_meta,
        "interfaces": interfaces,
        "strength": strength,
        "contentFingerprint": hashlib.sha256(
            json.dumps(
                {"rewriteMap": rewrite_map, "closed": closed},
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest(),
    }

    if emit_bank_event and verify.get("ok"):
        try:
            from generators.bank.events import (
                publish_atom_upserted,
                publish_strength_changed,
            )

            publish_atom_upserted(
                atom_id_v,
                capabilities=list(atom_meta.get("capabilities") or []),
                source_ref=origin,
                strength_delta=strength.get("overall"),
            )
            publish_strength_changed(
                atom_id_v,
                overall=float(strength.get("overall") or 0.0),
                capabilities=list(atom_meta.get("capabilities") or []),
            )
        except Exception:  # noqa: BLE001 — events best-effort
            pass

    # Dynamic Atom Layer — sandbox compose under data/instances/{id}/
    # Default: write compose only (EWGEN_ASE_INSTANCE_DEPLOY=0). Core DB untouched.
    instance_info: Dict[str, Any] | None = None
    if verify.get("ok") and get_bool("EWGEN_ASE_INSTANCE_PROVISION", default=True):
        try:
            from generators.instances.orchestrator import provision_instance

            instance_info = provision_instance(
                atom_id_v,
                kind="atom",
                emit_event=False,
            )
            result["instance"] = instance_info
        except Exception as exc:  # noqa: BLE001
            result["instance"] = {
                "ok": False,
                "error": str(exc),
                "coreDbUntouched": True,
            }

    return result


__all__ = ["atomize_files", "atoms_root", "make_atom_id", "infer_role"]
