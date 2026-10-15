"""Shared fixtures for empery_control_center_api tests."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from core.container import ServiceContainer
from core.event_bus import EventBus
from core.registry import GlobalServiceRegistry
from services.empery_control_center_api.config import ServiceConfig, clear_config_cache
from services.empery_control_center_api.src.api.main import create_app, register
from services.empery_control_center_api.src.integration.registry_adapter import (
    RegistrySnapshotAdapter,
)


class RecordingEventBus(EventBus):
    """EventBus that records published events for assertions."""

    def __init__(self) -> None:
        super().__init__()
        self.published: list = []

    async def publish(self, event) -> None:  # type: ignore[no-untyped-def]
        self.published.append(event)
        await super().publish(event)


def make_config(tmp_path: Path, **overrides) -> ServiceConfig:
    values = {
        "orchestration_root": str(tmp_path / "orchestration"),
        "port": 8006,
        "job_claim_ttl_seconds": 3600,
        "max_audit_lines": 500,
        "allow_demo_runner": True,
        # Unit tests opt out of market auth; production default remains true.
        "require_auth": False,
    }
    values.update(overrides)
    return ServiceConfig(**values)


def build_test_app(
    tmp_path: Path,
    *,
    event_bus: Any = None,
    config: ServiceConfig | None = None,
    registry: GlobalServiceRegistry | None = None,
) -> tuple[Any, Any]:
    """Create ECC app with temp orchestration root and optional registry."""
    container = ServiceContainer()
    bus = event_bus or RecordingEventBus()
    container.register("event_bus", lambda _c: bus)
    if registry is not None:
        container.register(
            "registry_snapshot",
            lambda _c: RegistrySnapshotAdapter(registry),
        )
    cfg = config or make_config(tmp_path)
    return create_app(container=container, config=cfg), bus


@pytest.fixture(autouse=True)
def _clear_config(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    clear_config_cache()
    yield
    clear_config_cache()


@pytest.fixture
def ecc_registry() -> GlobalServiceRegistry:
    registry = GlobalServiceRegistry()
    register(registry)
    return registry
