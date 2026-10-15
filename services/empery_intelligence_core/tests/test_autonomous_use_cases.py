"""Unit tests for EicAutonomousUseCases facade."""

from __future__ import annotations

import asyncio
from pathlib import Path

from core.container import ServiceContainer
from core.event_bus import Event, EventBus
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.api.wire_autonomous import wire_autonomous
from services.empery_intelligence_core.src.data.schemas_autonomous import (
    ProviderId,
    SubmitIntentionRequest,
)
from core.logging import configure_logging


def _build(tmp_path: Path):
    container = ServiceContainer()
    bus = EventBus()
    container.register("event_bus", lambda _c: bus)
    container.register(
        "logger", lambda _c: configure_logging("eic_autonomous_test")
    )
    cfg = ServiceConfig(
        provider_id="fake",
        autonomous_enabled=True,
        use_fake_nervas=False,
        allow_autonomous_fakes=True,
        worker_enabled=False,
        provider_runtime_path=str(tmp_path / "provider_runtime.json"),
        provider_config_path=str(tmp_path / "nervas_runtime.json"),
        orchestration_root=str(tmp_path / "orchestration"),
        workspace_root=str(tmp_path),
    )
    container.register("config", lambda _c: cfg)
    wire_autonomous(container, cfg)
    return container, bus


def test_submit_intention_delegates_and_publishes(tmp_path: Path) -> None:
    container, bus = _build(tmp_path)
    published: list[Event] = []

    async def _capture(event: Event) -> None:
        published.append(event)

    bus.subscribe("eic.intention.submitted", _capture)
    bus.subscribe("eic.job.queued", _capture)

    uc = container.resolve("eic_autonomous_use_cases")

    async def _run() -> None:
        result = await uc.submit_intention(
            SubmitIntentionRequest(intention="Build autonomous panel")
        )
        assert result.job.intention_text == "Build autonomous panel"
        assert result.job.provider_id == ProviderId.FAKE

    asyncio.run(_run())
    names = {e.name for e in published}
    assert "eic.intention.submitted" in names
    assert "eic.job.queued" in names


def test_mode_toggle_and_job_controls(tmp_path: Path) -> None:
    container, _bus = _build(tmp_path)
    uc = container.resolve("eic_autonomous_use_cases")

    async def _run() -> None:
        mode = await uc.set_mode(True)
        assert mode.enabled is True

        submitted = await uc.submit_intention(
            SubmitIntentionRequest(intention="Pause me")
        )
        job_id = submitted.job.id

        paused = await uc.pause_job(job_id)
        assert paused.job.status.value == "paused"

        resumed = await uc.resume_job(job_id)
        assert resumed.job.status.value == "queued"

        cancelled = await uc.cancel_job(job_id)
        assert cancelled.job.status.value == "cancelled"

    asyncio.run(_run())


def test_provider_switch_and_health(tmp_path: Path) -> None:
    container, _bus = _build(tmp_path)
    uc = container.resolve("eic_autonomous_use_cases")

    async def _run() -> None:
        providers = await uc.get_providers()
        assert providers.active_provider_id == ProviderId.FAKE

        switched = await uc.set_provider(ProviderId.LOCAL)
        assert switched.config.active_provider_id == ProviderId.LOCAL
        assert switched.switched is True

        health = await uc.llm_health()
        assert health.status == "ok"
        assert health.provider_id == ProviderId.LOCAL

    asyncio.run(_run())
