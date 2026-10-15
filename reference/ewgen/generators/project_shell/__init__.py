# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# N-way project shell — compose, resolve, and manage assembled projects.
# Invariants:
# - Does not replace set-runtime/; writes data/project-shells/ only.
# - Lifecycle mutations remain under data/project-shells/, not set-runtime/.
# Related:
# - documentation/platform/EWGEN-COMPONENT-FACTORY-VISION.md
# - generators/set/bootstrap.py
# ---

"""Project shell package — compose, resolve, and lifecycle."""

from .compose import PROTOCOL_V1, compose_project_shell
from .lifecycle import (
    PROTOCOL_LIFECYCLE_V1,
    get_project,
    install_bank_module,
    list_projects,
    register_shell,
    repair_project,
)
from .resolver import PROTOCOL_RESOLVE_V1, resolve_project_shell

__all__ = [
    "PROTOCOL_LIFECYCLE_V1",
    "PROTOCOL_V1",
    "PROTOCOL_RESOLVE_V1",
    "compose_project_shell",
    "get_project",
    "install_bank_module",
    "list_projects",
    "register_shell",
    "repair_project",
    "resolve_project_shell",
]
