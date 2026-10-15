"""
FactoryRun state machine — stages, transitions, and event records.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Set

from pydantic import BaseModel, Field

from .spec import ComponentSpec


class FactoryRunStage(str, Enum):
    INTAKE = "INTAKE"
    CONTEXT_GATHERING = "CONTEXT_GATHERING"
    GENERATING = "GENERATING"
    VERIFYING = "VERIFYING"
    DEPLOYING = "DEPLOYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


TERMINAL_STAGES: Set[FactoryRunStage] = {
    FactoryRunStage.COMPLETED,
    FactoryRunStage.FAILED,
}

ACTIVE_STAGES: Set[FactoryRunStage] = {
    FactoryRunStage.INTAKE,
    FactoryRunStage.CONTEXT_GATHERING,
    FactoryRunStage.GENERATING,
    FactoryRunStage.VERIFYING,
    FactoryRunStage.DEPLOYING,
}

ALLOWED_TRANSITIONS: Dict[FactoryRunStage, Set[FactoryRunStage]] = {
    FactoryRunStage.INTAKE: {
        FactoryRunStage.CONTEXT_GATHERING,
        FactoryRunStage.FAILED,
    },
    FactoryRunStage.CONTEXT_GATHERING: {
        FactoryRunStage.GENERATING,
        FactoryRunStage.FAILED,
    },
    FactoryRunStage.GENERATING: {
        FactoryRunStage.VERIFYING,
        FactoryRunStage.FAILED,
    },
    FactoryRunStage.VERIFYING: {
        FactoryRunStage.DEPLOYING,
        FactoryRunStage.GENERATING,
        FactoryRunStage.FAILED,
    },
    FactoryRunStage.DEPLOYING: {
        FactoryRunStage.COMPLETED,
        FactoryRunStage.FAILED,
    },
    FactoryRunStage.COMPLETED: set(),
    FactoryRunStage.FAILED: set(),
}


def can_transition(from_stage: FactoryRunStage, to_stage: FactoryRunStage) -> bool:
    if from_stage in TERMINAL_STAGES:
        return False
    return to_stage in ALLOWED_TRANSITIONS.get(from_stage, set())


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class FactoryRunEvent(BaseModel):
    """Structured timeline entry for traceability."""

    timestamp: str = Field(default_factory=utc_now_iso)
    stage: FactoryRunStage
    event_type: str = Field(
        ...,
        description="e.g. stage_entered, stage_completed, error",
    )
    message: str = ""
    details: Optional[Dict[str, Any]] = None


class FactoryRunRecord(BaseModel):
    """Durable snapshot of a factory run."""

    run_id: str
    status: FactoryRunStage
    spec: ComponentSpec
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)
    error: Optional[str] = None
    retry_count: int = Field(
        default=0,
        description="Repair attempts consumed after verification failures",
    )
    max_retries: int = Field(
        default=3,
        description="Maximum self-healing repair attempts (circuit breaker)",
    )

    model_config = {"extra": "forbid"}
