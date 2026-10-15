# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Desktop App Store, installed-apps, and EW billing/entitlement REST under parent ``/desktop`` router.
# Invariants:
# - Mounted without extra prefix; OAuth2 on user-facing routes; URL paths unchanged vs monolithic desktop.py.
# - ``_get_desktop_user_id`` lazy-imports resolver from ``api.routers.desktop`` to avoid circular imports.
# Related:
# - api/routers/desktop.py (parent router, items/catalog helpers, factory install policy)
# - api/routers/desktop_shell.py (ETag helpers for GET /installed)
# ---
"""Desktop App Store, installed apps, and EW wallet/billing API."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
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
    DesktopConfig,
    DesktopItem,
    ItemType,
    UserDesktopAppEntitlement,
    UserEwLedger,
    UserInstalledApp,
)
from api.routers.desktop_shell import _if_none_match_matches, _weak_etag_for_pydantic_model
from api.utils.json_safe import json_safe_api_detail

router = APIRouter(tags=["desktop"])

EW_SUBSCRIPTION_PERIOD_DAYS = 30
ENTITLEMENT_EXEMPT = "exempt"
ENTITLEMENT_TRIAL = "trial"
ENTITLEMENT_PAID = "paid"


async def _get_desktop_user_id(
    current_user: AuthUser = Depends(require_oauth2_user),
    db: AsyncSession = Depends(get_postgres_session),
) -> UUID:
    from api.routers.desktop import get_desktop_user_id

    return await get_desktop_user_id(current_user=current_user, db=db)


def _desktop():
    from api.routers import desktop as d

    return d


def _catalog_can_uninstall(c: DesktopAppCatalog) -> bool:
    d = _desktop()
    if c.app_id == d.APP_STORE_APP_ID:
        return False
    return not (getattr(c, "is_system", False) or getattr(c, "is_factory", False))


class DesktopAccessGroupRef(BaseModel):
    """Snippet for API responses (store + admin catalog)."""

    id: UUID
    name: str

    model_config = ConfigDict(from_attributes=True)


class StoreAppResponse(BaseModel):
    app_id: str
    name: str
    description: str | None
    app_component: str
    category: str
    gradient: str | None
    color: str | None
    sort_order: int
    allow_multiple_windows: bool = False
    max_window_instances: int = 1
    installed: bool
    is_system: bool = False
    is_factory: bool = False
    can_uninstall: bool = True
    ew_monthly_price: int = 0
    trial_duration_days: int = 0
    billing_exempt: bool = False
    access_groups: list[DesktopAccessGroupRef] = Field(default_factory=list)
    is_featured_new: bool = False
    new_until: datetime | None = None
    show_new_badge: bool = False
    maintenance_mode: bool = False
    maintenance_title: str | None = None
    maintenance_reason: str | None = None
    maintenance_expected_outcome: str | None = None
    maintenance_eta_note: str | None = None
    icon_url: str | None = None
    icon_url_2x: str | None = None
    preview_url: str | None = None
    preview_url_2x: str | None = None

    model_config = ConfigDict(from_attributes=True)


class StoreAppDetailResponse(StoreAppResponse):
    """Same fields as catalog row plus install eligibility."""

    can_install: bool = True


class StoreResponse(BaseModel):
    apps: list[StoreAppResponse]


class InstalledResponse(BaseModel):
    app_ids: list[str]


class InstalledInstallBody(BaseModel):
    app_id: str


class EwWalletResponse(BaseModel):
    ew_balance: int
    ew_family: bool


def _catalog_billing_exempt(catalog: DesktopAppCatalog) -> bool:
    if getattr(catalog, "is_system", False):
        return True
    price = int(getattr(catalog, "ew_monthly_price", 0) or 0)
    return price <= 0


def _store_billing_fields(catalog: DesktopAppCatalog) -> tuple[int, int, bool]:
    ew_monthly_price = int(getattr(catalog, "ew_monthly_price", 0) or 0)
    trial_duration_days = int(getattr(catalog, "trial_duration_days", 0) or 0)
    billing_exempt = _catalog_billing_exempt(catalog)
    return ew_monthly_price, trial_duration_days, billing_exempt


def _entitlement_access_ok(ent: UserDesktopAppEntitlement, now: datetime) -> bool:
    if ent.status == ENTITLEMENT_EXEMPT:
        return True
    if ent.status == ENTITLEMENT_TRIAL and ent.trial_ends_at and ent.trial_ends_at > now:
        return True
    return bool(ent.status == ENTITLEMENT_PAID and ent.subscription_ends_at and ent.subscription_ends_at > now)


async def _ensure_exempt_entitlement(
    db: AsyncSession,
    *,
    user_id: UUID,
    app_id: str,
    now: datetime,
) -> None:
    stmt = (
        pg_insert(UserDesktopAppEntitlement)
        .values(
            user_id=user_id,
            app_id=app_id,
            status=ENTITLEMENT_EXEMPT,
            trial_ends_at=None,
            subscription_ends_at=None,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_update(
            index_elements=[UserDesktopAppEntitlement.user_id, UserDesktopAppEntitlement.app_id],
            set_={
                "status": ENTITLEMENT_EXEMPT,
                "trial_ends_at": None,
                "subscription_ends_at": None,
                "updated_at": now,
            },
        )
    )
    await db.execute(stmt)


async def _upsert_paid_entitlement(
    db: AsyncSession,
    *,
    user_id: UUID,
    app_id: str,
    subscription_ends_at: datetime,
    now: datetime,
) -> None:
    stmt = (
        pg_insert(UserDesktopAppEntitlement)
        .values(
            user_id=user_id,
            app_id=app_id,
            status=ENTITLEMENT_PAID,
            trial_ends_at=None,
            subscription_ends_at=subscription_ends_at,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_update(
            index_elements=[UserDesktopAppEntitlement.user_id, UserDesktopAppEntitlement.app_id],
            set_={
                "status": ENTITLEMENT_PAID,
                "trial_ends_at": None,
                "subscription_ends_at": subscription_ends_at,
                "updated_at": now,
            },
        )
    )
    await db.execute(stmt)


async def _charge_ew_monthly_subscription(
    db: AsyncSession,
    *,
    user_id: UUID,
    app_id: str,
    price: int,
    current_user: AuthUser,
    now: datetime,
) -> None:
    if price <= 0:
        return
    sub_end = now + timedelta(days=EW_SUBSCRIPTION_PERIOD_DAYS)
    if current_user.ew_family:
        db.add(
            UserEwLedger(
                user_id=user_id,
                delta=-price,
                balance_after=None,
                reason="desktop_app_subscribe",
                app_id=app_id,
                is_family_waiver=True,
            )
        )
        await _upsert_paid_entitlement(db, user_id=user_id, app_id=app_id, subscription_ends_at=sub_end, now=now)
        return

    ures = await db.execute(select(User).where(User.id == user_id).with_for_update())
    user_row = ures.scalar_one_or_none()
    if user_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    bal = int(getattr(user_row, "ew_balance", 0) or 0)
    if bal < price:
        raise HTTPException(
            status_code=402,
            detail=json_safe_api_detail(
                {
                    "message": "Недостаточно EW для подписки на это приложение",
                    "ew_balance": bal,
                    "required": price,
                    "app_id": app_id,
                }
            ),
        )
    user_row.ew_balance = bal - price  # type: ignore[assignment]
    db.add(
        UserEwLedger(
            user_id=user_id,
            delta=-price,
            balance_after=user_row.ew_balance,
            reason="desktop_app_subscribe",
            app_id=app_id,
            is_family_waiver=False,
        )
    )
    await _upsert_paid_entitlement(db, user_id=user_id, app_id=app_id, subscription_ends_at=sub_end, now=now)


async def _apply_desktop_store_billing_for_install(
    db: AsyncSession,
    *,
    user_id: UUID,
    catalog: DesktopAppCatalog,
    current_user: AuthUser,
) -> None:
    now = datetime.now(UTC)
    if _catalog_billing_exempt(catalog):
        await _ensure_exempt_entitlement(db, user_id=user_id, app_id=catalog.app_id, now=now)
        return

    price = int(getattr(catalog, "ew_monthly_price", 0) or 0)
    trial_days = int(getattr(catalog, "trial_duration_days", 0) or 0)

    res = await db.execute(
        select(UserDesktopAppEntitlement).where(
            UserDesktopAppEntitlement.user_id == user_id,
            UserDesktopAppEntitlement.app_id == catalog.app_id,
        )
    )
    ent = res.scalar_one_or_none()

    if ent is not None and _entitlement_access_ok(ent, now):
        return

    if ent is None and trial_days > 0:
        trial_end = now + timedelta(days=trial_days)
        ins_trial = (
            pg_insert(UserDesktopAppEntitlement)
            .values(
                user_id=user_id,
                app_id=catalog.app_id,
                status=ENTITLEMENT_TRIAL,
                trial_ends_at=trial_end,
                subscription_ends_at=trial_end,
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_nothing(
                index_elements=[UserDesktopAppEntitlement.user_id, UserDesktopAppEntitlement.app_id],
            )
        )
        await db.execute(ins_trial)
        return

    await _charge_ew_monthly_subscription(
        db,
        user_id=user_id,
        app_id=catalog.app_id,
        price=price,
        current_user=current_user,
        now=now,
    )


async def _user_can_install_after_billing(
    db: AsyncSession,
    user_id: UUID,
    catalog: DesktopAppCatalog,
    current_user: AuthUser,
) -> bool:
    now = datetime.now(UTC)
    if _catalog_billing_exempt(catalog):
        return True
    trial_days = int(getattr(catalog, "trial_duration_days", 0) or 0)
    price = int(getattr(catalog, "ew_monthly_price", 0) or 0)
    res = await db.execute(
        select(UserDesktopAppEntitlement).where(
            UserDesktopAppEntitlement.user_id == user_id,
            UserDesktopAppEntitlement.app_id == catalog.app_id,
        )
    )
    ent = res.scalar_one_or_none()
    if ent is not None and _entitlement_access_ok(ent, now):
        return True
    if ent is None and trial_days > 0:
        return True
    if current_user.ew_family:
        return True
    bal_row = await db.execute(select(User.ew_balance).where(User.id == user_id))
    bal = bal_row.scalar_one_or_none()
    if bal is None:
        return False
    return int(bal) >= price


def _catalog_show_new_badge(c: DesktopAppCatalog) -> bool:
    """Бейдж «Новое»: флаг и опциональный срок (после new_until — скрыть)."""
    if not bool(getattr(c, "is_featured_new", False)):
        return False
    nu = getattr(c, "new_until", None)
    if nu is None:
        return True
    now = datetime.now(UTC)
    if nu.tzinfo is None:
        nu = nu.replace(tzinfo=UTC)
    return nu > now


def _catalog_store_sort_key(c: DesktopAppCatalog) -> tuple[int, int, str]:
    """Новинки с активным бейджем выше, затем sort_order и имя."""
    new_first = 0 if _catalog_show_new_badge(c) else 1
    name = str(getattr(c, "name", "") or "")
    return (new_first, int(getattr(c, "sort_order", None) or 0), name)


@router.get("/ew-wallet", response_model=EwWalletResponse)
async def get_ew_wallet(
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Current user's Elite Worlds balance and family flag (for desktop store UI)."""
    res = await db.execute(select(User.ew_balance).where(User.id == user_id))
    bal = res.scalar_one_or_none()
    if bal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return EwWalletResponse(ew_balance=int(bal), ew_family=bool(current_user.ew_family))


