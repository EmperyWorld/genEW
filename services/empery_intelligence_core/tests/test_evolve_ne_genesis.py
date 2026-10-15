"""Step 1: evolve/verify must not count as genesis expect_capsule."""

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
from services.empery_intelligence_core.src.integration.service_scaffold import (
    is_create_service_intention,
    is_evolve_intention,
)
from services.empery_intelligence_core.tests.conftest import make_container
from tests.fakes.fake_nervas_stub import FakeNervasStub


def test_named_evolve_is_not_create_intention() -> None:
    assert is_evolve_intention(kind="evolve")
    assert not is_create_service_intention(
        intent="Добавить JTBD вкладку",
        service_name="marketing_cabinet",
        kind="evolve",
    )


def test_evolve_anatomy_does_not_override_llm_failed(tmp_path: Path) -> None:
    """Existing capsule + LLM FAILED must stay FAILED (no genesis anatomy upgrade)."""
    service = "evolve_no_green_svc"
    container, _bus, _cfg = make_container(
        tmp_path,
        engine_allow_service_writes=True,
        auto_scaffold_on_implement=False,
        auto_deploy_on_implement=False,
        require_deploy_agent=False,
        max_fix_loops=0,
    )
    workspace = container.resolve("workspace_tools")
    workspace.scaffold_service(
        service,
        intent=f"create_service {service}",
        scaffold_profile="health_probe",
    )
    container.register(
        "nervas_provider",
        lambda _c: FakeNervasStub(
            scripted=['{"eic_actions":[],"verify_status":"FAILED"}']
        ),
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
    store = container.resolve("intention_store")

    async def _run() -> Intention:
        now = datetime.now(timezone.utc)
        intention = Intention(
            id=uuid4(),
            kind=IntentionKind.EVOLVE,
            status=IntentionStatus.PENDING,
            intent="Добавить JTBD исследования вкладкой и улучшить UI",
            service_name=service,
            checkpoint=LoopCheckpoint(stage=LoopStage.VERIFY, updated_at=now),
            created_at=now,
            updated_at=now,
            metadata={
                "selected_option": {
                    "id": "ui_only",
                    "touches": ["api", "events"],
                }
            },
        )
        await store.create(intention)
        claimed = await store.claim_next("test")
        assert claimed is not None
        return await loop.run(claimed)

    result = asyncio.run(_run())
    assert result.checkpoint.verify_status == "FAILED"
    # Without genesis upgrade, LLM FAILED is authoritative when no touch gates
    # force a presence pass.
    assert result.status == IntentionStatus.FAILED
