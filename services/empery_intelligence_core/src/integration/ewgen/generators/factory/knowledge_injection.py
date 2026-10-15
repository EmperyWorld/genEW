"""
Knowledge injection — transform scavenger snippets into a token-budgeted context window.
"""

from __future__ import annotations

import os
import re
from typing import TYPE_CHECKING, List, Optional, Set

from .context_knowledge import ContextSnippet, ContextWindow, estimate_tokens
from .context_transport import TRANSPORT_MODE
from .fragment_ranking import rank_snippets
from .smart_truncation import smart_trim_content, validate_structural_integrity

if TYPE_CHECKING:
    from .dependency_graph import DependencyGraph
    from .graph_impact import NodeImpactProfile

__all__ = [
    "DEFAULT_TOKEN_BUDGET",
    "build_context_window",
    "build_semantic_context_window",
    "estimate_tokens",
]

DEFAULT_TOKEN_BUDGET = int(os.getenv("EWGEN_FACTORY_CONTEXT_TOKEN_BUDGET", "4096"))
SUFFIX_RESERVE_MIN = 16
SUFFIX_RESERVE_MAX = 320

TS_METHOD_RE = re.compile(r"^\s+(?:public\s+)?(?:async\s+)?(\w+)\s*\(", re.MULTILINE)


