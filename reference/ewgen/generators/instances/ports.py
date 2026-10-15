# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Stable host port allocation for atom sandbox Postgres/Redis.
# Invariants:
# - Deterministic from instance_id (sha256); no Python hash() randomization.
# Related:
# - generators/instances/orchestrator.py
# ---

"""Port allocation for atom instances."""

from __future__ import annotations

import hashlib
from typing import Dict


def allocate_ports(instance_id: str) -> Dict[str, int]:
    digest = hashlib.sha256(instance_id.encode("utf-8")).hexdigest()
    n = int(digest[:6], 16)
    # Keep clear of common host services; range ~15432–16431 / 16379–17378
    return {
        "db": 15432 + (n % 1000),
        "redis": 16379 + (n % 1000),
    }
