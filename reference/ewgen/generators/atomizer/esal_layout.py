# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Write ESAL directory trees and Core-owned META files.
# Invariants:
# - Source files written only from Core rewrite map.
# - Overlay never called from this module.
# Related:
# - EWGen/docs/ESAL.md
# ---

"""ESAL layout writer."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from .import_rewrite import rewrite_content


def atoms_root(base: Optional[Path] = None) -> Path:
    root = base or Path(
        os.getenv("EWGEN_ATOMS_ROOT", "")
        or Path(__file__).resolve().parents[2] / "data" / "atoms"
    )
    root.mkdir(parents=True, exist_ok=True)
    return root


def write_esal_tree(
    atom_id: str,
    files: Mapping[str, str],
    rewrite_map: Mapping[str, str],
    *,
    base: Optional[Path] = None,
) -> Path:
    """Materialize rewritten sources under atoms/{atom_id}/."""
    import shutil

    root = atoms_root(base) / atom_id
    if root.exists():
        # Re-atomize must drop prior flatten (backend/) so Neutral Contract
        # ewgen_bundle/ layout is not mixed with stale trees.
        shutil.rmtree(root)
    for sub in ("META", "backend", "frontend/src", "contracts", "tests"):
        (root / sub).mkdir(parents=True, exist_ok=True)

    written: Dict[str, str] = {}
    for old_path, content in sorted(files.items()):
        if old_path not in rewrite_map:
            continue
        new_path, new_content = rewrite_content(
            old_path,
            content,
            dict(rewrite_map),
            atom_id=atom_id,
        )
        dest = root / new_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(new_content, encoding="utf-8")
        written[old_path] = new_path

    from generators.synthesis.neutral_contract import neutralize_atom_tree

    neutralize_atom_tree(root)

    lineage = {
        "schemaVersion": "ewgen_lineage_v1",
        "atomId": atom_id,
        "rewriteMap": dict(sorted(rewrite_map.items())),
        "written": written,
    }
    (root / "META" / "lineage.json").write_text(
        json.dumps(lineage, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return root


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_integration_md(root: Path, atom_meta: Dict[str, Any]) -> None:
    name = atom_meta.get("semanticName") or atom_meta.get("atomId")
    role = atom_meta.get("role") or "mixed"
    caps = ", ".join(atom_meta.get("capabilities") or []) or "(none)"
    text = (
        f"# Integration — {name}\n\n"
        f"- Role: `{role}`\n"
        f"- Capabilities: {caps}\n"
        f"- Mount via SET/project shell using Bank atomId "
        f"`{atom_meta.get('atomId')}`.\n"
    )
    (root / "INTEGRATION.md").write_text(text, encoding="utf-8")
