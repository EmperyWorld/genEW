"""ECC correlation via EventBus only — no ECC module imports."""

from __future__ import annotations

import logging
from typing import Any

from core.event_bus import Event, EventBus
from core.logging import log_event


class EccBridgeAdapter:
    """Publish ECC-facing job status events when ecc_job_id is present."""

    def __init__(self, event_bus: EventBus, logger: logging.Logger) -> None:
        self._bus = event_bus
        self._logger = logger

    async def on_intention_event(
        self, event_name: str, payload: dict[str, Any]
    ) -> None:
        ecc_job_id = payload.get("ecc_job_id")
        if not ecc_job_id:
            return
        mapped: str | None = None
        if event_name.endswith(".completed"):
            mapped = "ecc.job.completed"
        elif event_name.endswith(".failed"):
            mapped = "ecc.job.failed"
        elif event_name.endswith(".stage_changed") or event_name.endswith(".claimed"):
            mapped = "ecc.job.status_changed"
        elif event_name.endswith(".paused") or event_name.endswith(".resumed"):
            mapped = "ecc.job.status_changed"
        if mapped is None:
            return
        await self._bus.publish(
            Event(
                name=mapped,
                payload={
                    "job_id": str(ecc_job_id),
                    "source": "eic_reflexes",
                    "eic_event": event_name,
                    **{k: v for k, v in payload.items() if k != "ecc_job_id"},
                    "ecc_job_id": str(ecc_job_id),
                    "metadata": {"autonomous": True},
                },
            )
        )
        log_event(
            self._logger,
            event="eic.ecc_bridge.mirrored",
            message="Mirrored intention event to ECC topic",
            eic_event=event_name,
            ecc_event=mapped,
            ecc_job_id=str(ecc_job_id),
        )
