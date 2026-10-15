# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Build the desktop shell cold-path snapshot for GET /desktop/shell-bootstrap —
# profile cluster, maintenance, config/installed, recents, badge feeds.
# Invariants:
# - Critical slices (profile, preferences, notification_center, maintenance, desktop_config)
#   fail the request; optional badge slices degrade to null with structured debug log.
# - Does not include desktop items, full App Store catalog, or shell-state (kept as separate GETs).
# Related:
# - api/routers/desktop_shell_bootstrap.py
# - documentation/platform/FRONTEND-TOOLCHAIN-AND-BUILD.md
# ---
"""Desktop shell cold-path bootstrap aggregator."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.auth import User as AuthUser
from api.gaf_chat.schemas import ChatListItem, GafChatMeResponse
from api.gaf_chat.service import GafChatService
from api.models.desktop import UserInstalledApp
from api.routers.desktop_recents import (
    DesktopRecentContentFeedResponse,
    DesktopRecentFileRow,
    fetch_recent_content_feed_for_user,
    fetch_recent_files_for_user,
)
from api.routers.desktop_shell_config import DesktopConfigResponse, load_desktop_config_response
from api.schemas.desktop_shell_bootstrap import InstalledAppsSlice
from api.schemas.notification_center import (
    NotificationCenterGetResponse,
    NotificationCenterItemSerialized,
)
from api.schemas.user_profile import UserPreferences, UserProfileResponse
from api.services.friends_service import FriendsService
from api.services.maintenance_service import get_maintenance_service
from api.services.user_profile_service import UserProfileService

logger = logging.getLogger(__name__)


def _desktop():
    from api.routers import desktop as d

    return d


async def _load_installed_response(
    db: AsyncSession,
    *,
    user_id: UUID,
    current_user: AuthUser,
) -> InstalledAppsSlice:
    d = _desktop()
    await d._cleanup_legacy_desktop_state(db, user_id=user_id)
    await d._enforce_user_installed_apps_policy(db, user_id=user_id, current_user=current_user)
    await d._ensure_factory_apps_installed(db, user_id=user_id, current_user=current_user)
    result = await db.execute(select(UserInstalledApp.app_id).where(UserInstalledApp.user_id == user_id))
    app_ids = [aid for aid in result.scalars().all() if not d._is_legacy_hidden_app_id(aid)]
    if d.APP_STORE_APP_ID not in app_ids:
        app_ids.append(d.APP_STORE_APP_ID)
    return InstalledAppsSlice(app_ids=app_ids)


async def _optional_slice(label: str, coro: Any) -> Any:
    try:
        return await coro
    except Exception:
        logger.debug("[STEP] desktop_shell_bootstrap_skip label=%s", label, exc_info=True)
        return None


async def build_desktop_shell_bootstrap(
    *,
    current_user: AuthUser,
    user_id: UUID,
    content_user_id: str,
    db: AsyncSession,
    profile_service: UserProfileService,
    friends_service: FriendsService,
    gaf_service: GafChatService,
) -> dict[str, Any]:
    """Assemble cold-path shell bootstrap payload (JSON-serializable dict / pydantic models)."""
    # Lazy: product_desktop_news imports desktop → cycle if imported at module load.
    from api.routers.product_desktop_news import (  # noqa: PLC0415
        _fetch_ewdesk_news_counts_row,
        _fetch_user_news_state,
    )
    from api.routers.ugs.task_listing import _fetch_ugs_tray_summary  # noqa: PLC0415

    maintenance = await get_maintenance_service().get_status()
    profile = await profile_service.get_user_profile(user_id, effective_role=current_user.role)
    preferences = await profile_service.get_preferences(user_id)
    notif_raw, notif_updated = await profile_service.get_notification_center_snapshot(user_id)
    notification_center = NotificationCenterGetResponse(
        items=[NotificationCenterItemSerialized.model_validate(x) for x in notif_raw],
        updated_at=notif_updated,
    )
    desktop_config = await load_desktop_config_response(db, user_id)
    installed = await _load_installed_response(db, user_id=user_id, current_user=current_user)
    recent_files_raw = await fetch_recent_files_for_user(db, user_id, limit=10)
    recent_files = [DesktopRecentFileRow.model_validate(row) for row in recent_files_raw]
    recent_content_feed = await fetch_recent_content_feed_for_user(db, user_id, limit=6)

    friends_overview = await _optional_slice(
        "friends_overview",
        friends_service.get_overview(content_user_id),
    )
    gaf_chats_raw = await _optional_slice(
        "gaf_chats",
        gaf_service.list_chats(content_user_id),
    )
    ewdesk_counts_row = await _optional_slice(
        "ewdesk_news_counts",
        _fetch_ewdesk_news_counts_row(db, user_id),
    )
    ewdesk_my_state = await _optional_slice(
        "ewdesk_news_my_state",
        _fetch_user_news_state(db, user_id),
    )
    ugs_tray = await _optional_slice(
        "ugs_tray_summary",
        _fetch_ugs_tray_summary(db, user_id=content_user_id),
    )

    friends_payload: dict[str, Any] | None = None
    if isinstance(friends_overview, dict):
        friends_payload = friends_overview

    gaf_chats: list[ChatListItem] | None = None
    if isinstance(gaf_chats_raw, list):
        gaf_chats = [ChatListItem.model_validate(row) for row in gaf_chats_raw]

    ewdesk_counts: dict[str, Any] | None = None
    if isinstance(ewdesk_counts_row, dict):
        ewdesk_counts = dict(ewdesk_counts_row)

    ewdesk_state: dict[str, Any] | None = None
    if ewdesk_my_state is not None:
        if hasattr(ewdesk_my_state, "model_dump"):
            ewdesk_state = ewdesk_my_state.model_dump(mode="json")
        elif isinstance(ewdesk_my_state, dict):
            ewdesk_state = ewdesk_my_state

    return {
        "schema_version": 1,
        "fetched_at": datetime.now(UTC),
        "maintenance": maintenance,
        "profile": profile if isinstance(profile, UserProfileResponse) else UserProfileResponse.model_validate(profile),
        "preferences": (
            preferences if isinstance(preferences, UserPreferences) else UserPreferences.model_validate(preferences)
        ),
        "notification_center": notification_center,
        "desktop_config": desktop_config if isinstance(desktop_config, DesktopConfigResponse) else desktop_config,
        "installed": installed,
        "recent_files": recent_files,
        "recent_content_feed": (
            recent_content_feed
            if isinstance(recent_content_feed, DesktopRecentContentFeedResponse)
            else DesktopRecentContentFeedResponse.model_validate(recent_content_feed)
        ),
        "gaf_me": GafChatMeResponse(user_id=content_user_id),
        "gaf_chats": gaf_chats,
        "friends_overview": friends_payload,
        "ewdesk_news_counts": ewdesk_counts,
        "ewdesk_news_my_state": ewdesk_state,
        "ugs_tray_summary": ugs_tray,
    }
