"""Headless genesis smoke: scaffold → factory gates → PASSED (no stubs)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

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
from tests.fakes.fake_nervas_stub import FakeNervasStub
from services.empery_intelligence_core.tests.conftest import make_container


def _verify_loop(tmp_path: Path, *, scripted: list[str]) -> tuple:
    container, _bus, _cfg = make_container(
        tmp_path,
        engine_allow_service_writes=True,
        auto_scaffold_on_implement=False,
        auto_deploy_on_implement=False,
        require_deploy_agent=False,
        max_fix_loops=0,
    )
    container.register(
        "nervas_provider", lambda _c: FakeNervasStub(scripted=scripted)
    )
    loop = HeadlessAgentLoop(
        container.resolve("intention_store"),
        container.resolve("prompt_templates"),
        container.resolve("nervas_provider"),
        container.resolve("workspace_tools"),
        container.resolve("eic_memory_hooks"),
        container.resolve("eic_ecc_bridge"),
        container.resolve("event_bus"),
        container.resolve("config"),
        container.resolve("logger"),
    )
    return container, loop


def test_headless_genesis_factory_gates_pass(tmp_path: Path) -> None:
    container, loop = _verify_loop(
        tmp_path,
        scripted=['{"eic_actions":[],"verify_status":"PASSED"}'],
    )
    workspace = container.resolve("workspace_tools")
    store = container.resolve("intention_store")
    service = "genesis_gate_svc"
    workspace.scaffold_service(
        service,
        intent="create companion chat service",
        scaffold_profile="companion_chat",
    )
    workspace.ensure_product_surfaces(service)

    async def _run() -> Intention:
        now = datetime.now(timezone.utc)
        intention = Intention(
            id=uuid4(),
            kind=IntentionKind.VERIFY,
            status=IntentionStatus.PENDING,
            intent=f"create_service {service} companion chat verify",
            service_name=service,
            checkpoint=LoopCheckpoint(stage=LoopStage.QUEUED, updated_at=now),
            created_at=now,
            updated_at=now,
            metadata={"scaffold_profile": "companion_chat"},
        )
        await store.create(intention)
        claimed = await store.claim_next("test")
        assert claimed is not None
        return await loop.run(claimed)

    result = asyncio.run(_run())
    assert result.checkpoint.verify_status == "PASSED"
    assert result.status == IntentionStatus.COMPLETED


def test_headless_genesis_fake_src_fails(tmp_path: Path) -> None:
    container, loop = _verify_loop(
        tmp_path,
        scripted=['{"eic_actions":[],"verify_status":"PASSED"}'],
    )
    workspace = container.resolve("workspace_tools")
    store = container.resolve("intention_store")
    service = "genesis_fake_svc"
    workspace.scaffold_service(
        service,
        intent="create companion chat service",
        scaffold_profile="companion_chat",
    )
    workspace.ensure_product_surfaces(service)
    evil = (
        tmp_path / "services" / service / "src" / "integration" / "fake_ai.py"
    )
    evil.write_text("class FakeAI:\n    pass\n", encoding="utf-8")

    async def _run() -> Intention:
        now = datetime.now(timezone.utc)
        intention = Intention(
            id=uuid4(),
            kind=IntentionKind.VERIFY,
            status=IntentionStatus.PENDING,
            intent=f"create_service {service} verify",
            service_name=service,
            checkpoint=LoopCheckpoint(stage=LoopStage.QUEUED, updated_at=now),
            created_at=now,
            updated_at=now,
            metadata={"scaffold_profile": "companion_chat"},
        )
        await store.create(intention)
        claimed = await store.claim_next("test")
        assert claimed is not None
        return await loop.run(claimed)

    result = asyncio.run(_run())
    assert result.checkpoint.verify_status == "FAILED"
    assert result.status == IntentionStatus.FAILED
