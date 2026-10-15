"""Domain-aware scaffold templates for ServiceScaffoldAction."""

from __future__ import annotations

import json
from typing import Any

from services.empery_intelligence_core.src.integration.service_scaffold import (
    _entity_name_from_hint,
    _event_prefix,
    _route_slug,
    _snake_case,
    _use_case_class_name,
)


def marketing_file_map(
    action: Any,
    service_name: str,
    *,
    features: list[str],
    port: int,
    domain_hint: str,
) -> dict[str, str]:
    from services.empery_intelligence_core.src.integration import (
        service_scaffold_companion as companion_mod,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        manifest_ui_block,
    )

    env_prefix = service_name.upper()
    use_case_class = _use_case_class_name(service_name)
    title = domain_hint.replace("_", " ").title()
    feat = list(features)
    for token in ("campaigns", "creatives", "audience_segments", "postgres"):
        if token not in feat:
            feat.append(token)
    manifest = {
        "name": service_name,
        "version": "0.1.0",
        "features": feat,
        "entry_point": "src/api/main.py",
        "dependencies": [],
        "publishes": [
            "marketing.campaign.created",
            "marketing.creative.created",
            "marketing.segment.created",
        ],
        "subscribes": [],
        "ui": manifest_ui_block(service_name, required=True),
    }
    return {
        "manifest.json": json.dumps(manifest, indent=2) + "\n",
        "config.py": _domain_production_config(service_name, port, env_prefix),
        "src/core/contracts.py": _marketing_contracts(service_name),
        "src/core/models.py": _MARKETING_MODELS,
        "src/core/use_cases.py": _marketing_use_cases(service_name, use_case_class),
        "src/data/schemas.py": _marketing_schemas(service_name),
        "src/data/orm.py": _marketing_orm(),
        "src/data/repository.py": _marketing_postgres_repository(service_name),
        "src/integration/__init__.py": _INTEGRATION_INIT,
        "src/api/routes.py": _marketing_routes(service_name, use_case_class),
        "src/api/main.py": _marketing_production_main(
            service_name, env_prefix, use_case_class, title
        ),
        "alembic.ini": companion_mod._alembic_ini(service_name),  # noqa: SLF001
        "alembic/env.py": companion_mod._alembic_env(service_name),  # noqa: SLF001
        "alembic/script.py.mako": companion_mod._ALEMBIC_MAKO,  # noqa: SLF001
        "alembic/versions/0001_create_marketing_tables.py": _marketing_alembic_revision(
            service_name
        ),
        "tests/test_health.py": action.health_test_py(service_name),
        "tests/test_marketing_domain.py": _marketing_test(service_name),
    }


def generic_domain_file_map(
    action: Any,
    service_name: str,
    *,
    features: list[str],
    port: int,
    domain_hint: str,
) -> dict[str, str]:
    from services.empery_intelligence_core.src.integration import (
        service_scaffold_companion as companion_mod,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        manifest_ui_block,
    )

    env_prefix = service_name.upper()
    use_case_class = _use_case_class_name(service_name)
    entity = _entity_name_from_hint(domain_hint)
    entity_snake = _snake_case(entity)
    if entity == "Task":
        route_slug = "tasks"
        title = "Task board"
        domain_feature = "task_board"
    elif entity == "Metric":
        route_slug = "metrics"
        title = "Ops dashboard"
        domain_feature = "ops_dashboard"
    elif entity == "Report":
        route_slug = "reports"
        title = "Research reports"
        domain_feature = "research_report"
    else:
        route_slug = _route_slug(entity)
        title = domain_hint.replace("_", " ").title()
        domain_feature = entity_snake.replace("_", "-")
    event_prefix = _event_prefix(domain_hint, service_name)
    event_name = f"{event_prefix}.{entity_snake}.created"
    repo_class = f"{entity}Repository"
    repo_key = f"{entity_snake}_repository"
    feat = list(features)
    for token in (domain_feature, "postgres"):
        if token not in feat:
            feat.append(token)
    manifest = {
        "name": service_name,
        "version": "0.1.0",
        "features": feat,
        "entry_point": "src/api/main.py",
        "dependencies": [],
        "publishes": [event_name],
        "subscribes": [],
        "ui": manifest_ui_block(service_name, required=True),
    }
    return {
        "manifest.json": json.dumps(manifest, indent=2) + "\n",
        "config.py": _domain_production_config(service_name, port, env_prefix),
        "src/core/contracts.py": _generic_contracts(service_name, entity),
        "src/core/models.py": _generic_models(title, entity),
        "src/core/use_cases.py": _generic_use_cases(
            service_name,
            use_case_class,
            entity,
            entity_snake,
            repo_key,
            event_name,
        ),
        "src/data/schemas.py": _generic_schemas(entity),
        "src/data/orm.py": _generic_orm(entity, entity_snake),
        "src/data/repository.py": _generic_postgres_repository(
            service_name, entity, entity_snake
        ),
        "src/integration/__init__.py": _INTEGRATION_INIT,
        "src/api/routes.py": _generic_routes(
            service_name, use_case_class, entity, entity_snake, route_slug
        ),
        "src/api/main.py": _generic_production_main(
            service_name,
            env_prefix,
            use_case_class,
            title,
            entity,
            entity_snake,
            repo_key,
            repo_class,
        ),
        "alembic.ini": companion_mod._alembic_ini(service_name),  # noqa: SLF001
        "alembic/env.py": companion_mod._alembic_env(service_name),  # noqa: SLF001
        "alembic/script.py.mako": companion_mod._ALEMBIC_MAKO,  # noqa: SLF001
        f"alembic/versions/0001_create_{entity_snake}s.py": _generic_alembic_revision(
            service_name, entity_snake
        ),
        "tests/test_health.py": action.health_test_py(service_name),
        "tests/test_domain.py": _generic_test(service_name, entity_snake, route_slug),
    }


_INTEGRATION_INIT = '"""External adapters (none required for reflex scaffold)."""\n'


def _domain_production_config(service_name: str, port: int, env_prefix: str) -> str:
    return f'''"""Environment-specific configuration for {service_name}."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _csv_env(key: str, default: str) -> list[str]:
    raw = os.environ.get(key, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


def _database_url() -> str:
    return os.environ.get(
        "{env_prefix}_DATABASE_URL",
        os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://eworld:eworld@localhost:5432/{service_name}",
        ),
    )


class ServiceConfig(BaseModel):
    """Immutable runtime configuration."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "{service_name}"
    host: str = "0.0.0.0"
    port: int = {port}
    log_level: str = "INFO"
    database_url: str = Field(
        default="postgresql+psycopg://eworld:eworld@localhost:5432/{service_name}",
    )
    auto_create_tables: bool = False
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ],
    )


@lru_cache
def get_config() -> ServiceConfig:
    return ServiceConfig(
        host=_env("{env_prefix}_HOST", "0.0.0.0"),
        port=int(_env("{env_prefix}_PORT", _env("PORT", "{port}"))),
        log_level=_env("LOG_LEVEL", "INFO"),
        database_url=_database_url(),
        auto_create_tables=_env("AUTO_CREATE_TABLES", "false").lower()
        in {{"1", "true", "yes"}},
        cors_origins=_csv_env(
            "{env_prefix}_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174,"
            "http://127.0.0.1:5173,http://localhost:5173",
        ),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
'''


def _marketing_orm() -> str:
    return '''"""SQLAlchemy ORM for marketing campaigns, creatives, and segments."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON, Uuid


class Base(DeclarativeBase):
    """Declarative base for marketing tables."""


class CampaignRow(Base):
    __tablename__ = "marketing_campaigns"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    objective: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    segment_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    creative_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class CreativeRow(Base):
    __tablename__ = "marketing_creatives"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    format: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class AudienceSegmentRow(Base):
    __tablename__ = "marketing_segments"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    criteria: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    estimated_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
'''


