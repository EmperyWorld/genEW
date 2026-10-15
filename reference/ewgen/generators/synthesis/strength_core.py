# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Deterministic strength scorers from Evidence Pack + atom tree.
# Invariants:
# - Metrics invented only from files/evidence; Overlay may ±0.15 later.
# Related:
# - generators/synthesis/strength_overlay.py
# ---

"""Core strength scoring."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional


def score_atom_dir(
    atom_root: Path,
    *,
    evidence: Optional[Dict[str, Any]] = None,
    atom_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    evidence_data: Dict[str, Any] = dict(evidence or {})
    if not evidence_data and (atom_root / "META" / "evidence.json").is_file():
        loaded = json.loads(
            (atom_root / "META" / "evidence.json").read_text(encoding="utf-8")
        )
        evidence_data = loaded if isinstance(loaded, dict) else {}
    atom_meta_data: Dict[str, Any] = dict(atom_meta or {})
    if not atom_meta_data and (atom_root / "META" / "atom.json").is_file():
        loaded_meta = json.loads(
            (atom_root / "META" / "atom.json").read_text(encoding="utf-8")
        )
        atom_meta_data = loaded_meta if isinstance(loaded_meta, dict) else {}

    files = list(evidence_data.get("files") or [])
    signatures = evidence_data.get("signatures") or {}
    if not isinstance(signatures, dict):
        signatures = {}
    routes = signatures.get("routes") or []
    exports = signatures.get("exports") or []

    dims = {
        "docs_processing": 0.0,
        "db_handling": 0.0,
        "api_surface": 0.0,
        "ui_polish": 0.0,
        "auth_readiness": 0.0,
        "observability": 0.0,
        "test_coverage": 0.0,
        "layout_quality": 0.0,
    }
    evidence_rows: List[Dict[str, Any]] = []

    if routes:
        dims["api_surface"] = min(1.0, 0.2 * len(routes))
        evidence_rows.append(
            {"kind": "routes", "metric": len(routes), "path": "signatures.routes"}
        )
    if any("migrat" in f.lower() or "/models/" in f for f in files):
        dims["db_handling"] = 0.8
        evidence_rows.append({"kind": "db_paths", "metric": 1, "path": "files"})
    if any(
        x in " ".join(files).lower()
        for x in ("ocr", "pdf", "docx", "document", "tika")
    ):
        dims["docs_processing"] = 0.75
        evidence_rows.append({"kind": "docs_hint", "metric": 1, "path": "files"})
    if any(f.endswith((".tsx", ".ts")) for f in files):
        dims["ui_polish"] = 0.6
        evidence_rows.append({"kind": "fe_files", "metric": 1, "path": "files"})
    if any("auth" in f.lower() or "keycloak" in f.lower() for f in files):
        dims["auth_readiness"] = 0.7
    if any("test" in f.lower() for f in files):
        dims["test_coverage"] = 0.5
        evidence_rows.append({"kind": "tests", "metric": 1, "path": "files"})
    if any("log" in f.lower() or "metric" in f.lower() for f in files):
        dims["observability"] = 0.4

    grade = str(atom_meta_data.get("qualityGrade") or "weak")
    dims["layout_quality"] = {
        "strong": 1.0,
        "weak": 0.5,
        "broken": 0.0,
    }.get(grade, 0.4)

    overall = sum(dims.values()) / max(1, len(dims))

    result = {
        "schemaVersion": "ewgen_strength_v1",
        "dimensions": dims,
        "evidence": evidence_rows,
        "overall": round(overall, 4),
        "overlay": {"used": False, "status": "core_only"},
        "exportCount": len(exports),
    }

    try:
        from .strength_overlay import adjudicate_strength

        result = adjudicate_strength(
            result,
            evidence=evidence_data,
            atom_meta=atom_meta_data,
        )
    except Exception:  # noqa: BLE001
        pass
    return result
