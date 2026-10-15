"""Thread-safe live publisher for StreamAssembly → EventBus ``eic.assembler.step``."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from core.event_bus import Event, EventBus
from core.logging import log_event
from services.empery_intelligence_core.src.core.reflexes import events as ev

_logger = logging.getLogger("empery_intelligence_core.assembler_progress")


def unpublished_assembler_steps(
    progress_steps: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Steps still needing post-hoc EventBus publish (skip live + dedupe)."""
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, Any]] = []
    for step in progress_steps:
        if step.get("live_published"):
            continue
        req_id = str(step.get("request_id") or "")
        step_name = str(step.get("step") or "")
        key = (req_id, step_name)
        if req_id and step_name and key in seen:
            continue
        if req_id and step_name:
            seen.add(key)
        out.append(step)
    return out


class LiveAssemblerProgressPublisher:
    """Publish mid-stream assembler steps from a worker thread onto the asyncio bus."""

    def __init__(
        self,
        bus: EventBus,
        *,
        logger: logging.Logger | None = None,
        publish_timeout_s: float = 2.0,
    ) -> None:
        self._bus = bus
        self._logger = logger or _logger
        self._loop: asyncio.AbstractEventLoop | None = None
        self._timeout_s = publish_timeout_s

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def __call__(self, entry: dict[str, Any]) -> None:
        payload = dict(entry)
        payload.pop("live_published", None)
        event = Event(
            name=ev.ASSEMBLER_STEP,
            payload=payload,
            source="empery_intelligence_core",
        )
        loop = self._loop
        if loop is None or not loop.is_running():
            log_event(
                self._logger,
                event="eic.assembler.step_publish_skipped",
                message="No running event loop for live assembler progress",
                step=payload.get("step"),
                level=logging.DEBUG,
            )
            return
        fut = asyncio.run_coroutine_threadsafe(self._bus.publish(event), loop)
        try:
            fut.result(timeout=self._timeout_s)
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="eic.assembler.step_publish_failed",
                message="Live assembler progress publish timed out or failed",
                error=str(exc)[:300],
                step=payload.get("step"),
                level=logging.WARNING,
            )
            raise
