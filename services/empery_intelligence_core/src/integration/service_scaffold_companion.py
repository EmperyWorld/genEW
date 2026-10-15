"""Production companion_chat Hands scaffold (Nervas + identity + Alembic).

Mirrors services/ai_chat — never emit InMemoryChatStore or NERVAS_NOT_WIRED in src/.
"""

from __future__ import annotations

import json
from typing import Any


def _use_case_class_name(service_name: str) -> str:
    return "".join(part.title() for part in service_name.split("_") if part) + "UseCases"


def companion_chat_file_map(
    action: Any,
    service_name: str,
    *,
    features: list[str],
    port: int,
    domain_hint: str,
) -> dict[str, str]:
    """Companion chat turn scaffold — durable store, Nervas, identity gate."""
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        manifest_ui_block,
    )

    env_prefix = service_name.upper()
    use_case_class = _use_case_class_name(service_name)
    title = domain_hint.replace("_", " ").title()
    err_prefix = env_prefix
    feat = list(features)
    for token in (
        "health",
        "companion_chat",
        "nervas_peer",
        "identity_gated_writes",
    ):
        if token not in feat:
            feat.append(token)
    # Drop canary tags if present
    feat = [t for t in feat if t != "reflex_scaffold"]
    manifest = {
        "name": service_name,
        "version": "0.2.0",
        "features": feat,
        "entry_point": "src/api/main.py",
        "dependencies": [
            "empery_intelligence_core",
            "identity_service",
        ],
        "publishes": [f"{service_name}.message.created"],
        "subscribes": [],
        "ui": manifest_ui_block(service_name, required=True),
    }
    return {
        "manifest.json": json.dumps(manifest, indent=2) + "\n",
        "config.py": _config_py(service_name, port, env_prefix),
        "src/core/contracts.py": _contracts(service_name),
        "src/core/models.py": _MODELS,
        "src/core/use_cases.py": _use_cases(service_name, use_case_class, err_prefix),
        "src/data/schemas.py": _SCHEMAS,
        "src/data/orm.py": _ORM,
        "src/data/repository.py": _repository(service_name),
        "src/integration/__init__.py": (
            '"""Prefer NervasClient → EIC; IdentityVerifier via HTTP introspect. '
            'Never Fake* in src/."""\n'
        ),
        "src/integration/nervas_client.py": _NERVAS_CLIENT,
        "src/integration/identity_adapter.py": _identity_adapter(err_prefix),
        "src/api/routes.py": _routes(service_name, use_case_class),
        "src/api/main.py": _main_py(
            service_name=service_name,
            env_prefix=env_prefix,
            use_case_class=use_case_class,
            description=f"Production companion chat via EIC Nervas + identity ({title})",
        ),
        "alembic.ini": _alembic_ini(service_name),
        "alembic/env.py": _alembic_env(service_name),
        "alembic/script.py.mako": _ALEMBIC_MAKO,
        "alembic/versions/0001_create_chat_tables.py": _alembic_revision(service_name),
        "tests/test_health.py": action.health_test_py(service_name),
        "tests/test_domain.py": _domain_test(service_name, err_prefix),
    }


_MODELS = '''"""Companion chat domain models."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ChatMessage(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID = Field(default_factory=uuid4)
    user_id: UUID | None = None
    role: str
    content: str
    created_at: datetime = Field(default_factory=_utcnow)
    session_id: UUID | None = None
'''

_SCHEMAS = '''"""Companion chat API schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class MessageResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    role: str
    content: str
    created_at: datetime


class MessageListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    messages: list[MessageResponse]
    count: int
'''

_ORM = '''"""SQLAlchemy ORM for companion chat sessions/messages."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, DateTime, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import Uuid


class Base(DeclarativeBase):
    """Declarative base for companion tables."""


class ChatSessionRow(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False, default="default")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    owner_id: Mapped[object] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
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


class ChatMessageRow(Base):
    __tablename__ = "chat_messages"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
'''

