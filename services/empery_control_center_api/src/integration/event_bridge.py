"""Publish ECC orchestration lifecycle events to EIC reflex subscribers."""

from __future__ import annotations

import logging
from typing import Any

from core.event_bus import Event, EventBus
from core.logging import log_event

from services.empery_control_center_api.config import ServiceConfig
from services.empery_control_center_api.src.core.models import (
    LifecycleSkill,
    OrchestrationJob,
)

INTENTION_REQUESTED_TOPIC = "eic.intention.requested"


def should_publish_eic_intention(
    skill: LifecycleSkill,
    *,
    publish_all_skills: bool,
) -> bool:
    """Return True when ECC should emit ``eic.intention.requested`` for ``skill``."""
    if skill == LifecycleSkill.EVOLVE:
        return True
    return publish_all_skills


def resolve_eic_intention_kind(
    job: OrchestrationJob,
    *,
    kind: LifecycleSkill | None = None,
) -> LifecycleSkill:
    """
    Prefer EVOLVE when Wizard posts plan/implement for a *new* service.

    EIC also upgrades kinds using workspace existence; this keeps the payload
    honest when markers or a missing ``services/{name}/`` tree are visible.
    """
    from pathlib import Path

    resolved = kind or job.skill
    if resolved not in {LifecycleSkill.PLAN, LifecycleSkill.IMPLEMENT}:
        return resolved
    text = f"{job.intent} {job.service_name or ''}".lower()
    markers = (
        "create_service",
        "create a service",
        "new service",
        "scaffold",
        "genesis",
        "создать сервис",
        "создай сервис",
        "создание сервиса",
        "новый сервис",
    )
    if any(m in text for m in markers):
        return LifecycleSkill.EVOLVE
    if job.service_name:
        for root in (Path("/app/services"), Path("services")):
            if (root / job.service_name).is_dir():
                return resolved
        return LifecycleSkill.EVOLVE
    return resolved


def build_intention_requested_payload(
    job: OrchestrationJob,
    *,
    kind: LifecycleSkill | None = None,
    extra_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Build EventBus payload matching EIC ``ReflexesUseCases.handle_intention_requested``.

    Fields align with ``IntentionEnqueueRequest`` in empery_intelligence_core.
    """
    resolved_kind = resolve_eic_intention_kind(job, kind=kind)
    metadata = dict(job.metadata)
    if extra_metadata:
        metadata.update(extra_metadata)
    if resolved_kind != (kind or job.skill):
        metadata["requested_kind"] = (kind or job.skill).value
        metadata["resolved_kind"] = resolved_kind.value
    payload: dict[str, Any] = {
        "intent": job.intent,
        "kind": resolved_kind.value,
        "service_name": job.service_name,
        "features": list(job.features),
        "ecc_job_id": str(job.id),
        "design_path": job.design_path,
        "metadata": metadata,
    }
    return payload


class EicIntentionBridge:
    """Publishes ``eic.intention.requested`` when ECC jobs should trigger EIC reflexes."""

    def __init__(
        self,
        event_bus: EventBus,
        config: ServiceConfig,
        logger: logging.Logger,
    ) -> None:
        self._bus = event_bus
        self._config = config
        self._logger = logger

    def should_publish(self, skill: LifecycleSkill) -> bool:
        return should_publish_eic_intention(
            skill,
            publish_all_skills=self._config.publish_eic_intentions,
        )

    async def publish_for_job(
        self,
        job: OrchestrationJob,
        *,
        kind: LifecycleSkill | None = None,
        extra_metadata: dict[str, Any] | None = None,
    ) -> bool:
        """
        Publish ``eic.intention.requested`` when policy allows.

        Returns True when an event was published.
        """
        target_kind = kind or job.skill
        if not should_publish_eic_intention(
            target_kind,
            publish_all_skills=self._config.publish_eic_intentions,
        ):
            return False

        payload = build_intention_requested_payload(
            job,
            kind=kind,
            extra_metadata=extra_metadata,
        )
        await self._bus.publish(
            Event(name=INTENTION_REQUESTED_TOPIC, payload=payload)
        )
        log_event(
            self._logger,
            event="ecc.eic_intention.requested",
            message="Published eic.intention.requested for orchestration job",
            job_id=str(job.id),
            skill=job.skill.value,
            kind=target_kind.value,
        )
        return True