def _marketing_postgres_repository(service_name: str) -> str:
    return f'''"""Postgres-backed marketing repository for {service_name}."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select

from core.data.database import DatabaseManager
from services.{service_name}.src.core.models import CampaignStatus, CreativeFormat
from services.{service_name}.src.data.orm import (
    AudienceSegmentRow,
    CampaignRow,
    CreativeRow,
)
from services.{service_name}.src.data.schemas import (
    AudienceSegmentCreate,
    AudienceSegmentView,
    CampaignCreate,
    CampaignView,
    CreativeCreate,
    CreativeView,
)


class MarketingRepository:
    def __init__(self, database: DatabaseManager) -> None:
        self._db = database

    def _campaign_view(self, row: CampaignRow) -> CampaignView:
        created = row.created_at
        updated = row.updated_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        return CampaignView(
            id=row.id,  # type: ignore[arg-type]
            name=row.name,
            objective=row.objective,
            status=CampaignStatus(row.status),
            segment_ids=list(row.segment_ids or []),
            creative_ids=list(row.creative_ids or []),
            created_at=created,
            updated_at=updated,
        )

    def _creative_view(self, row: CreativeRow) -> CreativeView:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return CreativeView(
            id=row.id,  # type: ignore[arg-type]
            name=row.name,
            format=CreativeFormat(row.format),
            content=dict(row.content or {{}}),
            created_at=created,
        )

    def _segment_view(self, row: AudienceSegmentRow) -> AudienceSegmentView:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return AudienceSegmentView(
            id=row.id,  # type: ignore[arg-type]
            name=row.name,
            criteria=dict(row.criteria or {{}}),
            estimated_size=int(row.estimated_size),
            created_at=created,
        )

    async def create_campaign(self, payload: CampaignCreate) -> CampaignView:
        now = datetime.now(timezone.utc)
        with self._db.session_scope() as session:
            row = CampaignRow(
                name=payload.name,
                objective=payload.objective,
                status=payload.status.value,
                segment_ids=[str(x) for x in payload.segment_ids],
                creative_ids=[str(x) for x in payload.creative_ids],
                created_at=now,
                updated_at=now,
            )
            session.add(row)
            session.flush()
            return self._campaign_view(row)

    async def list_campaigns(self, *, limit: int = 50) -> list[CampaignView]:
        with self._db.session_scope() as session:
            rows = list(
                session.scalars(
                    select(CampaignRow)
                    .order_by(CampaignRow.created_at.desc())
                    .limit(max(1, min(limit, 200)))
                ).all()
            )
            return [self._campaign_view(r) for r in rows]

    async def get_campaign(self, campaign_id: UUID) -> CampaignView | None:
        with self._db.session_scope() as session:
            row = session.get(CampaignRow, campaign_id)
            return self._campaign_view(row) if row is not None else None

    async def create_creative(self, payload: CreativeCreate) -> CreativeView:
        with self._db.session_scope() as session:
            row = CreativeRow(
                name=payload.name,
                format=payload.format.value,
                content=dict(payload.content),
            )
            session.add(row)
            session.flush()
            return self._creative_view(row)

    async def list_creatives(self, *, limit: int = 50) -> list[CreativeView]:
        with self._db.session_scope() as session:
            rows = list(
                session.scalars(
                    select(CreativeRow)
                    .order_by(CreativeRow.created_at.desc())
                    .limit(max(1, min(limit, 200)))
                ).all()
            )
            return [self._creative_view(r) for r in rows]

    async def create_segment(
        self, payload: AudienceSegmentCreate
    ) -> AudienceSegmentView:
        with self._db.session_scope() as session:
            row = AudienceSegmentRow(
                name=payload.name,
                criteria=dict(payload.criteria),
                estimated_size=payload.estimated_size,
            )
            session.add(row)
            session.flush()
            return self._segment_view(row)

    async def list_segments(
        self, *, limit: int = 50
    ) -> list[AudienceSegmentView]:
        with self._db.session_scope() as session:
            rows = list(
                session.scalars(
                    select(AudienceSegmentRow)
                    .order_by(AudienceSegmentRow.created_at.desc())
                    .limit(max(1, min(limit, 200)))
                ).all()
            )
            return [self._segment_view(r) for r in rows]
'''


def _marketing_production_main(
    service_name: str, env_prefix: str, use_case_class: str, title: str
) -> str:
    return f'''"""FastAPI entry point and registry registration for {service_name}."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.cors import apply_lab_cors
from core.api.responses import register_standard_error_handlers
from core.container import ServiceContainer
from core.data.database import DatabaseManager, register_sqlite_fk_pragma
from core.event_bus import (
    EventBus,
    create_event_bus,
    ensure_event_bus_started,
    ensure_event_bus_stopped,
)
from core.logging import configure_logging
from core.registry import (
    GlobalServiceRegistry,
    ServiceManifest,
    register_service_database_manager,
    resolve_service_database_manager,
)
from services.{service_name}.config import ServiceConfig, get_config
from services.{service_name}.src.api.routes import router
from services.{service_name}.src.core.use_cases import {use_case_class}
from services.{service_name}.src.data.orm import Base
from services.{service_name}.src.data.repository import MarketingRepository


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def _make_event_bus() -> EventBus:
    try:
        return create_event_bus()
    except RuntimeError:
        return EventBus()


def _wire_dependencies(container: ServiceContainer, config: ServiceConfig) -> None:
    logger = configure_logging(config.service_name)
    container.register("logger", lambda _c: logger)
    container.register("config", lambda _c: config)
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: _make_event_bus())
    register_service_database_manager(
        container, config.service_name, config.database_url
    )
    svc = config.service_name
    container.register(
        "marketing_repository",
        lambda c: MarketingRepository(resolve_service_database_manager(c, svc)),
    )
    container.register("service_use_cases", lambda c: {use_case_class}(c))


async def _bootstrap_database(
    container: ServiceContainer, config: ServiceConfig
) -> None:
    db: DatabaseManager = resolve_service_database_manager(
        container, config.service_name
    )
    if config.database_url.startswith("sqlite"):
        register_sqlite_fk_pragma(db.engine)
    if config.auto_create_tables or config.database_url.startswith("sqlite"):
        db.create_all(Base.metadata)


def create_app(
    container: ServiceContainer | None = None,
    config: ServiceConfig | None = None,
) -> FastAPI:
    runtime_config = config or get_config()
    app_container = container or ServiceContainer()
    _wire_dependencies(app_container, runtime_config)
    manifest = load_manifest()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await _bootstrap_database(app.state.container, runtime_config)
        await ensure_event_bus_started(app.state.container.resolve("event_bus"))
        try:
            yield
        finally:
            await ensure_event_bus_stopped(app.state.container.resolve("event_bus"))

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="Production marketing scaffold for {title}",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    register_standard_error_handlers(
        app,
        service_prefix="{env_prefix[:16]}",
        service_name=runtime_config.service_name,
    )
    app.include_router(router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    registry.register(load_manifest(), create_app)
'''


def _marketing_alembic_revision(service_name: str) -> str:
    return f'''"""create marketing tables for {service_name}

Revision ID: 0001
Revises:
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "marketing_campaigns",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("objective", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("segment_ids", sa.JSON(), nullable=False),
        sa.Column("creative_ids", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_table(
        "marketing_creatives",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("format", sa.String(length=32), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_table(
        "marketing_segments",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("criteria", sa.JSON(), nullable=False),
        sa.Column("estimated_size", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("marketing_segments")
    op.drop_table("marketing_creatives")
    op.drop_table("marketing_campaigns")
'''


def _generic_orm(entity: str, entity_snake: str) -> str:
    if entity == "Task":
        return '''"""SQLAlchemy ORM for task rows."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import Uuid


class Base(DeclarativeBase):
    """Declarative base for domain tables."""


class TaskRow(Base):
    __tablename__ = "tasks"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="todo")
    column: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
'''

    if entity == "Metric":
        return '''"""SQLAlchemy ORM for metric rows."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import Uuid


class Base(DeclarativeBase):
    """Declarative base for domain tables."""


class MetricRow(Base):
    __tablename__ = "metrics"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
'''

    if entity == "Report":
        return '''"""SQLAlchemy ORM for report rows."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import Uuid


class Base(DeclarativeBase):
    """Declarative base for domain tables."""


class ReportRow(Base):
    __tablename__ = "reports"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    topic: Mapped[str] = mapped_column(String(4000), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
'''

    table = f"{entity_snake}s"
    return f'''"""SQLAlchemy ORM for {entity_snake} rows."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON, Uuid


class Base(DeclarativeBase):
    """Declarative base for domain tables."""


class {entity}Row(Base):
    __tablename__ = "{table}"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    attributes: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
'''


