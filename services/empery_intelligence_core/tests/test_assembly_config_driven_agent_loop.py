"""Config-driven IMPLEMENT: Assembler-before-LLM order + deny domain writes."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from core.errors import ServiceError
from core.logging import configure_logging

from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
    HeadlessAgentLoop,
)
from services.empery_intelligence_core.src.core.reflexes.models import (
    AgentRole,
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopCheckpoint,
    LoopStage,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)
from services.empery_intelligence_core.tests.conftest import make_config, make_container
from tests.fakes.fake_nervas_stub import FakeNervasStub


def _intention(service: str = "asm_loop_dash") -> Intention:
    now = datetime.now(timezone.utc)
    return Intention(
        id=uuid4(),
        kind=IntentionKind.EVOLVE,
        status=IntentionStatus.RUNNING,
        intent="Build an ops dashboard with metrics cards and charts",
        service_name=service,
        metadata={
            "scaffold_profile": "ops_dashboard",
            "assembly_mode": "config_driven",
            "eic_skip_mechanical_extract": True,
        },
        checkpoint=LoopCheckpoint(stage=LoopStage.IMPLEMENT, updated_at=now),
        created_at=now,
        updated_at=now,
        claimed_by="test",
        started_at=now,
    )


def test_job_is_config_driven_from_metadata(tmp_path: Path) -> None:
    container, _bus, _cfg = make_container(tmp_path)
    loop = container.resolve("headless_agent_loop")
    assert loop._job_is_config_driven("asm_loop_dash", _intention()) is True


def test_config_driven_implement_assembler_before_apply(tmp_path: Path) -> None:
    """IMPLEMENT on ops_dashboard: persist Manifest → Assembler → apply_actions."""
    container, _bus, cfg = make_container(tmp_path)
    calls: list[str] = []

    tools: WorkspaceToolAdapter = container.resolve("workspace_tools")

    def _bp(service: str, **kwargs: Any) -> str:
        calls.append("ensure_blueprint")
        path = (
            tmp_path
            / ".cursor"
            / "orchestration"
            / "designs"
            / f"{service}_blueprint.json"
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{}", encoding="utf-8")
        return str(path.relative_to(tmp_path))

    def _mf(service: str, **kwargs: Any) -> str:
        calls.append("persist_manifest")
        path = (
            tmp_path
            / ".cursor"
            / "orchestration"
            / "eic"
            / "assembly"
            / f"{service}_manifest.json"
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{}", encoding="utf-8")
        return str(path.relative_to(tmp_path))

    def _asm(service: str, **kwargs: Any) -> list[str]:
        calls.append("assembler")
        assert tools.config_driven_active is True
        return [f"services/{service}/assembly_runtime.json"]

    tools.ensure_blueprint_json = _bp  # type: ignore[method-assign]
    tools.persist_assembly_manifest = _mf  # type: ignore[method-assign]
    tools.run_config_driven_assembler = _asm  # type: ignore[method-assign]

    scripted = [
        (
            "implement\n```json\n"
            '{"eic_actions":[{"op":"write_file",'
            '"path":".cursor/orchestration/eic/assembly/asm_loop_dash_note.txt",'
            '"content":"ok"}]}\n```'
        )
    ]
    loop = HeadlessAgentLoop(
        container.resolve("intention_store"),
        container.resolve("prompt_templates"),
        FakeNervasStub(scripted=scripted),
        tools,
        container.resolve("eic_memory_hooks"),
        container.resolve("eic_ecc_bridge"),
        container.resolve("event_bus"),
        cfg,
        container.resolve("logger"),
    )

    store = container.resolve("intention_store")

    async def _run() -> Intention:
        intention = _intention()
        pending = intention.model_copy(update={"status": IntentionStatus.PENDING})
        await store.create(pending)
        claimed = await store.claim_next("test")
        assert claimed is not None
        return await loop._run_role_turn(
            claimed,
            role=AgentRole.IMPLEMENTER,
            stage=LoopStage.IMPLEMENT,
        )

    result = asyncio.run(_run())
    assert result is not None
    assert "ensure_blueprint" in calls
    assert "persist_manifest" in calls
    assert "assembler" in calls
    assert calls.index("persist_manifest") < calls.index("assembler")
    assert tools.config_driven_active is True


def test_config_driven_deny_domain_write_after_flag(tmp_path: Path) -> None:
    cfg = make_config(tmp_path, engine_allow_service_writes=True)
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("asm_deny"))
    tools.config_driven_active = True
    with pytest.raises(ServiceError) as exc:
        tools.apply_actions(
            [
                {
                    "op": "write_file",
                    "path": "services/asm_loop_dash/src/api/main.py",
                    "content": "print('nope')\n",
                }
            ],
            role=AgentRole.IMPLEMENTER,
            service_name="asm_loop_dash",
        )
    assert exc.value.response.error_code == "EIC_CRITICAL_VIOLATION"
