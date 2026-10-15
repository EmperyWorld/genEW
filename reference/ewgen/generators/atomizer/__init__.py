# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# ASE Stage 21 Atomizer package — Deterministic Core + Cognitive Overlay bridge.
# Invariants:
# - Core owns AST/graph/ESAL; Overlay never writes source trees.
# - EWGEN_ASE_LLM=0 ⇒ identical source + lineage across runs.
# Related:
# - documentation/platform/EWGEN-AUTONOMOUS-SYNTHESIS-ENGINE.md
# - EWGen/docs/ESAL.md
# ---

"""ASE Atomizer — hybrid Core/Overlay atomization."""

from .atomize import atomize_files, atoms_root

__all__ = ["atomize_files", "atoms_root"]
