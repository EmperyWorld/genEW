"""Shared helpers for intelligence_service tests."""

from __future__ import annotations

import logging

from core.container import ServiceContainer
from core.logging import configure_logging
from services.intelligence_service.config import ServiceConfig
from services.intelligence_service.src.api.main import create_app
from tests.fakes.fake_ai import FakeAIProvider


def build_intelligence_app(**overrides):
    """Create intelligence app with FakeAI injected (tests/fakes only)."""
    values = {
        "database_url": "sqlite+pysqlite:///:memory:",
        "auto_create_tables": True,
        "use_fake_ai": False,
    }
    values.update(overrides)
    cfg = ServiceConfig(**values)
    container = ServiceContainer()
    log = configure_logging("intelligence_test")
    container.register("logger", lambda _c: log)
    container.register(
        "ai_provider",
        lambda _c: FakeAIProvider(logging.getLogger("intelligence_fake_ai")),
    )
    return create_app(container=container, config=cfg)
