# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Paths for Dynamic Atom Layer instance sandboxes.
# Invariants:
# - Root is EWGen/data/instances/ (or EWGEN_INSTANCES_ROOT).
# - Never resolves into systemd core DB data dirs.
# Related:
# - generators/instances/orchestrator.py
# ---

"""Instance directory layout."""

from __future__ import annotations

import os
import re
from pathlib import Path

_SAFE_ID = re.compile(r"^[a-zA-Z0-9._-]{3,128}$")


def instances_root() -> Path:
    root = Path(
        os.getenv("EWGEN_INSTANCES_ROOT")
        or Path(__file__).resolve().parents[2] / "data" / "instances"
    )
    root.mkdir(parents=True, exist_ok=True)
    return root


def sanitize_instance_id(instance_id: str) -> str:
    raw = (instance_id or "").strip()
    if not _SAFE_ID.match(raw):
        raise ValueError(
            f"INSTANCE_ID_INVALID: {instance_id!r} "
            "(expected [a-zA-Z0-9._-]{3,128})"
        )
    return raw


def instance_dir(instance_id: str) -> Path:
    return instances_root() / sanitize_instance_id(instance_id)


def short_id(instance_id: str, *, n: int = 8) -> str:
    safe = sanitize_instance_id(instance_id)
    # Prefer hex-ish prefix from UUID; else hash-stable slice
    cleaned = safe.replace("-", "")
    return cleaned[:n].lower()
