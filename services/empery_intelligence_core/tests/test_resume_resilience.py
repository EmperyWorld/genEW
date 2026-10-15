"""Life Test 3 — interrupt mid-run and resume from checkpoint."""

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
from services.empery_intelligence_core.tests.conftest import make_container, make_store


def test_recover_running_to_paused_interrupted(tmp_path: Path) -> None:
    store = make_store(tmp_path)

    async def _run() -> None:
        now = datetime.now(timezone.utc)
        design = store.paths.designs_root / "resume_svc_design.md"
        design.parent.mkdir(parents=True, exist_ok=True)
        design.write_text("# Design\n", encoding="utf-8")

        intention = Intention(
            id=uuid4(),
            kind=IntentionKind.EVOLVE,
            status=IntentionStatus.RUNNING,
            intent="resume test",
            service_name="resume_svc",
            checkpoint=LoopCheckpoint(
                stage=LoopStage.IMPLEMENT,
                design_path=str(design),
                attempt=0,
                role_summary="plan done",
                updated_at=now,
            ),
            created_at=now,
            updated_at=now,
            started_at=now,
            claimed_by="crashed-worker",
        )
        # Write directly into running/ (simulate crash mid-implement)
        path = store.paths.running_dir / f"{intention.id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(intention.model_dump_json(indent=2), encoding="utf-8")

        recovered = await store.recover_running()
        assert len(recovered) == 1
        assert recovered[0].status == IntentionStatus.PAUSED
        assert recovered[0].checkpoint.last_error == "interrupted"
        assert recovered[0].checkpoint.stage == LoopStage.IMPLEMENT
        assert recovered[0].checkpoint.design_path == str(design)
        assert not path.exists()
        assert (store.paths.paused_dir / f"{intention.id}.json").is_file()

    asyncio.run(_run())


def test_resume_continues_without_replan(tmp_path: Path) -> None:
    """
    Life Test 3:
    1. Seed running intention mid-implement with design_path
    2. recover_running → paused(interrupted)
    3. resume → pending → claim → loop continues at implement (no re-plan)
    """
    # Script: implement + verify only (no plan response needed if skip works)
    scripted = [
        (
            'implemented\n```json\n{"eic_actions":[{"op":"write","path":"reports/proposal_r.py",'
            '"content":"# ok\\n"}]}\n```'
        ),
        (
            'PASSED\n```json\n{"verify_status":"PASSED","eic_actions":[{"op":"write",'
            '"path":"reports/resume_svc_verify.md","content":"PASSED"}]}\n```'
        ),
    ]
    container, bus, cfg = make_container(
        tmp_path, auto_resume_on_boot=False, worker_enabled=False
    )
    container.register("nervas_provider", lambda _c: FakeNervasStub(scripted=scripted))
    from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
        HeadlessAgentLoop,
    )

    store = container.resolve("intention_store")
    store.ensure_layout()
    loop = HeadlessAgentLoop(
        store,
        container.resolve("prompt_templates"),
        container.resolve("nervas_provider"),
        container.resolve("workspace_tools"),
        container.resolve("eic_memory_hooks"),
        container.resolve("eic_ecc_bridge"),
        container.resolve("event_bus"),
        cfg,
        container.resolve("logger"),
    )
    worker = container.resolve("intention_worker")

    async def _run() -> None:
        now = datetime.now(timezone.utc)
        design = store.paths.designs_root / "resume_svc_design.md"
        design.parent.mkdir(parents=True, exist_ok=True)
        design.write_text("# Design resume_svc\n", encoding="utf-8")

        intention_id = uuid4()
        intention = Intention(
            id=intention_id,
            kind=IntentionKind.EVOLVE,
            status=IntentionStatus.RUNNING,
            intent="resume mid implement",
            service_name="resume_svc",
            checkpoint=LoopCheckpoint(
                stage=LoopStage.IMPLEMENT,
                design_path=str(design),
                artifact_paths=[str(design)],
                role_summary="architect finished",
                updated_at=now,
            ),
            history=[],  # empty — plan not re-run if stage is implement
            created_at=now,
            updated_at=now,
            started_at=now,
            claimed_by="old-worker",
        )
        running_path = store.paths.running_dir / f"{intention_id}.json"
        running_path.parent.mkdir(parents=True, exist_ok=True)
        running_path.write_text(intention.model_dump_json(indent=2), encoding="utf-8")

        # Simulate process restart recovery (without auto-resume — explicit resume)
        recovered_ids = await worker.recover_and_resume()
        # auto_resume_on_boot=False → only paused, not resumed
        assert intention_id in recovered_ids
        paused = await store.get(intention_id)
        assert paused is not None
        assert paused.status == IntentionStatus.PAUSED
        assert paused.checkpoint.last_error == "interrupted"
        assert paused.checkpoint.stage == LoopStage.IMPLEMENT

        resumed = await store.resume(intention_id)
        assert resumed.status == IntentionStatus.PENDING
        assert resumed.checkpoint.stage == LoopStage.IMPLEMENT
        assert resumed.checkpoint.design_path == str(design)

        claimed = await store.claim_next("new-worker")
        assert claimed is not None
        assert claimed.checkpoint.stage == LoopStage.IMPLEMENT

        result = await loop.run(claimed)
        assert result.status == IntentionStatus.COMPLETED
        assert result.checkpoint.stage == LoopStage.DONE
        # Must not have re-run architect: no architect turn in history after resume
        roles = [t.role.value for t in result.history]
        assert "architect" not in roles
        assert "implementer" in roles
        assert "verifier" in roles
        assert result.checkpoint.design_path is not None
        assert Path(result.checkpoint.design_path).is_file()

        stage_events = [
            e for e in bus.published if e.name == "eic.intention.stage_changed"
        ]
        # Should not transition into plan from implement
        for event in stage_events:
            assert event.payload.get("to_stage") != "plan" or event.payload.get(
                "from_stage"
            ) == "plan"

    asyncio.run(_run())


def test_boot_auto_resume(tmp_path: Path) -> None:
    container, bus, _cfg = make_container(
        tmp_path, auto_resume_on_boot=True, worker_enabled=False
    )
    store = container.resolve("intention_store")
    store.ensure_layout()
    worker = container.resolve("intention_worker")

    async def _run() -> None:
        now = datetime.now(timezone.utc)
        intention = Intention(
            id=uuid4(),
            kind=IntentionKind.PLAN,
            status=IntentionStatus.RUNNING,
            intent="auto resume",
            service_name="auto_svc",
            checkpoint=LoopCheckpoint(stage=LoopStage.PLAN, updated_at=now),
            created_at=now,
            updated_at=now,
            claimed_by="old",
        )
        path = store.paths.running_dir / f"{intention.id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(intention.model_dump_json(indent=2), encoding="utf-8")

        await worker.recover_and_resume()
        current = await store.get(intention.id)
        assert current is not None
        assert current.status == IntentionStatus.PENDING
        names = [e.name for e in bus.published]
        assert "eic.intention.paused" in names
        assert "eic.intention.resumed" in names

    asyncio.run(_run())
