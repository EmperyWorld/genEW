"""P7.1/P7.2: blocking workspace I/O off the event loop with hard budgets."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any
from unittest.mock import MagicMock

import pytest

from core.errors import ServiceError
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
    HeadlessAgentLoop,
)


def _loop() -> HeadlessAgentLoop:
    return HeadlessAgentLoop(
        store=MagicMock(),
        prompts=MagicMock(),
        nervas=MagicMock(),
        workspace=MagicMock(),
        memory_hooks=None,
        ecc_bridge=MagicMock(),
        event_bus=MagicMock(),
        config=MagicMock(),
        logger=logging.getLogger("test.p7_offload"),
    )


def test_run_blocking_keeps_event_loop_responsive() -> None:
    """While sync work sleeps in a thread, other awaitables still progress."""

    loop = _loop()

    async def _slow() -> str:
        def _block() -> str:
            time.sleep(0.25)
            return "done"

        return await loop._run_blocking(_block)

    async def _probe() -> list[float]:
        ticks: list[float] = []
        start = time.monotonic()
        while time.monotonic() - start < 0.2:
            await asyncio.sleep(0.02)
            ticks.append(time.monotonic() - start)
        return ticks

    async def _run() -> None:
        slow_task = asyncio.create_task(_slow())
        probe_task = asyncio.create_task(_probe())
        ticks, result = await asyncio.gather(probe_task, slow_task)
        assert result == "done"
        assert len(ticks) >= 3, f"event loop stalled; ticks={ticks}"

    asyncio.run(_run())


def test_run_blocking_passes_args_and_kwargs() -> None:
    loop = _loop()

    def _add(a: int, *, b: int) -> int:
        return a + b

    async def _run() -> None:
        assert await loop._run_blocking(_add, 2, b=3) == 5

    asyncio.run(_run())


def test_run_blocking_propagates_exceptions() -> None:
    loop = _loop()

    def _boom() -> Any:
        raise RuntimeError("deploy_stall")

    async def _run() -> None:
        with pytest.raises(RuntimeError, match="deploy_stall"):
            await loop._run_blocking(_boom)

    asyncio.run(_run())


def test_run_blocking_timed_raises_service_error_on_budget() -> None:
    loop = _loop()

    def _hang() -> str:
        time.sleep(1.0)
        return "late"

    async def _run() -> None:
        with pytest.raises(ServiceError) as caught:
            await loop._run_blocking_timed(
                _hang,
                timeout_s=0.05,
                error_code="EIC_DEPLOY_TIMEOUT",
                message="in-loop deploy_service exceeded blocking budget",
            )
        assert caught.value.response.error_code == "EIC_DEPLOY_TIMEOUT"
        assert caught.value.http_status == 504
        assert caught.value.response.details.get("timeout_s") == 0.05

    asyncio.run(_run())


def test_run_blocking_timed_returns_when_within_budget() -> None:
    loop = _loop()

    async def _run() -> None:
        result = await loop._run_blocking_timed(
            lambda: "ok",
            timeout_s=1.0,
            error_code="EIC_DEPLOY_TIMEOUT",
            message="should not fire",
        )
        assert result == "ok"

    asyncio.run(_run())


def test_config_deploy_timeout_defaults() -> None:
    cfg = ServiceConfig()
    assert cfg.deploy_agent_timeout_s == 120.0
    assert cfg.deploy_blocking_budget_s == 180.0
    assert cfg.live_verify_budget_s == 150.0