def _generic_postgres_repository(service_name: str, entity: str, entity_snake: str) -> str:
    if entity == "Task":
        return f'''"""Postgres-backed task repository for {service_name}."""

from __future__ import annotations

from datetime import timezone

from sqlalchemy import select

from core.data.database import DatabaseManager
from services.{service_name}.src.data.orm import TaskRow
from services.{service_name}.src.data.schemas import TaskCreate, TaskView


class TaskRepository:
    def __init__(self, database: DatabaseManager) -> None:
        self._db = database

    def _to_view(self, row: TaskRow) -> TaskView:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return TaskView(
            id=row.id,  # type: ignore[arg-type]
            title=row.title,
            status=row.status,
            column=row.column,
            created_at=created,
        )

    async def create(self, payload: TaskCreate) -> TaskView:
        with self._db.session_scope() as session:
            row = TaskRow(
                title=payload.title,
                status=payload.status or "todo",
                column=payload.column,
            )
            session.add(row)
            session.flush()
            return self._to_view(row)

    async def list_items(self, *, limit: int = 50) -> list[TaskView]:
        with self._db.session_scope() as session:
            rows = list(
                session.scalars(
                    select(TaskRow)
                    .order_by(TaskRow.created_at.desc())
                    .limit(max(1, min(limit, 200)))
                ).all()
            )
            return [self._to_view(r) for r in rows]
'''
    if entity == "Metric":
        return f'''"""Postgres-backed metric repository for {service_name}."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from core.data.database import DatabaseManager
from services.{service_name}.src.data.orm import MetricRow
from services.{service_name}.src.data.schemas import MetricCreate, MetricView


class MetricRepository:
    def __init__(self, database: DatabaseManager) -> None:
        self._db = database

    def _to_view(self, row: MetricRow) -> MetricView:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        updated = row.updated_at
        if updated is not None and updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        return MetricView(
            id=row.id,  # type: ignore[arg-type]
            label=row.label,
            value=row.value,
            unit=row.unit,
            updated_at=updated,
            created_at=created,
        )

    async def create(self, payload: MetricCreate) -> MetricView:
        with self._db.session_scope() as session:
            now = datetime.now(timezone.utc)
            row = MetricRow(
                label=payload.label,
                value=payload.value,
                unit=payload.unit,
                updated_at=now,
            )
            session.add(row)
            session.flush()
            return self._to_view(row)

    async def list_items(self, *, limit: int = 50) -> list[MetricView]:
        with self._db.session_scope() as session:
            rows = list(
                session.scalars(
                    select(MetricRow)
                    .order_by(MetricRow.created_at.desc())
                    .limit(max(1, min(limit, 200)))
                ).all()
            )
            return [self._to_view(r) for r in rows]
'''
    if entity == "Report":
        return f'''"""Postgres-backed report repository for {service_name}."""

from __future__ import annotations

from datetime import timezone

from sqlalchemy import select

from core.data.database import DatabaseManager
from services.{service_name}.src.data.orm import ReportRow
from services.{service_name}.src.data.schemas import ReportCreate, ReportView


class ReportRepository:
    def __init__(self, database: DatabaseManager) -> None:
        self._db = database

    def _to_view(self, row: ReportRow) -> ReportView:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return ReportView(
            id=row.id,  # type: ignore[arg-type]
            topic=row.topic,
            status=row.status,
            summary=row.summary,
            created_at=created,
        )

    async def create(self, payload: ReportCreate) -> ReportView:
        with self._db.session_scope() as session:
            row = ReportRow(
                topic=payload.topic,
                status=payload.status or "draft",
                summary=payload.summary,
            )
            session.add(row)
            session.flush()
            return self._to_view(row)

    async def list_items(self, *, limit: int = 50) -> list[ReportView]:
        with self._db.session_scope() as session:
            rows = list(
                session.scalars(
                    select(ReportRow)
                    .order_by(ReportRow.created_at.desc())
                    .limit(max(1, min(limit, 200)))
                ).all()
            )
            return [self._to_view(r) for r in rows]
'''
    return f'''"""Postgres-backed {entity_snake} repository for {service_name}."""

from __future__ import annotations

from datetime import timezone

from sqlalchemy import select

from core.data.database import DatabaseManager
from services.{service_name}.src.data.orm import {entity}Row
from services.{service_name}.src.data.schemas import {entity}Create, {entity}View


class {entity}Repository:
    def __init__(self, database: DatabaseManager) -> None:
        self._db = database

    def _to_view(self, row: {entity}Row) -> {entity}View:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return {entity}View(
            id=row.id,  # type: ignore[arg-type]
            name=row.name,
            attributes=dict(row.attributes or {{}}),
            created_at=created,
        )

    async def create(self, payload: {entity}Create) -> {entity}View:
        with self._db.session_scope() as session:
            row = {entity}Row(
                name=payload.name,
                attributes=dict(payload.attributes),
            )
            session.add(row)
            session.flush()
            return self._to_view(row)

    async def list_items(self, *, limit: int = 50) -> list[{entity}View]:
        with self._db.session_scope() as session:
            rows = list(
                session.scalars(
                    select({entity}Row)
                    .order_by({entity}Row.created_at.desc())
                    .limit(max(1, min(limit, 200)))
                ).all()
            )
            return [self._to_view(r) for r in rows]
'''


def _generic_production_main(
    service_name: str,
    env_prefix: str,
    use_case_class: str,
    title: str,
    entity: str,
    entity_snake: str,
    repo_key: str,
    repo_class: str,
) -> str:
    return f'''"""FastAPI entry point and registry registration for {service_name}."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.cors import apply_lab_cors
from core.api.responses import register_standard_error_handlers
from core.container import ServiceContainer
from core.data.database import DatabaseManager, register_sqlite_fk_pragma
from core.event_bus import (
    EventBus,
    create_event_bus,
    ensure_event_bus_started,
    ensure_event_bus_stopped,
)
from core.logging import configure_logging
from core.registry import (
    GlobalServiceRegistry,
    ServiceManifest,
    register_service_database_manager,
    resolve_service_database_manager,
)
from services.{service_name}.config import ServiceConfig, get_config
from services.{service_name}.src.api.routes import router
from services.{service_name}.src.core.use_cases import {use_case_class}
from services.{service_name}.src.data.orm import Base
from services.{service_name}.src.data.repository import {repo_class}


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def _make_event_bus() -> EventBus:
    try:
        return create_event_bus()
    except RuntimeError:
        return EventBus()


def _wire_dependencies(container: ServiceContainer, config: ServiceConfig) -> None:
    logger = configure_logging(config.service_name)
    container.register("logger", lambda _c: logger)
    container.register("config", lambda _c: config)
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: _make_event_bus())
    register_service_database_manager(
        container, config.service_name, config.database_url
    )
    svc = config.service_name
    container.register(
        "{repo_key}",
        lambda c: {repo_class}(resolve_service_database_manager(c, svc)),
    )
    container.register("service_use_cases", lambda c: {use_case_class}(c))


async def _bootstrap_database(
    container: ServiceContainer, config: ServiceConfig
) -> None:
    db: DatabaseManager = resolve_service_database_manager(
        container, config.service_name
    )
    if config.database_url.startswith("sqlite"):
        register_sqlite_fk_pragma(db.engine)
    if config.auto_create_tables or config.database_url.startswith("sqlite"):
        db.create_all(Base.metadata)


def create_app(
    container: ServiceContainer | None = None,
    config: ServiceConfig | None = None,
) -> FastAPI:
    runtime_config = config or get_config()
    app_container = container or ServiceContainer()
    _wire_dependencies(app_container, runtime_config)
    manifest = load_manifest()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await _bootstrap_database(app.state.container, runtime_config)
        await ensure_event_bus_started(app.state.container.resolve("event_bus"))
        try:
            yield
        finally:
            await ensure_event_bus_stopped(app.state.container.resolve("event_bus"))

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="Production domain scaffold for {title} ({entity})",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    register_standard_error_handlers(
        app,
        service_prefix="{env_prefix[:16]}",
        service_name=runtime_config.service_name,
    )
    app.include_router(router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    registry.register(load_manifest(), create_app)
'''


def _generic_alembic_revision(service_name: str, entity_snake: str) -> str:
    if entity_snake == "task":
        return f'''"""create tasks for {service_name}

Revision ID: 0001
Revises:
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="todo"),
        sa.Column("column", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("tasks")
'''

    if entity_snake == "metric":
        return f'''"""create metrics for {service_name}

Revision ID: 0001
Revises:
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "metrics",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("value", sa.String(length=200), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("metrics")
'''

    if entity_snake == "report":
        return f'''"""create reports for {service_name}

Revision ID: 0001
Revises:
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("topic", sa.String(length=4000), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("reports")
'''

    table = f"{entity_snake}s"
    return f'''"""create {table} for {service_name}

Revision ID: 0001
Revises:
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "{table}",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("attributes", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("{table}")
'''


_MARKETING_MODELS = '''"""Immutable marketing domain models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CampaignStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"


class CreativeFormat(StrEnum):
    BANNER = "banner"
    EMAIL = "email"
    SOCIAL = "social"


class Campaign(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    name: str
    objective: str
    status: CampaignStatus = CampaignStatus.DRAFT
    segment_ids: tuple[UUID, ...] = ()
    creative_ids: tuple[UUID, ...] = ()
    created_at: datetime
    updated_at: datetime


class Creative(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    name: str
    format: CreativeFormat
    content: dict = Field(default_factory=dict)
    created_at: datetime


class AudienceSegment(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    name: str
    criteria: dict = Field(default_factory=dict)
    estimated_size: int = Field(default=0, ge=0)
    created_at: datetime
'''


def _marketing_contracts(service_name: str) -> str:
    return f'''"""Domain contracts for {service_name}."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from services.{service_name}.src.data.schemas import (
    AudienceSegmentCreate,
    AudienceSegmentView,
    CampaignCreate,
    CampaignView,
    CreativeCreate,
    CreativeView,
)


class MarketingRepositoryPort(Protocol):
    async def create_campaign(self, payload: CampaignCreate) -> CampaignView: ...

    async def list_campaigns(self, *, limit: int = 50) -> list[CampaignView]: ...

    async def get_campaign(self, campaign_id: UUID) -> CampaignView | None: ...

    async def create_creative(self, payload: CreativeCreate) -> CreativeView: ...

    async def list_creatives(self, *, limit: int = 50) -> list[CreativeView]: ...

    async def create_segment(
        self, payload: AudienceSegmentCreate
    ) -> AudienceSegmentView: ...

    async def list_segments(
        self, *, limit: int = 50
    ) -> list[AudienceSegmentView]: ...
'''


