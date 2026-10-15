"""Unit tests for file-backed IntentionStore."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from core.errors import ServiceError
from services.empery_intelligence_core.src.core.reflexes.models import (
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopCheckpoint,
    LoopStage,
)
from services.empery_intelligence_core.tests.conftest import make_store


def _intention(**kwargs) -> Intention:
    now = datetime.now(timezone.utc)
    base = {
        "id": uuid4(),
        "kind": IntentionKind.EVOLVE,
        "status": IntentionStatus.PENDING,
        "intent": "build demo",
        "service_name": "demo_service",
        "checkpoint": LoopCheckpoint(stage=LoopStage.QUEUED, updated_at=now),
        "created_at": now,
        "updated_at": now,
    }
    base.update(kwargs)
    return Intention(**base)


def test_atomic_create_and_directory_moves(tmp_path: Path) -> None:
    store = make_store(tmp_path)

    async def _run() -> None:
        intention = _intention()
        created = await store.create(intention)
        pending = store.paths.pending_dir / f"{created.id}.json"
        assert pending.is_file()

        claimed = await store.claim_next("eic-test")
        assert claimed is not None
        assert claimed.status == IntentionStatus.RUNNING
        assert not pending.exists()
        assert (store.paths.running_dir / f"{claimed.id}.json").is_file()

        done = await store.complete(claimed.id, result_summary="ok")
        assert done.status == IntentionStatus.COMPLETED
        assert (store.paths.archive_dir / f"{done.id}.json").is_file()

    asyncio.run(_run())


def test_corrupt_json_skipped_in_list(tmp_path: Path) -> None:
    store = make_store(tmp_path)

    async def _run() -> None:
        good = await store.create(_intention())
        bad = store.paths.pending_dir / f"{uuid4()}.json"
        bad.write_text("{not-json", encoding="utf-8")
        items = await store.list(status=None, kind=None, limit=50)
        ids = {i.id for i in items}
        assert good.id in ids
        assert len(items) == 1

    asyncio.run(_run())


def test_pause_resume_cancel(tmp_path: Path) -> None:
    store = make_store(tmp_path)

    async def _run() -> None:
        await store.create(_intention())
        claimed = await store.claim_next("w")
        assert claimed is not None
        paused = await store.pause(claimed.id, reason="api_pause")
        assert paused.status == IntentionStatus.PAUSED
        assert (store.paths.paused_dir / f"{paused.id}.json").is_file()

        resumed = await store.resume(paused.id)
        assert resumed.status == IntentionStatus.PENDING

        claimed2 = await store.claim_next("w")
        assert claimed2 is not None
        cancelled = await store.cancel(claimed2.id)
        assert cancelled.status == IntentionStatus.CANCELLED

    asyncio.run(_run())


def test_missing_raises(tmp_path: Path) -> None:
    store = make_store(tmp_path)

    async def _run() -> None:
        with pytest.raises(ServiceError) as exc:
            await store.pause(uuid4())
        assert exc.value.response.error_code == "EIC_INTENTION_NOT_FOUND"

    asyncio.run(_run())


def test_list_filters(tmp_path: Path) -> None:
    store = make_store(tmp_path)

    async def _run() -> None:
        a = await store.create(_intention(kind=IntentionKind.PLAN))
        await store.create(_intention(kind=IntentionKind.VERIFY))
        items = await store.list(
            status=IntentionStatus.PENDING, kind=IntentionKind.PLAN, limit=10
        )
        assert len(items) == 1
        assert items[0].id == a.id

    asyncio.run(_run())
