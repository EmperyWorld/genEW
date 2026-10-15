"""
Context knowledge models — semantic snippets for CAG generation.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


def estimate_tokens(text: str) -> int:
    """Rough token estimate (~4 chars per token for code)."""
    if not text:
        return 0
    return max(1, len(text) // 4)


class ImpactLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ContextSnippet(BaseModel):
    """High-signal code excerpt from a dependency catalog entry."""

    source_id: str
    catalog: str
    path: str
    language: str
    content: str
    symbols: List[str] = Field(default_factory=list)
    relevance_score: float = 1.0
    importance_tier: int = Field(
        default=6,
        description="1=contract (highest) … 7=import barrel (lowest)",
    )
    impact_level: ImpactLevel = ImpactLevel.MEDIUM
    source_file: str = ""
    line_start: int = Field(default=1, ge=1)
    line_end: int = Field(default=1, ge=1)
    node_id: str = ""


class ContextWindow(BaseModel):
    """Token-budgeted context payload for ts_worker / LLM generation."""

    snippets: List[ContextSnippet] = Field(default_factory=list)
    integration_directives: List[str] = Field(default_factory=list)
    prompt_suffix: str = ""
    token_count: int = 0
    token_budget: int = 4096
    truncated: bool = False
    dropped_snippets: int = 0
    transport_mode: str = "jsonlines_stdin"
    dependency_map: List[Dict[str, Any]] = Field(default_factory=list)
    relationship_summary: List[str] = Field(default_factory=list)
    target_module: str = ""
