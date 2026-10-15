"""Reflex Hands — scaffold, sandbox, parse_eic_actions."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from core.logging import configure_logging
from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
    HeadlessAgentLoop,
    authoritative_verify_summary,
    parse_eic_actions,
)
from services.empery_intelligence_core.src.core.reflexes.models import (
    AgentRole,
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopCheckpoint,
    LoopStage,
)
from tests.fakes.fake_nervas_stub import (
    FakeNervasStub,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.service_scaffold import (
    ServiceScaffoldAction,
    is_create_service_intention,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)
from services.empery_intelligence_core.tests.conftest import make_config, make_container


def test_parse_eic_actions_bare_and_tool_call() -> None:
    text = (
        'Here is the plan.\n'
        '{"eic_actions":[{"op":"write_file","path":"services/demo/x.py","content":"hi"}]}\n'
        'tool_call(create_dir, {"path": "services/demo/src"})\n'
    )
    actions, status = parse_eic_actions(text)
    assert status is None
    assert any(a.get("op") == "write_file" for a in actions)
    assert any(a.get("op") == "create_dir" for a in actions)


def test_parse_qwen_and_gemma_native_tool_calls() -> None:
    qwen = (
        '<tool_call>\n'
        '{"name": "write_file", "arguments": {"path": "services/a.py", "content": "x"}}\n'
        '</tool_call>'
    )
    gemma = (
        '<|tool_call>call:create_dir{path:<|"|>services/a/src<|"|>}<tool_call|>'
    )
    qa, _ = parse_eic_actions(qwen)
    ga, _ = parse_eic_actions(gemma)
    assert any(
        a.get("op") == "write_file" and a.get("path") == "services/a.py" for a in qa
    )
    assert any(
        a.get("op") == "create_dir" and a.get("path") == "services/a/src" for a in ga
    )


def test_parse_aborted_prose_does_not_force_failed() -> None:
    text = (
        "**CRITICAL STATUS: ABORTED**\n"
        "I will not issue a PASSED or FAILED status until design exists.\n"
    )
    _actions, status = parse_eic_actions(text)
    assert status is None
    body, summary = authoritative_verify_summary(
        "PASSED",
        anatomy_detail="Anatomy OK",
        live_detail="deploy_agent health: ok",
        llm_narrative=text,
    )
    assert summary == "verify_status=PASSED"
    assert "**Authoritative verify_status:** PASSED" in body
    assert "non-authoritative" in body
    assert "ABORTED" in body


def test_scaffold_writes_anatomy(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    logger = configure_logging("scaffold_test")
    action = ServiceScaffoldAction(tmp_path, logger)
    result = action.scaffold("reflex_probe_service", features=["health", "probe"])
    root = tmp_path / "services" / "reflex_probe_service"
    assert root.is_dir()
    assert (root / "manifest.json").is_file()
    assert (root / "config.py").is_file()
    assert (root / "src" / "api" / "main.py").is_file()
    assert (root / "src" / "core").is_dir()
    assert (root / "src" / "data").is_dir()
    assert (root / "src" / "integration").is_dir()
    assert (root / "tests" / "test_health.py").is_file()
    assert (tmp_path / "deploy" / "services" / "reflex_probe_service.yml").is_file()
    assert (
        tmp_path / ".cursor" / "orchestration" / "eic" / "compose.reflex.yml"
    ).is_file()
    assert (
        tmp_path / ".cursor" / "orchestration" / "eic" / "dynamic_health_bases.json"
    ).is_file()
    assert len(result["written"]) > 5


def test_sandbox_denies_env(tmp_path: Path) -> None:
    cfg = make_config(tmp_path, engine_allow_service_writes=True)
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("ws"))
    written = tools.apply_actions(
        [{"op": "write_file", "path": ".env", "content": "SECRET=1"}],
        role=AgentRole.IMPLEMENTER,
        service_name="x",
    )
    assert written == [] or all(".env" not in p for p in written)
    assert not (tmp_path / ".env").exists()


def test_implementer_scaffold_fallback_when_llm_prose(tmp_path: Path) -> None:
    """Genesis failure mode: LLM returns prose with zero eic_actions → scaffold."""
    prose = [
        # Viable design (not meta-prose) — Architect gate + UI genesis
        (
            "# Design: reflex_probe_service\n\n"
            "## Purpose\nProbe capsule for reflex genesis.\n\n"
            "## Anatomy\nservices/reflex_probe_service with api/core/data.\n\n"
            "## Manifest\nhealth + reflex_scaffold features.\n\n"
            '## UI\n{"ui":{"required":true,"route":"/ops/reflex-probe-service"}}\n'
        ),
        "Pre-flight check complete. Ready to implement.\n"
        '{"eic_actions":[]}\n',
        "PASSED\n```json\n{\"verify_status\":\"PASSED\",\"eic_actions\":[]}\n```",
    ]
    container, _bus, _cfg = make_container(
        tmp_path,
        engine_allow_service_writes=True,
        auto_scaffold_on_implement=True,
        auto_deploy_on_implement=False,
        allow_compose_commands=False,
        max_fix_loops=1,
    )
    container.register(
        "nervas_provider", lambda _c: FakeNervasStub(scripted=prose)
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

    async def _run() -> None:
        now = datetime.now(timezone.utc)
        intention = Intention(
            id=uuid4(),
            kind=IntentionKind.EVOLVE,
            status=IntentionStatus.PENDING,
            intent=(
                "GENESIS create_service mission: create reflex_probe_service "
                "standalone module"
            ),
            service_name="reflex_probe_service",
            checkpoint=LoopCheckpoint(stage=LoopStage.QUEUED, updated_at=now),
            created_at=now,
            updated_at=now,
        )
        await store.create(intention)
        claimed = await store.claim_next("test")
        assert claimed is not None
        result = await loop.run(claimed)
        root = tmp_path / "services" / "reflex_probe_service"
        assert root.is_dir()
        assert (root / "manifest.json").is_file()
        assert result.metadata.get("eic_write_file_count", 0) > 0
        assert result.status in {
            IntentionStatus.COMPLETED,
            IntentionStatus.FAILED,
        }
        # With anatomy present, verify should pass
        assert result.status == IntentionStatus.COMPLETED
        assert result.checkpoint.verify_status == "PASSED"

    asyncio.run(_run())


def test_is_create_service_intention() -> None:
    assert is_create_service_intention(
        intent="create_service marketing_engine", service_name="marketing_engine"
    )
    assert is_create_service_intention(
        intent="GENESIS", service_name="reflex_probe_service"
    )
    # Named service alone still counts as genesis when kind is unset (legacy create).
    assert is_create_service_intention(
        intent="wire peer health", service_name="marketing_cabinet"
    )
    # Evolve/verify must never count as genesis — even with a snake_case name.
    assert not is_create_service_intention(
        intent="Добавить JTBD вкладку и улучшить UI",
        service_name="marketing_cabinet",
        kind="evolve",
    )
    assert not is_create_service_intention(
        intent="Verify marketing_cabinet",
        service_name="marketing_cabinet",
        kind="verify",
    )
    # Create markers still win when kind is create_service.
    assert is_create_service_intention(
        intent="create_service foo",
        service_name="foo",
        kind="create_service",
    )