def _marketing_use_cases(service_name: str, use_case_class: str) -> str:
    return f'''"""Application use cases for {service_name}."""

from __future__ import annotations

from uuid import UUID

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event
from core.logging import log_event

from services.{service_name}.src.core.contracts import MarketingRepositoryPort
from services.{service_name}.src.data.schemas import (
    AudienceSegmentCreate,
    AudienceSegmentListResponse,
    AudienceSegmentView,
    CampaignCreate,
    CampaignListResponse,
    CampaignView,
    CreativeCreate,
    CreativeListResponse,
    CreativeView,
)


class {use_case_class}:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._repo: MarketingRepositoryPort = container.resolve("marketing_repository")
        self._logger = container.resolve("logger")
        self._event_bus = container.resolve("event_bus")

    async def create_campaign(self, payload: CampaignCreate) -> CampaignView:
        campaign = await self._repo.create_campaign(payload)
        log_event(
            self._logger,
            event="marketing.campaign.created",
            message="Campaign created",
            campaign_id=str(campaign.id),
            name=campaign.name,
        )
        await self._event_bus.publish(
            Event(
                name="marketing.campaign.created",
                payload={{
                    "campaign_id": str(campaign.id),
                    "name": campaign.name,
                    "status": campaign.status.value,
                }},
            )
        )
        return campaign

    async def list_campaigns(self, *, limit: int = 50) -> CampaignListResponse:
        campaigns = await self._repo.list_campaigns(limit=limit)
        return CampaignListResponse(campaigns=campaigns, count=len(campaigns))

    async def get_campaign(self, campaign_id: UUID) -> CampaignView:
        campaign = await self._repo.get_campaign(campaign_id)
        if campaign is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="MARKETING_CAMPAIGN_NOT_FOUND",
                    message="Campaign not found",
                    details={{"campaign_id": str(campaign_id)}},
                ),
                http_status=404,
            )
        return campaign

    async def create_creative(self, payload: CreativeCreate) -> CreativeView:
        creative = await self._repo.create_creative(payload)
        log_event(
            self._logger,
            event="marketing.creative.created",
            message="Creative created",
            creative_id=str(creative.id),
            name=creative.name,
        )
        await self._event_bus.publish(
            Event(
                name="marketing.creative.created",
                payload={{
                    "creative_id": str(creative.id),
                    "name": creative.name,
                    "format": creative.format.value,
                }},
            )
        )
        return creative

    async def list_creatives(self, *, limit: int = 50) -> CreativeListResponse:
        creatives = await self._repo.list_creatives(limit=limit)
        return CreativeListResponse(creatives=creatives, count=len(creatives))

    async def create_segment(
        self, payload: AudienceSegmentCreate
    ) -> AudienceSegmentView:
        segment = await self._repo.create_segment(payload)
        log_event(
            self._logger,
            event="marketing.segment.created",
            message="Audience segment created",
            segment_id=str(segment.id),
            name=segment.name,
        )
        await self._event_bus.publish(
            Event(
                name="marketing.segment.created",
                payload={{
                    "segment_id": str(segment.id),
                    "name": segment.name,
                    "estimated_size": segment.estimated_size,
                }},
            )
        )
        return segment

    async def list_segments(
        self, *, limit: int = 50
    ) -> AudienceSegmentListResponse:
        segments = await self._repo.list_segments(limit=limit)
        return AudienceSegmentListResponse(segments=segments, count=len(segments))
'''


def _marketing_schemas(service_name: str) -> str:
    return f'''"""API schemas for {service_name}."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from services.{service_name}.src.core.models import CampaignStatus, CreativeFormat


class HealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    version: str
    features: list[str] = Field(default_factory=list)


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    objective: str = Field(min_length=1, max_length=500)
    status: CampaignStatus = CampaignStatus.DRAFT
    segment_ids: list[UUID] = Field(default_factory=list)
    creative_ids: list[UUID] = Field(default_factory=list)


class CampaignView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    name: str
    objective: str
    status: CampaignStatus
    segment_ids: list[UUID] = Field(default_factory=list)
    creative_ids: list[UUID] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class CampaignListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    campaigns: list[CampaignView]
    count: int


class CreativeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    format: CreativeFormat
    content: dict[str, Any] = Field(default_factory=dict)


class CreativeView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    name: str
    format: CreativeFormat
    content: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CreativeListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    creatives: list[CreativeView]
    count: int


class AudienceSegmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    criteria: dict[str, Any] = Field(default_factory=dict)
    estimated_size: int = Field(default=0, ge=0)


class AudienceSegmentView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    name: str
    criteria: dict[str, Any] = Field(default_factory=dict)
    estimated_size: int
    created_at: datetime


class AudienceSegmentListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    segments: list[AudienceSegmentView]
    count: int
'''


def _marketing_routes(service_name: str, use_case_class: str) -> str:
    return f'''"""FastAPI routers for {service_name}."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Query, Request

from services.{service_name}.src.core.use_cases import {use_case_class}
from services.{service_name}.src.data.schemas import (
    AudienceSegmentCreate,
    AudienceSegmentListResponse,
    AudienceSegmentView,
    CampaignCreate,
    CampaignListResponse,
    CampaignView,
    CreativeCreate,
    CreativeListResponse,
    CreativeView,
    HealthResponse,
)

router = APIRouter()


def _load_manifest() -> dict:
    manifest_path = Path(__file__).resolve().parents[2] / "manifest.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


@router.get("/health", response_model=HealthResponse)
async def health(_request: Request) -> HealthResponse:
    manifest = _load_manifest()
    return HealthResponse(
        status="ok",
        service=manifest["name"],
        version=manifest["version"],
        features=manifest.get("features", []),
    )


@router.post("/campaigns", response_model=CampaignView, status_code=201)
async def create_campaign(payload: CampaignCreate, request: Request) -> CampaignView:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.create_campaign(payload)


@router.get("/campaigns", response_model=CampaignListResponse)
async def list_campaigns(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> CampaignListResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.list_campaigns(limit=limit)


@router.get("/campaigns/{{campaign_id}}", response_model=CampaignView)
async def get_campaign(campaign_id: UUID, request: Request) -> CampaignView:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.get_campaign(campaign_id)


@router.post("/creatives", response_model=CreativeView, status_code=201)
async def create_creative(payload: CreativeCreate, request: Request) -> CreativeView:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.create_creative(payload)


@router.get("/creatives", response_model=CreativeListResponse)
async def list_creatives(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> CreativeListResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.list_creatives(limit=limit)


@router.post("/segments", response_model=AudienceSegmentView, status_code=201)
async def create_segment(
    payload: AudienceSegmentCreate, request: Request
) -> AudienceSegmentView:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.create_segment(payload)


@router.get("/segments", response_model=AudienceSegmentListResponse)
async def list_segments(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> AudienceSegmentListResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.list_segments(limit=limit)
'''


def _marketing_test(service_name: str) -> str:
    return f'''"""Marketing domain API smoke for {service_name}."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.{service_name}.config import ServiceConfig, clear_config_cache
from services.{service_name}.src.api.main import create_app


def test_create_and_list_campaigns(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    clear_config_cache()
    db_path = tmp_path / "marketing_test.db"
    cfg = ServiceConfig(
        database_url=f"sqlite+pysqlite:///{{db_path}}",
        auto_create_tables=True,
    )
    with TestClient(create_app(config=cfg)) as client:
        created = client.post(
            "/api/v1/campaigns",
            json={{"name": "Launch", "objective": "Acquire users", "status": "draft"}},
        )
        assert created.status_code == 201
        listed = client.get("/api/v1/campaigns")
        assert listed.status_code == 200
        assert listed.json()["count"] >= 1
    clear_config_cache()
'''


def _generic_contracts(service_name: str, entity: str) -> str:
    if entity == "Task":
        return f'''"""Domain contracts for {service_name}."""

from __future__ import annotations

from typing import Protocol

from services.{service_name}.src.data.schemas import TaskCreate, TaskView


class TaskRepositoryPort(Protocol):
    async def create(self, payload: TaskCreate) -> TaskView: ...

    async def list_items(self, *, limit: int = 50) -> list[TaskView]: ...
'''
    if entity == "Metric":
        return f'''"""Domain contracts for {service_name}."""

from __future__ import annotations

from typing import Protocol

from services.{service_name}.src.data.schemas import MetricCreate, MetricView


class MetricRepositoryPort(Protocol):
    async def create(self, payload: MetricCreate) -> MetricView: ...

    async def list_items(self, *, limit: int = 50) -> list[MetricView]: ...
'''
    if entity == "Report":
        return f'''"""Domain contracts for {service_name}."""

from __future__ import annotations

from typing import Protocol

from services.{service_name}.src.data.schemas import ReportCreate, ReportView


class ReportRepositoryPort(Protocol):
    async def create(self, payload: ReportCreate) -> ReportView: ...

    async def list_items(self, *, limit: int = 50) -> list[ReportView]: ...
'''
    return f'''"""Domain contracts for {service_name}."""

from __future__ import annotations

from typing import Protocol

from services.{service_name}.src.data.schemas import {entity}Create, {entity}View


class {entity}RepositoryPort(Protocol):
    async def create(self, payload: {entity}Create) -> {entity}View: ...

    async def list_items(self, *, limit: int = 50) -> list[{entity}View]: ...
'''


def _generic_models(title: str, entity: str) -> str:
    if entity == "Task":
        return '''"""Immutable domain models for task board."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Task(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    title: str
    status: str = "todo"
    column: str | None = None
    created_at: datetime
'''
    if entity == "Metric":
        return '''"""Immutable domain models for ops dashboard metrics."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class Metric(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    label: str
    value: str
    unit: str | None = None
    updated_at: datetime | None = None
    created_at: datetime
'''
    if entity == "Report":
        return '''"""Immutable domain models for research reports."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class Report(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    topic: str
    status: str = "draft"
    summary: str | None = None
    created_at: datetime
'''
    return f'''"""Immutable domain models for {title}."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class {entity}(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    name: str
    attributes: dict = Field(default_factory=dict)
    created_at: datetime
'''


