"""Single-role LLM turn(s) via Nervas — 'spawn subagent' = different role prompt."""

from __future__ import annotations

import logging

from core.integration.nervas import (
    NervasGenerateRequest,
    NervasPlanRequest,
    NervasProvider,
    NervasReasonRequest,
)
from core.logging import log_event
from services.empery_intelligence_core.src.core.engine.contracts import (
    PromptTemplate,
    RoleName,
)


class RoleExecutor:
    """Execute one orchestration role against Nervas with a prompt template."""

    def __init__(
        self,
        nervas: NervasProvider,
        logger: logging.Logger,
    ) -> None:
        self._nervas = nervas
        self._logger = logger

    async def plan(
        self,
        *,
        system: str,
        intention: str,
        context: str | None,
    ):
        return await self._nervas.plan(
            NervasPlanRequest(
                intention=intention,
                context=context,
                system=system,
            )
        )

    async def reason(
        self,
        *,
        system: str,
        question: str,
        context: str | None,
    ):
        return await self._nervas.reason(
            NervasReasonRequest(
                question=question,
                context=context,
                system=system,
            )
        )

    async def generate(
        self,
        *,
        system: str,
        prompt: str,
    ):
        return await self._nervas.generate(
            NervasGenerateRequest(prompt=prompt, system=system)
        )

    def combine_prompts(self, *templates: PromptTemplate) -> str:
        parts = [t.body for t in templates if t.body.strip()]
        return "\n\n---\n\n".join(parts)

    def log_role(self, role: RoleName, template_paths: list[str]) -> None:
        log_event(
            self._logger,
            event="engine.role.start",
            message=f"Headless role turn: {role.value}",
            role=role.value,
            templates=template_paths,
        )
