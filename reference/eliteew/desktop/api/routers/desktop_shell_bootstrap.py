# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# GET /desktop/shell-bootstrap — one cold-path snapshot for idle `#desktop` shell hydration.
# Invariants:
# - OAuth2 required; mounted without extra prefix under parent ``/desktop`` (from desktop.py).
# - Does not replace items / store catalog / shell-state endpoints.
# - Avoids importing gaf_chat.router / product_desktop_news / desktop_store at module load (cycles).
# Related:
# - api/services/desktop_shell_bootstrap_service.py
# - api/schemas/desktop_shell_bootstrap.py
# - api/routers/desktop.py
# ---
"""Desktop shell cold-path bootstrap route."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.auth import User as AuthUser
from api.core.database_manager import get_asyncpg_pool, get_postgres_session
from api.core.oauth2_auth import require_oauth2_user
from api.core.user_identity import resolve_db_user_uuid_with_pool
from api.gaf_chat.service import GafChatService
from api.routers.friends import get_friends_service
from api.routers.user_profile import get_profile_service
from api.schemas.desktop_shell_bootstrap import DesktopShellBootstrapResponse
from api.services.desktop_shell_bootstrap_service import build_desktop_shell_bootstrap
from api.services.friends_service import FriendsService
from api.services.user_profile_service import UserProfileService

router = APIRouter(tags=["desktop"])


async def _get_gaf_chat_service() -> GafChatService:
    """Local DI — do not import ``gaf_chat.router`` (it imports ``desktop`` → cycle)."""
    pool = await get_asyncpg_pool()
    return GafChatService(pool)


async def _resolve_shell_user_id(
    current_user: AuthUser = Depends(require_oauth2_user),
    db: AsyncSession = Depends(get_postgres_session),
) -> UUID:
    from api.routers.desktop import get_desktop_user_id

    return await get_desktop_user_id(current_user=current_user, db=db)


@router.get(
    "/shell-bootstrap",
    response_model=DesktopShellBootstrapResponse,
    summary="Desktop shell cold-path bootstrap",
)
async def get_desktop_shell_bootstrap(
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_resolve_shell_user_id),
    db: AsyncSession = Depends(get_postgres_session),
    profile_service: UserProfileService = Depends(get_profile_service),
    friends_service: FriendsService = Depends(get_friends_service),
    gaf_service: GafChatService = Depends(_get_gaf_chat_service),
) -> DesktopShellBootstrapResponse:
    """One GET replacing the dense idle `#desktop` fan-out of profile/prefs/notif/config/badges."""
    pool = await get_asyncpg_pool()
    content_user_id = str(await resolve_db_user_uuid_with_pool(current_user, pool))
    payload = await build_desktop_shell_bootstrap(
        current_user=current_user,
        user_id=user_id,
        content_user_id=content_user_id,
        db=db,
        profile_service=profile_service,
        friends_service=friends_service,
        gaf_service=gaf_service,
    )
    return DesktopShellBootstrapResponse.model_validate(payload)
