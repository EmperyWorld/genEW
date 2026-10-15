# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Paths for exported N-way project shells (not live set-runtime).
# Invariants:
# - Default under EWGen/data/project-shells/; override via env.
# Related:
# - generators/project_shell/materialize.py
# ---

"""Project shell path helpers."""

from __future__ import annotations

import os
import re
from pathlib import Path

PROJECT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$")


def ewgen_root() -> Path:
    return Path(__file__).parent.parent.parent


def project_shells_root() -> Path:
    configured = os.getenv("EWGEN_PROJECT_SHELLS_PATH", "").strip()
    if configured:
        return Path(configured)
    return ewgen_root() / "data" / "project-shells"


def project_shell_path(project_kebab: str) -> Path:
    normalized = project_kebab.strip()
    if not PROJECT_ID_RE.fullmatch(normalized):
        raise ValueError(
            "projectId must be 3-80 lowercase kebab characters",
        )
    return project_shells_root() / normalized
