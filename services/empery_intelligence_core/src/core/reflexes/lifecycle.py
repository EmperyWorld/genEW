"""Intention status / stage transitions for Reflexes."""

from __future__ import annotations

from services.empery_intelligence_core.src.core.reflexes.models import (
    AgentRole,
    IntentionKind,
    IntentionStatus,
    LoopStage,
)

TERMINAL_STATUSES = frozenset(
    {
        IntentionStatus.COMPLETED,
        IntentionStatus.FAILED,
        IntentionStatus.CANCELLED,
    }
)

ALLOWED_TRANSITIONS: dict[IntentionStatus, frozenset[IntentionStatus]] = {
    IntentionStatus.PENDING: frozenset(
        {
            IntentionStatus.RUNNING,
            IntentionStatus.PAUSED,  # operator pause before claim
            IntentionStatus.CANCELLED,
        }
    ),
    IntentionStatus.RUNNING: frozenset(
        {
            IntentionStatus.PAUSED,
            IntentionStatus.COMPLETED,
            IntentionStatus.FAILED,
            IntentionStatus.CANCELLED,
        }
    ),
    IntentionStatus.PAUSED: frozenset(
        {
            IntentionStatus.PENDING,
            IntentionStatus.RUNNING,
            IntentionStatus.CANCELLED,
        }
    ),
    IntentionStatus.COMPLETED: frozenset(),
    IntentionStatus.FAILED: frozenset(),
    IntentionStatus.CANCELLED: frozenset(),
}

KIND_ENTRY_STAGE: dict[IntentionKind, LoopStage] = {
    IntentionKind.PLAN: LoopStage.PLAN,
    IntentionKind.IMPLEMENT: LoopStage.IMPLEMENT,
    IntentionKind.VERIFY: LoopStage.VERIFY,
    IntentionKind.EVOLVE: LoopStage.PLAN,
}

STAGE_ROLE: dict[LoopStage, AgentRole | None] = {
    LoopStage.QUEUED: None,
    LoopStage.PLAN: AgentRole.ARCHITECT,
    LoopStage.IMPLEMENT: AgentRole.IMPLEMENTER,
    LoopStage.VERIFY: AgentRole.VERIFIER,
    LoopStage.FIX: AgentRole.IMPLEMENTER,
    LoopStage.DONE: None,
}

# Stages that imply PLAN already completed (idempotent skip).
POST_PLAN_STAGES = frozenset(
    {
        LoopStage.IMPLEMENT,
        LoopStage.VERIFY,
        LoopStage.FIX,
        LoopStage.DONE,
    }
)


def is_terminal(status: IntentionStatus) -> bool:
    return status in TERMINAL_STATUSES


def can_transition(from_status: IntentionStatus, to_status: IntentionStatus) -> bool:
    if from_status == to_status:
        return True
    return to_status in ALLOWED_TRANSITIONS.get(from_status, frozenset())


def entry_stage_for(kind: IntentionKind) -> LoopStage:
    return KIND_ENTRY_STAGE[kind]


def role_for_stage(stage: LoopStage) -> AgentRole | None:
    return STAGE_ROLE.get(stage)


def should_skip_plan(*, design_path: str | None, stage: LoopStage) -> bool:
    return bool(design_path) and stage in POST_PLAN_STAGES