_NERVAS_CLIENT = '''"""
HTTP client for EIC Nervas — peers call EIC over HTTP, never import EIC internals.
"""

from __future__ import annotations

from typing import Any

import httpx


class NervasClient:
    def __init__(self, base_url: str, *, timeout_seconds: float = 180.0) -> None:
        self.base_url = base_url.rstrip("/")
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

_ALEMBIC_MAKO = '''"""Alembic script template."""

${imports}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
'''


def _config_py(service_name: str, port: int, env_prefix: str) -> str:
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
        description="SQLAlchemy/Alembic database URL",
    )
    auto_create_tables: bool = Field(
        default=False,
        description="create_all for sqlite/tests only; Postgres uses Alembic",
    )
    eic_api_base: str = Field(
        default="http://127.0.0.1:8007",
        description="EIC HTTP base for Nervas chat",
    )
    identity_base_url: str = Field(
        default="http://127.0.0.1:8003",
        description="Identity introspect base",
    )
    identity_mode: str = Field(
        default="http",
        description="Identity verification mode: http | container",
    )
    nervas_timeout_seconds: float = 180.0
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
            "http://127.0.0.1:5175",
            "http://localhost:5175",
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
        eic_api_base=_env("EIC_API_BASE", "http://127.0.0.1:8007").strip().rstrip("/"),
        identity_base_url=_env(
            "IDENTITY_API_BASE",
            _env("IDENTITY_BASE_URL", "http://127.0.0.1:8003"),
        )
        .strip()
        .rstrip("/"),
        identity_mode=_env("IDENTITY_MODE", "http"),
        nervas_timeout_seconds=float(_env("{env_prefix}_NERVAS_TIMEOUT", "180")),
        cors_origins=_csv_env(
            "{env_prefix}_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174,"
            "http://127.0.0.1:5175,http://localhost:5175,"
            "http://127.0.0.1:5173,http://localhost:5173",
        ),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
'''


def _contracts(service_name: str) -> str:
    return f'''"""Ports for {service_name}."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from services.{service_name}.src.core.models import ChatMessage


class ChatStorePort(Protocol):
    async def append(
        self,
        role: str,
        content: str,
        *,
        user_id: UUID | None = None,
        session_id: UUID | None = None,
    ) -> ChatMessage: ...

    async def list(
        self,
        *,
        limit: int = 50,
        user_id: UUID | None = None,
    ) -> list[ChatMessage]: ...
'''


