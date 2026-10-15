# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Parent REST router for desktop: store install policy, child mounts, backward-compatible re-exports.
# Invariants:
# - OAuth2 on user routes; child routers mounted without extra prefix.
# - Child modules: desktop_shell (aggregator), desktop_shell_config, desktop_shell_proxy, desktop_store, desktop_widgets, desktop_workspace.
# Related:
# - api/routers/desktop_shell.py (aggregator)
# - api/routers/desktop_shell_config.py (config, shell-state)
# - api/routers/desktop_shell_proxy.py (local-service iframe proxy)
# - api/routers/desktop_store.py (App Store, installed apps, EW billing)
# - api/routers/desktop_widgets.py (widget notes/todos, dashboard favorites)
# - api/routers/desktop_workspace.py (items/recents/bootstrap aggregator)
# - api/routers/desktop_items.py (items CRUD, re-exported via workspace)
# - api/routers/desktop_admin_schemas.py (admin Pydantic schemas, re-exported here)
# ---
"""
Desktop API Router
Handles user desktop configuration and items
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.core.auth import User as AuthUser
from api.core.database_manager import get_postgres_session
from api.core.oauth2_auth import require_oauth2_user
from api.models.database_models import User
from api.models.desktop import (
    DesktopAppCatalog,
    DesktopItem,
    ItemType,
    UserInstalledApp,
)
from api.utils.datetime_helpers import utc_now_naive

router = APIRouter(prefix="/desktop", tags=["desktop"])

KNOWN_DESKTOP_APP_COMPONENTS = frozenset(
    {
        "AppStore",
        "ContentManagerPro",
        "AudioTranscriptionPro",
        "UGS",
        "UGSHubApp",
        "EWRP",
        "StudioGU",
        "Presentations",
        "PresentationsArchive",
        "VoiceStudio",
        "DocEditor",
        "DocEditorV2",
        "ComfyUI",
        "ImageStudio",
        "VideoStudio",
        "VideoCallApp",
        "VoiceCommand",
        "GAFChatApp",
        "DesktopAiChatApp",
        "MusicGenerator",
        "MusicForgeApp",
        "MusicEvolutionApp",
        "PoemmaApp",
        "ProjectAboutApp",
        "MusicPlayer",
        "ClipboardManager",
        "UserProfile",
        "SocialHubApp",
        "MarketingCabinet",
        "CustomerCabinet",
        "UserSiteStudio",
        "FriendsApp",
        "KirsCuration",
        "KirsClientSite",
        "UnifiedAdminApp",
        "NotificationsApp",
        "EWDeskApp",
        "EwaApp",
        "FeedbackHubApp",
        "SurveyHubApp",
        "AssistantApp",
        "LocalServiceIframeApp",
    }
)


async def get_desktop_user_id(
    current_user: AuthUser = Depends(require_oauth2_user),
    db: AsyncSession = Depends(get_postgres_session),
) -> UUID:
    """Resolve current OAuth2 user to database user UUID with UUID-first, email-fallback logic."""
    raw_user_id = str(getattr(current_user, "id", "") or "").strip()
    email = str(getattr(current_user, "email", "") or "").strip()

    row = None

    try:
        oauth_uuid = UUID(raw_user_id)
    except (TypeError, ValueError):  # fmt: skip
        oauth_uuid = None

    if oauth_uuid is not None:
        r = await db.execute(select(User.id).where(User.id == oauth_uuid))
        row = r.scalar_one_or_none()

    if row is None and email:
        r = await db.execute(select(User.id).where(User.email == email))
        row = r.scalar_one_or_none()

    if row is None and not email and oauth_uuid is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User email or UUID is required to resolve desktop data",
        )

    if row is None and oauth_uuid is not None and not email:
        return oauth_uuid

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in database",
        )
    # scalar_one_or_none() returns the single column value; normalize to stdlib UUID
    return row if isinstance(row, UUID) else UUID(str(row))


from api.routers import desktop_shell as _desktop_shell
from api.routers import desktop_store as _desktop_store
from api.routers import desktop_widgets as _desktop_widgets
from api.routers import desktop_workspace as _desktop_workspace

router.include_router(_desktop_shell.router)
router.include_router(_desktop_store.router)
router.include_router(_desktop_widgets.router)
router.include_router(_desktop_workspace.router)

# After store/workspace: shell-bootstrap imports installed/config helpers without cycling desktop_shell.
from api.routers import desktop_shell_bootstrap as _desktop_shell_bootstrap  # noqa: E402

router.include_router(_desktop_shell_bootstrap.router)

# ruff: noqa: I001 — intentional late re-exports after child router mounts
# Re-exports for backward-compatible imports from api.routers.desktop (shell)
from api.routers.desktop_shell import (  # noqa: E402, F401
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

# Re-exports for backward-compatible imports from api.routers.desktop (store)
from api.routers.desktop_store import (  # noqa: E402, F401
    DesktopAccessGroupRef,
    EwWalletResponse,
    InstalledInstallBody,
    InstalledResponse,
    StoreAppDetailResponse,
    StoreAppResponse,
    StoreResponse,
    _catalog_can_uninstall,
)

# Re-exports for backward-compatible imports from api.routers.desktop (widgets)
from api.routers.desktop_widgets import (  # noqa: E402, F401
    DashboardFavoriteCreate,
    DashboardFavoriteReorder,
    DashboardFavoriteResponse,
    WidgetNoteCreate,
    WidgetNoteResponse,
    WidgetNoteUpdate,
    WidgetTodoCreate,
    WidgetTodoResponse,
    WidgetTodoUpdate,
)

# Re-exports for backward-compatible imports from api.routers.desktop (workspace)
from api.routers.desktop_workspace import (  # noqa: E402, F401
    DesktopItemCreate,
    DesktopItemResponse,
    DesktopItemUpdate,
    DesktopItemUpsert,
    DesktopItemsBulkUpdate,
    DesktopItemsResponse,
    DesktopRecentContentFeedResponse,
    DesktopRecentFileRow,
    SYSTEM_FOLDER_KEYS,
    _cleanup_legacy_desktop_state,
    ensure_app_store_icon,
    ensure_system_folders,
)

# Re-exports for backward-compatible imports from api.routers.desktop (admin schemas)
from api.routers.desktop_admin_schemas import (  # noqa: E402, F401
    AccessGroupCreate,
    AccessGroupResponse,
    AccessGroupUpdate,
    AdminSsoLoginHistoryEntry,
    AdminSsoSessionSnapshot,
    AdminUserDirectoryEntry,
    AdminUserDirectoryPage,
    AdminUserDirectorySummary,
    AdminUserSsoOverview,
    CatalogAppCreate,
    CatalogAppResponse,
    CatalogAppUpdate,
    UserAppAccessGroupResponse,
    UserAppAccessGroupUpdate,
    UserEwBalanceSetBody,
    UserUgsCreditsSetBody,
    UserWebSearchQuotaPatch,
    WebSearchQuotaStatusResponse,
    validate_factory_catalog_flags,
)

__all__ = [
    "router",
    "get_desktop_user_id",
    "KNOWN_DESKTOP_APP_COMPONENTS",
    "DEFAULT_ACCESS_GROUP_ID",
    "ADMIN_ROLES",
    "APP_STORE_APP_ID",
    "APP_STORE_APP_COMPONENT",
    "APP_STORE_DISPLAY_NAME",
    "LEGACY_HIDDEN_DESKTOP_APP_IDS",
    # shell re-exports
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
    # store re-exports
    "DesktopAccessGroupRef",
    "EwWalletResponse",
    "InstalledInstallBody",
    "InstalledResponse",
    "StoreAppDetailResponse",
    "StoreAppResponse",
    "StoreResponse",
    "_catalog_can_uninstall",
    # widgets re-exports
    "DashboardFavoriteCreate",
    "DashboardFavoriteReorder",
    "DashboardFavoriteResponse",
    "WidgetNoteCreate",
    "WidgetNoteResponse",
    "WidgetNoteUpdate",
    "WidgetTodoCreate",
    "WidgetTodoResponse",
    "WidgetTodoUpdate",
    # workspace re-exports
    "DesktopItemCreate",
    "DesktopItemResponse",
    "DesktopItemUpdate",
    "DesktopItemUpsert",
    "DesktopItemsBulkUpdate",
    "DesktopItemsResponse",
    "DesktopRecentContentFeedResponse",
    "DesktopRecentFileRow",
    "SYSTEM_FOLDER_KEYS",
    "_cleanup_legacy_desktop_state",
    "ensure_app_store_icon",
    "ensure_system_folders",
    # admin schema re-exports
    "AccessGroupCreate",
    "AccessGroupResponse",
    "AccessGroupUpdate",
    "AdminSsoLoginHistoryEntry",
    "AdminSsoSessionSnapshot",
    "AdminUserDirectoryEntry",
    "AdminUserDirectoryPage",
    "AdminUserDirectorySummary",
    "AdminUserSsoOverview",
    "CatalogAppCreate",
    "CatalogAppResponse",
    "CatalogAppUpdate",
    "UserAppAccessGroupResponse",
    "UserAppAccessGroupUpdate",
    "UserEwBalanceSetBody",
    "UserUgsCreditsSetBody",
    "UserWebSearchQuotaPatch",
    "WebSearchQuotaStatusResponse",
    "validate_factory_catalog_flags",
]

# Default access group UUID (seed in 006_app_access_groups.sql); NULL user group means this
DEFAULT_ACCESS_GROUP_ID = UUID("a0000000-0000-4000-8000-000000000001")
ADMIN_ROLES = ("admin", "emperyworld_admin")
# App Store is always installed for all users and cannot be uninstalled.
# Desktop icon with item_id == APP_STORE_APP_ID is treated as system-managed:
# it is auto-created on read and only its position may be updated via bulk replace_items.
APP_STORE_APP_ID = "app-store"
APP_STORE_APP_COMPONENT = "AppStore"
APP_STORE_DISPLAY_NAME = "Магазин приложений"

LEGACY_HIDDEN_DESKTOP_APP_IDS = frozenset(
    {
        "app-voice",
        "app-voicecmd",
        "app-transcription",
        "app-friends",
        "app-user-profile",
        "app-chat",
        "app-analytics",
    }
)
# Keep removed app components here until old persisted desktop items are fully cleaned up.
LEGACY_HIDDEN_DESKTOP_APP_COMPONENTS = frozenset(
    {
        "VoiceCommand",
        "VoiceStudio",
        "DocumentStudio",
        "AudioTranscriptionPro",
        "FriendsApp",
        "UserProfile",
        "EliteChat",
        "Analytics",
        "ArlyQueenChat",
        "SystemMonitorWidget",
    }
)


# ============= Legacy visibility helpers (store policy) =============


def _is_legacy_hidden_app_id(app_id: str | None) -> bool:
    return bool(app_id) and app_id in LEGACY_HIDDEN_DESKTOP_APP_IDS


def _is_legacy_hidden_app_component(app_component: str | None) -> bool:
    return bool(app_component) and app_component in LEGACY_HIDDEN_DESKTOP_APP_COMPONENTS


def _is_legacy_hidden_desktop_item(item_id: str | None, app_component: str | None) -> bool:
    return _is_legacy_hidden_app_id(item_id) or _is_legacy_hidden_app_component(app_component)


# ============= Store install policy helpers =============


def _user_can_see_app(app: DesktopAppCatalog, user: AuthUser) -> bool:
    """True if current user is allowed to see (and install) this catalog app."""
    if getattr(app, "is_system", False):
        return getattr(user, "role", "") in ADMIN_ROLES
    user_group: UUID | None = user.app_access_group_id
    if user_group is None:
        user_group = DEFAULT_ACCESS_GROUP_ID
    allowed = list(getattr(app, "access_groups", None) or [])
    if len(allowed) == 0:
        return True
    allowed_ids = {g.id for g in allowed}
    return user_group in allowed_ids


async def _enforce_user_installed_apps_policy(
    db: AsyncSession,
    *,
    user_id: UUID,
    current_user: AuthUser,
) -> None:
    """Remove user_installed_apps rows the user may no longer access (server source of truth)."""
    result = await db.execute(select(UserInstalledApp.app_id).where(UserInstalledApp.user_id == user_id))
    raw_ids = [a for a in result.scalars().all() if not _is_legacy_hidden_app_id(a)]
    if not raw_ids:
        return
    catalog_result = await db.execute(
        select(DesktopAppCatalog)
        .options(selectinload(DesktopAppCatalog.access_groups))
        .where(DesktopAppCatalog.app_id.in_(raw_ids))
    )
    by_id = {c.app_id: c for c in catalog_result.scalars().all()}
    to_remove: list[str] = []
    for aid in raw_ids:
        if aid == APP_STORE_APP_ID:
            continue
        row = by_id.get(aid)
        if (
            row is None
            or _is_legacy_hidden_desktop_item(row.app_id, row.app_component)
            or not _user_can_see_app(row, current_user)
        ):
            to_remove.append(aid)
    if not to_remove:
        return
    await db.execute(
        delete(UserInstalledApp).where(
            UserInstalledApp.user_id == user_id,
            UserInstalledApp.app_id.in_(to_remove),
        )
    )
    await db.flush()


async def _ensure_factory_apps_installed(
    db: AsyncSession,
    *,
    user_id: UUID,
    current_user: AuthUser,
) -> None:
    """Insert user_installed_apps for factory (OEM) catalog apps the user can see."""
    result = await db.execute(
        select(DesktopAppCatalog)
        .options(selectinload(DesktopAppCatalog.access_groups))
        .where(DesktopAppCatalog.is_factory.is_(True))
    )
    installed_at = utc_now_naive()
    for c in result.scalars().all():
        if _is_legacy_hidden_desktop_item(c.app_id, c.app_component):
            continue
        if not _user_can_see_app(c, current_user):
            continue
        existing = await db.execute(
            select(UserInstalledApp).where(
                UserInstalledApp.user_id == user_id,
                UserInstalledApp.app_id == c.app_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            continue
        from api.routers.desktop_store import _apply_desktop_store_billing_for_install

        await _apply_desktop_store_billing_for_install(
            db,
            user_id=user_id,
            catalog=c,
            current_user=current_user,
        )
        await db.execute(
            pg_insert(UserInstalledApp)
            .values(user_id=user_id, app_id=c.app_id, installed_at=installed_at)
            .on_conflict_do_nothing(
                index_elements=[UserInstalledApp.user_id, UserInstalledApp.app_id],
            )
        )
    await db.flush()


async def _strip_unauthorized_app_desktop_items(
    db: AsyncSession,
    *,
    config_id: UUID,
    allowed_app_ids: set[str],
) -> None:
    """Remove APP desktop shortcuts that are not in the authorized installed set."""
    result = await db.execute(
        select(DesktopItem).where(
            DesktopItem.config_id == config_id,
            DesktopItem.item_type == ItemType.APP,
        )
    )
    for item in result.scalars().all():
        if item.item_id in allowed_app_ids:
            continue
        if item.item_id == APP_STORE_APP_ID and getattr(item, "is_system", False):
            continue
        await db.delete(item)
    await db.flush()
