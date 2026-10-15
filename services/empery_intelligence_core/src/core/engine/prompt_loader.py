"""Filesystem role/skill prompt loader — markdown templates only (no Cursor Task API)."""

from __future__ import annotations

import re
from pathlib import Path

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_intelligence_core.src.core.engine.contracts import (
    PromptTemplate,
    RoleName,
)

_FRONTMATTER_RE = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n", re.DOTALL)


def _strip_frontmatter(text: str) -> str:
    return _FRONTMATTER_RE.sub("", text, count=1).strip()


class FilesystemRolePromptLoader:
    """Load `.cursor/agents/{role}.md` and `.cursor/skills/{name}/SKILL.md`."""

    def __init__(
        self,
        workspace_root: str | Path,
        *,
        agents_root: str | Path | None = None,
        skills_root: str | Path | None = None,
    ) -> None:
        self._root = Path(workspace_root)
        self._agents = (
            Path(agents_root)
            if agents_root is not None
            else self._root / ".cursor" / "agents"
        )
        self._skills = (
            Path(skills_root)
            if skills_root is not None
            else self._root / ".cursor" / "skills"
        )

    def load_agent(self, role: RoleName) -> PromptTemplate:
        path = self._agents / f"{role.value}.md"
        return self._load(role, path)

    def load_skill(self, skill_name: str) -> PromptTemplate:
        path = self._skills / skill_name / "SKILL.md"
        return self._load(skill_name, path)

    def _load(self, role: RoleName | str, path: Path) -> PromptTemplate:
        if not path.is_file():
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ENGINE_PROMPT_NOT_FOUND",
                    message=f"Prompt template not found: {path}",
                    details={"path": str(path)},
                ),
                http_status=404,
            )
        body = _strip_frontmatter(path.read_text(encoding="utf-8"))
        return PromptTemplate(role=role, source_path=str(path), body=body)
