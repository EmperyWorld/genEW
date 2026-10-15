# ---
# EliteEW · Empery World
# https://eliteew.ru
# Author: po&T <keysray70@gmail.com>
# ---
# Purpose:
# ORM модели рабочего стола: конфиг, виджеты, приложения из каталога, избранное и связи.
# Invariants:
# - DateTime без TZ: default/onupdate через utc_now_naive (семантика UTC).
# Related:
# - `database_models.Base`; роутеры/сервисы desktop.
# ---

"""
Desktop Models — SQLAlchemy models for Elite Desktop.
"""

import enum
from uuid import uuid4

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from api.models.database_models import Base
from api.utils.datetime_helpers import utc_now_naive

desktop_app_catalog_access_groups = Table(
    "desktop_app_catalog_access_groups",
    Base.metadata,
    Column(
        "catalog_id",
        PGUUID(as_uuid=True),
        ForeignKey("desktop_app_catalog.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "access_group_id",
        PGUUID(as_uuid=True),
        ForeignKey("app_access_groups.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class IconSize(enum.StrEnum):
    SMALL = "SMALL"
    MEDIUM = "MEDIUM"
    LARGE = "LARGE"


class Theme(enum.StrEnum):
    DARK = "DARK"
    LIGHT = "LIGHT"
    AUTO = "AUTO"


class ItemType(enum.StrEnum):
    FOLDER = "FOLDER"
    APP = "APP"
    FILE = "FILE"


# Default SPA wallpaper (bundled in `web/frontend/public/desktop-wallpapers/1.webp`).
DEFAULT_DESKTOP_WALLPAPER = "/desktop-wallpapers/1.webp"


class DesktopConfig(Base):
    """User's desktop configuration"""

    __tablename__ = "desktop_configs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )

    wallpaper = Column(
        Text,
        nullable=False,
        default=DEFAULT_DESKTOP_WALLPAPER,
    )
    icon_size = Column(SQLEnum(IconSize), nullable=False, default=IconSize.MEDIUM)
    show_widget = Column(Boolean, nullable=False, default=False)
    widget_position = Column(JSON, nullable=False, default={"x": 20, "y": 20})
    theme = Column(SQLEnum(Theme), nullable=False, default=Theme.DARK)
    accent_color = Column(String(32), nullable=False, default="purple")
    live_wallpaper = Column(Boolean, nullable=False, default=False)
    snap_to_grid = Column(Boolean, nullable=False, default=True)
    grid_step = Column(String(16), nullable=False, default="medium")
    widgets_panel_position = Column(String(32), nullable=False, default="top-right")
    compact_widgets = Column(Boolean, nullable=False, default=False)
    show_widgets_panel = Column(Boolean, nullable=False, default=False)
    # History of wallpapers for this user (list of strings, most recent first).
    wallpapers_history = Column(JSON, nullable=False, default=list)
    # Launcher / session state (recent apps, virtual desktops, window layout, DND, clock…).
    shell_state = Column(JSON, nullable=False, default=dict)

    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    updated_at = Column(DateTime, nullable=False, default=utc_now_naive, onupdate=utc_now_naive)

    # Relationships
    user = relationship("User", back_populates="desktop_config")
    items = relationship("DesktopItem", back_populates="config", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<DesktopConfig(user_id={self.user_id})>"


class DesktopItem(Base):
    """Desktop item (folder, app shortcut, file)"""

    __tablename__ = "desktop_items"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    config_id = Column(
        PGUUID(as_uuid=True), ForeignKey("desktop_configs.id", ondelete="CASCADE"), nullable=False, index=True
    )

    item_id = Column(String(100), nullable=False)  # Unique ID within user's desktop
    item_type = Column(SQLEnum(ItemType), nullable=False)
    name = Column(String(255), nullable=False)

    is_system = Column(Boolean, nullable=False, default=False)
    system_key = Column(String(64), nullable=True)

    position = Column(JSON, nullable=False, default={"x": 20, "y": 20})
    color = Column(String(50), nullable=True)
    gradient = Column(String(100), nullable=True)
    is_pinned = Column(Boolean, nullable=False, default=False)

    # For apps
    app_component = Column(String(100), nullable=True)

    # For folders - parent folder
    parent_id = Column(PGUUID(as_uuid=True), ForeignKey("desktop_items.id", ondelete="CASCADE"), nullable=True)

    # Arbitrary metadata (e.g. project_guard_released for eliteew-proj-* folders).
    meta = Column(JSON, nullable=False, default=dict)

    # Metadata
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    updated_at = Column(DateTime, nullable=False, default=utc_now_naive, onupdate=utc_now_naive)

    # Relationships
    config = relationship("DesktopConfig", back_populates="items")
    parent = relationship("DesktopItem", remote_side=[id], back_populates="children")
    children = relationship("DesktopItem", back_populates="parent", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<DesktopItem(item_id={self.item_id}, name={self.name})>"


class AppAccessGroup(Base):
    """Group controlling which desktop apps a user can see and install."""

    __tablename__ = "app_access_groups"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    updated_at = Column(DateTime, nullable=False, default=utc_now_naive, onupdate=utc_now_naive)

    catalog_apps = relationship(
        "DesktopAppCatalog",
        secondary=desktop_app_catalog_access_groups,
        back_populates="access_groups",
    )
    users = relationship("User", back_populates="app_access_group")

    def __repr__(self) -> str:
        return f"<AppAccessGroup(id={self.id}, name={self.name})>"


class DesktopAppCatalog(Base):
    """Catalog of apps available in the desktop app store (shared)."""

    __tablename__ = "desktop_app_catalog"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    app_id = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(String(500), nullable=True)
    app_component = Column(String(100), nullable=False)
    category = Column(String(64), nullable=False, default="productivity")
    gradient = Column(String(100), nullable=True)
    color = Column(String(50), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    allow_multiple_windows = Column(Boolean, nullable=False, default=False, server_default="false")
    max_window_instances = Column(Integer, nullable=False, default=1, server_default="1")

    is_system = Column(Boolean, nullable=False, default=False)
    is_factory = Column(Boolean, nullable=False, default=False, server_default="false")
    ew_monthly_price = Column(Integer, nullable=False, default=0, server_default="0")
    trial_duration_days = Column(Integer, nullable=False, default=0, server_default="0")

    is_featured_new = Column(Boolean, nullable=False, default=False, server_default="false")
    new_until = Column(DateTime(timezone=True), nullable=True)
    maintenance_mode = Column(Boolean, nullable=False, default=False, server_default="false")
    maintenance_title = Column(Text, nullable=True)
    maintenance_reason = Column(Text, nullable=True)
    maintenance_expected_outcome = Column(Text, nullable=True)
    maintenance_eta_note = Column(Text, nullable=True)

    icon_url = Column(Text, nullable=True)
    icon_url_2x = Column(Text, nullable=True)
    preview_url = Column(Text, nullable=True)
    preview_url_2x = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    updated_at = Column(DateTime, nullable=False, default=utc_now_naive, onupdate=utc_now_naive)

    access_groups = relationship(
        "AppAccessGroup",
        secondary=desktop_app_catalog_access_groups,
        back_populates="catalog_apps",
    )

    def __repr__(self) -> str:
        return f"<DesktopAppCatalog(app_id={self.app_id}, name={self.name})>"


class UserDesktopAppEntitlement(Base):
    """Per-user billing / trial window for a catalog app (install eligibility)."""

    __tablename__ = "user_desktop_app_entitlements"

    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    app_id = Column(
        String(100),
        ForeignKey("desktop_app_catalog.app_id", ondelete="CASCADE"),
        primary_key=True,
    )
    # exempt | trial | paid
    status = Column(String(20), nullable=False)
    trial_ends_at = Column(DateTime(timezone=True), nullable=True)
    subscription_ends_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now_naive, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=utc_now_naive,
        onupdate=utc_now_naive,
        nullable=False,
    )


class UserEwLedger(Base):
    """Audit trail for EW balance changes (desktop store)."""

    __tablename__ = "user_ew_ledger"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    delta = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=True)
    reason = Column(Text, nullable=False)
    app_id = Column(String(100), nullable=True)
    is_family_waiver = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now_naive, nullable=False, index=True)


class UserInstalledApp(Base):
    """Per-user installed apps (access control)."""

    __tablename__ = "user_installed_apps"

    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, nullable=False)
    app_id = Column(
        String(100), ForeignKey("desktop_app_catalog.app_id", ondelete="CASCADE"), primary_key=True, nullable=False
    )
    installed_at = Column(DateTime, nullable=False, default=utc_now_naive)

    user = relationship("User", back_populates="installed_apps")
    catalog_app = relationship("DesktopAppCatalog", back_populates="installed_by_users")

    def __repr__(self) -> str:
        return f"<UserInstalledApp(user_id={self.user_id}, app_id={self.app_id})>"


# Back-reference on catalog for installed_by_users (optional, for queries)
DesktopAppCatalog.installed_by_users = relationship(
    "UserInstalledApp", back_populates="catalog_app", cascade="all, delete-orphan"
)


class SiteStudioStatus(enum.StrEnum):
    DRAFT = "draft"
    PROVISIONING = "provisioning"
    RUNNING = "running"
    STOPPED = "stopped"
    FAILED = "failed"
    REDEPLOYING = "redeploying"
    STARTING = "starting"
    STOPPING = "stopping"


class SiteStudioPublicationState(enum.StrEnum):
    OPEN = "open"
    CLOSED = "closed"


class UserSiteInstance(Base):
    """Single per-user site studio runtime metadata."""

    __tablename__ = "user_site_instances"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    template_key = Column(String(100), nullable=False, default="olenti")
    site_slug = Column(String(150), nullable=False, unique=True, index=True)
    site_title = Column(String(255), nullable=False)
    site_topic = Column(String(255), nullable=False, default="")
    brief_json = Column(JSON, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default=SiteStudioStatus.DRAFT.value)

    public_hostname = Column(String(255), nullable=False, unique=True, index=True)
    publication_state = Column(
        String(16),
        nullable=False,
        default=SiteStudioPublicationState.OPEN.value,
    )
    public_url = Column(Text, nullable=True)
    api_base_url = Column(Text, nullable=True)
    opened_at = Column(DateTime, nullable=True, default=utc_now_naive)
    closed_at = Column(DateTime, nullable=True)

    admin_email = Column(String(255), nullable=True)
    admin_password_encrypted = Column(Text, nullable=True)

    runtime_dir = Column(Text, nullable=True)
    source_dir = Column(Text, nullable=True)
    env_dir = Column(Text, nullable=True)
    compose_file_path = Column(Text, nullable=True)
    compose_project_name = Column(String(120), nullable=True)

    ports_json = Column(JSON, nullable=False, default=dict)
    db_name = Column(String(120), nullable=True)
    last_error = Column(Text, nullable=True)
    last_provisioned_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    updated_at = Column(DateTime, nullable=False, default=utc_now_naive, onupdate=utc_now_naive)

    user = relationship("User", back_populates="site_instance")

    def __repr__(self) -> str:
        return f"<UserSiteInstance(user_id={self.user_id}, slug={self.site_slug}, status={self.status})>"


class ProjectSiteInstance(Base):
    """KIRS: one Site Studio runtime per marketing project; owned by agency operator (owner_user_id)."""

    __tablename__ = "project_site_instances"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    owner_user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    marketing_project_id = Column(PGUUID(as_uuid=True), nullable=False, unique=True, index=True)
    template_key = Column(String(100), nullable=False, default="olenti")
    site_slug = Column(String(150), nullable=False, unique=True, index=True)
    site_title = Column(String(255), nullable=False)
    site_topic = Column(String(255), nullable=False, default="")
    brief_json = Column(JSON, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default=SiteStudioStatus.DRAFT.value)

    public_hostname = Column(String(255), nullable=False, unique=True, index=True)
    publication_state = Column(
        String(16),
        nullable=False,
        default=SiteStudioPublicationState.OPEN.value,
    )
    public_url = Column(Text, nullable=True)
    api_base_url = Column(Text, nullable=True)
    opened_at = Column(DateTime, nullable=True, default=utc_now_naive)
    closed_at = Column(DateTime, nullable=True)

    admin_email = Column(String(255), nullable=True)
    admin_password_encrypted = Column(Text, nullable=True)

    runtime_dir = Column(Text, nullable=True)
    source_dir = Column(Text, nullable=True)
    env_dir = Column(Text, nullable=True)
    compose_file_path = Column(Text, nullable=True)
    compose_project_name = Column(String(120), nullable=True)

    ports_json = Column(JSON, nullable=False, default=dict)
    db_name = Column(String(120), nullable=True)
    last_error = Column(Text, nullable=True)
    last_provisioned_at = Column(DateTime, nullable=True)

    client_access_json = Column(JSON, nullable=False, default=dict)

    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    updated_at = Column(DateTime, nullable=False, default=utc_now_naive, onupdate=utc_now_naive)

    owner = relationship("User", foreign_keys=[owner_user_id])

    def __repr__(self) -> str:
        return (
            f"<ProjectSiteInstance(project={self.marketing_project_id}, slug={self.site_slug}, status={self.status})>"
        )


class DesktopWidgetNote(Base):
    """Desktop sticky notes widget - persisted per user."""

    __tablename__ = "desktop_widget_notes"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=False, default="")
    color = Column(String(50), nullable=False, default="yellow")
    position = Column(JSON, nullable=False, default={"x": 0, "y": 0})
    tags = Column(JSON, nullable=False, default=[])
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    updated_at = Column(DateTime, nullable=False, default=utc_now_naive, onupdate=utc_now_naive)


class DesktopWidgetTodo(Base):
    """Desktop todo widget - persisted per user."""

    __tablename__ = "desktop_widget_todos"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(Text, nullable=False)
    completed = Column(Boolean, nullable=False, default=False)
    priority = Column(String(20), nullable=False, default="medium")
    tags = Column(JSON, nullable=False, default=[])
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    updated_at = Column(DateTime, nullable=False, default=utc_now_naive, onupdate=utc_now_naive)


class UserDashboardFavorite(Base):
    """Dashboard favorites widget - persisted per user (was localStorage dashboard_favorites)."""

    __tablename__ = "user_dashboard_favorites"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    url = Column(String(1000), nullable=False, default="#")
    icon = Column(String(100), nullable=False, default="star")
    color = Column(String(200), nullable=False, default="from-pink-500/20 to-rose-500/20")
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
