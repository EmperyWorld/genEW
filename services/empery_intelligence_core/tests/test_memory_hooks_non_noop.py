"""P8.4 — memory hooks must not be noop when use cases are wired."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from core.logging import configure_logging
from services.empery_intelligence_core.src.integration.memory_hook_adapter import (
    MemoryHookAdapter,
    NoopMemoryHooks,
)


@pytest.mark.asyncio
async def test_memory_hook_adapter_delegates_to_use_cases() -> None:
    memory = MagicMock()
    memory.record_plan_decision = AsyncMock()
    memory.record_verify_report = AsyncMock()
    adapter = MemoryHookAdapter(memory, configure_logging("mem_hooks"))
    intention = MagicMock()
    intention.id = "intent-1"
    await adapter.record_plan_decision(intention, "plan summary")
    await adapter.record_verify_report(intention, status="PASSED", summary="ok")
    memory.record_plan_decision.assert_awaited_once()
    memory.record_verify_report.assert_awaited_once()


@pytest.mark.asyncio
async def test_noop_hooks_log_when_unwired() -> None:
    hooks = NoopMemoryHooks(configure_logging("noop_hooks"))
    intention = MagicMock()
    intention.id = "intent-2"
    await hooks.record_plan_decision(intention, "s")
    await hooks.record_verify_report(intention, status="FAILED", summary="f")


@pytest.mark.asyncio
async def test_adapter_falls_back_to_noop_without_use_cases() -> None:
    adapter = MemoryHookAdapter(None, configure_logging("unwired"))
    intention = MagicMock()
    intention.id = "intent-3"
    # Must not raise
    await adapter.record_plan_decision(intention, "s")
    await adapter.record_verify_report(intention, status="PASSED", summary="ok")
