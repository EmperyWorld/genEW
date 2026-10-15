"""ECC use cases — commands, jobs, registry, audit, health."""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event, EventBus, RedisEventBus, _allow_in_memory_event_bus
from core.logging import log_event

from services.empery_control_center_api.config import ServiceConfig
from services.empery_control_center_api.src.core.contracts import (
    AuditReaderPort,
    JobStorePort,
    RegistrySnapshotPort,
    SandboxSessionStorePort,
    WsHubPort,
)
from services.empery_control_center_api.src.core.job_lifecycle import (
    agent_hint_for,
    pickup_hint,
)
from services.empery_control_center_api.src.core.models import (
    JobMode,
    JobStatus,
    LifecycleSkill,
    OrchestrationJob,
)
from services.empery_control_center_api.src.data.schemas import (
    AuditListResponse,
    ClaimJobRequest,
    CreateCommandRequest,
    EvolveCommandRequest,
    HealthResponse,
    ImplementCommandRequest,
    JobListResponse,
    JobResponse,
    OrchestrationPathsResponse,
    PlanCommandRequest,
    RegistrySnapshotResponse,
    SandboxProbeRequest,
    SandboxProbeResponse,
    SandboxSessionResponse,
    ServiceHealthListResponse,
    UpdateJobRequest,
    VerifyCommandRequest,
)
from services.empery_control_center_api.src.integration.service_health_prober import (
    ServiceHealthProber,
)
from services.empery_control_center_api.src.integration.orchestration_paths import (
    OrchestrationPaths,
)
from services.empery_control_center_api.src.integration.event_bridge import (
    EicIntentionBridge,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _redis_configured() -> bool:
    url = os.environ.get("EVENT_BUS_REDIS_URL") or os.environ.get("REDIS_URL")
    return bool(url and url.strip())


def _fabric_from_bus(
    bus: EventBus,
) -> tuple[Literal["redis", "memory", "unknown"], bool, bool]:
    """Return ``(backend, event_bus_ok, redis_configured)`` for health."""
    redis_ok = _redis_configured()
    if isinstance(bus, RedisEventBus):
        return "redis", True, redis_ok
    if isinstance(bus, EventBus):
        return "memory", _allow_in_memory_event_bus(), redis_ok
    return "unknown", False, redis_ok


# Short TTL so StatusBeacon + /health/services share one Nervas probe.
_LLM_HEALTH_CACHE_TTL_S = 5.0


class EccUseCases:
    """Application use cases resolved via ServiceContainer."""

    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._llm_ready_cache: bool | None = None
        self._llm_ready_cached_mono: float = 0.0

    @property
    def _config(self) -> ServiceConfig:
        return self._container.resolve("config")

    @property
    def _logger(self) -> logging.Logger:
        return self._container.resolve("logger")

    @property
    def _job_store(self) -> JobStorePort:
        return self._container.resolve("job_store")

    @property
    def _audit_reader(self) -> AuditReaderPort:
        return self._container.resolve("audit_reader")

    @property
    def _registry(self) -> RegistrySnapshotPort:
        return self._container.resolve("registry_snapshot")

    @property
    def _bus(self) -> EventBus:
        return self._container.resolve("event_bus")

    @property
    def _ws_hub(self) -> WsHubPort:
        return self._container.resolve("ws_hub")

    @property
    def _paths(self) -> OrchestrationPaths:
        return self._container.resolve("orchestration_paths")

    @property
    def _health_prober(self) -> ServiceHealthProber:
        return self._container.resolve("service_health_prober")

    @property
    def _sandbox_store(self) -> SandboxSessionStorePort:
        return self._container.resolve("sandbox_store")

    @property
    def _eic_intention_bridge(self) -> EicIntentionBridge:
        return self._container.resolve("eic_intention_bridge")

    def _job_response(self, job: OrchestrationJob) -> JobResponse:
        return JobResponse(
            job=job,
            pickup_hint=pickup_hint(
                str(job.id), job.skill, design_path=job.design_path
            ),
        )

    async def _probe_llm_ready(self) -> bool | None:
        """Best-effort Nervas readiness via EIC gateway; ``None`` if unavailable."""
        if not self._container.has("eic_gateway"):
            return None
        age = time.monotonic() - self._llm_ready_cached_mono
        if self._llm_ready_cached_mono > 0 and age < _LLM_HEALTH_CACHE_TTL_S:
            return self._llm_ready_cache
        try:
            gateway = self._container.resolve("eic_gateway")
            result = await gateway.llm_health()
            status = getattr(result, "status", None)
            if status is None and isinstance(result, dict):
                status = result.get("status")
            if status is None:
                ready: bool | None = None
            else:
                ready = str(status).lower() == "ok"
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="ecc.health.llm_probe_failed",
                message="LLM fabric probe failed",
                reason=str(exc),
            )
            ready = None
        self._llm_ready_cache = ready
        self._llm_ready_cached_mono = time.monotonic()
        return ready

    async def health(self, *, version: str, service: str) -> HealthResponse:
        paths = self._paths
        jobs_ok = paths.jobs_root.is_dir()
        audit_ok = paths.audit_path.is_file()
        backend, event_bus_ok, redis_configured = _fabric_from_bus(self._bus)
        llm_ready = await self._probe_llm_ready()
        fabric_ok = event_bus_ok and llm_ready is not False
        status = "ok" if jobs_ok and fabric_ok else "degraded"
        return HealthResponse(
            status=status,
            service=service,
            version=version,
            jobs_root_exists=jobs_ok,
            audit_file_exists=audit_ok,
            subscribed_topics=list(self._config.event_subscribe_topics),
            ws_clients=self._ws_hub.client_count(),
            event_bus_backend=backend,
            event_bus_ok=event_bus_ok,
            redis_configured=redis_configured,
            auth_required=self._config.require_auth,
            llm_ready=llm_ready,
        )

    async def services_health(
        self, *, version: str, service: str
    ) -> ServiceHealthListResponse:
        """Batch health for every registry service (probe map or unknown)."""
        local = await self.health(version=version, service=service)
        return await self._health_prober.probe_all(local_status=local.status)

    async def create_command(self, request: CreateCommandRequest) -> JobResponse:
        return await self._enqueue(
            skill=request.skill,
            intent=request.intent,
            service_name=request.service_name,
            features=request.features,
            design_path=request.design_path,
            mode=request.mode,
            metadata=request.metadata,
        )

    async def plan(self, request: PlanCommandRequest) -> JobResponse:
        return await self._enqueue(
            skill=LifecycleSkill.PLAN,
            intent=request.intent,
            service_name=request.service_name,
            features=request.features,
            design_path=None,
            mode=request.mode,
            metadata=request.metadata,
        )

    async def implement(self, request: ImplementCommandRequest) -> JobResponse:
        design = request.design_path
        if design is None and request.service_name:
            design = (
                f".cursor/orchestration/designs/{request.service_name}_design.md"
            )
        return await self._enqueue(
            skill=LifecycleSkill.IMPLEMENT,
            intent=request.intent,
            service_name=request.service_name,
            features=[],
            design_path=design,
            mode=request.mode,
            metadata=request.metadata,
        )

    async def verify(self, request: VerifyCommandRequest) -> JobResponse:
        return await self._enqueue(
            skill=LifecycleSkill.VERIFY,
            intent=request.intent,
            service_name=request.service_name,
            features=[],
            design_path=None,
            mode=request.mode,
            metadata=request.metadata,
        )

    async def evolve(self, request: EvolveCommandRequest) -> JobResponse:
        return await self._enqueue(
            skill=LifecycleSkill.EVOLVE,
            intent=request.intent,
            service_name=request.service_name,
            features=request.features,
            design_path=None,
            mode=request.mode,
            metadata=request.metadata,
        )

    async def _enqueue(
        self,
        *,
        skill: LifecycleSkill,
        intent: str,
        service_name: str | None,
        features: list[str],
        design_path: str | None,
        mode: JobMode,
        metadata: dict[str, Any],
    ) -> JobResponse:
        if mode == JobMode.DEMO:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ECC_DEMO_MODE_REMOVED",
                    message=(
                        "Job mode=demo is removed from the production path. "
                        "Enqueue with mode=agent (Hands / Cursor claim)."
                    ),
                    details={"mode": mode.value},
                ),
                http_status=422,
            )
        now = _utc_now()
        job = OrchestrationJob(
            id=uuid4(),
            skill=skill,
            status=JobStatus.PENDING,
            mode=mode,
            service_name=service_name,
            intent=intent,
            features=list(features),
            design_path=design_path,
            agent_hint=agent_hint_for(skill),
            created_at=now,
            updated_at=now,
            metadata=dict(metadata),
        )
        created = await self._job_store.create(job)

        # Optional intent markdown for agent pickup
        if service_name or intent:
            self._paths.intents_root.mkdir(parents=True, exist_ok=True)
            intent_path = self._paths.intents_root / f"{created.id}.md"
            intent_path.write_text(
                f"# Intent {created.id}\n\n"
                f"Skill: {skill.value}\n"
                f"Service: {service_name or '(none)'}\n\n"
                f"{intent}\n",
                encoding="utf-8",
            )

        await self._bus.publish(
            Event(
                name="ecc.job.created",
                payload={
                    "job_id": str(created.id),
                    "skill": created.skill.value,
                    "service_name": created.service_name,
                    "status": created.status.value,
                    "intent_preview": created.intent[:200],
                    "mode": created.mode.value,
                },
            )
        )
        await self._eic_intention_bridge.publish_for_job(created)
        log_event(
            self._logger,
            event="ecc.command.enqueued",
            message="Lifecycle command enqueued",
            job_id=str(created.id),
            skill=skill.value,
        )
        return self._job_response(created)

    async def list_jobs(
        self,
        *,
        status: JobStatus | None,
        skill: LifecycleSkill | None,
        limit: int,
    ) -> JobListResponse:
        jobs = await self._job_store.list(status=status, skill=skill, limit=limit)
        return JobListResponse(jobs=jobs, count=len(jobs))

    async def get_job(self, job_id: UUID) -> JobResponse:
        job = await self._job_store.get(job_id)
        if job is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ECC_JOB_NOT_FOUND",
                    message=f"Job '{job_id}' not found",
                    details={"job_id": str(job_id)},
                ),
                http_status=404,
            )
        return self._job_response(job)

    async def claim_job(self, job_id: UUID, request: ClaimJobRequest) -> JobResponse:
        job = await self._job_store.claim(job_id, request.claimed_by)
        await self._bus.publish(
            Event(
                name="ecc.job.claimed",
                payload={
                    "job_id": str(job.id),
                    "claimed_by": job.claimed_by,
                    "status": job.status.value,
                },
            )
        )
        await self._bus.publish(
            Event(
                name="ecc.job.status_changed",
                payload={
                    "job_id": str(job.id),
                    "from_status": JobStatus.PENDING.value,
                    "to_status": JobStatus.CLAIMED.value,
                    "skill": job.skill.value,
                },
            )
        )
        return self._job_response(job)

    async def update_job(self, job_id: UUID, request: UpdateJobRequest) -> JobResponse:
        existing = await self._job_store.get(job_id)
        if existing is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ECC_JOB_NOT_FOUND",
                    message=f"Job '{job_id}' not found",
                    details={"job_id": str(job_id)},
                ),
                http_status=404,
            )
        if request.mode == JobMode.DEMO:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ECC_DEMO_MODE_REMOVED",
                    message=(
                        "Job mode=demo is removed from the production path. "
                        "Use mode=agent only."
                    ),
                    details={"mode": "demo"},
                ),
                http_status=422,
            )
        from_status = existing.status
        job = await self._job_store.update(job_id, request)
        if request.status is not None and request.status != from_status:
            await self._bus.publish(
                Event(
                    name="ecc.job.status_changed",
                    payload={
                        "job_id": str(job.id),
                        "from_status": from_status.value,
                        "to_status": job.status.value,
                        "skill": job.skill.value,
                    },
                )
            )
            if job.status == JobStatus.COMPLETED:
                await self._bus.publish(
                    Event(
                        name="ecc.job.completed",
                        payload={
                            "job_id": str(job.id),
                            "artifact_paths": job.artifact_paths,
                            "result_summary": job.result_summary,
                        },
                    )
                )
            elif job.status == JobStatus.FAILED:
                await self._bus.publish(
                    Event(
                        name="ecc.job.failed",
                        payload={
                            "job_id": str(job.id),
                            "error_message": job.error_message,
                        },
                    )
                )
                if job.skill == LifecycleSkill.VERIFY:
                    await self._eic_intention_bridge.publish_for_job(
                        job,
                        kind=LifecycleSkill.EVOLVE,
                        extra_metadata={
                            "trigger": "verify_failed",
                            "source_verify_job_id": str(job.id),
                        },
                    )
        return self._job_response(job)

    async def cancel_job(self, job_id: UUID) -> JobResponse:
        existing = await self._job_store.get(job_id)
        if existing is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ECC_JOB_NOT_FOUND",
                    message=f"Job '{job_id}' not found",
                    details={"job_id": str(job_id)},
                ),
                http_status=404,
            )
        from_status = existing.status
        job = await self._job_store.cancel(job_id)
        await self._bus.publish(
            Event(
                name="ecc.job.status_changed",
                payload={
                    "job_id": str(job.id),
                    "from_status": from_status.value,
                    "to_status": job.status.value,
                    "skill": job.skill.value,
                },
            )
        )
        return self._job_response(job)

    async def registry_snapshot(self) -> RegistrySnapshotResponse:
        return RegistrySnapshotResponse(snapshot=self._registry.snapshot())

    async def registry_refresh(self) -> RegistrySnapshotResponse:
        """Hot-reload: discover new services/*/manifest.json without full stack restart."""
        added: list[str] = []
        try:
            from core.registry import (
                publish_registry_updated,
                refresh_service_registry,
            )

            _reg, added = refresh_service_registry()
            await publish_registry_updated(added=added)
        except Exception:  # noqa: BLE001 — snapshot still returned
            added = []

        # Reload dynamic health bases into the prober (if supported).
        prober = None
        if self._container.has("service_health_prober"):
            prober = self._container.resolve("service_health_prober")
            if hasattr(prober, "reload_dynamic_bases"):
                prober.reload_dynamic_bases()

        snapshot = self._registry.snapshot()
        if self._container.has("event_bridge"):
            bridge = self._container.resolve("event_bridge")
            peer_topics = [
                topic
                for entry in snapshot.services
                if entry.name != "empery_control_center_api"
                for topic in (entry.publishes or [])
            ]
            if peer_topics and hasattr(bridge, "ensure_topics"):
                bridge.ensure_topics(peer_topics)
            elif peer_topics and hasattr(bridge, "subscribe_all"):
                bridge.subscribe_all(peer_topics)

        await self._bus.publish(
            Event(
                name="ecc.registry.refreshed",
                payload={
                    "service_names": [s.name for s in snapshot.services],
                    "count": len(snapshot.services),
                    "added": added,
                    "generated_at": snapshot.generated_at.isoformat(),
                },
            )
        )
        await self._bus.publish(
            Event(
                name="registry.updated",
                payload={
                    "service_names": [s.name for s in snapshot.services],
                    "count": len(snapshot.services),
                    "added": added,
                },
            )
        )
        return RegistrySnapshotResponse(snapshot=snapshot)

    async def read_audit(
        self,
        *,
        limit: int,
        offset: int,
        category: str | None = None,
        exclude_category: str | None = None,
        include_hooks: bool | None = None,
    ) -> AuditListResponse:
        capped = min(limit, self._config.max_audit_lines)

        def _split(raw: str | None) -> set[str] | None:
            if not raw:
                return None
            parts = {p.strip() for p in raw.split(",") if p.strip()}
            return parts or None

        exclude = _split(exclude_category) or set()
        if include_hooks is False:
            exclude.add("audit_hook")
        elif include_hooks is True:
            exclude.discard("audit_hook")

        entries, exists, path = await self._audit_reader.read(
            limit=capped,
            offset=offset,
            categories=_split(category),
            exclude_categories=exclude or None,
        )
        return AuditListResponse(
            entries=entries,
            count=len(entries),
            source_exists=exists,
            source_path=path,
        )

    def orchestration_paths(self) -> OrchestrationPathsResponse:
        paths = self._paths
        return OrchestrationPathsResponse(
            orchestration_root=str(paths.orchestration_root),
            jobs_root=str(paths.jobs_root),
            audit_path=str(paths.audit_path),
            designs_root=str(paths.designs_root),
            reports_root=str(paths.reports_root),
        )

    @staticmethod
    def _topic_looks_destructive(topic: str) -> bool:
        lowered = topic.lower()
        markers = (
            "delete",
            "destroy",
            "revoke",
            "purge",
            "wipe",
            "drop",
            "remove",
        )
        return any(m in lowered for m in markers)

    async def create_sandbox_session(self) -> SandboxSessionResponse:
        session = self._sandbox_store.create()
        log_event(
            self._logger,
            event="ecc.sandbox.session_created",
            message="Sandbox session created",
            session_id=str(session.session_id),
        )
        return SandboxSessionResponse(
            session_id=session.session_id,
            status=session.status,
            created_at=session.created_at,
        )

    async def sandbox_probe(
        self, session_id: UUID, request: SandboxProbeRequest
    ) -> SandboxProbeResponse:
        session = self._sandbox_store.get(session_id)
        if session is None or session.status == "closed":
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ECC_SANDBOX_SESSION_NOT_FOUND",
                    message=f"Sandbox session '{session_id}' not found",
                    details={"session_id": str(session_id)},
                ),
                http_status=404,
            )

        if self._topic_looks_destructive(request.topic) and not request.confirm_destructive:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ECC_SANDBOX_CONFIRM_REQUIRED",
                    message=(
                        "Topic looks destructive; set confirm_destructive=true "
                        "to proceed"
                    ),
                    details={"topic": request.topic},
                ),
                http_status=400,
            )

        publisher = (request.publisher or "").strip()
        if not publisher:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ECC_SANDBOX_PUBLISHER_REQUIRED",
                    message="publisher is required",
                    details={},
                ),
                http_status=422,
            )

        known = {s.name for s in self._registry.snapshot().services}
        if publisher not in known:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ECC_SANDBOX_UNKNOWN_PUBLISHER",
                    message=f"Publisher '{publisher}' is not in the registry",
                    details={"publisher": publisher},
                ),
                http_status=400,
            )

        subscriber = (request.subscriber or "").strip() or None
        if subscriber and subscriber not in known:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ECC_SANDBOX_UNKNOWN_SUBSCRIBER",
                    message=f"Subscriber '{subscriber}' is not in the registry",
                    details={"subscriber": subscriber},
                ),
                http_status=400,
            )

        self._sandbox_store.mark_probing(session_id)
        probe_id = uuid4()
        observed_at = _utc_now()
        echo = {
            "publisher": publisher,
            "subscriber": subscriber,
            "topic": request.topic,
            "payload": dict(request.payload),
            "probe_id": str(probe_id),
            "session_id": str(session_id),
        }

        try:
            # Publish the probe topic so EventBus subscribers / WS fan-out see it.
            await self._bus.publish(
                Event(
                    name=request.topic,
                    payload={
                        **dict(request.payload),
                        "_sandbox": {
                            "session_id": str(session_id),
                            "probe_id": str(probe_id),
                            "publisher": publisher,
                            "subscriber": subscriber,
                        },
                    },
                )
            )
            await self._bus.publish(
                Event(
                    name="sandbox.probe.result",
                    payload={
                        "session_id": str(session_id),
                        "probe_id": str(probe_id),
                        "accepted": True,
                        "status": "accepted",
                        "publisher": publisher,
                        "subscriber": subscriber,
                        "topic": request.topic,
                        "echo": echo,
                        "observed_at": observed_at.isoformat(),
                    },
                )
            )
            log_event(
                self._logger,
                event="ecc.sandbox.probe_accepted",
                message="Sandbox probe accepted",
                session_id=str(session_id),
                probe_id=str(probe_id),
                topic=request.topic,
                publisher=publisher,
            )
            return SandboxProbeResponse(
                session_id=session_id,
                probe_id=probe_id,
                accepted=True,
                status="accepted",
                message=f"Probe published on topic '{request.topic}'",
                observed_at=observed_at,
                echo=echo,
                result={"published": True, "topic": request.topic},
            )
        finally:
            self._sandbox_store.mark_ready(session_id)