def _generic_use_cases(
    service_name: str,
    use_case_class: str,
    entity: str,
    entity_snake: str,
    repo_key: str,
    event_name: str,
) -> str:
    if entity == "Task":
        return f'''"""Application use cases for {service_name}."""

from __future__ import annotations

from core.container import ServiceContainer
from core.event_bus import Event
from core.logging import log_event

from services.{service_name}.src.core.contracts import TaskRepositoryPort
from services.{service_name}.src.data.schemas import (
    TaskCreate,
    TaskListResponse,
    TaskView,
)


class {use_case_class}:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._repo: TaskRepositoryPort = container.resolve("{repo_key}")
        self._logger = container.resolve("logger")
        self._event_bus = container.resolve("event_bus")

    async def create_task(self, payload: TaskCreate) -> TaskView:
        item = await self._repo.create(payload)
        log_event(
            self._logger,
            event="{event_name}",
            message="Task created",
            item_id=str(item.id),
            title=item.title,
        )
        await self._event_bus.publish(
            Event(
                name="{event_name}",
                payload={{"item_id": str(item.id), "title": item.title}},
            )
        )
        return item

    async def list_tasks(self, *, limit: int = 50) -> TaskListResponse:
        items = await self._repo.list_items(limit=limit)
        return TaskListResponse(tasks=items, count=len(items))
'''
    if entity == "Metric":
        return f'''"""Application use cases for {service_name}."""

from __future__ import annotations

from core.container import ServiceContainer
from core.event_bus import Event
from core.logging import log_event

from services.{service_name}.src.core.contracts import MetricRepositoryPort
from services.{service_name}.src.data.schemas import (
    MetricCreate,
    MetricListResponse,
    MetricView,
)


class {use_case_class}:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._repo: MetricRepositoryPort = container.resolve("{repo_key}")
        self._logger = container.resolve("logger")
        self._event_bus = container.resolve("event_bus")

    async def create_metric(self, payload: MetricCreate) -> MetricView:
        item = await self._repo.create(payload)
        log_event(
            self._logger,
            event="{event_name}",
            message="Metric created",
            item_id=str(item.id),
            label=item.label,
        )
        await self._event_bus.publish(
            Event(
                name="{event_name}",
                payload={{"item_id": str(item.id), "label": item.label}},
            )
        )
        return item

    async def list_metrics(self, *, limit: int = 50) -> MetricListResponse:
        items = await self._repo.list_items(limit=limit)
        return MetricListResponse(metrics=items, count=len(items))
'''
    if entity == "Report":
        return f'''"""Application use cases for {service_name}."""

from __future__ import annotations

from core.container import ServiceContainer
from core.event_bus import Event
from core.logging import log_event

from services.{service_name}.src.core.contracts import ReportRepositoryPort
from services.{service_name}.src.data.schemas import (
    ReportCreate,
    ReportListResponse,
    ReportView,
)


class {use_case_class}:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._repo: ReportRepositoryPort = container.resolve("{repo_key}")
        self._logger = container.resolve("logger")
        self._event_bus = container.resolve("event_bus")

    async def create_report(self, payload: ReportCreate) -> ReportView:
        item = await self._repo.create(payload)
        log_event(
            self._logger,
            event="{event_name}",
            message="Report created",
            item_id=str(item.id),
            topic=item.topic,
        )
        await self._event_bus.publish(
            Event(
                name="{event_name}",
                payload={{"item_id": str(item.id), "topic": item.topic}},
            )
        )
        return item

    async def list_reports(self, *, limit: int = 50) -> ReportListResponse:
        items = await self._repo.list_items(limit=limit)
        return ReportListResponse(reports=items, count=len(items))
'''
    return f'''"""Application use cases for {service_name}."""

from __future__ import annotations

from core.container import ServiceContainer
from core.event_bus import Event
from core.logging import log_event

from services.{service_name}.src.core.contracts import {entity}RepositoryPort
from services.{service_name}.src.data.schemas import (
    {entity}Create,
    {entity}ListResponse,
    {entity}View,
)


class {use_case_class}:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._repo: {entity}RepositoryPort = container.resolve("{repo_key}")
        self._logger = container.resolve("logger")
        self._event_bus = container.resolve("event_bus")

    async def create_{entity_snake}(self, payload: {entity}Create) -> {entity}View:
        item = await self._repo.create(payload)
        log_event(
            self._logger,
            event="{event_name}",
            message="{entity} created",
            item_id=str(item.id),
            name=item.name,
        )
        await self._event_bus.publish(
            Event(
                name="{event_name}",
                payload={{"item_id": str(item.id), "name": item.name}},
            )
        )
        return item

    async def list_{entity_snake}s(
        self, *, limit: int = 50
    ) -> {entity}ListResponse:
        items = await self._repo.list_items(limit=limit)
        return {entity}ListResponse(items=items, count=len(items))
'''


def _generic_schemas(entity: str) -> str:
    if entity == "Task":
        return '''"""API schemas for task board."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    version: str
    features: list[str] = Field(default_factory=list)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    column: str | None = None
    status: str = "todo"


class TaskView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    title: str
    status: str
    column: str | None = None
    created_at: datetime


class TaskListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    tasks: list[TaskView]
    count: int
'''
    if entity == "Metric":
        return '''"""API schemas for ops dashboard metrics."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    version: str
    features: list[str] = Field(default_factory=list)


class MetricCreate(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    value: str = Field(min_length=1, max_length=200)
    unit: str | None = None


class MetricView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    label: str
    value: str
    unit: str | None = None
    updated_at: datetime | None = None
    created_at: datetime


class MetricListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    metrics: list[MetricView]
    count: int
'''
    if entity == "Report":
        return '''"""API schemas for research reports."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    version: str
    features: list[str] = Field(default_factory=list)


class ReportCreate(BaseModel):
    topic: str = Field(min_length=1, max_length=4000)
    summary: str | None = None
    status: str = "draft"


class ReportView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    topic: str
    status: str
    summary: str | None = None
    created_at: datetime


class ReportListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    reports: list[ReportView]
    count: int
'''
    return f'''"""API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    version: str
    features: list[str] = Field(default_factory=list)


class {entity}Create(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    attributes: dict[str, Any] = Field(default_factory=dict)


class {entity}View(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    name: str
    attributes: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class {entity}ListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    items: list[{entity}View]
    count: int
'''


def _generic_routes(
    service_name: str,
    use_case_class: str,
    entity: str,
    entity_snake: str,
    route_slug: str,
) -> str:
    if entity == "Task":
        return f'''"""FastAPI routers for {service_name} task board."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Query, Request

from services.{service_name}.src.core.use_cases import {use_case_class}
from services.{service_name}.src.data.schemas import (
    HealthResponse,
    TaskCreate,
    TaskListResponse,
    TaskView,
)

router = APIRouter()


def _load_manifest() -> dict:
    manifest_path = Path(__file__).resolve().parents[2] / "manifest.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


@router.get("/health", response_model=HealthResponse)
async def health(_request: Request) -> HealthResponse:
    manifest = _load_manifest()
    return HealthResponse(
        status="ok",
        service=manifest["name"],
        version=manifest["version"],
        features=manifest.get("features", []),
    )


@router.post("/tasks", response_model=TaskView, status_code=201)
async def create_task(payload: TaskCreate, request: Request) -> TaskView:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.create_task(payload)


@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> TaskListResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.list_tasks(limit=limit)
'''
    if entity == "Metric":
        return f'''"""FastAPI routers for {service_name} ops dashboard."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Query, Request

from services.{service_name}.src.core.use_cases import {use_case_class}
from services.{service_name}.src.data.schemas import (
    HealthResponse,
    MetricCreate,
    MetricListResponse,
    MetricView,
)

router = APIRouter()


def _load_manifest() -> dict:
    manifest_path = Path(__file__).resolve().parents[2] / "manifest.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


@router.get("/health", response_model=HealthResponse)
async def health(_request: Request) -> HealthResponse:
    manifest = _load_manifest()
    return HealthResponse(
        status="ok",
        service=manifest["name"],
        version=manifest["version"],
        features=manifest.get("features", []),
    )


@router.post("/metrics", response_model=MetricView, status_code=201)
async def create_metric(payload: MetricCreate, request: Request) -> MetricView:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.create_metric(payload)


@router.get("/metrics", response_model=MetricListResponse)
async def list_metrics(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> MetricListResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.list_metrics(limit=limit)
'''
    if entity == "Report":
        return f'''"""FastAPI routers for {service_name} research reports."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Query, Request

from services.{service_name}.src.core.use_cases import {use_case_class}
from services.{service_name}.src.data.schemas import (
    HealthResponse,
    ReportCreate,
    ReportListResponse,
    ReportView,
)

router = APIRouter()


def _load_manifest() -> dict:
    manifest_path = Path(__file__).resolve().parents[2] / "manifest.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


@router.get("/health", response_model=HealthResponse)
async def health(_request: Request) -> HealthResponse:
    manifest = _load_manifest()
    return HealthResponse(
        status="ok",
        service=manifest["name"],
        version=manifest["version"],
        features=manifest.get("features", []),
    )


@router.post("/reports", response_model=ReportView, status_code=201)
async def create_report(payload: ReportCreate, request: Request) -> ReportView:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.create_report(payload)


@router.get("/reports", response_model=ReportListResponse)
async def list_reports(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> ReportListResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.list_reports(limit=limit)
'''
    return f'''"""FastAPI routers for {service_name}."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Query, Request

from services.{service_name}.src.core.use_cases import {use_case_class}
from services.{service_name}.src.data.schemas import (
    HealthResponse,
    {entity}Create,
    {entity}ListResponse,
    {entity}View,
)

router = APIRouter()


def _load_manifest() -> dict:
    manifest_path = Path(__file__).resolve().parents[2] / "manifest.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


@router.get("/health", response_model=HealthResponse)
async def health(_request: Request) -> HealthResponse:
    manifest = _load_manifest()
    return HealthResponse(
        status="ok",
        service=manifest["name"],
        version=manifest["version"],
        features=manifest.get("features", []),
    )


@router.post("/{route_slug}", response_model={entity}View, status_code=201)
async def create_{entity_snake}(payload: {entity}Create, request: Request) -> {entity}View:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.create_{entity_snake}(payload)


@router.get("/{route_slug}", response_model={entity}ListResponse)
async def list_{entity_snake}s(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> {entity}ListResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.list_{entity_snake}s(limit=limit)
'''


