"""Background Intention worker — dequeue / resume / concurrency=1."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from core.event_bus import Event, EventBus
from core.logging import log_event

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.core.reflexes import events as ev
from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
    HeadlessAgentLoop,
)
from services.empery_intelligence_core.src.data.intention_store import IntentionStore


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class IntentionWorker:
    """Polls pending Intentions and runs HeadlessAgentLoop one-at-a-time."""

    def __init__(
        self,
        store: IntentionStore,
        loop: HeadlessAgentLoop,
        event_bus: EventBus,
        config: ServiceConfig,
        logger: logging.Logger,
    ) -> None:
        self._store = store
        self._loop = loop
        self._bus = event_bus
        self._config = config
        self._logger = logger
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._last_tick_at: datetime | None = None
        self._active_intention_id: UUID | None = None
        self._paused = False

    @property
    def last_tick_at(self) -> datetime | None:
        return self._last_tick_at

    @property
    def active_intention_id(self) -> UUID | None:
        return self._active_intention_id

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    def set_paused(self, paused: bool) -> None:
        """When True, worker ticks but does not claim new work (autonomous mode)."""
        self._paused = paused

    async def recover_and_resume(self) -> list[UUID]:
        """Boot: recover running→paused; optionally auto-resume interrupted."""
        recovered = await self._store.recover_running()
        ids: list[UUID] = []
        for intention in recovered:
            ids.append(intention.id)
            await self._bus.publish(
                Event(
                    name=ev.INTENTION_PAUSED,
                    payload={
                        "intention_id": str(intention.id),
                        "reason": "interrupted",
                        "stage": intention.checkpoint.stage.value,
                        "ecc_job_id": str(intention.ecc_job_id)
                        if intention.ecc_job_id
                        else None,
                    },
                )
            )
            if self._config.auto_resume_on_boot:
                resumed = await self._store.resume(intention.id)
                await self._bus.publish(
                    Event(
                        name=ev.INTENTION_RESUMED,
                        payload={
                            "intention_id": str(resumed.id),
                            "stage": resumed.checkpoint.stage.value,
                        },
                    )
                )
        return ids

    async def start(self) -> None:
        if self.is_running:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="eic-intention-worker")
        log_event(
            self._logger,
            event="eic.worker.started",
            message="IntentionWorker started",
            poll_seconds=self._config.worker_poll_seconds,
        )

    async def stop(self) -> None:
        self._stop.set()
        if self._active_intention_id is not None:
            self._loop.request_pause(self._active_intention_id)
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=10)
            except asyncio.TimeoutError:
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
            self._task = None
        log_event(
            self._logger,
            event="eic.worker.stopped",
            message="IntentionWorker stopped",
        )

    async def tick_once(self) -> bool:
        """Process at most one intention. Returns True if work was done."""
        self._last_tick_at = _utc_now()
        if self._paused or not self._config.worker_enabled:
            return False
        if self._active_intention_id is not None:
            return False

        await self._store.reclaim_stale_running()
        claimed = await self._store.claim_next(self._config.claimed_by_label)
        if claimed is None:
            return False

        self._active_intention_id = claimed.id
        claim_payload = {
            "intention_id": str(claimed.id),
            "claimed_by": claimed.claimed_by,
            "stage": claimed.checkpoint.stage.value,
            "service_name": claimed.service_name,
        }
        await self._bus.publish(
            Event(name=ev.INTENTION_CLAIMED, payload=claim_payload)
        )
        mirror = ev.job_mirror_payload(ev.INTENTION_CLAIMED, claim_payload)
        if mirror is not None:
            await self._bus.publish(
                Event(name=ev.INTENTION_TO_JOB[ev.INTENTION_CLAIMED], payload=mirror)
            )
        log_event(
            self._logger,
            event="eic.worker.claimed",
            message="Claimed intention",
            intention_id=str(claimed.id),
            stage=claimed.checkpoint.stage.value,
        )
        try:
            result = await self._loop.run(claimed)
            log_event(
                self._logger,
                event="eic.worker.finished",
                message="Intention loop finished",
                intention_id=str(result.id),
                status=result.status.value,
            )
        except Exception as exc:  # noqa: BLE001 — never leave zombie running
            # Crash mid-loop (e.g. RO filesystem) used to leave status=running
            # until stale TTL (1h) — UI looks "stuck" with LLM idle.
            try:
                paused = await self._store.pause(
                    claimed.id,
                    reason=f"worker_tick_error: {exc}"[:400],
                )
                await self._bus.publish(
                    Event(
                        name=ev.INTENTION_PAUSED,
                        payload={
                            "intention_id": str(paused.id),
                            "reason": "worker_tick_error",
                            "stage": paused.checkpoint.stage.value,
                            "error": str(exc)[:240],
                            "ecc_job_id": str(paused.ecc_job_id)
                            if paused.ecc_job_id
                            else None,
                        },
                    )
                )
            except Exception as cleanup_exc:  # noqa: BLE001
                log_event(
                    self._logger,
                    event="eic.worker.cleanup_failed",
                    message="Failed to pause after tick error",
                    level=logging.ERROR,
                    error=str(cleanup_exc),
                    intention_id=str(claimed.id),
                )
            raise
        finally:
            self._active_intention_id = None
        return True

    async def _run(self) -> None:
        while not self._stop.is_set():
            try:
                await self.tick_once()
            except Exception as exc:  # noqa: BLE001 — keep worker alive
                log_event(
                    self._logger,
                    event="eic.worker.tick_error",
                    message="Worker tick failed",
                    level=logging.ERROR,
                    error=str(exc),
                )
            try:
                await asyncio.wait_for(
                    self._stop.wait(),
                    timeout=self._config.worker_poll_seconds,
                )
            except asyncio.TimeoutError:
                continue
