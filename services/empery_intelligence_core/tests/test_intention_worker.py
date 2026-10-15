"""Tests for IntentionWorker polling / concurrency."""

from __future__ import annotations

import asyncio
from pathlib import Path

from services.empery_intelligence_core.src.core.reflexes.models import (
    IntentionKind,
    IntentionStatus,
)
from services.empery_intelligence_core.src.data.schemas import IntentionEnqueueRequest
from services.empery_intelligence_core.tests.conftest import make_container


def test_worker_claims_pending_and_completes(tmp_path: Path) -> None:
    container, bus, cfg = make_container(
        tmp_path, worker_enabled=True, autonomous_enabled=True
    )
    # Rebuild worker with enabled config already in container
    uc = container.resolve("eic_reflexes_use_cases")
    worker = container.resolve("intention_worker")
    worker.set_paused(False)

    async def _run() -> None:
        await uc.enqueue(
            IntentionEnqueueRequest(
                intent="worker implement demo",
                service_name="worker_svc",
                kind=IntentionKind.IMPLEMENT,
            )
        )
        did = await worker.tick_once()
        assert did is True
        items = await uc.list(status=IntentionStatus.COMPLETED, limit=10)
        assert items.count == 1
        names = {e.name for e in bus.published}
        assert "eic.intention.claimed" in names
        assert "eic.intention.completed" in names

    asyncio.run(_run())


def test_worker_respects_pause_flag(tmp_path: Path) -> None:
    container, _bus, _cfg = make_container(tmp_path)
    uc = container.resolve("eic_reflexes_use_cases")
    worker = container.resolve("intention_worker")
    worker.set_paused(True)

    async def _run() -> None:
        await uc.enqueue(
            IntentionEnqueueRequest(intent="paused worker", service_name="p_svc")
        )
        did = await worker.tick_once()
        assert did is False
        pending = await uc.list(status=IntentionStatus.PENDING, limit=10)
        assert pending.count == 1

    asyncio.run(_run())


def test_concurrency_one_at_a_time(tmp_path: Path) -> None:
    container, _bus, _cfg = make_container(tmp_path)
    uc = container.resolve("eic_reflexes_use_cases")
    worker = container.resolve("intention_worker")
    worker.set_paused(False)

    async def _run() -> None:
        await uc.enqueue(
            IntentionEnqueueRequest(intent="one", service_name="c1_svc")
        )
        await uc.enqueue(
            IntentionEnqueueRequest(intent="two", service_name="c2_svc")
        )
        # Simulate active work blocking second claim
        worker._active_intention_id = (await uc.list(limit=1)).intentions[0].id
        did = await worker.tick_once()
        assert did is False
        pending = await uc.list(status=IntentionStatus.PENDING, limit=10)
        assert pending.count == 2

    asyncio.run(_run())