def _repository(service_name: str) -> str:
    return f'''"""Postgres-backed chat store for {service_name}."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import func, select

from core.data.database import DatabaseManager
from services.{service_name}.src.core.models import ChatMessage
from services.{service_name}.src.data.orm import ChatMessageRow, ChatSessionRow


class ChatMessageRepository:
    def __init__(self, database: DatabaseManager) -> None:
        self._db = database

    def _to_message(self, row: ChatMessageRow) -> ChatMessage:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        meta = row.metadata_json if isinstance(row.metadata_json, dict) else {{}}
        user_id = meta.get("user_id")
        return ChatMessage(
            id=row.id,  # type: ignore[arg-type]
            user_id=UUID(str(user_id)) if user_id else None,
            role=row.role,
            content=row.content,
            created_at=created,
            session_id=row.session_id,  # type: ignore[arg-type]
        )

    def _ensure_session(self, session, owner_id: UUID) -> UUID:
        row = session.scalar(
            select(ChatSessionRow)
            .where(ChatSessionRow.owner_id == owner_id)
            .where(ChatSessionRow.status == "active")
            .order_by(ChatSessionRow.updated_at.desc())
            .limit(1)
        )
        if row is not None:
            return row.id  # type: ignore[return-value]
        sid = uuid4()
        now = datetime.now(timezone.utc)
        session.add(
            ChatSessionRow(
                id=sid,
                title="default",
                status="active",
                owner_id=owner_id,
                created_at=now,
                updated_at=now,
            )
        )
        session.flush()
        return sid

    async def append(
        self,
        role: str,
        content: str,
        *,
        user_id: UUID | None = None,
        session_id: UUID | None = None,
    ) -> ChatMessage:
        if user_id is None:
            raise ValueError("user_id required for durable chat store")
        with self._db.session_scope() as session:
            sid = session_id or self._ensure_session(session, user_id)
            next_seq = session.scalar(
                select(func.coalesce(func.max(ChatMessageRow.sequence), 0)).where(
                    ChatMessageRow.session_id == sid
                )
            )
            seq = int(next_seq or 0) + 1
            row = ChatMessageRow(
                session_id=sid,
                role=role,
                content=content,
                sequence=seq,
                metadata_json={{"user_id": str(user_id)}},
            )
            session.add(row)
            sess = session.get(ChatSessionRow, sid)
            if sess is not None:
                sess.updated_at = datetime.now(timezone.utc)
            session.flush()
            return self._to_message(row)

    async def list(
        self,
        *,
        limit: int = 50,
        user_id: UUID | None = None,
    ) -> list[ChatMessage]:
        if user_id is None:
            return []
        with self._db.session_scope() as session:
            sid = session.scalar(
                select(ChatSessionRow.id)
                .where(ChatSessionRow.owner_id == user_id)
                .where(ChatSessionRow.status == "active")
                .order_by(ChatSessionRow.updated_at.desc())
                .limit(1)
            )
            if sid is None:
                return []
            rows = list(
                session.scalars(
                    select(ChatMessageRow)
                    .where(ChatMessageRow.session_id == sid)
                    .order_by(ChatMessageRow.sequence.asc())
                ).all()
            )
            sliced = rows[-limit:]
            return [self._to_message(r) for r in sliced]
'''


