"""Memory → Context pack formatter for Reason/Plan prompts."""

from __future__ import annotations

import logging
from typing import Any

from core.logging import log_event
from services.empery_intelligence_core.src.core.memory.models import AtomKind
from services.empery_intelligence_core.src.core.memory.settings import MemoryConfig
from services.empery_intelligence_core.src.core.memory.use_cases import MemoryUseCases
from services.empery_intelligence_core.src.data.memory.schemas import (
    ContextPackResponse,
    RetrievedAtom,
    RetrieveRequest,
)


class ContextPackService:
    """Builds a bounded formatted context string from retrieved Atoms."""

    def __init__(
        self,
        *,
        memory_use_cases: MemoryUseCases,
        config: MemoryConfig,
        logger: logging.Logger,
    ) -> None:
        self._memory = memory_use_cases
        self._config = config
        self._logger = logger

    def _kind_priority(self, stage: str, atom: RetrievedAtom) -> tuple[int, float]:
        kind = atom.atom.kind
        meta = atom.atom.metadata
        # Lower tuple sorts first
        if stage in {"plan", "evolve"}:
            order = {
                AtomKind.ARCHITECT_DECISION: 0,
                AtomKind.VERIFIER_REPORT: 1,
                AtomKind.CONTEXT_NOTE: 2,
                AtomKind.SELF_DOC_PROPOSAL: 3,
                AtomKind.SELF_DOC_APPLY: 4,
            }
            return (order.get(kind, 9), -atom.score)
        if stage == "implement":
            if kind == AtomKind.VERIFIER_REPORT and meta.get("verify_status") == "FAILED":
                return (0, -atom.score)
            if kind == AtomKind.VERIFIER_REPORT and meta.get("verify_status") == "PASSED":
                return (1, -atom.score)
            if kind == AtomKind.VERIFIER_REPORT:
                return (2, -atom.score)
            if kind == AtomKind.ARCHITECT_DECISION:
                return (3, -atom.score)
            return (4, -atom.score)
        if stage == "verify":
            order = {
                AtomKind.VERIFIER_REPORT: 0,
                AtomKind.ARCHITECT_DECISION: 1,
            }
            return (order.get(kind, 5), -atom.score)
        return (5, -atom.score)

    def _format_atom_block(self, item: RetrievedAtom) -> str:
        atom = item.atom
        artifact = atom.provenance.artifact_path or ""
        body = atom.body
        if len(body) > 800:
            body = body[:797] + "..."
        lines = [
            f"### [{atom.kind.value}] {atom.title}",
            body,
        ]
        if artifact:
            lines.append(f"_provenance: {artifact}_")
        return "\n".join(lines)

    def _recipe_source_block(
        self,
        *,
        query: str,
        service_name: str | None,
        stage: str,
    ) -> str | None:
        if stage not in {"plan", "implement", "evolve"}:
            return None
        try:
            from pathlib import Path

            from services.empery_intelligence_core.config import ServiceConfig
            from services.empery_intelligence_core.src.integration.orchestration_paths import (
                EicOrchestrationPaths,
            )
            from services.empery_intelligence_core.src.integration.recipe_catalog import (
                resolve_assembly_selection,
                _pack_dir,
                _eliteew_root,
            )

            root = Path(self._config.repo_root or Path.cwd()).resolve()
            cfg = ServiceConfig(workspace_root=str(root))
            paths = EicOrchestrationPaths.from_config(cfg, cwd=root)
            selection = resolve_assembly_selection(
                paths, service_name=service_name, intent=query
            )
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="eic.memory.context.recipe_failed",
                message=str(exc)[:200],
                level=logging.DEBUG,
            )
            return None

        chunks: list[str] = []
        budget = min(1200, max(400, self._config.context_token_budget // 3))
        used = 0
        for stem in selection.packs:
            pack_dir = _pack_dir(paths, stem)
            source_md = None
            if pack_dir is not None:
                cand = pack_dir / "SOURCE.md"
                if cand.is_file():
                    source_md = cand
            if source_md is None and stem in {
                "desktop_shell_kernel",
                "desktop_shell",
            }:
                elite = _eliteew_root(paths)
                for cand in (elite / "desktop" / "SOURCE.md", elite / "SOURCE.md"):
                    if cand.is_file():
                        source_md = cand
                        break
            if source_md is None:
                continue
            try:
                body = source_md.read_text(encoding="utf-8").strip()
            except OSError:
                continue
            block = f"### SOURCE `{stem}`\n\n{body}"
            if used + len(block) + 2 > budget and chunks:
                break
            if len(block) > budget - used:
                block = block[: max(0, budget - used - 3)] + "..."
            chunks.append(block)
            used += len(block) + 2
            if used >= budget:
                break
        if not chunks:
            return None
        return "## Recipe SOURCE excerpts (atoms)\n\n" + "\n\n".join(chunks)

    async def build_context(
        self,
        *,
        query: str,
        stage: str = "plan",
        service_name: str | None = None,
        kinds: list[AtomKind] | None = None,
        limit: int | None = None,
        token_budget: int | None = None,
    ) -> ContextPackResponse:
        budget = token_budget or self._config.context_token_budget
        top_k = limit or self._config.retrieve_default_limit
        top_k = min(top_k, self._config.retrieve_max_limit)

        retrieved = await self._memory.retrieve(
            RetrieveRequest(
                query=query,
                kinds=kinds,
                service_name=service_name,
                limit=top_k,
                mode="hybrid",
            )
        )
        ordered = sorted(
            retrieved.results,
            key=lambda a: self._kind_priority(stage, a),
        )

        header = f"## EIC Memory Context ({stage})"
        parts: list[str] = [header]
        used = len(header)
        selected: list[RetrievedAtom] = []
        truncated = False

        # Recipe SOURCE / atom catalog excerpts (compose-from-atoms, not invent).
        recipe_block = self._recipe_source_block(
            query=query, service_name=service_name, stage=stage
        )
        if recipe_block:
            addition = len(recipe_block) + 2
            if used + addition <= budget:
                parts.append(recipe_block)
                used += addition

        for item in ordered:
            block = self._format_atom_block(item)
            # +2 for blank line separators
            addition = len(block) + 2
            if selected and used + addition > budget:
                truncated = True
                break
            if not selected and used + addition > budget:
                # Always include at least a truncated first atom if possible
                overflow = budget - used - 2
                if overflow < 64:
                    truncated = True
                    break
                block = block[: overflow - 3] + "..."
                parts.append(block)
                selected.append(item)
                used = budget
                truncated = True
                break
            parts.append(block)
            selected.append(item)
            used += addition

        formatted = "\n\n".join(parts)
        log_event(
            self._logger,
            event="eic.memory.context.built",
            message="Context pack built",
            stage=stage,
            atom_count=len(selected),
            truncated=truncated,
            budget_used=len(formatted),
        )
        return ContextPackResponse(
            query=query,
            stage=stage,
            atoms=selected,
            formatted_context=formatted,
            truncated=truncated,
            budget_used=len(formatted),
        )

    # Alias matching ContextPackPort naming in some callers
    async def build(
        self,
        **kwargs: Any,
    ) -> ContextPackResponse:
        return await self.build_context(**kwargs)
