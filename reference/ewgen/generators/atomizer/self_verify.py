# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Structural self-verify for ESAL atoms (Core hard gate).
# Invariants:
# - Fails on banned imports, missing META/lineage, empty rewrite map.
# Related:
# - generators/atomizer/import_rewrite.py
# ---

"""ESAL self-verify."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from .import_rewrite import (
    has_banned_imports,
    has_unresolved_in_set_absolute_imports,
)


def self_verify(atom_root: Path) -> Dict[str, Any]:
    errors: List[str] = []
    warnings: List[str] = []

    lineage_path = atom_root / "META" / "lineage.json"
    if not lineage_path.is_file():
        errors.append("MISSING_LINEAGE")
        rewrite_map: Dict[str, str] = {}
    else:
        lineage = json.loads(lineage_path.read_text(encoding="utf-8"))
        rewrite_map = dict(lineage.get("rewriteMap") or {})
        if not rewrite_map:
            errors.append("EMPTY_REWRITE_MAP")

    evidence_path = atom_root / "META" / "evidence.json"
    if not evidence_path.is_file():
        errors.append("MISSING_EVIDENCE")

    source_files = [
        p
        for p in atom_root.rglob("*")
        if p.is_file()
        and "META" not in p.parts
        and "__pycache__" not in p.parts
        and p.name != "INTEGRATION.md"
        and p.suffix.lower()
        in {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md"}
    ]
    if not source_files:
        errors.append("NO_SOURCE_FILES")

    for path in source_files:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            warnings.append(f"SKIP_NON_TEXT:{path.relative_to(atom_root)}")
            continue
        if has_banned_imports(text):
            errors.append(f"BANNED_IMPORT:{path.relative_to(atom_root)}")
        if path.suffix == ".py" and rewrite_map:
            residual = has_unresolved_in_set_absolute_imports(text, rewrite_map)
            for mod in residual:
                errors.append(
                    f"ABS_IMPORT_IN_SET:{path.relative_to(atom_root)}:{mod}"
                )

    # cycles: simple check — rewrite map values unique
    values = list(rewrite_map.values())
    if len(values) != len(set(values)):
        errors.append("REWRITE_COLLISION")

    grade = "strong"
    if errors:
        grade = "broken"
    elif warnings:
        grade = "weak"

    return {
        "ok": not errors,
        "qualityGrade": grade,
        "errors": errors,
        "warnings": warnings,
        "sourceFileCount": len(source_files),
    }
