"""Best-effort memory hooks — noop when eic_memory_use_cases is absent."""

from __future__ import annotations

import logging
from typing import Any

from core.logging import log_event

from services.empery_intelligence_core.src.core.reflexes.models import Intention


class NoopMemoryHooks:
    """Default memory hook when Architect 2 providers are not registered."""

    def __init__(self, logger: logging.Logger | None = None) -> None:
        self._logger = logger

    async def record_plan_decision(self, intention: Intention, summary: str) -> None:
        if self._logger:
            log_event(
                self._logger,
                event="eic.memory_hooks.noop_plan",
                message="Memory hooks unavailable; skipping plan atom",
                intention_id=str(intention.id),
            )

    async def record_verify_report(
        self, intention: Intention, *, status: str, summary: str
    ) -> None:
        if self._logger:
            log_event(
                self._logger,
                event="eic.memory_hooks.noop_verify",
                message="Memory hooks unavailable; skipping verify atom",
                intention_id=str(intention.id),
                status=status,
            )


class MemoryHookAdapter:
    """Delegates to eic_memory_use_cases when present; otherwise noop."""

    def __init__(
        self,
        memory_use_cases: Any | None,
        logger: logging.Logger,
    ) -> None:
        self._memory = memory_use_cases
        self._logger = logger
        self._noop = NoopMemoryHooks(logger)

    async def record_plan_decision(self, intention: Intention, summary: str) -> None:
        if self._memory is None:
            await self._noop.record_plan_decision(intention, summary)
            return
        try:
            if hasattr(self._memory, "record_plan_decision"):
                await self._memory.record_plan_decision(intention, summary)
            elif hasattr(self._memory, "store_decision"):
                await self._memory.store_decision(
                    intention_id=str(intention.id), summary=summary
                )
        except Exception as exc:  # noqa: BLE001 — best-effort
            log_event(
                self._logger,
                event="eic.memory_hooks.error",
                message="Plan memory hook failed",
                level=logging.WARNING,
                error=str(exc),
                intention_id=str(intention.id),
            )

    async def record_verify_report(
        self, intention: Intention, *, status: str, summary: str
    ) -> None:
        if self._memory is None:
            await self._noop.record_verify_report(
                intention, status=status, summary=summary
            )
            return
        try:
            if hasattr(self._memory, "record_verify_report"):
                await self._memory.record_verify_report(
                    intention, status=status, summary=summary
                )
            elif hasattr(self._memory, "store_report"):
                await self._memory.store_report(
                    intention_id=str(intention.id),
                    status=status,
                    summary=summary,
                )
        except Exception as exc:  # noqa: BLE001 — best-effort
            log_event(
                self._logger,
                event="eic.memory_hooks.error",
                message="Verify memory hook failed",
                level=logging.WARNING,
                error=str(exc),
                intention_id=str(intention.id),
            )
