# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Desktop shell aggregator: mounts config and local-service proxy child routers; re-exports for desktop.py.
# Invariants:
# - Mounted without extra prefix under parent ``/desktop`` router.
# - No route handlers in this module — pure orchestration layer.
# - ``shell-bootstrap`` is mounted from ``desktop.py`` (after store) to avoid import cycles.
# Related:
# - api/routers/desktop_shell_config.py
# - api/routers/desktop_shell_proxy.py
# - api/routers/desktop_shell_bootstrap.py (mounted in desktop.py)
# - api/routers/desktop.py (parent router)
# ---
"""Desktop shell aggregator — mounts config and proxy under /desktop."""

from fastapi import APIRouter

router = APIRouter(tags=["desktop"])

from api.routers import desktop_shell_config as _desktop_shell_config
from api.routers import desktop_shell_proxy as _desktop_shell_proxy

router.include_router(_desktop_shell_config.router)
router.include_router(_desktop_shell_proxy.router)

# ruff: noqa: I001 — intentional late re-exports after child router mounts
from api.routers.desktop_shell_config import (  # noqa: E402, F401
    MAX_WINDOWS_SNAPSHOT_WINDOWS,
    DesktopConfigCreate,
    DesktopConfigResponse,
    DesktopConfigUpdate,
    DesktopShellStateOut,
    DesktopShellStatePatch,
    Position,
    _get_or_create_desktop_config_row,
    _if_none_match_matches,
    _raise_if_shell_state_etag_conflict,
    _shell_state_field_etags,
    _shell_state_to_out,
    _weak_etag_for_pydantic_model,
    validate_window_instance_policy,
)

__all__ = [
    "MAX_WINDOWS_SNAPSHOT_WINDOWS",
    "DesktopConfigCreate",
    "DesktopConfigResponse",
    "DesktopConfigUpdate",
    "DesktopShellStateOut",
    "DesktopShellStatePatch",
    "Position",
    "_get_or_create_desktop_config_row",
    "_if_none_match_matches",
    "_raise_if_shell_state_etag_conflict",
    "_shell_state_field_etags",
    "_shell_state_to_out",
    "_weak_etag_for_pydantic_model",
    "validate_window_instance_policy",
    "router",
]
