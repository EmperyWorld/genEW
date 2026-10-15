"""Ports used by the Autonomous Mode facade (Protocols for A1–A3)."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from services.empery_intelligence_core.src.data.schemas_autonomous import (
    AutonomousJob,
    AutonomousJobStatus,
    AutonomousModeResponse,
    LlmHealthResponse,
    MemorySearchResponse,
    ProviderConfigResponse,
    ProviderId,
    SetProviderResponse,
    SubmitIntentionRequest,
    SubmitIntentionResponse,
)


class EicQueuePort(Protocol):
    async def enqueue_intention(
        self, req: SubmitIntentionRequest
    ) -> SubmitIntentionResponse: ...

    async def list_jobs(
        self, *, status: AutonomousJobStatus | None, limit: int
    ) -> list[AutonomousJob]: ...

    async def get_job(self, job_id: UUID) -> AutonomousJob | None: ...

    async def pause(self, job_id: UUID) -> AutonomousJob: ...

    async def resume(self, job_id: UUID) -> AutonomousJob: ...

    async def cancel(self, job_id: UUID) -> AutonomousJob: ...

    async def get_mode(self) -> AutonomousModeResponse: ...

    async def set_mode(self, enabled: bool) -> AutonomousModeResponse: ...


class EicMemoryPort(Protocol):
    async def search(self, query: str, *, limit: int) -> MemorySearchResponse: ...


class NervasProviderRegistryPort(Protocol):
    def list_providers(self) -> ProviderConfigResponse: ...

    async def set_active(
        self, provider_id: ProviderId, *, llm_base_url: str | None
    ) -> SetProviderResponse: ...

    async def health(self) -> LlmHealthResponse: ...


class EicAutonomousPort(Protocol):
    """Facade surface resolved by ECC (`eic_autonomous_use_cases` / `eic_gateway`)."""

    async def submit_intention(
        self, req: SubmitIntentionRequest
    ) -> SubmitIntentionResponse: ...

    async def list_jobs(
        self, *, status: AutonomousJobStatus | None = None, limit: int = 50
    ): ...

    async def get_job(self, job_id: UUID): ...

    async def pause_job(self, job_id: UUID): ...

    async def resume_job(self, job_id: UUID): ...

    async def cancel_job(self, job_id: UUID): ...

    async def get_mode(self) -> AutonomousModeResponse: ...

    async def set_mode(self, enabled: bool) -> AutonomousModeResponse: ...

    async def get_providers(self) -> ProviderConfigResponse: ...

    async def set_provider(
        self, provider_id: ProviderId, *, llm_base_url: str | None = None
    ) -> SetProviderResponse: ...

    async def search_memory(
        self, query: str, *, limit: int = 10, service_name: str | None = None
    ) -> MemorySearchResponse: ...

    async def llm_health(self) -> LlmHealthResponse: ...
