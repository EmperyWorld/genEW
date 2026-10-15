"""Reflexes use cases — enqueue / pause / resume / cancel / list."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event, EventBus
from core.logging import log_event

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.core.di import resolve_eic_config
from services.empery_intelligence_core.src.core.reflexes import events as ev
from services.empery_intelligence_core.src.core.reflexes.lifecycle import (
    entry_stage_for,
)
from services.empery_intelligence_core.src.core.reflexes.models import (
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopCheckpoint,
    LoopStage,
)
from pathlib import Path

from services.empery_intelligence_core.src.data.intention_store import IntentionStore
from services.empery_intelligence_core.src.data.schemas import (
    IntentionEnqueueRequest,
    IntentionListResponse,
    IntentionResponse,
    WorkerHealthResponse,
)
from services.empery_intelligence_core.src.integration.service_scaffold import (
    should_force_full_autonomous_loop,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ReflexesUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _store(self) -> IntentionStore:
        return self._container.resolve("intention_store")

    def _bus(self) -> EventBus:
        return self._container.resolve("event_bus")

    def _config(self) -> ServiceConfig:
        return resolve_eic_config(self._container)

    def _logger(self) -> logging.Logger:
        return self._container.resolve("logger")

    def _worker(self) -> Any | None:
        if self._container.has("intention_worker"):
            return self._container.resolve("intention_worker")
        return None

    def _resolve_kind(self, req: IntentionEnqueueRequest) -> IntentionKind:
        """Upgrade Wizard plan/implement for new services to full EVOLVE loop."""
        cfg = self._config()
        workspace = Path(getattr(cfg, "workspace_root", ".") or ".")
        if should_force_full_autonomous_loop(
            kind=req.kind.value,
            intent=req.intent,
            service_name=req.service_name,
            workspace_root=workspace,
        ):
            log_event(
                self._logger(),
                event="eic.use_cases.kind_upgraded",
                message="Upgraded intention kind to evolve for full autonomous genesis",
                from_kind=req.kind.value,
                to_kind=IntentionKind.EVOLVE.value,
                service_name=req.service_name,
            )
            return IntentionKind.EVOLVE
        return req.kind

    async def enqueue(self, req: IntentionEnqueueRequest) -> IntentionResponse:
        now = _utc_now()
        kind = self._resolve_kind(req)
        stage = (
            LoopStage.QUEUED
            if kind == IntentionKind.EVOLVE
            else entry_stage_for(kind)
        )
        # implement/verify may seed design_path
        if kind == IntentionKind.IMPLEMENT and not req.design_path:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_VALIDATION_ERROR",
                    message="design_path required for implement kind",
                    details={},
                ),
                http_status=422,
            )
        from services.empery_intelligence_core.src.integration.service_scaffold import (
            requires_named_service,
            validate_genesis_service_name,
        )
        from services.empery_intelligence_core.src.integration.evolve_enqueue_gate import (
            evolve_enqueue_violation,
            evolve_missing_capsule_violation,
        )

        metadata = dict(req.metadata)
        violation = evolve_enqueue_violation(
            metadata, intent=req.intent, kind=kind.value
        )
        if violation:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_EVOLVE_PICK_REQUIRED",
                    message=violation,
                    details={"field": "metadata.selected_option"},
                ),
                http_status=422,
            )

        resolved_service_name = req.service_name
        if requires_named_service(intent=req.intent, kind=kind.value):
            try:
                resolved_service_name = validate_genesis_service_name(req.service_name)
            except ValueError as exc:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_VALIDATION_ERROR",
                        message=str(exc),
                        details={"field": "service_name"},
                    ),
                    http_status=422,
                ) from exc
        missing_capsule = evolve_missing_capsule_violation(
            workspace=Path(getattr(self._config(), "workspace_root", ".") or "."),
            service_name=resolved_service_name,
            kind=kind.value,
            intent=req.intent,
            metadata=metadata,
        )
        if missing_capsule:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_EVOLVE_NO_CAPSULE",
                    message=missing_capsule,
                    details={
                        "field": "service_name",
                        "service_name": resolved_service_name,
                    },
                ),
                http_status=422,
            )
        if kind != req.kind:
            metadata["requested_kind"] = req.kind.value
            metadata["resolved_kind"] = kind.value
        checkpoint = LoopCheckpoint(
            stage=stage,
            design_path=req.design_path,
            updated_at=now,
        )
        intention = Intention(
            id=uuid4(),
            kind=kind,
            status=IntentionStatus.PENDING,
            intent=req.intent,
            service_name=resolved_service_name,
            features=list(req.features),
            ecc_job_id=req.ecc_job_id,
            checkpoint=checkpoint,
            created_at=now,
            updated_at=now,
            metadata=metadata,
        )
        created = await self._store().create(intention)
        await self._bus().publish(
            Event(
                name=ev.INTENTION_CREATED,
                payload={
                    "intention_id": str(created.id),
                    "kind": created.kind.value,
                    "service_name": created.service_name,
                    "ecc_job_id": str(created.ecc_job_id)
                    if created.ecc_job_id
                    else None,
                    "intent_preview": created.intent[:200],
                },
            )
        )
        log_event(
            self._logger(),
            event="eic.use_cases.enqueued",
            message="Intention enqueued",
            intention_id=str(created.id),
            kind=created.kind.value,
        )
        return IntentionResponse(intention=created)

    async def get(self, intention_id: UUID) -> IntentionResponse:
        intention = await self._store().get(intention_id)
        if intention is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_INTENTION_NOT_FOUND",
                    message=f"Intention '{intention_id}' not found",
                    details={"intention_id": str(intention_id)},
                ),
                http_status=404,
            )
        return IntentionResponse(intention=intention)

    async def list(
        self,
        *,
        status: IntentionStatus | None = None,
        kind: IntentionKind | None = None,
        limit: int = 50,
    ) -> IntentionListResponse:
        items = await self._store().list(status=status, kind=kind, limit=limit)
        return IntentionListResponse(intentions=items, count=len(items))

    async def pause(self, intention_id: UUID) -> IntentionResponse:
        worker = self._worker()
        if worker is not None and getattr(worker, "active_intention_id", None) == intention_id:
            loop = self._container.resolve("headless_agent_loop")
            loop.request_pause(intention_id)
        paused = await self._store().pause(intention_id, reason="api_pause")
        await self._bus().publish(
            Event(
                name=ev.INTENTION_PAUSED,
                payload={
                    "intention_id": str(paused.id),
                    "reason": "api_pause",
                    "stage": paused.checkpoint.stage.value,
                },
            )
        )
        return IntentionResponse(intention=paused)

    async def resume(self, intention_id: UUID) -> IntentionResponse:
        resumed = await self._store().resume(intention_id)
        await self._bus().publish(
            Event(
                name=ev.INTENTION_RESUMED,
                payload={
                    "intention_id": str(resumed.id),
                    "stage": resumed.checkpoint.stage.value,
                },
            )
        )
        return IntentionResponse(intention=resumed)

    async def cancel(self, intention_id: UUID) -> IntentionResponse:
        worker = self._worker()
        if worker is not None and getattr(worker, "active_intention_id", None) == intention_id:
            loop = self._container.resolve("headless_agent_loop")
            loop.request_cancel(intention_id)
        cancelled = await self._store().cancel(intention_id)
        return IntentionResponse(intention=cancelled)

    async def worker_health(self) -> WorkerHealthResponse:
        depths = await self._store().depths()
        worker = self._worker()
        return WorkerHealthResponse(
            worker_enabled=self._config().worker_enabled,
            pending=depths.get("pending", 0),
            running=depths.get("running", 0),
            paused=depths.get("paused", 0),
            last_tick_at=getattr(worker, "last_tick_at", None) if worker else None,
            active_intention_id=getattr(worker, "active_intention_id", None)
            if worker
            else None,
        )

    async def handle_intention_requested(self, event: Event) -> None:
        """EventBus subscriber for eic.intention.requested."""
        payload = event.payload or {}
        req = IntentionEnqueueRequest(
            intent=str(payload.get("intent") or payload.get("intention") or ""),
            kind=IntentionKind(payload["kind"])
            if payload.get("kind")
            else IntentionKind.EVOLVE,
            service_name=payload.get("service_name"),
            features=list(payload.get("features") or []),
            ecc_job_id=UUID(payload["ecc_job_id"])
            if payload.get("ecc_job_id")
            else None,
            design_path=payload.get("design_path"),
            metadata=dict(payload.get("metadata") or {}),
        )
        if not req.intent:
            log_event(
                self._logger(),
                event="eic.use_cases.requested_invalid",
                message="Ignoring intention.requested without intent",
                level=logging.WARNING,
            )
            return
        await self.enqueue(req)