def _generic_test(service_name: str, entity_snake: str, route_slug: str) -> str:
    if entity_snake == "task" or route_slug == "tasks":
        return f'''"""Domain API smoke for {service_name} task board."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.{service_name}.config import ServiceConfig, clear_config_cache
from services.{service_name}.src.api.main import create_app


def test_create_and_list_tasks(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    clear_config_cache()
    db_path = tmp_path / "domain_test.db"
    cfg = ServiceConfig(
        database_url=f"sqlite+pysqlite:///{{db_path}}",
        auto_create_tables=True,
    )
    with TestClient(create_app(config=cfg)) as client:
        created = client.post(
            "/api/v1/tasks",
            json={{"title": "Ship P12", "column": "todo"}},
        )
        assert created.status_code == 201
        body = created.json()
        assert body["title"] == "Ship P12"
        listed = client.get("/api/v1/tasks")
        assert listed.status_code == 200
        assert listed.json()["count"] >= 1
        assert "tasks" in listed.json()
    clear_config_cache()
'''
    if entity_snake == "metric" or route_slug == "metrics":
        return f'''"""Domain API smoke for {service_name} ops dashboard."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.{service_name}.config import ServiceConfig, clear_config_cache
from services.{service_name}.src.api.main import create_app


def test_create_and_list_metrics(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    clear_config_cache()
    db_path = tmp_path / "domain_test.db"
    cfg = ServiceConfig(
        database_url=f"sqlite+pysqlite:///{{db_path}}",
        auto_create_tables=True,
    )
    with TestClient(create_app(config=cfg)) as client:
        created = client.post(
            "/api/v1/metrics",
            json={{"label": "Latency", "value": "42", "unit": "ms"}},
        )
        assert created.status_code == 201
        body = created.json()
        assert body["label"] == "Latency"
        listed = client.get("/api/v1/metrics")
        assert listed.status_code == 200
        assert listed.json()["count"] >= 1
        assert "metrics" in listed.json()
    clear_config_cache()
'''
    if entity_snake == "report" or route_slug == "reports":
        return f'''"""Domain API smoke for {service_name} research reports."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.{service_name}.config import ServiceConfig, clear_config_cache
from services.{service_name}.src.api.main import create_app


def test_create_and_list_reports(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    clear_config_cache()
    db_path = tmp_path / "domain_test.db"
    cfg = ServiceConfig(
        database_url=f"sqlite+pysqlite:///{{db_path}}",
        auto_create_tables=True,
    )
    with TestClient(create_app(config=cfg)) as client:
        created = client.post(
            "/api/v1/reports",
            json={{"topic": "Q3 market scan", "summary": "Brief"}},
        )
        assert created.status_code == 201
        body = created.json()
        assert body["topic"] == "Q3 market scan"
        listed = client.get("/api/v1/reports")
        assert listed.status_code == 200
        assert listed.json()["count"] >= 1
        assert "reports" in listed.json()
    clear_config_cache()
'''
    return f'''"""Domain API smoke for {service_name}."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.{service_name}.config import ServiceConfig, clear_config_cache
from services.{service_name}.src.api.main import create_app


def test_create_and_list_{entity_snake}s(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    clear_config_cache()
    db_path = tmp_path / "domain_test.db"
    cfg = ServiceConfig(
        database_url=f"sqlite+pysqlite:///{{db_path}}",
        auto_create_tables=True,
    )
    with TestClient(create_app(config=cfg)) as client:
        created = client.post(
            "/api/v1/{route_slug}",
            json={{"name": "alpha", "attributes": {{"sku": "A-1"}}}},
        )
        assert created.status_code == 201
        listed = client.get("/api/v1/{route_slug}")
        assert listed.status_code == 200
        assert listed.json()["count"] >= 1
    clear_config_cache()
'''


def health_probe_file_map(
    action: Any,
    service_name: str,
    *,
    features: list[str],
    port: int,
    domain_hint: str,
) -> dict[str, str]:
    """Minimal anatomy scaffold — health only, no DomainItem CRUD."""
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        manifest_ui_block,
    )

    env_prefix = service_name.upper()
    use_case_class = _use_case_class_name(service_name)
    title = domain_hint.replace("_", " ").title()
    feat = list(features)
    for token in ("health", "reflex_scaffold", "probe"):
        if token not in feat:
            feat.append(token)
    manifest = {
        "name": service_name,
        "version": "0.1.0",
        "features": feat,
        "entry_point": "src/api/main.py",
        "dependencies": [],
        "publishes": [],
        "subscribes": [],
        "ui": manifest_ui_block(
            service_name,
            required=False,
            skip_reason=(
                "Scaffold/probe module — not a product app; "
                "ECC/Desktop launch UI not required."
            ),
            lab=True,
        ),
    }
    return {
        "manifest.json": json.dumps(manifest, indent=2) + "\n",
        "config.py": action.config_py(service_name, port, env_prefix),
        "src/core/contracts.py": _health_probe_contracts(service_name),
        "src/core/models.py": _HEALTH_PROBE_MODELS,
        "src/core/use_cases.py": _health_probe_use_cases(service_name, use_case_class),
        "src/data/schemas.py": _HEALTH_PROBE_SCHEMAS,
        "src/data/repository.py": _health_probe_repository(service_name),
        "src/integration/__init__.py": (
            '"""External adapters — fill from recipe extract peers when needed."""\n'
        ),
        "src/api/routes.py": _health_probe_routes(service_name, use_case_class),
        "src/api/main.py": action.main_py(
            service_name=service_name,
            port=port,
            env_prefix=env_prefix,
            use_case_class=use_case_class,
            repository_class="ProbeStore",
            repository_key="probe_store",
            description=f"Health-probe scaffold for {title} (no DomainItem CRUD)",
        ),
        "tests/test_health.py": action.health_test_py(service_name),
        "tests/test_domain.py": _health_probe_test(service_name),
    }


def studio_job_file_map(
    action: Any,
    service_name: str,
    *,
    features: list[str],
    port: int,
    domain_hint: str,
) -> dict[str, str]:
    """Creative/studio job queue — durable Postgres + identity-gated writes."""
    from services.empery_intelligence_core.src.integration import (
        service_scaffold_companion as companion_mod,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        manifest_ui_block,
    )

    env_prefix = service_name.upper()
    use_case_class = _use_case_class_name(service_name)
    title = domain_hint.replace("_", " ").title()
    err_prefix = env_prefix
    feat = [t for t in features if t != "reflex_scaffold"]
    for token in ("health", "studio_jobs", "identity_gated_writes"):
        if token not in feat:
            feat.append(token)
    manifest = {
        "name": service_name,
        "version": "0.2.0",
        "features": feat,
        "entry_point": "src/api/main.py",
        "dependencies": ["identity_service", "empery_intelligence_core"],
        "publishes": [f"{service_name}.job.created", f"{service_name}.job.completed"],
        "subscribes": [],
        "ui": manifest_ui_block(service_name, required=True),
    }
    return {
        "manifest.json": json.dumps(manifest, indent=2) + "\n",
        "config.py": _studio_production_config(service_name, port, env_prefix),
        "src/core/contracts.py": _studio_contracts(service_name),
        "src/core/models.py": _STUDIO_MODELS,
        "src/core/use_cases.py": _studio_production_use_cases(
            service_name, use_case_class, err_prefix
        ),
        "src/data/schemas.py": _STUDIO_SCHEMAS,
        "src/data/orm.py": _STUDIO_ORM,
        "src/data/repository.py": _studio_postgres_repository(service_name),
        "src/integration/__init__.py": (
            '"""Identity HTTP adapter; peer notes for Comfy/Nervas wiring."""\n'
        ),
        "src/integration/identity_adapter.py": companion_mod._identity_adapter(  # noqa: SLF001
            err_prefix
        ),
        "src/integration/peer_notes.py": (
            '"""Assembly notes: adapt EliteEW studio peers; never import reference/."""\n'
        ),
        "src/api/routes.py": _studio_production_routes(service_name, use_case_class),
        "src/api/main.py": _studio_production_main(
            service_name, env_prefix, use_case_class, title
        ),
        "alembic.ini": companion_mod._alembic_ini(service_name),  # noqa: SLF001
        "alembic/env.py": companion_mod._alembic_env(service_name),  # noqa: SLF001
        "alembic/script.py.mako": companion_mod._ALEMBIC_MAKO,  # noqa: SLF001
        "alembic/versions/0001_create_jobs.py": _studio_alembic_revision(service_name),
        "tests/test_health.py": action.health_test_py(service_name),
        "tests/test_domain.py": _studio_production_test(service_name, err_prefix),
    }


