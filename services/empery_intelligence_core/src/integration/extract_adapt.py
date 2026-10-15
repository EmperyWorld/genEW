"""Re-export — extract_adapt SoT is ``core.assembly.extract_adapt`` (Mechanics)."""

from __future__ import annotations

from core.assembly.extract_adapt import (  # noqa: F401
    ExtractResult,
    apply_transforms,
    default_eliteew_root,
    extract_adapt,
    extract_from_catalog_entry,
)

__all__ = [
    "ExtractResult",
    "apply_transforms",
    "default_eliteew_root",
    "extract_adapt",
    "extract_from_catalog_entry",
]
