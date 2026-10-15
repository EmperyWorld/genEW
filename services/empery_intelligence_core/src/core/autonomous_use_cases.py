"""EicAutonomousUseCases — sole facade ECC resolves for Autonomous Mode."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event, EventBus
from core.logging import log_event
from services.empery_intelligence_core.src.data.schemas_autonomous import (
    AutonomousJob,
    AutonomousJobListResponse,
    AutonomousJobResponse,
    AutonomousJobStatus,
    AutonomousModeResponse,
    AutonomousModeState,
    AutonomousStage,
    IntentionRecord,
    LlmHealthResponse,
    MemorySearchHit,
    MemorySearchResponse,
    ProviderConfigResponse,
    ProviderId,
    SetProviderResponse,
    SubmitIntentionRequest,
    SubmitIntentionResponse,
)

_STAGE_ALIASES = {
    "queued": AutonomousStage.INTAKE,
    "intake": AutonomousStage.INTAKE,
    "architect": AutonomousStage.PLAN,
    "plan": AutonomousStage.PLAN,
    "implement": AutonomousStage.IMPLEMENT,
    "implementer": AutonomousStage.IMPLEMENT,
    "fix": AutonomousStage.IMPLEMENT,
    "verify": AutonomousStage.VERIFY,
    "verifier": AutonomousStage.VERIFY,
    "done": AutonomousStage.DONE,
    "completed": AutonomousStage.DONE,
}


def _as_job(raw: Any) -> AutonomousJob:
    if isinstance(raw, AutonomousJob):
        return raw
    data = raw.model_dump() if hasattr(raw, "model_dump") else dict(raw)
    stage = str(data.get("stage", "intake")).lower()
    data["stage"] = _STAGE_ALIASES.get(stage, AutonomousStage.INTAKE)
    status = str(data.get("status", "queued")).lower()
    try:
        data["status"] = AutonomousJobStatus(status)
    except ValueError:
        data["status"] = AutonomousJobStatus.QUEUED
    try:
        data["provider_id"] = ProviderId(str(data.get("provider_id", "fake")))
    except ValueError:
        data["provider_id"] = ProviderId.FAKE
    return AutonomousJob.model_validate(data)


def _as_mode(raw: Any) -> AutonomousModeResponse:
    if isinstance(raw, AutonomousModeResponse):
        return raw
    data = raw.model_dump() if hasattr(raw, "model_dump") else dict(raw)
    if "state" in data and not isinstance(data["state"], AutonomousModeState):
        data["state"] = AutonomousModeState(str(data["state"]))
    if "provider_id" in data and not isinstance(data["provider_id"], ProviderId):
        data["provider_id"] = ProviderId(str(data["provider_id"]))
    return AutonomousModeResponse.model_validate(data)


def _as_submit(raw: Any) -> SubmitIntentionResponse:
    if isinstance(raw, SubmitIntentionResponse):
        return raw
    data = raw.model_dump() if hasattr(raw, "model_dump") else dict(raw)
    intention = data["intention"]
    if not isinstance(intention, IntentionRecord):
        intention = IntentionRecord.model_validate(
            intention.model_dump() if hasattr(intention, "model_dump") else intention
        )
    return SubmitIntentionResponse(intention=intention, job=_as_job(data["job"]))


class EicAutonomousUseCases:
    """Orchestrates queue / memory / Nervas registry ports + event publish."""

    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _logger(self) -> logging.Logger:
        return self._container.resolve("logger")

    def _bus(self) -> EventBus:
        return self._container.resolve("event_bus")

    def _queue(self) -> Any:
        if not self._container.has("eic_queue_port"):
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_QUEUE_UNAVAILABLE",
                    message="eic_queue_port is not registered",
                ),
                http_status=503,
            )
        return self._container.resolve("eic_queue_port")

    def _memory(self) -> Any:
        if not self._container.has("eic_memory_port"):
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MEMORY_UNAVAILABLE",
                    message="eic_memory_port is not registered",
                ),
                http_status=503,
            )
        return self._container.resolve("eic_memory_port")

    def _providers(self) -> Any:
        if self._container.has("nervas_provider_registry"):
            return self._container.resolve("nervas_provider_registry")
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_PROVIDER_UNAVAILABLE",
                message="nervas_provider_registry is not registered",
            ),
            http_status=502,
        )

    async def _publish(self, name: str, payload: dict) -> None:
        await self._bus().publish(Event(name=name, payload=payload))

    async def submit_intention(
        self, req: SubmitIntentionRequest
    ) -> SubmitIntentionResponse:
        mode = _as_mode(await self._queue().get_mode())
        if not mode.enabled:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MODE_DISABLED",
                    message="Autonomous Mode is off; enable mode before enqueueing",
                ),
                http_status=409,
            )
        result = _as_submit(await self._queue().enqueue_intention(req))
        await self._publish(
            "eic.intention.submitted",
            {
                "intention_id": str(result.intention.id),
                "job_id": str(result.job.id),
                "status": result.job.status.value,
                "stage": result.job.stage.value,
                "provider_id": result.job.provider_id.value,
                "ts": datetime.now(timezone.utc).isoformat(),
            },
        )
        await self._publish(
            "eic.job.queued",
            {
                "job_id": str(result.job.id),
                "status": result.job.status.value,
                "stage": result.job.stage.value,
                "provider_id": result.job.provider_id.value,
                "ts": datetime.now(timezone.utc).isoformat(),
            },
        )
        log_event(
            self._logger(),
            event="eic.intention.submitted",
            message="Intention enqueued",
            job_id=str(result.job.id),
        )
        return result

    async def list_jobs(
        self,
        *,
        status: AutonomousJobStatus | None = None,
        limit: int = 50,
    ) -> AutonomousJobListResponse:
        jobs = await self._queue().list_jobs(status=status, limit=limit)
        return AutonomousJobListResponse(
            jobs=[_as_job(j) for j in jobs],
            total=len(jobs),
        )

    async def get_job(self, job_id: UUID) -> AutonomousJobResponse:
        job = await self._queue().get_job(job_id)
        if job is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_JOB_NOT_FOUND",
                    message=f"Autonomous job {job_id} not found",
                ),
                http_status=404,
            )
        return AutonomousJobResponse(job=_as_job(job))

    async def pause_job(self, job_id: UUID) -> AutonomousJobResponse:
        job = _as_job(await self._queue().pause(job_id))
        await self._publish(
            "eic.job.paused",
            {
                "job_id": str(job.id),
                "status": job.status.value,
                "stage": job.stage.value,
                "provider_id": job.provider_id.value,
                "ts": datetime.now(timezone.utc).isoformat(),
            },
        )
        return AutonomousJobResponse(job=job)

    async def resume_job(self, job_id: UUID) -> AutonomousJobResponse:
        job = _as_job(await self._queue().resume(job_id))
        await self._publish(
            "eic.job.resumed",
            {
                "job_id": str(job.id),
                "status": job.status.value,
                "stage": job.stage.value,
                "provider_id": job.provider_id.value,
                "ts": datetime.now(timezone.utc).isoformat(),
            },
        )
        return AutonomousJobResponse(job=job)

    async def cancel_job(self, job_id: UUID) -> AutonomousJobResponse:
        job = _as_job(await self._queue().cancel(job_id))
        await self._publish(
            "eic.job.cancelled",
            {
                "job_id": str(job.id),
                "status": job.status.value,
                "stage": job.stage.value,
                "provider_id": job.provider_id.value,
                "ts": datetime.now(timezone.utc).isoformat(),
            },
        )
        return AutonomousJobResponse(job=job)

    async def get_mode(self) -> AutonomousModeResponse:
        return _as_mode(await self._queue().get_mode())

    async def set_mode(self, enabled: bool) -> AutonomousModeResponse:
        mode = _as_mode(await self._queue().set_mode(enabled))
        await self._publish(
            "eic.mode.changed",
            {
                "state": mode.state.value,
                "enabled": mode.enabled,
                "provider_id": mode.provider_id.value,
                "ts": datetime.now(timezone.utc).isoformat(),
            },
        )
        return mode

    async def get_providers(self) -> ProviderConfigResponse:
        return self._providers().list_providers()

    async def set_provider(
        self, provider_id: ProviderId, *, llm_base_url: str | None = None
    ) -> SetProviderResponse:
        result = await self._providers().set_active(
            provider_id, llm_base_url=llm_base_url
        )
        await self._publish(
            "eic.provider.changed",
            {
                "provider_id": result.config.active_provider_id.value,
                "switched": result.switched,
                "ts": datetime.now(timezone.utc).isoformat(),
            },
        )
        return result

    async def search_memory(
        self, query: str, *, limit: int = 10, service_name: str | None = None
    ) -> MemorySearchResponse:
        raw = await self._memory().search(
            query, limit=limit, service_name=service_name
        )
        if isinstance(raw, MemorySearchResponse):
            return raw
        if hasattr(raw, "model_dump"):
            raw = raw.model_dump(mode="json")
        if not isinstance(raw, dict):
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MEMORY_UNAVAILABLE",
                    message="Memory port returned unexpected payload",
                ),
                http_status=503,
            )
        hits: list[MemorySearchHit] = []
        for item in raw.get("results") or raw.get("hits") or []:
            if isinstance(item, MemorySearchHit):
                hits.append(item)
                continue
            if hasattr(item, "model_dump"):
                item = item.model_dump(mode="json")
            atom = item.get("atom") if isinstance(item, dict) else None
            if isinstance(atom, dict):
                prov = atom.get("provenance") if isinstance(atom.get("provenance"), dict) else {}
                hits.append(
                    MemorySearchHit(
                        atom_id=str(atom.get("id", "")),
                        kind=str(atom.get("kind", "docs")),
                        title=str(atom.get("title", "")),
                        snippet=str(atom.get("body", ""))[:280],
                        score=item.get("score"),
                        created_at=atom.get("created_at"),
                        service_name=(
                            str(prov.get("service_name"))
                            if prov.get("service_name")
                            else None
                        ),
                    )
                )
            elif isinstance(item, dict):
                hits.append(
                    MemorySearchHit(
                        atom_id=str(item.get("atom_id", item.get("id", ""))),
                        kind=str(item.get("kind", "docs")),
                        title=str(item.get("title", "")),
                        snippet=str(item.get("snippet", item.get("body", "")))[:280],
                        score=item.get("score"),
                        created_at=item.get("created_at"),
                        service_name=(
                            str(item["service_name"])
                            if item.get("service_name")
                            else None
                        ),
                    )
                )
        return MemorySearchResponse(
            query=str(raw.get("query", query)),
            hits=hits[:limit],
            truncated=len(hits) > limit,
        )

    async def llm_health(self) -> LlmHealthResponse:
        health = await self._providers().health()
        await self._publish(
            "eic.llm.health",
            {
                "status": health.status,
                "provider_id": health.provider_id.value,
                "latency_ms": health.latency_ms,
                "ts": health.checked_at.isoformat(),
            },
        )
        return health