def peer_http_file_map(
    action: Any,
    service_name: str,
    *,
    features: list[str],
    port: int,
    domain_hint: str,
) -> dict[str, str]:
    """HTTP peer adapter scaffold — NervasClient toward EIC (no DomainItem CRUD)."""
    base = health_probe_file_map(
        action,
        service_name,
        features=features,
        port=port,
        domain_hint=domain_hint,
    )
    env_prefix = service_name.upper()
    base["src/integration/nervas_client.py"] = _PEER_NERVAS_CLIENT
    base["src/integration/http_peer.py"] = (
        '"""Deprecated alias — prefer nervas_client.NervasClient."""\n'
        "from services." + service_name + ".src.integration.nervas_client import NervasClient\n\n"
        "HttpPeerClient = NervasClient\n"
    )
    base["src/integration/__init__.py"] = (
        '"""HTTP peer adapters — NervasClient → EIC; never Fake* in src/."""\n'
    )
    # Production config: EIC base for Nervas
    base["config.py"] = action.config_py(service_name, port, env_prefix).replace(
        "cors_origins: list[str] = Field(",
        "eic_api_base: str = Field(default=\"http://127.0.0.1:8007\")\n"
        "    cors_origins: list[str] = Field(",
    ).replace(
        "cors_origins=_csv_env(",
        "eic_api_base=_env(\"EIC_API_BASE\", \"http://127.0.0.1:8007\").strip().rstrip(\"/\"),\n"
        "        cors_origins=_csv_env(",
    )
    feat = json.loads(base["manifest.json"])
    feats = list(feat.get("features") or [])
    for token in ("http_peer", "nervas_peer"):
        if token not in feats:
            feats.append(token)
    feat["features"] = [t for t in feats if t != "reflex_scaffold"]
    feat["dependencies"] = ["empery_intelligence_core"]
    base["manifest.json"] = json.dumps(feat, indent=2) + "\n"
    return base


# companion_chat moved to service_scaffold_companion.py (production Nervas+identity+Alembic)

_PEER_NERVAS_CLIENT = '''"""
HTTP client for EIC Nervas — peers call EIC over HTTP, never import EIC internals.
"""

from __future__ import annotations

from typing import Any

import httpx


class NervasClient:
    def __init__(self, base_url: str | None = None, *, timeout_seconds: float = 180.0) -> None:
        import os

        self.base_url = (
            base_url
            or os.environ.get("EIC_API_BASE")
            or "http://empery_intelligence_core:8007"
        ).rstrip("/")
        self._timeout = httpx.Timeout(timeout_seconds, connect=15.0)

    async def health(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.get(f"{self.base_url}/api/v1/health")
            res.raise_for_status()
            data = res.json()
            return data if isinstance(data, dict) else {}

    async def chat(
        self,
        *,
        messages: list[dict[str, str]],
        temperature: float = 0.45,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{self.base_url}/api/v1/nervas/chat",
                json={
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            if res.status_code >= 400:
                raise RuntimeError(
                    f"Nervas chat failed: HTTP {res.status_code} — {res.text[:500]}"
                )
            data = res.json()
            if not isinstance(data, dict):
                raise RuntimeError("Nervas returned non-object response")
            return data
'''


_HEALTH_PROBE_MODELS = '''"""Probe domain — no DomainItem CRUD."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProbeStatus(BaseModel):
    model_config = ConfigDict(frozen=True)

    service: str
    ready: bool = True
    detail: str = "ok"
    checked_at: datetime = Field(default_factory=datetime.utcnow)
'''

_HEALTH_PROBE_SCHEMAS = '''"""API schemas for health probe."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProbeStatusResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    service: str
    ready: bool
    detail: str
    checked_at: datetime
'''


def _health_probe_contracts(service_name: str) -> str:
    return f'''"""Ports for {service_name}."""

from __future__ import annotations

from typing import Protocol

from services.{service_name}.src.core.models import ProbeStatus


class ProbeStorePort(Protocol):
    async def status(self) -> ProbeStatus: ...
'''


def _health_probe_use_cases(service_name: str, use_case_class: str) -> str:
    return f'''"""Use cases for {service_name}."""

from __future__ import annotations

from core.container import ServiceContainer

from services.{service_name}.src.data.schemas import ProbeStatusResponse


class {use_case_class}:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    async def probe_status(self) -> ProbeStatusResponse:
        store = self._container.resolve("probe_store")
        status = await store.status()
        return ProbeStatusResponse(
            service=status.service,
            ready=status.ready,
            detail=status.detail,
            checked_at=status.checked_at,
        )
'''


def _health_probe_repository(service_name: str) -> str:
    return f'''"""Probe store for {service_name}."""

from __future__ import annotations

from services.{service_name}.src.core.models import ProbeStatus


class ProbeStore:
    def __init__(self, service_name: str = "{service_name}") -> None:
        self._service_name = service_name

    async def status(self) -> ProbeStatus:
        return ProbeStatus(service=self._service_name, ready=True, detail="ok")
'''


def _health_probe_routes(service_name: str, use_case_class: str) -> str:
    return f'''"""HTTP routes for {service_name}."""

from __future__ import annotations

from fastapi import APIRouter, Request

from services.{service_name}.src.data.schemas import ProbeStatusResponse

router = APIRouter(tags=["{service_name}"])


@router.get("/health")
async def health(_request: Request) -> dict:
    return {{"status": "ok", "service": "{service_name}", "version": "0.1.0"}}


@router.get("/probe", response_model=ProbeStatusResponse)
async def probe_status(request: Request) -> ProbeStatusResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.probe_status()
'''


def _health_probe_test(service_name: str) -> str:
    return f'''"""Probe API smoke for {service_name}."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.{service_name}.src.api.main import create_app


def test_probe_status() -> None:
    with TestClient(create_app()) as client:
        health = client.get("/api/v1/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"
        res = client.get("/api/v1/probe")
        assert res.status_code == 200
        body = res.json()
        assert body["ready"] is True
        assert body["service"] == "{service_name}"
'''


_STUDIO_MODELS = '''"""Studio generation job models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class GenerationJob(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID = Field(default_factory=uuid4)
    prompt: str
    status: JobStatus = JobStatus.QUEUED
    result_uri: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
'''

_STUDIO_SCHEMAS = '''"""Studio job API schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CreateJobRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)


class JobResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    prompt: str
    status: str
    result_uri: str | None = None
    error: str | None = None
    created_at: datetime


class JobListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    jobs: list[JobResponse]
    count: int
'''


def _studio_contracts(service_name: str) -> str:
    return f'''"""Ports for {service_name} studio jobs."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from services.{service_name}.src.core.models import GenerationJob


class JobStorePort(Protocol):
    async def create(self, prompt: str) -> GenerationJob: ...

    async def get(self, job_id: UUID) -> GenerationJob | None: ...

    async def list(self, *, limit: int = 50) -> list[GenerationJob]: ...
'''


_STUDIO_ORM = '''"""SQLAlchemy ORM for studio generation jobs."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import Uuid


class Base(DeclarativeBase):
    """Declarative base for studio tables."""


class GenerationJobRow(Base):
    __tablename__ = "generation_jobs"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    result_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[object | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
'''


def _studio_production_config(service_name: str, port: int, env_prefix: str) -> str:
    return f'''"""Environment-specific configuration for {service_name}."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _csv_env(key: str, default: str) -> list[str]:
    raw = os.environ.get(key, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


def _database_url() -> str:
    return os.environ.get(
        "{env_prefix}_DATABASE_URL",
        os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://eworld:eworld@localhost:5432/{service_name}",
        ),
    )


class ServiceConfig(BaseModel):
    """Immutable runtime configuration."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "{service_name}"
    host: str = "0.0.0.0"
    port: int = {port}
    log_level: str = "INFO"
    database_url: str = Field(
        default="postgresql+psycopg://eworld:eworld@localhost:5432/{service_name}",
    )
    auto_create_tables: bool = False
    identity_base_url: str = "http://127.0.0.1:8003"
    identity_mode: str = "http"
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ],
    )


@lru_cache
def get_config() -> ServiceConfig:
    return ServiceConfig(
        host=_env("{env_prefix}_HOST", "0.0.0.0"),
        port=int(_env("{env_prefix}_PORT", _env("PORT", "{port}"))),
        log_level=_env("LOG_LEVEL", "INFO"),
        database_url=_database_url(),
        auto_create_tables=_env("AUTO_CREATE_TABLES", "false").lower()
        in {{"1", "true", "yes"}},
        identity_base_url=_env(
            "IDENTITY_API_BASE",
            _env("IDENTITY_BASE_URL", "http://127.0.0.1:8003"),
        )
        .strip()
        .rstrip("/"),
        identity_mode=_env("IDENTITY_MODE", "http"),
        cors_origins=_csv_env(
            "{env_prefix}_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174,"
            "http://127.0.0.1:5173,http://localhost:5173",
        ),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
'''


def _studio_postgres_repository(service_name: str) -> str:
    return f'''"""Postgres-backed studio job store for {service_name}."""

from __future__ import annotations

from datetime import timezone
from uuid import UUID

from sqlalchemy import select

from core.data.database import DatabaseManager
from services.{service_name}.src.core.models import GenerationJob, JobStatus
from services.{service_name}.src.data.orm import GenerationJobRow


class JobRepository:
    def __init__(self, database: DatabaseManager) -> None:
        self._db = database

    def _to_job(self, row: GenerationJobRow) -> GenerationJob:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return GenerationJob(
            id=row.id,  # type: ignore[arg-type]
            prompt=row.prompt,
            status=JobStatus(row.status),
            result_uri=row.result_uri,
            error=row.error,
            created_at=created,
        )

    async def create(self, prompt: str, *, owner_id: UUID | None = None) -> GenerationJob:
        with self._db.session_scope() as session:
            row = GenerationJobRow(
                prompt=prompt,
                status=JobStatus.QUEUED.value,
                owner_id=owner_id,
            )
            session.add(row)
            session.flush()
            return self._to_job(row)

    async def get(self, job_id: UUID) -> GenerationJob | None:
        with self._db.session_scope() as session:
            row = session.get(GenerationJobRow, job_id)
            return self._to_job(row) if row is not None else None

    async def list(self, *, limit: int = 50, owner_id: UUID | None = None) -> list[GenerationJob]:
        with self._db.session_scope() as session:
            stmt = select(GenerationJobRow).order_by(GenerationJobRow.created_at.desc())
            if owner_id is not None:
                stmt = stmt.where(GenerationJobRow.owner_id == owner_id)
            rows = list(session.scalars(stmt.limit(limit)).all())
            return [self._to_job(r) for r in rows]
'''