def _identity_adapter(err_prefix: str) -> str:
    return f'''"""Identity verification adapter — HTTP introspect only."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import httpx

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.integration.identity_verifier import (
    IdentityPrincipal,
    IdentityVerifyResponse,
)
from core.logging import log_event


def strip_bearer_token(authorization: str | None) -> str:
    if authorization is None or not authorization.strip():
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="{err_prefix}_UNAUTHORIZED",
                message="Missing Authorization bearer token",
            ),
            http_status=401,
        )
    value = authorization.strip()
    prefix = "Bearer "
    if not value.startswith(prefix):
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="{err_prefix}_UNAUTHORIZED",
                message="Malformed Authorization header; expected Bearer token",
            ),
            http_status=401,
        )
    token = value[len(prefix) :].strip()
    if not token:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="{err_prefix}_UNAUTHORIZED",
                message="Empty bearer token",
            ),
            http_status=401,
        )
    return token


def _unauthorized(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="{err_prefix}_UNAUTHORIZED",
            message="Identity verification failed",
            details={{"reason": reason}},
        ),
        http_status=401,
    )


def _identity_unavailable(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="IDENTITY_UNAVAILABLE",
            message="Identity verifier is not available",
            details={{"reason": reason}},
        ),
        http_status=503,
    )


class IdentityVerifierAdapter:
    """HTTP introspect adapter implementing IdentityVerifier protocol."""

    def __init__(
        self,
        *,
        mode: str,
        container: ServiceContainer,
        base_url: str,
        logger: logging.Logger,
        timeout_seconds: float = 5.0,
    ) -> None:
        self._mode = mode
        self._container = container
        self._base_url = base_url.rstrip("/")
        self._logger = logger
        self._timeout_seconds = timeout_seconds

    def verify_bearer_token(self, authorization: str | None) -> IdentityPrincipal:
        token = strip_bearer_token(authorization)
        return self.verify_token(token)

    def verify_token(self, token: str) -> IdentityPrincipal:
        raw = token.strip()
        if raw.startswith("Bearer "):
            raw = strip_bearer_token(raw)
        if not raw:
            raise _unauthorized("empty token")
        if self._mode == "http":
            return self._verify_http(raw)
        try:
            verifier = self._container.resolve("identity_verifier")
        except KeyError as exc:
            raise _identity_unavailable(
                "identity_verifier peer not registered"
            ) from exc
        if verifier is self:
            raise _identity_unavailable(
                "identity_verifier peer not registered; provide Fake in tests only"
            )
        try:
            return verifier.verify_token(raw)
        except ServiceError:
            raise
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="companion.identity.rejected",
                message="Identity verifier rejected token",
                level=logging.WARNING,
                reason=str(exc),
            )
            raise _unauthorized(str(exc)) from exc

    def introspect(self, token: str) -> IdentityVerifyResponse:
        try:
            principal = self.verify_token(token)
            return IdentityVerifyResponse(active=True, principal=principal)
        except ServiceError as exc:
            if exc.response.error_code == "{err_prefix}_UNAUTHORIZED":
                return IdentityVerifyResponse(
                    active=False,
                    error=exc.response.message,
                )
            raise

    def _verify_http(self, token: str) -> IdentityPrincipal:
        url = f"{{self._base_url}}/api/v1/auth/introspect"
        try:
            with httpx.Client(timeout=self._timeout_seconds) as client:
                response = client.post(
                    url,
                    json={{"token": token}},
                    headers={{"Authorization": f"Bearer {{token}}"}},
                )
        except httpx.HTTPError as exc:
            raise _identity_unavailable(f"identity HTTP error: {{exc}}") from exc

        if response.status_code in {{401, 403}}:
            raise _unauthorized(f"identity returned {{response.status_code}}")
        if response.status_code >= 500:
            raise _identity_unavailable(
                f"identity returned {{response.status_code}}"
            )
        if response.status_code != 200:
            raise _unauthorized(f"identity returned {{response.status_code}}")

        try:
            payload: dict[str, Any] = response.json()
        except ValueError as exc:
            raise _identity_unavailable("invalid identity JSON response") from exc

        if not payload.get("active", False):
            raise _unauthorized(payload.get("error") or "token inactive")

        principal_data = payload.get("principal") or payload
        user_id = (
            principal_data.get("user_id")
            or principal_data.get("sub")
            or payload.get("user_id")
            or payload.get("sub")
        )
        email = principal_data.get("email") or payload.get("email") or ""
        if user_id is None:
            raise _unauthorized("identity response missing user_id")
        try:
            return IdentityPrincipal(
                user_id=UUID(str(user_id)),
                email=str(email),
                roles=list(principal_data.get("roles") or []),
                permissions=list(principal_data.get("permissions") or []),
            )
        except (TypeError, ValueError) as exc:
            raise _unauthorized("invalid identity principal") from exc
'''


