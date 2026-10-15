# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Unified archive ingest — classify ZIP and dispatch Fortune Seaker / Scavenger
# analyzers and Stage 9 prepare without rewriting sanitizers.
# Invariants:
# - Direct /api/importer and /api/scavenger analyze remain valid power paths.
# - Stage 1 analyze does not prepare; Stage 9 prepare is explicit.
# Related:
# - documentation/platform/EWGEN-COMPONENT-FACTORY-VISION.md
# - generators/importer/analyze.py
# - generators/scavenger/analyze.py
# ---

"""Unified ingest package — classify + orchestrate analyzers/prepare."""

from .orchestrate import PROTOCOL_V1, ingest_zip
from .prepare_orchestrate import (
    PROTOCOL_PREPARE_V1,
    PrepareConflictError,
    prepare_ingest_zip,
)

__all__ = [
    "PROTOCOL_V1",
    "PROTOCOL_PREPARE_V1",
    "PrepareConflictError",
    "ingest_zip",
    "prepare_ingest_zip",
]
