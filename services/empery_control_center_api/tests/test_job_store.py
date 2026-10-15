"""Unit tests for file-backed JobStore."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from core.errors import ServiceError
from core.logging import configure_logging
from services.empery_control_center_api.config import ServiceConfig
from services.empery_control_center_api.src.core.models import (
    JobStatus,
    LifecycleSkill,
    OrchestrationJob,
)
from services.empery_control_center_api.src.data.job_store import JobStore
from services.empery_control_center_api.src.data.schemas import UpdateJobRequest
from services.empery_control_center_api.src.integration.orchestration_paths import (
    OrchestrationPaths,
)


def _store(tmp_path: Path, *, ttl: int = 3600) -> JobStore:
    cfg = ServiceConfig(
        orchestration_root=str(tmp_path / "orch"),
        job_claim_ttl_seconds=ttl,
    )
    paths = OrchestrationPaths.from_config(cfg, cwd=tmp_path)
    store = JobStore(paths, cfg, configure_logging("ecc_test_store"))
    store.ensure_layout()
    return store


def _job(**kwargs) -> OrchestrationJob:
    now = datetime.now(timezone.utc)
    base = {
        "id": uuid4(),
        "skill": LifecycleSkill.PLAN,
        "status": JobStatus.PENDING,
        "intent": "test",
        "created_at": now,
        "updated_at": now,
        "agent_hint": "architect",
    }
    base.update(kwargs)
    return OrchestrationJob(**base)


def test_directory_moves_and_atomic_write(tmp_path: Path) -> None:
    store = _store(tmp_path)

    async def _run() -> None:
        job = _job()
        await store.create(job)
        pending = store._paths.pending_dir / f"{job.id}.json"
        assert pending.is_file()

        claimed = await store.claim(job.id, "agent-1")
        assert claimed.status == JobStatus.CLAIMED
        assert not pending.exists()
        assert (store._paths.claimed_dir / f"{job.id}.json").is_file()

        done = await store.update(
            job.id, UpdateJobRequest(status=JobStatus.COMPLETED, result_summary="ok")
        )
        assert done.status == JobStatus.COMPLETED
        assert (store._paths.archive_dir / f"{job.id}.json").is_file()

    asyncio.run(_run())


def test_missing_job_raises(tmp_path: Path) -> None:
    store = _store(tmp_path)

    async def _run() -> None:
        with pytest.raises(ServiceError) as exc:
            await store.claim(uuid4(), "x")
        assert exc.value.response.error_code == "ECC_JOB_NOT_FOUND"

    asyncio.run(_run())


def test_ttl_reclaim(tmp_path: Path) -> None:
    store = _store(tmp_path, ttl=1)

    async def _run() -> None:
        old = datetime.now(timezone.utc) - timedelta(seconds=10)
        job = _job()
        await store.create(job)
        # Manually place a stale claimed job
        claimed = job.model_copy(
            update={
                "status": JobStatus.CLAIMED,
                "claimed_at": old,
                "claimed_by": "stale",
                "updated_at": old,
            }
        )
        path = store._paths.pending_dir / f"{job.id}.json"
        path.unlink()
        store._atomic_write(store._paths.claimed_dir / f"{job.id}.json", claimed)

        reclaimed_claim = await store.claim(job.id, "fresh")
        assert reclaimed_claim.status == JobStatus.CLAIMED
        assert reclaimed_claim.claimed_by == "fresh"

    asyncio.run(_run())
