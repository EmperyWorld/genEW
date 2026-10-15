"""EIC → ECC JobStore sync."""

from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

from core.event_bus import Event
from core.logging import configure_logging

from services.empery_control_center_api.config import ServiceConfig
from services.empery_control_center_api.src.core.models import (
    JobMode,
    JobStatus,
    LifecycleSkill,
    OrchestrationJob,
)
from services.empery_control_center_api.src.data.job_store import JobStore
from services.empery_control_center_api.src.integration.eic_job_sync import (
    EicJobStoreSync,
)
from services.empery_control_center_api.src.integration.orchestration_paths import (
    OrchestrationPaths,
)
from services.empery_control_center_api.tests.conftest import RecordingEventBus
from datetime import datetime, timezone


def _store(tmp_path: Path) -> JobStore:
    cfg = ServiceConfig(
        orchestration_root=str(tmp_path / "orchestration"),
        allow_demo_runner=True,
    )
    paths = OrchestrationPaths.from_config(cfg)
    store = JobStore(paths, cfg, configure_logging("ecc_job_sync_test"))
    store.ensure_layout()
    return store


def test_eic_completed_moves_pending_job(tmp_path: Path) -> None:
    store = _store(tmp_path)
    bus = RecordingEventBus()
    sync = EicJobStoreSync(bus, store, configure_logging("ecc_job_sync_test"))
    sync.start()
    job_id = uuid4()
    now = datetime.now(timezone.utc)

    async def _run() -> None:
        await store.create(
            OrchestrationJob(
                id=job_id,
                skill=LifecycleSkill.PLAN,
                status=JobStatus.PENDING,
                mode=JobMode.AGENT,
                service_name="generator_post_tg",
                intent="test",
                created_at=now,
                updated_at=now,
            )
        )
        await sync._on_event(
            Event(
                name="ecc.job.completed",
                payload={
                    "source": "eic_reflexes",
                    "job_id": str(job_id),
                    "result_summary": "done via eic",
                    "artifact_paths": ["designs/x.md"],
                },
            )
        )
        updated = await store.get(job_id)
        assert updated is not None
        assert updated.status == JobStatus.COMPLETED
        assert updated.result_summary == "done via eic"

    asyncio.run(_run())
