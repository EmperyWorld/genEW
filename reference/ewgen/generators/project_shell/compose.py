# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Compose N-way project shell from bank catalog refs (Stage 5).
# Invariants:
# - Validates manifest then materializes under data/project-shells/.
# - Does not run Stage 6 resolver.
# Related:
# - generators/project_shell/manifest.py
# - generators/project_shell/materialize.py
# ---

"""Compose N-way project shell."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

from .manifest import validate_project_manifest
from .materialize import materialize_project_shell

PROTOCOL_V1 = "ewgen_project_shell_v1"


def compose_project_shell(
    payload: Dict[str, Any],
    *,
    overwrite: bool = False,
    project_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Validate N-way manifest and materialize SET-base project shell.
    """
    manifest = validate_project_manifest(payload)
    result = materialize_project_shell(
        manifest,
        overwrite=overwrite,
        project_root=project_root,
    )
    return {
        "protocol": PROTOCOL_V1,
        "success": True,
        "manifest": manifest,
        **result,
    }
