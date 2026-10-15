"""EventBridge → eic.intention.requested publish tests."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from core.container import ServiceContainer
from core.event_bus import EventBus
from services.empery_control_center_api.src.core.models import (
    JobMode,
    JobStatus,
    LifecycleSkill,
    OrchestrationJob,
)
from services.empery_control_center_api.src.integration.event_bridge import (
    EicIntentionBridge,
    INTENTION_REQUESTED_TOPIC,
    build_intention_requested_payload,
    should_publish_eic_intention,
)
from services.empery_control_center_api.tests.conftest import (
    RecordingEventBus,
    build_test_app,
    make_config,
)


def _sample_job(
    *,
    skill: LifecycleSkill = LifecycleSkill.EVOLVE,
    intent: str = "Evolve after verify failure",
    service_name: str = "probe_service",
) -> OrchestrationJob:
    now = datetime.now(timezone.utc)
    metadata: dict = {"source": "test"}
    if skill == LifecycleSkill.EVOLVE:
        metadata["evolve_skip_propose"] = True
    return OrchestrationJob(
        id=uuid4(),
        skill=skill,
        status=JobStatus.PENDING,
        mode=JobMode.AGENT,
        service_name=service_name,
        intent=intent,
        features=["kg"],
        design_path=".cursor/orchestration/designs/probe_service_design.md",
        agent_hint=None,
        created_at=now,
        updated_at=now,
        metadata=metadata,
    )


def test_should_publish_evolve_always_when_flag_off() -> None:
    assert should_publish_eic_intention(
        LifecycleSkill.EVOLVE, publish_all_skills=False
    )
    assert not should_publish_eic_intention(
        LifecycleSkill.PLAN, publish_all_skills=False
    )


def test_should_publish_all_skills_when_flag_on() -> None:
    for skill in LifecycleSkill:
        assert should_publish_eic_intention(skill, publish_all_skills=True)


def test_build_payload_matches_eic_contract() -> None:
    job = _sample_job(skill=LifecycleSkill.IMPLEMENT)
    payload = build_intention_requested_payload(job)
    # Missing services/{name}/ → plan/implement remaps to evolve for genesis honesty.
    assert payload == {
        "intent": job.intent,
        "kind": "evolve",
        "service_name": "probe_service",
        "features": ["kg"],
        "ecc_job_id": str(job.id),
        "design_path": job.design_path,
        "metadata": {
            "source": "test",
            "requested_kind": "implement",
            "resolved_kind": "evolve",
        },
    }


@pytest.mark.asyncio
async def test_bridge_publishes_intention_requested(tmp_path: Path) -> None:
    bus = RecordingEventBus()
    cfg = make_config(tmp_path, publish_eic_intentions=True)
    bridge = EicIntentionBridge(bus, cfg, __import__("logging").getLogger("test"))
    job = _sample_job(skill=LifecycleSkill.PLAN)

    published = await bridge.publish_for_job(job)
    assert published is True
    assert len(bus.published) == 1
    event = bus.published[0]
    assert event.name == INTENTION_REQUESTED_TOPIC
    assert event.payload["kind"] == "evolve"
    assert event.payload["metadata"]["requested_kind"] == "plan"
    assert event.payload["ecc_job_id"] == str(job.id)


@pytest.mark.asyncio
async def test_bridge_skips_non_evolve_when_flag_off(tmp_path: Path) -> None:
    bus = RecordingEventBus()
    cfg = make_config(tmp_path, publish_eic_intentions=False)
    bridge = EicIntentionBridge(bus, cfg, __import__("logging").getLogger("test"))
    job = _sample_job(skill=LifecycleSkill.VERIFY)

    published = await bridge.publish_for_job(job)
    assert published is False
    assert bus.published == []


def test_enqueue_evolve_publishes_intention_requested(tmp_path: Path) -> None:
    app, bus = build_test_app(
        tmp_path,
        config=make_config(tmp_path, publish_eic_intentions=False),
    )
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/commands/evolve",
            json={
                "intent": "Full evolve loop",
                "service_name": "bridge_svc",
                "features": ["memory"],
            },
        )
        assert r.status_code == 201

    topics = [e.name for e in bus.published]
    assert "ecc.job.created" in topics
    assert INTENTION_REQUESTED_TOPIC in topics
    intention_event = next(
        e for e in bus.published if e.name == INTENTION_REQUESTED_TOPIC
    )
    assert intention_event.payload["kind"] == "evolve"
    assert intention_event.payload["service_name"] == "bridge_svc"
    assert intention_event.payload["intent"] == "Full evolve loop"


def test_enqueue_plan_skips_when_flag_off(tmp_path: Path) -> None:
    app, bus = build_test_app(
        tmp_path,
        config=make_config(tmp_path, publish_eic_intentions=False),
    )
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/commands/plan",
            json={"intent": "Plan only", "service_name": "plan_svc"},
        )
        assert r.status_code == 201

    assert INTENTION_REQUESTED_TOPIC not in [e.name for e in bus.published]


def test_enqueue_plan_publishes_when_flag_on(tmp_path: Path) -> None:
    app, bus = build_test_app(
        tmp_path,
        config=make_config(tmp_path, publish_eic_intentions=True),
    )
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/commands/plan",
            json={"intent": "Plan with bridge", "service_name": "plan_svc"},
        )
        assert r.status_code == 201

    intention_event = next(
        e for e in bus.published if e.name == INTENTION_REQUESTED_TOPIC
    )
    assert intention_event.payload["kind"] == "evolve"
    assert intention_event.payload["metadata"]["requested_kind"] == "plan"


def test_verify_failed_publishes_evolve_intention(tmp_path: Path) -> None:
    app, bus = build_test_app(
        tmp_path,
        config=make_config(tmp_path, publish_eic_intentions=False),
    )
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/commands/verify",
            json={"intent": "Verify svc", "service_name": "fail_svc"},
        )
        assert created.status_code == 201
        job_id = created.json()["job"]["id"]
        claimed = client.post(
            f"/api/v1/jobs/{job_id}/claim",
            json={"claimed_by": "verifier"},
        )
        assert claimed.status_code == 200
        failed = client.patch(
            f"/api/v1/jobs/{job_id}",
            json={"status": "failed", "error_message": "tests red"},
        )
        assert failed.status_code == 200

    intention_events = [
        e for e in bus.published if e.name == INTENTION_REQUESTED_TOPIC
    ]
    assert len(intention_events) == 1
    payload = intention_events[0].payload
    assert payload["kind"] == "evolve"
    assert payload["metadata"]["trigger"] == "verify_failed"
    assert payload["metadata"]["source_verify_job_id"] == job_id


@pytest.mark.asyncio
async def test_eic_subscriber_receives_and_enqueues(tmp_path: Path) -> None:
    """Shared in-memory bus: ECC bridge publish → EIC handle_intention_requested."""
    from core.logging import configure_logging
    from services.empery_intelligence_core.config import ServiceConfig as EicConfig
    from services.empery_intelligence_core.src.api.wire_reflexes import wire_reflexes
    from services.empery_intelligence_core.src.core.reflexes.use_cases import (
        ReflexesUseCases,
    )
    from tests.fakes.fake_nervas_stub import (
        FakeNervasStub,
    )

    bus = EventBus()
    ecc_cfg = make_config(tmp_path, publish_eic_intentions=True)
    bridge = EicIntentionBridge(
        bus,
        ecc_cfg,
        configure_logging("empery_control_center_api"),
    )

    eic_container = ServiceContainer()
    eic_cfg = EicConfig(
        orchestration_root=str(tmp_path / "orchestration"),
        workspace_root=str(tmp_path),
        worker_enabled=False,
        autonomous_enabled=True,
        allow_autonomous_fakes=True,
        require_deploy_agent=False,
        auto_deploy_on_implement=False,
    )
    eic_container.register("event_bus", lambda _c: bus)
    eic_container.register("nervas_provider", lambda _c: FakeNervasStub())
    wire_reflexes(eic_container, eic_cfg)
    uc: ReflexesUseCases = eic_container.resolve("eic_reflexes_use_cases")
    store = eic_container.resolve("intention_store")
    store.ensure_layout()
    bus.subscribe(INTENTION_REQUESTED_TOPIC, uc.handle_intention_requested)

    job = _sample_job(skill=LifecycleSkill.EVOLVE, service_name="e2e_svc")
    await bridge.publish_for_job(job)
    await asyncio.sleep(0.05)

    listed = await uc.list(limit=10)
    assert listed.count == 1
    intention = listed.intentions[0]
    assert intention.intent == job.intent
    assert intention.service_name == "e2e_svc"
    assert intention.ecc_job_id == job.id
