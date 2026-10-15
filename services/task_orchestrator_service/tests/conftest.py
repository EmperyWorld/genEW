"""Shared fixtures for task_orchestrator_service tests."""

from __future__ import annotations

from uuid import UUID, uuid4

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import EventBus
from core.integration.identity_verifier import (
    IdentityPrincipal,
    IdentityVerifyResponse,
)
from services.task_orchestrator_service.config import ServiceConfig
from services.task_orchestrator_service.src.api.main import create_app

TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")
VALID_TOKEN = "test-token"


class FakeIdentityVerifier:
    """Test double registered as ``identity_verifier``."""

    def __init__(
        self,
        *,
        user_id: UUID = TEST_USER_ID,
        email: str = "tester@example.com",
        valid_token: str = VALID_TOKEN,
    ) -> None:
        self.user_id = user_id
        self.email = email
        self.valid_token = valid_token

    def verify_token(self, token: str) -> IdentityPrincipal:
        if token != self.valid_token:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="TASK_UNAUTHORIZED",
                    message="Invalid token",
                ),
                http_status=401,
            )
        return IdentityPrincipal(
            user_id=self.user_id,
            email=self.email,
            roles=["member"],
            permissions=[],
        )

    def introspect(self, token: str) -> IdentityVerifyResponse:
        try:
            principal = self.verify_token(token)
            return IdentityVerifyResponse(active=True, principal=principal)
        except ServiceError as exc:
            return IdentityVerifyResponse(active=False, error=exc.response.message)


class RecordingEventBus(EventBus):
    """EventBus that records published events for assertions."""

    def __init__(self) -> None:
        super().__init__()
        self.published: list = []

    async def publish(self, event) -> None:  # type: ignore[no-untyped-def]
        self.published.append(event)
        await super().publish(event)


def test_config(**overrides) -> ServiceConfig:
    values = {
        "database_url": "sqlite+pysqlite:///:memory:",
        "auto_create_tables": True,
        "identity_mode": "container",
        "port": 8004,
    }
    values.update(overrides)
    return ServiceConfig(**values)


def build_test_app(
    *,
    event_bus: EventBus | None = None,
    identity: FakeIdentityVerifier | None = None,
    config: ServiceConfig | None = None,
):
    """Create app with Fake identity_verifier pre-registered."""
    container = ServiceContainer()
    bus = event_bus or RecordingEventBus()
    container.register("event_bus", lambda _c: bus)
    container.register(
        "identity_verifier",
        lambda _c: identity or FakeIdentityVerifier(),
    )
    return create_app(container=container, config=config or test_config())


def auth_headers(token: str = VALID_TOKEN) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def random_uuid() -> UUID:
    return uuid4()
