"""Tests for HeadlessAgentLoop with FakeNervas stub."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from services.empery_intelligence_core.src.core.reflexes.models import (
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopCheckpoint,
    LoopStage,
)
from tests.fakes.fake_nervas_stub import (
    FakeNervasStub,
)
from services.empery_intelligence_core.tests.conftest import make_container


def _running_evolve(service: str = "demo_service") -> Intention:
    now = datetime.now(timezone.utc)
    return Intention(
        id=uuid4(),
        kind=IntentionKind.EVOLVE,
        status=IntentionStatus.RUNNING,
        intent=f"build {service}",
        service_name=service,
        checkpoint=LoopCheckpoint(stage=LoopStage.QUEUED, updated_at=now),
        created_at=now,
        updated_at=now,
        claimed_by="test",
        started_at=now,
    )


def _seed_evolve_capsule(tmp_path: Path, container: object, service: str) -> None:
    """Evolve no longer scaffolds a new capsule — tests must seed anatomy first."""
    from core.logging import configure_logging
    from services.empery_intelligence_core.src.integration.service_scaffold import (
        ServiceScaffoldAction,
    )

    action = ServiceScaffoldAction(tmp_path, configure_logging("seed_evolve"))
    action.scaffold(service, features=["health", "probe"])
    _ = container


def test_evolve_writes_design_and_report(tmp_path: Path) -> None:
    container, bus, _cfg = make_container(tmp_path)
    store = container.resolve("intention_store")
    loop = container.resolve("headless_agent_loop")
    _seed_evolve_capsule(tmp_path, container, "loop_svc")

    async def _run() -> None:
        intention = _running_evolve("loop_svc")
        # Place in running dir via create+claim
        pending = intention.model_copy(update={"status": IntentionStatus.PENDING})
        await store.create(pending)
        claimed = await store.claim_next("test")
        assert claimed is not None
        result = await loop.run(claimed)
        assert result.status == IntentionStatus.COMPLETED
        assert result.checkpoint.stage == LoopStage.DONE
        assert result.checkpoint.design_path is not None
        assert Path(result.checkpoint.design_path).is_file()
        assert result.checkpoint.report_path is not None
        assert Path(result.checkpoint.report_path).is_file()
        names = {e.name for e in bus.published}
        assert "eic.loop.role_started" in names
        assert "eic.loop.role_finished" in names
        assert "eic.intention.completed" in names

    asyncio.run(_run())


def test_verify_failed_triggers_fix_then_pass(tmp_path: Path) -> None:
    _plan_md = (
        "# System Design Document: fix_svc\\n\\n"
        "## 1. Purpose\\n\\nFix loop test service.\\n\\n"
        "## 2. Module Anatomy\\n\\nservices/fix_svc/src\\n\\n"
        "## 3. Manifest\\n\\n"
    )
    fail_then_pass = [
        # plan
        (
            f'# Design\n{_plan_md}\n```json\n{{"eic_actions":[{{"op":"write","path":"designs/fix_svc_design.md",'
            f'"content":"{_plan_md}"}}]}}\n```'
        ),
        # implement
        (
            'impl\n```json\n{"eic_actions":[{"op":"write","path":"reports/proposal_x.py",'
            '"content":"# x\\n"}]}\n```'
        ),
        # verify FAIL
        (
            'FAILED\n```json\n{"eic_actions":[{"op":"write","path":"reports/fix_svc_verify.md",'
            '"content":"FAILED"}],"verify_status":"FAILED"}\n```'
        ),
        # fix/implement
        (
            'fix impl\n```json\n{"eic_actions":[{"op":"write","path":"reports/proposal_x.py",'
            '"content":"# fixed\\n"}]}\n```'
        ),
        # verify PASS
        (
            'PASSED\n```json\n{"eic_actions":[{"op":"write","path":"reports/fix_svc_verify.md",'
            '"content":"PASSED"}],"verify_status":"PASSED"}\n```'
        ),
    ]
    container, _bus, _cfg = make_container(tmp_path)
    container.register("nervas_provider", lambda _c: FakeNervasStub(scripted=fail_then_pass))
    # Rebuild loop with new nervas
    from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
        HeadlessAgentLoop,
    )

    _seed_evolve_capsule(tmp_path, container, "fix_svc")
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
        intention = _running_evolve("fix_svc")
        await store.create(
            intention.model_copy(update={"status": IntentionStatus.PENDING})
        )
        claimed = await store.claim_next("test")
        assert claimed is not None
        result = await loop.run(claimed)
        assert result.status == IntentionStatus.COMPLETED
        assert result.checkpoint.attempt >= 1

    asyncio.run(_run())


def test_max_fix_loops_fails(tmp_path: Path) -> None:
    _plan_md = (
        "# System Design Document: max_svc\\n\\n"
        "## 1. Purpose\\n\\nMax fix loops test.\\n\\n"
        "## 2. Module Anatomy\\n\\nservices/max_svc/src\\n\\n"
        "## 3. Manifest\\n\\n"
    )
    always_fail_verify = [
        (
            f'# Design\n{_plan_md}\n```json\n{{"eic_actions":[{{"op":"write","path":"designs/max_svc_design.md",'
            f'"content":"{_plan_md}"}}]}}\n```'
        ),
        (
            'impl\n```json\n{"eic_actions":[{"op":"write","path":"reports/p.py","content":"x"}]}\n```'
        ),
        (
            'FAILED\n```json\n{"verify_status":"FAILED","eic_actions":[]}\n```'
        ),
    ]
    # After first fail: implement + verify fail, repeated
    scripted = list(always_fail_verify)
    for _ in range(5):
        scripted.append(always_fail_verify[1])
        scripted.append(always_fail_verify[2])

    container, _bus, _cfg = make_container(tmp_path, max_fix_loops=1)
    container.register("nervas_provider", lambda _c: FakeNervasStub(scripted=scripted))
    from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
        HeadlessAgentLoop,
    )

    _seed_evolve_capsule(tmp_path, container, "max_svc")
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
        intention = _running_evolve("max_svc")
        await store.create(
            intention.model_copy(update={"status": IntentionStatus.PENDING})
        )
        claimed = await store.claim_next("test")
        assert claimed is not None
        result = await loop.run(claimed)
        assert result.status == IntentionStatus.FAILED
        assert "max_fix_loops" in (result.error_message or "")

    asyncio.run(_run())


def test_accumulate_eic_action_stats_survives_verifier_zero_snapshot() -> None:
    from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
        accumulate_eic_action_stats,
    )

    meta: dict = {}
    accumulate_eic_action_stats(
        meta,
        {"extract_adapt": 2, "scaffold": 1, "write_file": 5},
    )
    assert meta["eic_action_stats"]["extract_adapt"] == 2
    assert meta["eic_extract_adapt_count"] == 2
    assert meta["eic_scaffold_count"] == 1
    assert meta["eic_write_file_count"] == 5

    # Verifier turn after reset_stats() — all zeros must not wipe Implement.
    accumulate_eic_action_stats(
        meta,
        {"extract_adapt": 0, "scaffold": 0, "write_file": 0},
    )
    assert meta["eic_action_stats"]["extract_adapt"] == 2
    assert meta["eic_extract_adapt_count"] == 2
    assert meta["eic_scaffold_count"] == 1
    assert meta["eic_write_file_count"] == 5
