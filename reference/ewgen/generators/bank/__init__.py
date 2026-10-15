# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Unified piggy bank — read-through search over importer / scavenger /
# warsmith / genesis catalogs (Component Factory Stages 3 + 8).
# Invariants:
# - Fan-out list_entries; genesis catalog filled only on approve.
# - Per-track /api/*/catalog routes remain valid power paths.
# Related:
# - documentation/platform/EWGEN-COMPONENT-FACTORY-VISION.md
# - generators/bank/genesis_catalog.py
# ---

"""Unified piggy bank package — search across ingest catalogs."""

from .search import PROTOCOL_V1, search_bank

__all__ = ["PROTOCOL_V1", "search_bank"]