@router.get("/store", response_model=StoreResponse)
async def get_store(
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """List catalog apps visible to current user (by role and access group) with installed flag."""
    d = _desktop()
    await d._cleanup_legacy_desktop_state(db, user_id=user_id)
    await d._enforce_user_installed_apps_policy(db, user_id=user_id, current_user=current_user)
    await d._ensure_factory_apps_installed(db, user_id=user_id, current_user=current_user)
    catalog_result = await db.execute(select(DesktopAppCatalog).options(selectinload(DesktopAppCatalog.access_groups)))
    catalog = sorted(
        catalog_result.scalars().all(),
        key=_catalog_store_sort_key,
    )

    installed_result = await db.execute(select(UserInstalledApp.app_id).where(UserInstalledApp.user_id == user_id))
    installed_app_ids = set(installed_result.scalars().all())

    apps = []
    for c in catalog:
        if d._is_legacy_hidden_desktop_item(c.app_id, c.app_component):
            continue
        if not d._user_can_see_app(c, current_user):
            continue
        group_refs = [DesktopAccessGroupRef.model_validate(g) for g in c.access_groups]
        ew_monthly_price, trial_duration_days, billing_exempt = _store_billing_fields(c)
        show_nb = _catalog_show_new_badge(c)
        apps.append(
            StoreAppResponse(
                app_id=c.app_id,
                name=c.name,
                description=c.description,
                app_component=c.app_component,
                category=c.category,
                gradient=c.gradient,
                color=c.color,
                sort_order=c.sort_order,
                allow_multiple_windows=bool(getattr(c, "allow_multiple_windows", False)),
                max_window_instances=(
                    int(getattr(c, "max_window_instances", 1) or 1)
                    if bool(getattr(c, "allow_multiple_windows", False))
                    else 1
                ),
                installed=(c.app_id == d.APP_STORE_APP_ID) or (c.app_id in installed_app_ids),
                is_system=getattr(c, "is_system", False),
                is_factory=getattr(c, "is_factory", False),
                can_uninstall=_catalog_can_uninstall(c),
                ew_monthly_price=ew_monthly_price,
                trial_duration_days=trial_duration_days,
                billing_exempt=billing_exempt,
                access_groups=group_refs,
                is_featured_new=bool(getattr(c, "is_featured_new", False)),
                new_until=getattr(c, "new_until", None),
                show_new_badge=show_nb,
                maintenance_mode=bool(getattr(c, "maintenance_mode", False)),
                maintenance_title=getattr(c, "maintenance_title", None),
                maintenance_reason=getattr(c, "maintenance_reason", None),
                maintenance_expected_outcome=getattr(c, "maintenance_expected_outcome", None),
                maintenance_eta_note=getattr(c, "maintenance_eta_note", None),
                icon_url=getattr(c, "icon_url", None),
                icon_url_2x=getattr(c, "icon_url_2x", None),
                preview_url=getattr(c, "preview_url", None),
                preview_url_2x=getattr(c, "preview_url_2x", None),
            )
        )
    return StoreResponse(apps=apps)


@router.get("/store/{app_id}", response_model=StoreAppDetailResponse)
async def get_store_app(
    app_id: str,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Get one catalog app by app_id; 404 if not found or no access."""
    d = _desktop()
    await d._cleanup_legacy_desktop_state(db, user_id=user_id)
    await d._enforce_user_installed_apps_policy(db, user_id=user_id, current_user=current_user)
    await d._ensure_factory_apps_installed(db, user_id=user_id, current_user=current_user)
    catalog_result = await db.execute(
        select(DesktopAppCatalog)
        .options(selectinload(DesktopAppCatalog.access_groups))
        .where(DesktopAppCatalog.app_id == app_id)
    )
    c = catalog_result.scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="App not found")
    if d._is_legacy_hidden_desktop_item(c.app_id, c.app_component):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="App not found")
    if not d._user_can_see_app(c, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="App not found")
    installed_result = await db.execute(
        select(UserInstalledApp).where(
            UserInstalledApp.user_id == user_id,
            UserInstalledApp.app_id == app_id,
        )
    )
    installed = installed_result.scalar_one_or_none() is not None or app_id == d.APP_STORE_APP_ID
    can_uninstall = _catalog_can_uninstall(c)
    can_install = await _user_can_install_after_billing(db, user_id, c, current_user)
    ew_monthly_price, trial_duration_days, billing_exempt = _store_billing_fields(c)
    group_refs = [DesktopAccessGroupRef.model_validate(g) for g in c.access_groups]
    show_nb = _catalog_show_new_badge(c)
    return StoreAppDetailResponse(
        app_id=c.app_id,
        name=c.name,
        description=c.description,
        app_component=c.app_component,
        category=c.category,
        gradient=c.gradient,
        color=c.color,
        sort_order=c.sort_order,
        allow_multiple_windows=bool(getattr(c, "allow_multiple_windows", False)),
        max_window_instances=(
            int(getattr(c, "max_window_instances", 1) or 1) if bool(getattr(c, "allow_multiple_windows", False)) else 1
        ),
        installed=installed,
        is_system=getattr(c, "is_system", False),
        is_factory=getattr(c, "is_factory", False),
        ew_monthly_price=ew_monthly_price,
        trial_duration_days=trial_duration_days,
        billing_exempt=billing_exempt,
        access_groups=group_refs,
        is_featured_new=bool(getattr(c, "is_featured_new", False)),
        new_until=getattr(c, "new_until", None),
        show_new_badge=show_nb,
        maintenance_mode=bool(getattr(c, "maintenance_mode", False)),
        maintenance_title=getattr(c, "maintenance_title", None),
        maintenance_reason=getattr(c, "maintenance_reason", None),
        maintenance_expected_outcome=getattr(c, "maintenance_expected_outcome", None),
        maintenance_eta_note=getattr(c, "maintenance_eta_note", None),
        icon_url=getattr(c, "icon_url", None),
        icon_url_2x=getattr(c, "icon_url_2x", None),
        preview_url=getattr(c, "preview_url", None),
        preview_url_2x=getattr(c, "preview_url_2x", None),
        can_install=can_install,
        can_uninstall=can_uninstall,
    )


@router.get(
    "/installed",
    response_model=InstalledResponse,
    responses={304: {"description": "Not Modified — If-None-Match matched ETag."}},
)
async def get_installed(
    request: Request,
    response: Response,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """List app_ids installed for current user. App Store is always included."""
    d = _desktop()
    await d._cleanup_legacy_desktop_state(db, user_id=user_id)
    await d._enforce_user_installed_apps_policy(db, user_id=user_id, current_user=current_user)
    await d._ensure_factory_apps_installed(db, user_id=user_id, current_user=current_user)
    result = await db.execute(select(UserInstalledApp.app_id).where(UserInstalledApp.user_id == user_id))
    app_ids = [aid for aid in result.scalars().all() if not d._is_legacy_hidden_app_id(aid)]
    if d.APP_STORE_APP_ID not in app_ids:
        app_ids.append(d.APP_STORE_APP_ID)
    payload = InstalledResponse(app_ids=app_ids)
    etag = _weak_etag_for_pydantic_model(payload)
    response.headers["ETag"] = etag
    if _if_none_match_matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})
    return payload


@router.post("/installed", status_code=status.HTTP_204_NO_CONTENT)
async def install_app(
    data: InstalledInstallBody,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Install an app for current user (add to user_installed_apps). Visible apps only."""
    d = _desktop()
    if d._is_legacy_hidden_app_id(data.app_id):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="App is deprecated and no longer available for installation",
        )
    catalog_result = await db.execute(
        select(DesktopAppCatalog)
        .options(selectinload(DesktopAppCatalog.access_groups))
        .where(DesktopAppCatalog.app_id == data.app_id)
    )
    catalog_row = catalog_result.scalar_one_or_none()
    if catalog_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="App not found in catalog",
        )
    if d._is_legacy_hidden_desktop_item(catalog_row.app_id, catalog_row.app_component):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="App is deprecated and no longer available for installation",
        )
    if not d._user_can_see_app(catalog_row, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this app",
        )
    if bool(getattr(catalog_row, "maintenance_mode", False)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Приложение временно недоступно для установки",
        )
    existing = await db.execute(
        select(UserInstalledApp).where(
            UserInstalledApp.user_id == user_id,
            UserInstalledApp.app_id == data.app_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return None
    await _apply_desktop_store_billing_for_install(
        db,
        user_id=user_id,
        catalog=catalog_row,
        current_user=current_user,
    )
    uia = UserInstalledApp(user_id=user_id, app_id=data.app_id)
    db.add(uia)
    await db.commit()


@router.delete("/installed/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
async def uninstall_app(
    app_id: str,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Uninstall an app for current user.

    App Store cannot be uninstalled. Also removes matching DesktopItem entries for this user
    so иконки приложения исчезают с рабочего стола после деинсталляции.
    """
    d = _desktop()
    if app_id == d.APP_STORE_APP_ID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Магазин приложений нельзя удалить",
        )
    catalog_check = await db.execute(select(DesktopAppCatalog).where(DesktopAppCatalog.app_id == app_id))
    catalog_meta = catalog_check.scalar_one_or_none()
    if catalog_meta is not None and getattr(catalog_meta, "is_system", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Админское приложение нельзя удалить",
        )
    if catalog_meta is not None and getattr(catalog_meta, "is_factory", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Заводское приложение нельзя удалить",
        )
    await db.execute(
        delete(UserInstalledApp).where(
            UserInstalledApp.user_id == user_id,
            UserInstalledApp.app_id == app_id,
        )
    )

    config_id_result = await db.execute(select(DesktopConfig.id).where(DesktopConfig.user_id == user_id))
    config_id = config_id_result.scalar_one_or_none()
    if config_id is not None:
        await db.execute(
            delete(DesktopItem).where(
                DesktopItem.config_id == config_id,
                DesktopItem.item_id == app_id,
                DesktopItem.item_type == ItemType.APP,
            )
        )

    await db.commit()
