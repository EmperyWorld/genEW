# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Dynamic Atom Layer — per-atom/project Podman sandbox under data/instances/.
# Invariants:
# - Never manage/reconfigure the systemd EWGen core Postgres/Redis.
# - Instance DBs are bind-mounted under data/instances/{id}/ only.
# Related:
# - documentation/platform/EWGEN-AUTONOMOUS-SYNTHESIS-ENGINE.md
# ---

"""ASE Dynamic Atom Layer (Podman sandboxes)."""

from .orchestrator import (
    destroy_instance,
    instance_status,
    provision_instance,
)
from .paths import instances_root

__all__ = [
    "destroy_instance",
    "instance_status",
    "instances_root",
    "provision_instance",
]
