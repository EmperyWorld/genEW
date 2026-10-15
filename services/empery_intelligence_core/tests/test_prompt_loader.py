"""Filesystem prompt loader loads real agents/skills markdown."""

from __future__ import annotations

from pathlib import Path

import pytest

from core.errors import ServiceError
from services.empery_intelligence_core.src.core.engine.contracts import RoleName
from services.empery_intelligence_core.src.core.engine.prompt_loader import (
    FilesystemRolePromptLoader,
)


def test_load_architect_and_plan_skill(workspace_root: Path) -> None:
    loader = FilesystemRolePromptLoader(
        workspace_root,
        agents_root=workspace_root / ".cursor" / "agents",
        skills_root=workspace_root / ".cursor" / "skills",
    )
    agent = loader.load_agent(RoleName.ARCHITECT)
    assert "Architect" in agent.body or "architect" in agent.body.lower()
    assert agent.source_path.endswith("architect.md")

    skill = loader.load_skill("plan")
    assert len(skill.body) > 20
    assert "SKILL.md" in skill.source_path


def test_missing_prompt_raises(tmp_path: Path) -> None:
    loader = FilesystemRolePromptLoader(tmp_path)
    with pytest.raises(ServiceError) as exc:
        loader.load_agent(RoleName.ARCHITECT)
    assert exc.value.response.error_code == "ENGINE_PROMPT_NOT_FOUND"
