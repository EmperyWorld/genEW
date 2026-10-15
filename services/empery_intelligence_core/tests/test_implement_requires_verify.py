"""Unit: IMPLEMENT advances to VERIFY (never DONE without gates)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
    HeadlessAgentLoop,
)
from services.empery_intelligence_core.src.core.reflexes.models import (
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopCheckpoint,
    LoopStage,
)


class _Store:
    async def update(self, intention: Intention) -> Intention:
        return intention


@pytest.mark.asyncio
async def test_implement_advances_to_verify_not_done() -> None:
    loop = HeadlessAgentLoop.__new__(HeadlessAgentLoop)
    loop._store = _Store()  # type: ignore[attr-defined]

    async def _set_stage(intention: Intention, stage: LoopStage) -> Intention:
        cp = intention.checkpoint.model_copy(update={"stage": stage})
        return intention.model_copy(update={"checkpoint": cp})

    loop._set_stage = _set_stage  # type: ignore[method-assign]

    now = datetime.now(timezone.utc)
    intention = Intention(
        id=uuid4(),
        intent="implement something",
        kind=IntentionKind.IMPLEMENT,
        status=IntentionStatus.RUNNING,
        service_name="svc",
        checkpoint=LoopCheckpoint(stage=LoopStage.IMPLEMENT, updated_at=now),
        created_at=now,
        updated_at=now,
    )
    out = await loop._advance_after_role(intention)
    assert out.checkpoint.stage == LoopStage.VERIFY
