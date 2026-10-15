"""Thin in-memory fakes for Autonomous ports when A1–A3 providers are absent."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.data.schemas_autonomous import (
    AutonomousJob,
    AutonomousJobStatus,
    AutonomousModeResponse,
    AutonomousModeState,
    AutonomousStage,
    IntentionRecord,
    LlmHealthResponse,
    MemorySearchHit,
    MemorySearchResponse,
    ProviderConfigResponse,
    ProviderDescriptor,
    ProviderId,
    SetProviderResponse,
    SubmitIntentionRequest,
    SubmitIntentionResponse,
)

_TERMINAL = {
    AutonomousJobStatus.COMPLETED,
    AutonomousJobStatus.FAILED,
    AutonomousJobStatus.CANCELLED,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _eic_error(code: str, message: str, *, http_status: int = 400) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(error_code=code, message=message),
        http_status=http_status,
    )


class InMemoryQueuePort:
    """File-less autonomous queue for CI / ECC tests."""

    def __init__(
        self,
        config: ServiceConfig,
        *,
        provider_id: ProviderId | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        self._config = config
        self._logger = logger
        self._provider_id = provider_id or ProviderId(config.provider_id)
        self._jobs: dict[UUID, AutonomousJob] = {}
        self._mode_enabled = bool(config.autonomous_enabled)
        self._mode_updated = _utcnow()

    def set_provider_id(self, provider_id: ProviderId) -> None:
        self._provider_id = provider_id

    async def enqueue_intention(
        self, req: SubmitIntentionRequest
    ) -> SubmitIntentionResponse:
        if not self._mode_enabled:
            raise _eic_error(
                "EIC_MODE_DISABLED",
                "Autonomous Mode is off; enable mode before enqueueing",
                http_status=409,
            )
        now = _utcnow()
        intention = IntentionRecord(
            id=uuid4(),
            text=req.intention,
            service_name=req.service_name,
            features=list(req.features),
            priority=req.priority,
            created_at=now,
            metadata=dict(req.metadata),
        )
        job = AutonomousJob(
            id=uuid4(),
            intention_id=intention.id,
            status=AutonomousJobStatus.QUEUED,
            stage=AutonomousStage.INTAKE,
            intention_text=req.intention,
            service_name=req.service_name,
            provider_id=self._provider_id,
            created_at=now,
            updated_at=now,
            metadata=dict(req.metadata),
        )
        self._jobs[job.id] = job
        return SubmitIntentionResponse(intention=intention, job=job)

    async def list_jobs(
        self, *, status: AutonomousJobStatus | None, limit: int
    ) -> list[AutonomousJob]:
        jobs = list(self._jobs.values())
        if status is not None:
            jobs = [j for j in jobs if j.status == status]
        jobs.sort(key=lambda j: j.created_at, reverse=True)
        return jobs[:limit]

    async def get_job(self, job_id: UUID) -> AutonomousJob | None:
        return self._jobs.get(job_id)

    async def pause(self, job_id: UUID) -> AutonomousJob:
        job = self._require_job(job_id)
        if job.status not in {
            AutonomousJobStatus.QUEUED,
            AutonomousJobStatus.RUNNING,
        }:
            raise _eic_error(
                "EIC_INVALID_TRANSITION",
                f"Cannot pause job in status {job.status.value}",
                http_status=409,
            )
        return self._replace(job, status=AutonomousJobStatus.PAUSED)

    async def resume(self, job_id: UUID) -> AutonomousJob:
        job = self._require_job(job_id)
        if job.status != AutonomousJobStatus.PAUSED:
            raise _eic_error(
                "EIC_INVALID_TRANSITION",
                f"Cannot resume job in status {job.status.value}",
                http_status=409,
            )
        return self._replace(job, status=AutonomousJobStatus.QUEUED)

    async def cancel(self, job_id: UUID) -> AutonomousJob:
        job = self._require_job(job_id)
        if job.status in _TERMINAL:
            raise _eic_error(
                "EIC_INVALID_TRANSITION",
                f"Cannot cancel job in status {job.status.value}",
                http_status=409,
            )
        return self._replace(
            job,
            status=AutonomousJobStatus.CANCELLED,
            finished_at=_utcnow(),
        )

    async def get_mode(self) -> AutonomousModeResponse:
        state = (
            AutonomousModeState.ON
            if self._mode_enabled
            else AutonomousModeState.OFF
        )
        active = next(
            (
                j.id
                for j in self._jobs.values()
                if j.status == AutonomousJobStatus.RUNNING
            ),
            None,
        )
        return AutonomousModeResponse(
            state=state,
            enabled=self._mode_enabled,
            active_job_id=active,
            provider_id=self._provider_id,
            updated_at=self._mode_updated,
        )

    async def set_mode(self, enabled: bool) -> AutonomousModeResponse:
        self._mode_enabled = enabled
        self._mode_updated = _utcnow()
        return await self.get_mode()

    def _require_job(self, job_id: UUID) -> AutonomousJob:
        job = self._jobs.get(job_id)
        if job is None:
            raise _eic_error(
                "EIC_JOB_NOT_FOUND",
                f"Autonomous job {job_id} not found",
                http_status=404,
            )
        return job

    def _replace(self, job: AutonomousJob, **updates: object) -> AutonomousJob:
        data = job.model_dump()
        data.update(updates)
        data["updated_at"] = _utcnow()
        replaced = AutonomousJob.model_validate(data)
        self._jobs[replaced.id] = replaced
        return replaced


class InMemoryMemoryPort:
    """Light search stub for Autonomous UI when A2 is absent."""

    def __init__(self) -> None:
        self._hits: list[MemorySearchHit] = []

    def seed(self, hits: list[MemorySearchHit]) -> None:
        self._hits = list(hits)

    async def search(self, query: str, *, limit: int) -> MemorySearchResponse:
        q = query.strip().lower()
        matched = [
            h
            for h in self._hits
            if q in h.title.lower() or q in h.snippet.lower() or q in h.kind.lower()
        ]
        if not matched and q:
            # Demo-friendly: synthesize a single hit so UI/search tests work.
            matched = [
                MemorySearchHit(
                    atom_id=f"stub-{abs(hash(query)) % 10_000}",
                    kind="docs",
                    title=f"Stub atom for '{query}'",
                    snippet=f"In-memory memory port match for query: {query}",
                    score=0.5,
                    created_at=_utcnow(),
                )
            ]
        truncated = len(matched) > limit
        return MemorySearchResponse(
            query=query,
            hits=matched[:limit],
            truncated=truncated,
        )


class InMemoryNervasProviderRegistry:
    """Runtime provider switch + health for CI without real LLM."""

    def __init__(
        self,
        config: ServiceConfig,
        *,
        queue: InMemoryQueuePort | None = None,
        health_status: str = "ok",
        logger: logging.Logger | None = None,
    ) -> None:
        self._config = config
        self._queue = queue
        self._logger = logger
        self._active = ProviderId(config.provider_id)
        self._llm_base_url = config.llm_base_url
        self._runtime_override = False
        self._updated_at = _utcnow()
        self._health_status = health_status  # ok | degraded | down
        self._load_runtime()

    def force_health(self, status: str) -> None:
        self._health_status = status

    def list_providers(self) -> ProviderConfigResponse:
        return ProviderConfigResponse(
            active_provider_id=self._active,
            available=self._descriptors(),
            llm_base_url=self._llm_base_url,
            runtime_override=self._runtime_override,
            updated_at=self._updated_at,
        )

    async def set_active(
        self, provider_id: ProviderId, *, llm_base_url: str | None
    ) -> SetProviderResponse:
        if provider_id == ProviderId.OPENAI and not self._config.openai_api_key:
            raise _eic_error(
                "EIC_PROVIDER_NOT_CONFIGURED",
                "OpenAI provider is not configured (missing API key)",
                http_status=400,
            )
        if provider_id == ProviderId.ANTHROPIC and not self._config.anthropic_api_key:
            raise _eic_error(
                "EIC_PROVIDER_NOT_CONFIGURED",
                "Anthropic provider is not configured (missing API key)",
                http_status=400,
            )
        switched = self._active != provider_id or (
            llm_base_url is not None and llm_base_url != self._llm_base_url
        )
        self._active = provider_id
        if llm_base_url:
            self._llm_base_url = llm_base_url
        self._runtime_override = True
        self._updated_at = _utcnow()
        if self._queue is not None:
            self._queue.set_provider_id(provider_id)
        self._persist_runtime()
        return SetProviderResponse(
            config=self.list_providers(),
            switched=switched,
            message=f"Active provider set to {provider_id.value}",
        )

    async def health(self) -> LlmHealthResponse:
        status = self._health_status
        latency = None if status == "down" else 12
        detail = None
        if status == "down":
            detail = "Simulated provider down"
        elif status == "degraded":
            detail = "Simulated provider degraded / timeout"
            latency = self._config.llm_health_timeout_ms
        return LlmHealthResponse(
            status=status,  # type: ignore[arg-type]
            provider_id=self._active,
            base_url=self._llm_base_url,
            latency_ms=latency,
            model="fake-nervas" if self._active == ProviderId.FAKE else "local-llm",
            detail=detail,
            checked_at=_utcnow(),
        )

    def _descriptors(self) -> list[ProviderDescriptor]:
        return [
            ProviderDescriptor(
                id=ProviderId.LOCAL,
                label="Local (llama-cpp)",
                configured=True,
                healthy=True if self._health_status == "ok" else None,
                is_local=True,
            ),
            ProviderDescriptor(
                id=ProviderId.FAKE,
                label="Fake (CI)",
                configured=True,
                healthy=True,
                is_local=True,
            ),
            ProviderDescriptor(
                id=ProviderId.OPENAI,
                label="OpenAI",
                configured=bool(self._config.openai_api_key),
                healthy=None,
                is_local=False,
            ),
            ProviderDescriptor(
                id=ProviderId.ANTHROPIC,
                label="Anthropic",
                configured=bool(self._config.anthropic_api_key),
                healthy=None,
                is_local=False,
            ),
        ]

    def _runtime_path(self) -> Path:
        return Path(self._config.provider_runtime_path)

    def _load_runtime(self) -> None:
        path = self._runtime_path()
        if not path.is_file():
            return
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            provider = ProviderId(raw.get("provider_id", self._active.value))
            self._active = provider
            if raw.get("llm_base_url"):
                self._llm_base_url = str(raw["llm_base_url"])
            self._runtime_override = True
            self._updated_at = _utcnow()
        except (OSError, ValueError, json.JSONDecodeError, KeyError):
            return

    def _persist_runtime(self) -> None:
        path = self._runtime_path()
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                json.dumps(
                    {
                        "provider_id": self._active.value,
                        "llm_base_url": self._llm_base_url,
                        "updated_at": self._updated_at.isoformat(),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
        except OSError:
            return