def _studio_production_use_cases(
    service_name: str, use_case_class: str, err_prefix: str
) -> str:
    return f'''"""Studio job use cases for {service_name} — identity-gated writes."""

from __future__ import annotations

from uuid import UUID

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.integration.identity_verifier import IdentityPrincipal
from core.logging import log_event

from services.{service_name}.src.data.schemas import (
    CreateJobRequest,
    JobListResponse,
    JobResponse,
)
from services.{service_name}.src.integration.identity_adapter import strip_bearer_token


class {use_case_class}:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._logger = container.resolve("logger")

    def _store(self):
        return self._container.resolve("job_store")

    def _require_actor(self, authorization: str | None) -> IdentityPrincipal:
        token = strip_bearer_token(authorization)
        try:
            verifier = self._container.resolve("identity_verifier")
        except KeyError as exc:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_UNAVAILABLE",
                    message="Identity verifier is not available",
                ),
                http_status=503,
            ) from exc
        try:
            return verifier.verify_token(token)
        except ServiceError:
            raise
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="{service_name}.identity.rejected",
                message="Identity verifier rejected token",
                level=40,
                reason=str(exc),
            )
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="{err_prefix}_UNAUTHORIZED",
                    message="Identity verification failed",
                ),
                http_status=401,
            ) from exc

    async def create_job(
        self, req: CreateJobRequest, *, authorization: str | None
    ) -> JobResponse:
        actor = self._require_actor(authorization)
        job = await self._store().create(req.prompt, owner_id=actor.user_id)
        return JobResponse(
            id=job.id,
            prompt=job.prompt,
            status=job.status.value,
            result_uri=job.result_uri,
            error=job.error,
            created_at=job.created_at,
        )

    async def get_job(
        self, job_id: UUID, *, authorization: str | None
    ) -> JobResponse:
        self._require_actor(authorization)
        job = await self._store().get(job_id)
        if job is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="{err_prefix}_NOT_FOUND",
                    message="job not found",
                    details={{"job_id": str(job_id)}},
                ),
                http_status=404,
            )
        return JobResponse(
            id=job.id,
            prompt=job.prompt,
            status=job.status.value,
            result_uri=job.result_uri,
            error=job.error,
            created_at=job.created_at,
        )

    async def list_jobs(
        self, *, authorization: str | None, limit: int = 50
    ) -> JobListResponse:
        actor = self._require_actor(authorization)
        jobs = await self._store().list(limit=limit, owner_id=actor.user_id)
        items = [
            JobResponse(
                id=j.id,
                prompt=j.prompt,
                status=j.status.value,
                result_uri=j.result_uri,
                error=j.error,
                created_at=j.created_at,
            )
            for j in jobs
        ]
        return JobListResponse(jobs=items, count=len(items))
'''


def _studio_production_routes(service_name: str, use_case_class: str) -> str:
    return f'''"""HTTP routes for {service_name} studio jobs."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from services.{service_name}.src.core.use_cases import {use_case_class}
from services.{service_name}.src.data.schemas import (
    CreateJobRequest,
    JobListResponse,
    JobResponse,
)

router = APIRouter(tags=["{service_name}"])


@router.get("/health")
async def health(_request: Request) -> dict:
    return {{"status": "ok", "service": "{service_name}", "version": "0.2.0"}}


@router.post("/jobs", response_model=JobResponse, status_code=201)
async def create_job(request: Request, body: CreateJobRequest) -> JobResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.create_job(
        body, authorization=request.headers.get("Authorization")
    )


@router.get("/jobs/{{job_id}}", response_model=JobResponse)
async def get_job(request: Request, job_id: UUID) -> JobResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.get_job(
        job_id, authorization=request.headers.get("Authorization")
    )


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> JobListResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.list_jobs(
        authorization=request.headers.get("Authorization"), limit=limit
    )
'''


def _studio_production_main(
    service_name: str, env_prefix: str, use_case_class: str, title: str
) -> str:
    return f'''"""FastAPI entry point and registry registration for {service_name}."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.cors import apply_lab_cors
from core.api.responses import register_standard_error_handlers
from core.container import ServiceContainer
from core.data.database import DatabaseManager, register_sqlite_fk_pragma
from core.event_bus import (
    EventBus,
    create_event_bus,
    ensure_event_bus_started,
    ensure_event_bus_stopped,
)
from core.logging import configure_logging, log_event
from core.registry import (
    GlobalServiceRegistry,
    ServiceManifest,
    register_service_database_manager,
    resolve_service_database_manager,
)
from services.{service_name}.config import ServiceConfig, get_config
from services.{service_name}.src.api.routes import router
from services.{service_name}.src.core.use_cases import {use_case_class}
from services.{service_name}.src.data.orm import Base
from services.{service_name}.src.data.repository import JobRepository
from services.{service_name}.src.integration.identity_adapter import IdentityVerifierAdapter


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def _make_event_bus() -> EventBus:
    try:
        return create_event_bus()
    except RuntimeError:
        return EventBus()


def _wire_dependencies(container: ServiceContainer, config: ServiceConfig) -> None:
    logger = configure_logging(config.service_name)
    container.register("logger", lambda _c: logger)
    container.register("config", lambda _c: config)
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: _make_event_bus())
    register_service_database_manager(
        container, config.service_name, config.database_url
    )
    svc = config.service_name
    container.register(
        "job_store",
        lambda c: JobRepository(resolve_service_database_manager(c, svc)),
    )
    if not container.has("identity_verifier"):
        container.register(
            "identity_verifier",
            lambda c: IdentityVerifierAdapter(
                mode=c.resolve("config").identity_mode,
                container=c,
                base_url=c.resolve("config").identity_base_url,
                logger=c.resolve("logger"),
            ),
        )
    container.register("service_use_cases", lambda c: {use_case_class}(c))


async def _bootstrap_database(
    container: ServiceContainer, config: ServiceConfig
) -> None:
    db: DatabaseManager = resolve_service_database_manager(
        container, config.service_name
    )
    if config.database_url.startswith("sqlite"):
        register_sqlite_fk_pragma(db.engine)
    if config.auto_create_tables or config.database_url.startswith("sqlite"):
        db.create_all(Base.metadata)


def create_app(
    container: ServiceContainer | None = None,
    config: ServiceConfig | None = None,
) -> FastAPI:
    runtime_config = config or get_config()
    app_container = container or ServiceContainer()
    _wire_dependencies(app_container, runtime_config)
    manifest = load_manifest()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await _bootstrap_database(app.state.container, runtime_config)
        await ensure_event_bus_started(app.state.container.resolve("event_bus"))
        try:
            yield
        finally:
            await ensure_event_bus_stopped(app.state.container.resolve("event_bus"))

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="Production studio job scaffold for {title}",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    register_standard_error_handlers(
        app,
        service_prefix="{env_prefix[:16]}",
        service_name=runtime_config.service_name,
    )
    app.include_router(router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    registry.register(load_manifest(), create_app)
'''


def _studio_alembic_revision(service_name: str) -> str:
    return f'''"""create generation_jobs for {service_name}

Revision ID: 0001
Revises:
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "generation_jobs",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("result_uri", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("owner_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_generation_jobs_owner_id", "generation_jobs", ["owner_id"])


def downgrade() -> None:
    op.drop_table("generation_jobs")
'''


def _studio_production_test(service_name: str, err_prefix: str) -> str:
    return f'''"""Production studio smoke for {service_name} (fakes in tests only)."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from core.integration.identity_verifier import IdentityPrincipal
from services.{service_name}.config import ServiceConfig, clear_config_cache
from services.{service_name}.src.api.main import create_app


class _FakeIdentity:
    _user_id = uuid4()

    def verify_token(self, token: str) -> IdentityPrincipal:
        if token != "good-token":
            from core.errors import ServiceError, StandardizedErrorResponse

            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="{err_prefix}_UNAUTHORIZED",
                    message="bad token",
                ),
                http_status=401,
            )
        return IdentityPrincipal(
            user_id=self._user_id,
            email="tester@empery.local",
            roles=["user"],
            permissions=[],
        )


def _app():
    clear_config_cache()
    cfg = ServiceConfig(
        database_url="sqlite+pysqlite:///:memory:",
        auto_create_tables=True,
        identity_mode="container",
        identity_base_url="http://identity.test",
    )
    app = create_app(config=cfg)
    app.state.container.register("identity_verifier", lambda _c: _FakeIdentity())
    return app


def test_anon_create_is_401(monkeypatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    with TestClient(_app()) as client:
        res = client.post("/api/v1/jobs", json={{"prompt": "a calm lake"}})
        assert res.status_code == 401


def test_create_and_list_with_bearer(monkeypatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    headers = {{"Authorization": "Bearer good-token"}}
    with TestClient(_app()) as client:
        assert client.get("/api/v1/health").status_code == 200
        created = client.post(
            "/api/v1/jobs", json={{"prompt": "a calm lake"}}, headers=headers
        )
        assert created.status_code == 201
        listed = client.get("/api/v1/jobs", headers=headers)
        assert listed.status_code == 200
        assert listed.json()["count"] >= 1
'''
