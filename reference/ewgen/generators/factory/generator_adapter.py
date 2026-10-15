"""
Factory generator adapter — materialize artifacts from ComponentSpec (+ repair feedback).
"""

from __future__ import annotations

import logging
from typing import Callable, Optional, Protocol, runtime_checkable

from .context_knowledge import ContextWindow
from .intent_naming import module_name_from_intent
from .knowledge_injection import build_semantic_context_window
from .scavenger_context import ContextKnowledgeService, ScavengerContextKnowledgeService
from .spec import ComponentSpec

logger = logging.getLogger(__name__)


@runtime_checkable
class FactoryGeneratorAdapter(Protocol):
    """Generate or regenerate artifacts for a factory run workspace."""

    def generate(
        self,
        run_id: str,
        spec: ComponentSpec,
        *,
        context_window: Optional[ContextWindow] = None,
        retry_count: int = 0,
    ) -> None:
        """Write generated files into ``data/factory-runs/{run_id}/``."""
        ...


class CallableFactoryGenerator:
    """Adapter wrapping a callable for tests and custom pipelines."""

    def __init__(
        self,
        handler: Callable[..., None],
    ):
        self._handler = handler

    def generate(
        self,
        run_id: str,
        spec: ComponentSpec,
        *,
        context_window: Optional[ContextWindow] = None,
        retry_count: int = 0,
    ) -> None:
        try:
            self._handler(
                run_id,
                spec,
                context_window=context_window,
                retry_count=retry_count,
            )
        except TypeError:
            try:
                self._handler(run_id, spec, context_window=context_window)
            except TypeError:
                self._handler(run_id, spec)


class ModuleGeneratorAdapter:
    """
    Bridge to EWGen module generator with CAG context injection.

    Fetches scavenger/catalog snippets for ``spec.dependencies`` and passes a
    token-budgeted ``contextWindow`` to the ts_worker before generation.
    """

    def __init__(
        self,
        wrapper: object | None = None,
        *,
        context_knowledge: Optional[ContextKnowledgeService] = None,
    ):
        if wrapper is None:
            from generators.generator_wrapper import GeneratorWrapper  # noqa: PLC0415

            self._wrapper = GeneratorWrapper()
        else:
            self._wrapper = wrapper
        self._context_knowledge = (
            context_knowledge or ScavengerContextKnowledgeService()
        )

    def generate(
        self,
        run_id: str,
        spec: ComponentSpec,
        *,
        context_window: Optional[ContextWindow] = None,
        retry_count: int = 0,
    ) -> None:
        from .artifacts import materialize_run_files  # noqa: PLC0415

        module_type = spec.module_type.value if spec.module_type else "crud"
        config: dict = {
            "moduleName": module_name_from_intent(spec.intent),
            "moduleType": module_type,
            "intent": spec.intent,
            "factoryRetryCount": retry_count,
        }
        if spec.repair_feedback:
            config["repairFeedback"] = spec.repair_feedback
        if spec.field_hints:
            config["fieldHints"] = list(spec.field_hints)
        config["factoryRunId"] = run_id

        resolved_context = context_window or self._resolve_context_window(
            spec, module_type
        )
        if resolved_context and resolved_context.snippets:
            config["contextWindow"] = _context_window_for_worker(resolved_context)
            logger.info(
                "[factory-cag] context_injected run_id=%s snippets=%d tokens=%d truncated=%s",
                run_id,
                len(resolved_context.snippets),
                resolved_context.token_count,
                resolved_context.truncated,
            )

        generate_fn = getattr(self._wrapper, f"generate_{module_type}", None)
        if generate_fn is None:
            raise ValueError(f"Unsupported module type for generation: {module_type}")

        result = generate_fn(config)  # type: ignore[operator]
        if not result.get("success"):
            raise RuntimeError(result.get("error") or "Generation failed")

        files = [
            {
                "path": str(item.get("path", "")),
                "content": str(item.get("content", "")),
            }
            for item in result.get("files") or []
            if item.get("path")
        ]
        if not files:
            raise RuntimeError("Generator returned no files")

        materialize_run_files(run_id, files)
        logger.info("[factory] generated run_id=%s files=%d", run_id, len(files))

    def _resolve_context_window(
        self,
        spec: ComponentSpec,
        module_type: str,
    ) -> Optional[ContextWindow]:
        if not spec.dependencies:
            return None
        snippets = self._context_knowledge.fetch_for_dependencies(spec.dependencies)
        if not snippets:
            return None
        target = module_name_from_intent(spec.intent)
        return build_semantic_context_window(
            snippets,
            target_module=target,
            direct_dependencies=list(spec.dependencies),
            module_type=module_type,
        )


def _context_window_for_worker(context_window: ContextWindow) -> dict:
    """Serialize context window using ts_worker camelCase field names."""
    return {
        "snippets": [
            {
                "sourceId": snippet.source_id,
                "catalog": snippet.catalog,
                "path": snippet.path,
                "language": snippet.language,
                "content": snippet.content,
                "symbols": snippet.symbols,
                "relevanceScore": snippet.relevance_score,
                "impactLevel": snippet.impact_level.value,
                "sourceFile": snippet.source_file or snippet.path,
                "lineStart": snippet.line_start,
                "lineEnd": snippet.line_end,
                "nodeId": snippet.node_id,
            }
            for snippet in context_window.snippets
        ],
        "dependencyMap": context_window.dependency_map,
        "relationshipSummary": context_window.relationship_summary,
        "targetModule": context_window.target_module,
        "integrationDirectives": context_window.integration_directives,
        "promptSuffix": context_window.prompt_suffix,
        "tokenCount": context_window.token_count,
        "tokenBudget": context_window.token_budget,
        "truncated": context_window.truncated,
        "droppedSnippets": context_window.dropped_snippets,
        "transportMode": context_window.transport_mode,
    }
