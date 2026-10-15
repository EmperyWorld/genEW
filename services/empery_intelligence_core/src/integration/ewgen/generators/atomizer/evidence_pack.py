# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Build Evidence Pack JSON for Overlay input (Core-authored).
# Invariants:
# - schemaVersion ewgen_evidence_pack_v1; no LLM.
# Related:
# - schemas/evidence-pack.v1.json
# ---

"""Evidence Pack builder."""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, Sequence

from .closure import build_import_graph
from .signature_harvest import harvest_signatures

PROTOCOL = "ewgen_evidence_pack_v1"


def build_evidence_pack(
    atom_id: str,
    files: Mapping[str, str],
    closed_paths: Sequence[str],
    *,
    role: str = "mixed",
) -> Dict[str, Any]:
    subset = {p: files[p] for p in closed_paths if p in files}
    _, edges = build_import_graph(subset)
    sigs = harvest_signatures(subset)
    return {
        "schemaVersion": PROTOCOL,
        "atomId": atom_id,
        "role": role,
        "files": sorted(subset.keys()),
        "graphEdges": edges,
        "signatures": {
            "routes": sigs["routes"],
            "exports": sigs["exports"],
            "feFetches": sigs["feFetches"],
        },
        "snippets": sigs["snippets"][:20],
    }


def heuristic_interfaces(evidence: Dict[str, Any]) -> Dict[str, Any]:
    sigs = evidence.get("signatures") or {}
    return {
        "schemaVersion": "ewgen_interfaces_v1",
        "routes": list(sigs.get("routes") or []),
        "exports": list(sigs.get("exports") or []),
        "feFetches": list(sigs.get("feFetches") or []),
    }


def heuristic_atom_meta(
    atom_id: str,
    *,
    role: str,
    evidence: Dict[str, Any],
    quality_grade: str,
) -> Dict[str, Any]:
    routes = (evidence.get("signatures") or {}).get("routes") or []
    caps: List[str] = []
    if routes:
        caps.append("api_surface")
    if any("migrat" in f.lower() for f in evidence.get("files") or []):
        caps.append("db_handling")
    if any(
        f.endswith((".tsx", ".ts", ".jsx")) for f in evidence.get("files") or []
    ):
        caps.append("ui_polish")
    if not caps:
        caps.append("mixed")
    return {
        "schemaVersion": "ewgen_atom_manifest_v2",
        "atomId": atom_id,
        "semanticName": atom_id,
        "role": role,
        "capabilities": caps,
        "kind": "module",
        "scale": "meso",
        "purpose": f"Heuristic atom for {atom_id}",
        "tags": [role],
        "qualityGrade": quality_grade,
        "overlay": {"used": False, "status": "heuristic"},
    }
