"""Phase 4: evolve propose → pick parsing and prompt injection."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest

from core.logging import configure_logging
from services.empery_intelligence_core.src.core.reflexes.models import (
    AgentRole,
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopCheckpoint,
    LoopStage,
)
from services.empery_intelligence_core.src.integration.evolve_propose import (
    EvolveProposeRequest,
    EvolveProposeUseCases,
    _fallback_options,
    format_selected_option_prompt,
    parse_evolve_options,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.prompt_templates import (
    PromptTemplateLoader,
)
from services.empery_intelligence_core.config import ServiceConfig


def test_parse_evolve_options_object() -> None:
    payload = {
        "options": [
            {
                "id": "a",
                "title": "A",
                "delta_summary": "do a",
                "risk": "low",
                "touches": ["api", "ui"],
            },
            {
                "id": "b",
                "title": "B",
                "delta_summary": "do b",
                "risk": "high",
                "touches": ["db"],
            },
        ]
    }
    opts = parse_evolve_options(payload, option_count=3)
    assert len(opts) == 2
    assert opts[0].id == "a"
    assert "ui" in opts[0].touches


def test_fallback_options_count() -> None:
    opts = _fallback_options("ai_chat", "add archive", n=3)
    assert len(opts) == 3
    assert opts[0].delta_summary


@pytest.mark.asyncio
async def test_propose_uses_fallback_without_nervas(tmp_path: Path) -> None:
    svc = tmp_path / "services" / "life_chat"
    svc.mkdir(parents=True)
    (svc / "manifest.json").write_text("{}\n", encoding="utf-8")

    class _Boom:
        async def chat(self, _req):  # noqa: ANN001
            raise RuntimeError("no llm")

    uc = EvolveProposeUseCases(
        workspace=tmp_path,
        nervas_use_cases=_Boom(),
        logger=configure_logging("evolve_test"),
    )
    res = await uc.propose(
        EvolveProposeRequest(
            service_name="life_chat",
            intent="add message search",
            option_count=3,
        )
    )
    assert res.proposal_id
    assert len(res.options) >= 2
    assert res.backend == "fallback"
    assert Path(res.persisted_path or "").is_file()


@pytest.mark.asyncio
async def test_propose_404_missing_service(tmp_path: Path) -> None:
    class _Boom:
        async def chat(self, _req):  # noqa: ANN001
            raise RuntimeError("no")

    uc = EvolveProposeUseCases(
        workspace=tmp_path,
        nervas_use_cases=_Boom(),
        logger=configure_logging("evolve_test"),
    )
    with pytest.raises(Exception) as exc:
        await uc.propose(
            EvolveProposeRequest(service_name="missing_svc", intent="x")
        )
    err = exc.value
    assert getattr(err, "http_status", None) == 404


def test_prompt_injects_selected_option(tmp_path: Path) -> None:
    from datetime import datetime, timezone

    agents = tmp_path / ".cursor" / "agents"
    skills = tmp_path / ".cursor" / "skills"
    recipes = tmp_path / ".cursor" / "orchestration" / "recipes"
    for d in (agents, skills / "plan", recipes):
        d.mkdir(parents=True)
    (agents / "architect.md").write_text("# Architect\nDo architecture.\n", encoding="utf-8")
    (skills / "plan" / "SKILL.md").write_text("# Plan\nPlan things.\n", encoding="utf-8")
    (recipes / "INDEX.md").write_text("# Index\n", encoding="utf-8")
    cfg = ServiceConfig(
        orchestration_root=str(tmp_path / ".cursor" / "orchestration"),
        workspace_root=str(tmp_path),
        agents_root=str(agents),
        skills_root=str(skills),
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    loader = PromptTemplateLoader(paths)
    now = datetime.now(timezone.utc)
    intention = Intention(
        id=uuid4(),
        kind=IntentionKind.EVOLVE,
        status=IntentionStatus.RUNNING,
        intent="improve search",
        service_name="life_chat",
        features=[],
        checkpoint=LoopCheckpoint(stage=LoopStage.PLAN, updated_at=now),
        created_at=now,
        updated_at=now,
        metadata={
            "selected_option": {
                "id": "opt_ux",
                "title": "UX",
                "delta_summary": "Add search UI",
                "risk": "medium",
                "touches": ["ui", "api"],
            }
        },
    )
    bundle = loader.build(AgentRole.ARCHITECT, intention)
    assert "Selected evolve option" in bundle.skill_addendum
    assert "opt_ux" in bundle.skill_addendum
    assert "Add search UI" in bundle.skill_addendum
    assert "opt_ux" in bundle.user_payload


def test_format_selected_option_prompt() -> None:
    text = format_selected_option_prompt(
        {
            "id": "x",
            "title": "T",
            "delta_summary": "D",
            "risk": "low",
            "touches": ["api"],
        }
    )
    assert "authoritative" in text
    assert "`x`" in text
