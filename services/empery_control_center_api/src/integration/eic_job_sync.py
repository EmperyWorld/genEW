"""Sync ECC JobStore when EIC mirrors intention lifecycle onto ecc.job.* topics."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from core.event_bus import Event, EventBus
from core.logging import log_event

from services.empery_control_center_api.src.core.models import JobStatus
from services.empery_control_center_api.src.data.job_store import JobStore
from services.empery_control_center_api.src.data.schemas import UpdateJobRequest

_SYNC_TOPICS = (
    "ecc.job.status_changed",
    "ecc.job.completed",
    "ecc.job.failed",
)


class EicJobStoreSync:
    """Apply EIC-mirrored job events to the file-backed ECC JobStore."""

    def __init__(
        self,
        event_bus: EventBus,
        job_store: JobStore,
        logger: logging.Logger,
    ) -> None:
        self._bus = event_bus
        self._store = job_store
        self._logger = logger
        self._active = False

    def start(self) -> None:
        if self._active:
            return
        for topic in _SYNC_TOPICS:
            self._bus.subscribe(topic, self._on_event)
        self._active = True
        log_event(
            self._logger,
            event="ecc.eic_job_sync.started",
            message="Subscribed JobStore sync for EIC-mirrored job events",
            topics=list(_SYNC_TOPICS),
        )

    def stop(self) -> None:
        self._active = False

    async def _on_event(self, event: Event) -> None:
        if not self._active:
            return
        payload = dict(event.payload or {})
        if payload.get("source") != "eic_reflexes":
            return
        job_id_raw = payload.get("job_id") or payload.get("ecc_job_id")
        if not job_id_raw:
            return
        try:
            job_id = UUID(str(job_id_raw))
        except (TypeError, ValueError):
            return
        try:
            await self._apply(job_id, event.name, payload)
        except Exception:  # noqa: BLE001 — never break EventBus
            log_event(
                self._logger,
                event="ecc.eic_job_sync.error",
                message="Failed to sync ECC job from EIC event",
                level=logging.WARNING,
                job_id=str(job_id_raw),
                event_name=event.name,
            )

    async def _apply(
        self, job_id: UUID, event_name: str, payload: dict[str, Any]
    ) -> None:
        job = await self._store.get(job_id)
        if job is None:
            return

        target: JobStatus | None = None
        if event_name.endswith(".completed"):
            target = JobStatus.COMPLETED
        elif event_name.endswith(".failed"):
            target = JobStatus.FAILED
        elif event_name.endswith(".status_changed"):
            # Mark in-flight when EIC claims / advances stages.
            if job.status == JobStatus.PENDING:
                target = JobStatus.RUNNING

        if target is None or target == job.status:
            # Still refresh artifacts/summary when present.
            await self._patch_metadata(job_id, payload)
            return

        # PENDING cannot jump to COMPLETED/FAILED — step through RUNNING.
        if job.status == JobStatus.PENDING and target in {
            JobStatus.COMPLETED,
            JobStatus.FAILED,
        }:
            await self._store.update(
                job_id,
                UpdateJobRequest(
                    status=JobStatus.RUNNING,
                    metadata={"eic_sync": True, "claimed_by": "eic-worker"},
                ),
            )

        summary = payload.get("result_summary") or payload.get("summary")
        error = payload.get("error_message")
        artifacts = payload.get("artifact_paths")
        design = payload.get("design_path")
        report = payload.get("report_path")
        await self._store.update(
            job_id,
            UpdateJobRequest(
                status=target,
                result_summary=str(summary) if summary else None,
                error_message=str(error) if error else None,
                artifact_paths=list(artifacts) if isinstance(artifacts, list) else None,
                design_path=str(design) if design else None,
                report_path=str(report) if report else None,
                metadata={"eic_sync": True, "eic_event": payload.get("eic_event")},
            ),
        )
        log_event(
            self._logger,
            event="ecc.eic_job_sync.updated",
            message="Synced ECC job status from EIC",
            job_id=str(job_id),
            status=target.value,
        )

    async def _patch_metadata(self, job_id: UUID, payload: dict[str, Any]) -> None:
        artifacts = payload.get("artifact_paths")
        design = payload.get("design_path")
        if artifacts is None and design is None:
            return
        await self._store.update(
            job_id,
            UpdateJobRequest(
                artifact_paths=list(artifacts) if isinstance(artifacts, list) else None,
                design_path=str(design) if design else None,
                metadata={"eic_sync": True},
            ),
        )
