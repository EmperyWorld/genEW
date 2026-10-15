# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Desktop workspace aggregator: mounts recents and items child routers; re-exports for desktop.py.
# Invariants:
# - Mounted without extra prefix under parent ``/desktop`` router.
# - No route handlers in this module — pure orchestration layer.
# Related:
# - api/routers/desktop_items.py
# - api/routers/desktop_recents.py
# - api/routers/desktop_bootstrap.py
# - api/routers/desktop.py (parent router)
# ---
"""Desktop workspace aggregator — mounts items and recents under /desktop."""

from fastapi import APIRouter

router = APIRouter(tags=["desktop"])

from api.routers import desktop_items as _desktop_items
from api.routers import desktop_recents as _desktop_recents

router.include_router(_desktop_recents.router)
router.include_router(_desktop_items.router)

# ruff: noqa: I001 — intentional late re-exports after child router mounts
from api.routers.desktop_bootstrap import (  # noqa: E402, F401
    SYSTEM_FOLDER_KEYS,
    _cleanup_legacy_desktop_state,
    ensure_app_store_icon,
    ensure_system_folders,
)
from api.routers.desktop_items import (  # noqa: E402, F401
    DesktopItemCreate,
    DesktopItemResponse,
    DesktopItemUpdate,
    DesktopItemUpsert,
    DesktopItemsBulkUpdate,
    DesktopItemsResponse,
)
from api.routers.desktop_recents import (  # noqa: E402, F401
    DesktopRecentContentFeedResponse,
    DesktopRecentFileRow,
)

__all__ = [
    "SYSTEM_FOLDER_KEYS",
    "_cleanup_legacy_desktop_state",
    "ensure_app_store_icon",
    "ensure_system_folders",
    "DesktopItemCreate",
    "DesktopItemResponse",
    "DesktopItemUpdate",
    "DesktopItemUpsert",
    "DesktopItemsBulkUpdate",
    "DesktopItemsResponse",
    "DesktopRecentContentFeedResponse",
    "DesktopRecentFileRow",
    "router",
]
