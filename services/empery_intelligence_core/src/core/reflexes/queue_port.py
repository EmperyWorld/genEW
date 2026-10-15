"""eic_queue_port — facade over ReflexesUseCases for Autonomous Mode / ECC."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from core.errors import ServiceError, StandardizedErrorResponse

from services.empery_intelligence_core.src.core.di import resolve_eic_config
from services.empery_intelligence_core.src.core.reflexes.models import (
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopStage,
)
from services.empery_intelligence_core.src.core.reflexes.use_cases import ReflexesUseCases
from services.empery_intelligence_core.src.data.schemas import IntentionEnqueueRequest
from services.empery_intelligence_core.src.data.schemas_autonomous import (
    AutonomousJob,
    AutonomousJobStatus,
    AutonomousModeResponse,
    AutonomousModeState,
    AutonomousStage,
    IntentionRecord,
    ProviderId,
    SubmitIntentionRequest,
    SubmitIntentionResponse,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


_STATUS_MAP = {
    IntentionStatus.PENDING: AutonomousJobStatus.QUEUED,
    IntentionStatus.RUNNING: AutonomousJobStatus.RUNNING,
    IntentionStatus.PAUSED: AutonomousJobStatus.PAUSED,
    IntentionStatus.COMPLETED: AutonomousJobStatus.COMPLETED,
    IntentionStatus.FAILED: AutonomousJobStatus.FAILED,
    IntentionStatus.CANCELLED: AutonomousJobStatus.CANCELLED,
}

_STAGE_MAP = {
    LoopStage.QUEUED: AutonomousStage.INTAKE,
    LoopStage.PLAN: AutonomousStage.PLAN,
    LoopStage.IMPLEMENT: AutonomousStage.IMPLEMENT,
    LoopStage.VERIFY: AutonomousStage.VERIFY,
    LoopStage.FIX: AutonomousStage.IMPLEMENT,
    LoopStage.DONE: AutonomousStage.DONE,
}

_FROM_JOB_STATUS = {
    AutonomousJobStatus.QUEUED: IntentionStatus.PENDING,
    AutonomousJobStatus.RUNNING: IntentionStatus.RUNNING,
    AutonomousJobStatus.PAUSED: IntentionStatus.PAUSED,
    AutonomousJobStatus.COMPLETED: IntentionStatus.COMPLETED,
    AutonomousJobStatus.FAILED: IntentionStatus.FAILED,
    AutonomousJobStatus.CANCELLED: IntentionStatus.CANCELLED,
}


def intention_to_autonomous_job(
    intention: Intention, *, provider_id: ProviderId = ProviderId.FAKE
) -> AutonomousJob:
    return AutonomousJob(
        id=intention.id,
        intention_id=intention.id,
        status=_STATUS_MAP[intention.status],
        stage=_STAGE_MAP.get(intention.checkpoint.stage, AutonomousStage.INTAKE),
        intention_text=intention.intent,
        service_name=intention.service_name,
        provider_id=provider_id,
        created_at=intention.created_at,
        updated_at=intention.updated_at,
        started_at=intention.started_at,
        finished_at=intention.finished_at,
        result_summary=intention.result_summary,
        error_message=intention.error_message,
        artifact_paths=list(intention.checkpoint.artifact_paths),
        ecc_job_id=intention.ecc_job_id,
        metadata={
            **intention.metadata,
            **(
                {"verify_status": intention.checkpoint.verify_status}
                if intention.checkpoint.verify_status
                else (
                    {"verify_status": intention.metadata.get("verify_status")}
                    if intention.metadata.get("verify_status")
                    else {}
                )
            ),
        },
    )


class EicQueuePortAdapter:
    """Implements EicQueuePort against Intention store / use cases."""

    def __init__(self, use_cases: ReflexesUseCases, container: Any) -> None:
        self._uc = use_cases
        self._container = container
        self._mode_enabled: bool | None = None
        self._mode_updated_at = _utc_now()

    def _provider_id(self) -> ProviderId:
        cfg = resolve_eic_config(self._container)
        raw = getattr(cfg, "provider_id", "fake") or "fake"
        try:
            return ProviderId(raw if raw != "local_llama" else "local")
        except ValueError:
            return ProviderId.FAKE

    def _cfg_enabled(self) -> bool:
        if self._mode_enabled is not None:
            return self._mode_enabled
        return bool(resolve_eic_config(self._container).autonomous_enabled)

    async def enqueue_intention(
        self, req: SubmitIntentionRequest
    ) -> SubmitIntentionResponse:
        if not self._cfg_enabled():
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MODE_DISABLED",
                    message="Autonomous Mode is off; enable mode before enqueueing",
                ),
                http_status=409,
            )
        raw_kind = getattr(req, "kind", None)
        if isinstance(raw_kind, IntentionKind):
            kind = raw_kind
        elif isinstance(raw_kind, str) and raw_kind.strip():
            kind = IntentionKind(raw_kind.strip().lower())
        else:
            kind = IntentionKind.EVOLVE
        enqueue = IntentionEnqueueRequest(
            intent=req.intention,
            kind=kind,
            service_name=req.service_name,
            features=list(req.features),
            ecc_job_id=getattr(req, "ecc_job_id", None),
            design_path=getattr(req, "design_path", None),
            metadata={**dict(req.metadata or {}), "priority": req.priority},
        )
        resp = await self._uc.enqueue(enqueue)
        intention = resp.intention
        record = IntentionRecord(
            id=intention.id,
            text=intention.intent,
            service_name=intention.service_name,
            features=list(intention.features),
            priority=int(intention.metadata.get("priority", 0)),
            created_at=intention.created_at,
            metadata=dict(intention.metadata),
        )
        return SubmitIntentionResponse(
            intention=record,
            job=intention_to_autonomous_job(intention, provider_id=self._provider_id()),
        )

    async def list_jobs(
        self, *, status: AutonomousJobStatus | None, limit: int
    ) -> list[AutonomousJob]:
        mapped = _FROM_JOB_STATUS.get(status) if status is not None else None
        items = await self._uc.list(status=mapped, limit=limit)
        pid = self._provider_id()
        return [intention_to_autonomous_job(i, provider_id=pid) for i in items.intentions]

    async def get_job(self, job_id: UUID) -> AutonomousJob | None:
        try:
            resp = await self._uc.get(job_id)
        except ServiceError:
            return None
        return intention_to_autonomous_job(resp.intention, provider_id=self._provider_id())

    async def pause(self, job_id: UUID) -> AutonomousJob:
        resp = await self._uc.pause(job_id)
        return intention_to_autonomous_job(resp.intention, provider_id=self._provider_id())

    async def resume(self, job_id: UUID) -> AutonomousJob:
        resp = await self._uc.resume(job_id)
        return intention_to_autonomous_job(resp.intention, provider_id=self._provider_id())

    async def cancel(self, job_id: UUID) -> AutonomousJob:
        resp = await self._uc.cancel(job_id)
        return intention_to_autonomous_job(resp.intention, provider_id=self._provider_id())

    async def get_mode(self) -> AutonomousModeResponse:
        enabled = self._cfg_enabled()
        worker = (
            self._container.resolve("intention_worker")
            if self._container.has("intention_worker")
            else None
        )
        paused = bool(getattr(worker, "_paused", False))
        if enabled and paused:
            state = AutonomousModeState.PAUSED
        elif enabled:
            state = AutonomousModeState.ON
        else:
            state = AutonomousModeState.OFF
        return AutonomousModeResponse(
            state=state,
            enabled=enabled,
            active_job_id=getattr(worker, "active_intention_id", None),
            provider_id=self._provider_id(),
            updated_at=self._mode_updated_at,
        )

    async def set_mode(self, enabled: bool) -> AutonomousModeResponse:
        self._mode_enabled = enabled
        self._mode_updated_at = _utc_now()
        if self._container.has("intention_worker"):
            worker = self._container.resolve("intention_worker")
            worker.set_paused(not enabled)
        return await self.get_mode()