def build_context_window(
    snippets: List[ContextSnippet],
    *,
    token_budget: Optional[int] = None,
    module_type: Optional[str] = None,
    dependency_graph: Optional[DependencyGraph] = None,
    selected_node_ids: Optional[Set[str]] = None,
    target_module: Optional[str] = None,
    preserve_order: bool = False,
    preselected: bool = False,
    impact_profiles: Optional[dict[str, NodeImpactProfile]] = None,
    relationship_summary: Optional[List[str]] = None,
) -> ContextWindow:
    """
    Pack snippets into a context window respecting the token budget.

    Uses semantic ranking (contracts/interfaces first) and smart truncation
    that never splits mid-declaration — unfit snippets are dropped, not poisoned.
    """
    budget = token_budget if token_budget is not None else DEFAULT_TOKEN_BUDGET
    if not snippets:
        return ContextWindow(token_budget=budget, transport_mode=TRANSPORT_MODE)

    suffix_reserve = min(
        SUFFIX_RESERVE_MAX,
        max(SUFFIX_RESERVE_MIN, budget // 6),
    )
    snippet_budget = max(24, budget - suffix_reserve)

    ranked = snippets if preserve_order else rank_snippets(snippets)
    packed: List[ContextSnippet] = []
    used_tokens = 0
    truncated = False
    dropped = 0

    if preselected:
        for snippet in ranked:
            if not validate_structural_integrity(snippet.content, snippet.language):
                dropped += 1
                truncated = True
                continue
            packed.append(snippet)
            used_tokens += (
                estimate_tokens(snippet.content)
                + estimate_tokens(f"{snippet.path} {' '.join(snippet.symbols)}")
                + 8
            )
        dropped += max(0, len(ranked) - len(packed))
    else:
        for snippet in ranked:
            header_tokens = estimate_tokens(f"{snippet.path} {' '.join(snippet.symbols)}")
            snippet_tokens = estimate_tokens(snippet.content)
            total = snippet_tokens + header_tokens + 8

            candidate = snippet
            if used_tokens + total > snippet_budget:
                remaining = snippet_budget - used_tokens - header_tokens - 8
                trimmed = smart_trim_content(snippet.content, snippet.language, remaining)
                if trimmed is None:
                    dropped += 1
                    truncated = True
                    continue
                candidate = snippet.model_copy(update={"content": trimmed})
                total = estimate_tokens(trimmed) + header_tokens + 8
                if used_tokens + total > snippet_budget:
                    dropped += 1
                    truncated = True
                    continue
                truncated = True

            if not validate_structural_integrity(candidate.content, candidate.language):
                dropped += 1
                truncated = True
                continue

            packed.append(candidate)
            used_tokens += total

    directives = _build_integration_directives(packed)
    resolved_relationship_summary: List[str] = list(relationship_summary or [])
    dependency_map: List[dict] = []

    if dependency_graph is not None:
        node_ids = selected_node_ids or {
            snippet.node_id or f"{snippet.source_id}:{snippet.path}"
            for snippet in packed
        }
        dependency_map = dependency_graph.to_dependency_map(selected_node_ids=node_ids)
        if target_module and not resolved_relationship_summary:
            resolved_relationship_summary = dependency_graph.relationship_lines(
                target_module,
                node_ids,
                profiles=impact_profiles,
            )

    prompt_suffix = _build_prompt_suffix(
        packed,
        directives,
        module_type,
        relationship_summary=resolved_relationship_summary,
        impact_profiles=impact_profiles,
    )
    suffix_tokens = estimate_tokens(prompt_suffix)

    remaining_for_suffix = budget - used_tokens
    if suffix_tokens > remaining_for_suffix:
        prompt_suffix = _trim_prompt_suffix(prompt_suffix, remaining_for_suffix)
        suffix_tokens = estimate_tokens(prompt_suffix)
        truncated = True

    while packed and used_tokens + suffix_tokens > budget:
        dropped += 1
        packed.pop()
        used_tokens = sum(
            estimate_tokens(item.content)
            + estimate_tokens(f"{item.path} {' '.join(item.symbols)}")
            + 8
            for item in packed
        )
        directives = _build_integration_directives(packed)
        prompt_suffix = _build_prompt_suffix(
            packed,
            directives,
            module_type,
            relationship_summary=resolved_relationship_summary,
            impact_profiles=impact_profiles,
        )
        remaining_for_suffix = budget - used_tokens
        if estimate_tokens(prompt_suffix) > remaining_for_suffix:
            prompt_suffix = _trim_prompt_suffix(prompt_suffix, remaining_for_suffix)
        suffix_tokens = estimate_tokens(prompt_suffix)
        truncated = True

    total_tokens = used_tokens + suffix_tokens

    return ContextWindow(
        snippets=packed,
        integration_directives=directives,
        prompt_suffix=prompt_suffix,
        token_count=min(total_tokens, budget),
        token_budget=budget,
        truncated=truncated or dropped > 0,
        dropped_snippets=dropped,
        transport_mode=TRANSPORT_MODE,
        dependency_map=dependency_map,
        relationship_summary=resolved_relationship_summary,
        target_module=target_module or "",
    )


def build_semantic_context_window(
    snippets: List[ContextSnippet],
    *,
    target_module: str,
    direct_dependencies: List[str],
    token_budget: Optional[int] = None,
    module_type: Optional[str] = None,
) -> ContextWindow:
    """Build a graph-pruned ContextWindow for the target module."""
    from .context_pruner import ContextPruner  # noqa: PLC0415

    budget = token_budget if token_budget is not None else DEFAULT_TOKEN_BUDGET
    return ContextPruner().prune(
        snippets,
        target_module=target_module,
        direct_dependencies=direct_dependencies,
        token_budget=budget,
        module_type=module_type,
    )


def _build_integration_directives(snippets: List[ContextSnippet]) -> List[str]:
    directives: List[str] = []
    classes: List[str] = []
    methods: List[str] = []
    types: List[str] = []
    routes: List[str] = []

    for snippet in snippets:
        for symbol in snippet.symbols:
            if symbol.startswith("/"):
                routes.append(symbol)
            elif symbol[0].isupper() and ("Repository" in symbol or "Service" in symbol):
                classes.append(symbol)
            elif symbol[0].isupper():
                types.append(symbol)
            elif symbol not in {"get", "set", "post", "put", "delete", "patch"}:
                methods.append(symbol)

    for cls in sorted(set(classes)):
        method_hint = next((m for m in methods if m in _methods_for_class(snippets, cls)), "")
        if method_hint:
            directives.append(f"Extend or compose with {cls} and reuse {cls}.{method_hint}()")
        else:
            directives.append(f"Integrate with existing {cls} from dependency context")

    for type_name in sorted(set(types))[:6]:
        directives.append(f"Reuse type/interface {type_name} from provided context")

    for route in sorted(set(routes))[:4]:
        directives.append(f"Align API routes with existing pattern {route}")

    if any("api_response_format" in snippet.content for snippet in snippets):
        directives.append("Follow api_response_format envelope from context snippets")

    if any("BaseRepository" in " ".join(snippet.symbols) for snippet in snippets):
        directives.append(
            "Use BaseRepository as the persistence base class instead of raw axios calls",
        )

    return directives


def _methods_for_class(snippets: List[ContextSnippet], class_name: str) -> List[str]:
    methods: List[str] = []
    class_pattern = re.compile(rf"class\s+{re.escape(class_name)}\b[^{{]*{{", re.MULTILINE)
    for snippet in snippets:
        match = class_pattern.search(snippet.content)
        if not match:
            continue
        body_start = match.end()
        body = snippet.content[body_start:]
        for method in TS_METHOD_RE.findall(body):
            if not method.startswith("_"):
                methods.append(method)
    return methods


def _build_prompt_suffix(
    snippets: List[ContextSnippet],
    directives: List[str],
    module_type: Optional[str],
    *,
    relationship_summary: Optional[List[str]] = None,
    impact_profiles: Optional[dict] = None,
) -> str:
    if not snippets:
        return ""

    kind = module_type or "module"
    lines = [
        f"Generate a {kind} that integrates with the existing monorepo ecosystem.",
        "Do not invent parallel types or API shapes when context snippets provide them.",
    ]
    if relationship_summary:
        lines.append("Relationship summary (dependency graph):")
        lines.extend(f"  • {line}" for line in relationship_summary[:8])
    lines.extend(f"- {directive}" for directive in directives[:8])
    lines.append("Context snippets (types, interfaces, routes, contracts):")
    for snippet in snippets[:6]:
        symbol_hint = ", ".join(snippet.symbols[:6]) if snippet.symbols else "symbols"
        provenance = snippet.source_file or snippet.path
        impact = snippet.impact_level.value if snippet.impact_level else "medium"
        line_range = f"L{snippet.line_start}-L{snippet.line_end}"
        node_id = snippet.node_id or f"{snippet.source_id}:{snippet.path}"
        profile = (impact_profiles or {}).get(node_id)
        reason_hint = ""
        if profile and profile.reasons:
            reason_hint = f" — {profile.reasons[0]}"
        lines.append(
            f"  • [{snippet.source_id}] {provenance} ({symbol_hint}) "
            f"[{impact} impact, {line_range}]{reason_hint}",
        )
    return "\n".join(lines)


def _trim_prompt_suffix(prompt_suffix: str, token_limit: int) -> str:
    """Trim suffix by line boundaries — never cut mid-line."""
    if token_limit <= 0 or not prompt_suffix:
        return ""
    if estimate_tokens(prompt_suffix) <= token_limit:
        return prompt_suffix

    lines = prompt_suffix.splitlines()
    kept: List[str] = []
    used = 0
    for line in lines:
        line_tokens = estimate_tokens(line) + 1
        if used + line_tokens > token_limit:
            break
        kept.append(line)
        used += line_tokens

    if not kept and lines:
        first = lines[0]
        max_chars = max(16, token_limit * 4)
        return first[:max_chars]

    return "\n".join(kept)