def _use_cases(service_name: str, use_case_class: str, err_prefix: str) -> str:
    return f'''"""Companion chat use cases for {service_name} — living Nervas, identity-gated."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event
from core.integration.identity_verifier import IdentityPrincipal
from core.logging import log_event

from services.{service_name}.src.data.schemas import (
    MessageListResponse,
    MessageResponse,
    SendMessageRequest,
)
from services.{service_name}.src.integration.identity_adapter import strip_bearer_token
from services.{service_name}.src.integration.nervas_client import NervasClient

_SYSTEM = (
    "You are an Empery companion on the production path. Be concise and helpful. "
    "Reply in the user's language. Never invent FakeAI stubs or ack: echoes."
)


class {use_case_class}:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._logger = container.resolve("logger")
        self._event_bus = container.resolve("event_bus")

    def _store(self):
        return self._container.resolve("chat_store")

    def _nervas(self) -> NervasClient:
        return self._container.resolve("nervas_client")

    def _config(self):
        return self._container.resolve("config")

    def _require_actor(self, authorization: str | None) -> IdentityPrincipal:
        token = strip_bearer_token(authorization)
        try:
            verifier = self._container.resolve("identity_verifier")
        except KeyError as exc:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_UNAVAILABLE",
                    message="Identity verifier is not available",
                    details={{"reason": "identity_verifier not registered"}},
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
                    details={{"reason": str(exc)}},
                ),
                http_status=401,
            ) from exc

    async def health(self) -> dict[str, Any]:
        cfg = self._config()
        nervas_ok = False
        detail: str | None = None
        backend: str | None = None
        try:
            body = await self._nervas().health()
            nervas = body.get("nervas") if isinstance(body, dict) else None
            if isinstance(nervas, dict):
                nervas_ok = bool(nervas.get("ready"))
                detail = str(nervas.get("detail") or nervas.get("backend") or "ok")
                backend = str(nervas.get("backend") or "")
            else:
                detail = "missing nervas block"
        except Exception as exc:  # noqa: BLE001
            detail = str(exc)[:200]
        return {{
            "status": "ok" if nervas_ok else "degraded",
            "service": cfg.service_name,
            "version": "0.2.0",
            "nervas": {{
                "base_url": cfg.eic_api_base,
                "ready": nervas_ok,
                "detail": detail,
                "backend": backend,
            }},
        }}

    async def send(
        self,
        req: SendMessageRequest,
        *,
        authorization: str | None,
    ) -> MessageResponse:
        actor = self._require_actor(authorization)
        store = self._store()
        user_msg = await store.append(
            "user",
            req.content,
            user_id=actor.user_id,
        )
        history = await store.list(limit=24, user_id=actor.user_id)
        messages: list[dict[str, str]] = [{{"role": "system", "content": _SYSTEM}}]
        for m in history:
            if m.role not in {{"user", "assistant"}}:
                continue
            messages.append({{"role": m.role, "content": m.content}})
        try:
            raw = await self._nervas().chat(messages=messages)
        except Exception as exc:  # noqa: BLE001
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="{err_prefix}_NERVAS_FAILED",
                    message=f"Nervas chat failed: {{exc}}",
                ),
                http_status=502,
            ) from exc
        message = raw.get("message") if isinstance(raw, dict) else None
        content = ""
        if isinstance(message, dict):
            content = str(message.get("content") or "").strip()
        if not content:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="{err_prefix}_NERVAS_EMPTY",
                    message="Nervas returned empty assistant content",
                ),
                http_status=502,
            )
        if content.lower().startswith("ack:"):
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="{err_prefix}_ECHO_FORBIDDEN",
                    message="Echo/canary assistant content is forbidden on production path",
                ),
                http_status=502,
            )
        assistant = await store.append(
            "assistant",
            content,
            user_id=actor.user_id,
        )
        await self._event_bus.publish(
            Event(
                name="{service_name}.message.created",
                payload={{
                    "user_message_id": str(user_msg.id),
                    "assistant_message_id": str(assistant.id),
                    "user_id": str(actor.user_id),
                    "backend": str(raw.get("backend") or ""),
                }},
                occurred_at=datetime.now(timezone.utc).isoformat(),
                source="{service_name}",
            )
        )
        return MessageResponse(
            id=user_msg.id,
            role=user_msg.role,
            content=user_msg.content,
            created_at=user_msg.created_at,
        )

    async def list_messages(
        self,
        *,
        authorization: str | None,
        limit: int = 50,
    ) -> MessageListResponse:
        actor = self._require_actor(authorization)
        store = self._store()
        msgs = await store.list(limit=limit, user_id=actor.user_id)
        items = [
            MessageResponse(
                id=m.id, role=m.role, content=m.content, created_at=m.created_at
            )
            for m in msgs
        ]
        return MessageListResponse(messages=items, count=len(items))
'''


