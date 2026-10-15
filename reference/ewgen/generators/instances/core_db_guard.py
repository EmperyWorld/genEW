# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Hard guard — ASE must never reconfigure the systemd EWGen core database.
# Invariants:
# - Reject compose/env that target known core unit names or host DB paths.
# Related:
# - documentation/platform/EWGEN-AUTONOMOUS-SYNTHESIS-ENGINE.md
# ---

"""Core DB fortress guard."""

from __future__ import annotations

import re
from typing import Iterable, List

# Patterns that indicate the Stable Core (Fortress), not atom sandboxes.
FORBIDDEN_SUBSTRINGS = (
    "ewgen-backend.service",
    "ewgen-postgres",
    "stack-ewgen",
    "ELITEEW_ENV_RUNTIME",
    "/var/lib/postgresql/ewgen-core",
    "docker/systemd/ewgen-",
)

FORBIDDEN_COMPOSE_NAMES = (
    "ewgen-set-db",  # shared SET template name — must be rewritten per atom
)


def assert_sandbox_safe(
    texts: Iterable[str],
    *,
    context: str = "instance",
) -> List[str]:
    """
    Raise ValueError if any text references Stable Core infrastructure.
    Returns list of warnings for soft issues.
    """
    warnings: List[str] = []
    blob = "\n".join(texts)
    for needle in FORBIDDEN_SUBSTRINGS:
        if needle in blob:
            raise ValueError(
                f"CORE_DB_FORTRESS_VIOLATION:{context}:{needle}"
            )
    for name in FORBIDDEN_COMPOSE_NAMES:
        if re.search(rf"container_name:\s*{re.escape(name)}\b", blob):
            raise ValueError(
                f"CORE_DB_FORTRESS_VIOLATION:{context}:container:{name}"
            )
    if "data/instances/" not in blob and "./db_data" not in blob:
        warnings.append("SANDBOX_BIND_HINT_MISSING")
    return warnings
