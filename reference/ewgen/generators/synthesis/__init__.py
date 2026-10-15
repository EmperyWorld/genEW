# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# ASE synthesis package — strength, ArchitecturePlan, adapters, reeval.
# Invariants:
# - Overlay proposes JSON; Core materializes and hard-gates.
# Related:
# - documentation/platform/EWGEN-AUTONOMOUS-SYNTHESIS-ENGINE.md
# ---

"""ASE SynthesisAgent modules."""

from .architect_overlay import (
    propose_architecture_plan,
    run_synthesis_agent,
)
from .materialize_core import materialize_from_plan
from .reeval import list_upgrade_offers, on_bank_event
from .resolver_core import resolve_and_materialize, validate_plan_physically
from .strength_core import score_atom_dir
from .bank_lifecycle import add_atom_from_bank
from .upgrade_apply import apply_upgrade

__all__ = [
    "score_atom_dir",
    "propose_architecture_plan",
    "run_synthesis_agent",
    "materialize_from_plan",
    "resolve_and_materialize",
    "validate_plan_physically",
    "on_bank_event",
    "list_upgrade_offers",
    "apply_upgrade",
    "add_atom_from_bank",
]