def _routes(service_name: str, use_case_class: str) -> str:
    return f'''"""HTTP routes for {service_name} companion chat."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.{service_name}.src.core.use_cases import {use_case_class}
from services.{service_name}.src.data.schemas import (
    MessageListResponse,
    MessageResponse,
    SendMessageRequest,
)

router = APIRouter(tags=["{service_name}"])


@router.get("/health")
async def health(request: Request) -> dict:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.health()


@router.post("/messages", response_model=MessageResponse, status_code=201)
async def send_message(request: Request, body: SendMessageRequest) -> MessageResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.send(
        body,
        authorization=request.headers.get("Authorization"),
    )


@router.get("/messages", response_model=MessageListResponse)
async def list_messages(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> MessageListResponse:
    uc: {use_case_class} = request.app.state.container.resolve("service_use_cases")
    return await uc.list_messages(
        authorization=request.headers.get("Authorization"),
        limit=limit,
    )
'''


def _main_py(
    *,
    service_name: str,
    env_prefix: str,
    use_case_class: str,
    description: str,
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
from services.{service_name}.src.data.repository import ChatMessageRepository
from services.{service_name}.src.integration.identity_adapter import IdentityVerifierAdapter
from services.{service_name}.src.integration.nervas_client import NervasClient


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
        "chat_store",
        lambda c: ChatMessageRepository(
            resolve_service_database_manager(c, svc),
        ),
    )
    container.register(
        "nervas_client",
        lambda _c, cfg=config: NervasClient(
            cfg.eic_api_base,
            timeout_seconds=cfg.nervas_timeout_seconds,
        ),
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
    container.register(
        "service_use_cases",
        lambda c: {use_case_class}(c),
    )


async def _bootstrap_database(
    container: ServiceContainer,
    config: ServiceConfig,
) -> None:
    db: DatabaseManager = resolve_service_database_manager(
        container, config.service_name
    )
    logger = container.resolve("logger")
    if config.database_url.startswith("sqlite"):
        register_sqlite_fk_pragma(db.engine)
    if config.auto_create_tables or config.database_url.startswith("sqlite"):
        db.create_all(Base.metadata)
        log_event(
            logger,
            event="{service_name}.db.schema_ready",
            message="Database schema ensured via create_all",
        )


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
        log_event(
            app.state.container.resolve("logger"),
            event="{service_name}.app.startup",
            message="{service_name} started",
            port=runtime_config.port,
            eic_api_base=runtime_config.eic_api_base,
        )
        try:
            yield
        finally:
            await ensure_event_bus_stopped(app.state.container.resolve("event_bus"))
            log_event(
                app.state.container.resolve("logger"),
                event="{service_name}.app.shutdown",
                message="{service_name} stopped",
            )

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="{description}",
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
    """Register this service in the Global Service Registry."""
    registry.register(load_manifest(), create_app)
'''


def _alembic_ini(service_name: str) -> str:
    return f"""[alembic]
script_location = %(here)s/alembic
prepend_sys_path = .
version_path_separator = os

sqlalchemy.url = postgresql+psycopg://eworld:eworld@localhost:5432/{service_name}

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = json

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = json

[formatter_json]
format = %(message)s
"""


def _alembic_env(service_name: str) -> str:
    return f'''"""Alembic migration environment for {service_name}."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from services.{service_name}.config import get_config
from services.{service_name}.src.data.orm import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

service_config = get_config()
config.set_main_option("sqlalchemy.url", service_config.database_url)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={{"paramstyle": "named"}},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {{}}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
'''


def _alembic_revision(service_name: str) -> str:
    return f'''"""create chat_sessions + chat_messages for {service_name}

Revision ID: 0001
Revises:
Create Date: 2026-07-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("owner_id", sa.Uuid(as_uuid=True), nullable=False),
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
    op.create_index("ix_chat_sessions_owner_id", "chat_sessions", ["owner_id"])

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("session_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column(
            "metadata_json",
            postgresql.JSON(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])


def downgrade() -> None:
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
'''


def _domain_test(service_name: str, err_prefix: str) -> str:
    from services.empery_intelligence_core.src.integration.scaffold_test_emitters import (
        companion_domain_test,
    )

    return companion_domain_test(service_name, err_prefix)

