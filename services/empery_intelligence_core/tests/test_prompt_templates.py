"""Tests for PromptTemplateLoader."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from core.errors import ServiceError
from services.empery_intelligence_core.config import ServiceConfig
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
from services.empery_intelligence_core.src.integration.prompt_templates import (
    PromptTemplateLoader,
    strip_frontmatter,
)


def _intention(stage: LoopStage = LoopStage.PLAN) -> Intention:
    now = datetime.now(timezone.utc)
    return Intention(
        id=uuid4(),
        kind=IntentionKind.EVOLVE,
        status=IntentionStatus.RUNNING,
        intent="plan a service",
        service_name="demo_service",
        checkpoint=LoopCheckpoint(stage=stage, updated_at=now),
        created_at=now,
        updated_at=now,
    )


def test_strip_frontmatter() -> None:
    raw = "---\nname: x\n---\n\n# Body\n"
    assert strip_frontmatter(raw).startswith("# Body")


def test_load_roles_and_stable_hash(tmp_path: Path) -> None:
    cfg = ServiceConfig(
        orchestration_root=str(tmp_path / "orch"),
        workspace_root=str(tmp_path),
        agents_root=str(Path.cwd() / ".cursor" / "agents"),
        skills_root=str(Path.cwd() / ".cursor" / "skills"),
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    loader = PromptTemplateLoader(paths)

    for role, stage in (
        (AgentRole.ARCHITECT, LoopStage.PLAN),
        (AgentRole.IMPLEMENTER, LoopStage.IMPLEMENT),
        (AgentRole.VERIFIER, LoopStage.VERIFY),
    ):
        intention = _intention(stage)
        b1 = loader.build(role, intention)
        b2 = loader.build(role, intention)
        assert b1.system_prompt
        assert b1.skill_addendum
        assert b1.prompt_hash == b2.prompt_hash
        assert "---\n" not in b1.system_prompt[:10]


def test_missing_agent_file_errors(tmp_path: Path) -> None:
    cfg = ServiceConfig(
        orchestration_root=str(tmp_path / "orch"),
        workspace_root=str(tmp_path),
        agents_root=str(tmp_path / "missing_agents"),
        skills_root=str(Path.cwd() / ".cursor" / "skills"),
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    loader = PromptTemplateLoader(paths)
    with pytest.raises(ServiceError) as exc:
        loader.build(AgentRole.ARCHITECT, _intention())
    assert exc.value.response.error_code == "EIC_LOOP_ERROR"
