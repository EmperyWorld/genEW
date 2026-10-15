"""Job status transitions and skill → agent_hint mapping."""

from __future__ import annotations

from services.empery_control_center_api.src.core.models import (
    JobStatus,
    LifecycleSkill,
)

SKILL_AGENT_HINT: dict[LifecycleSkill, str] = {
    LifecycleSkill.PLAN: "architect",
    LifecycleSkill.IMPLEMENT: "implementer",
    LifecycleSkill.VERIFY: "verifier",
    LifecycleSkill.EVOLVE: "architect",
}

TERMINAL_STATUSES = frozenset(
    {
        JobStatus.COMPLETED,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
    }
)

# Allowed transitions: from → set of to
ALLOWED_TRANSITIONS: dict[JobStatus, frozenset[JobStatus]] = {
    JobStatus.PENDING: frozenset(
        {
            JobStatus.CLAIMED,
            JobStatus.RUNNING,
            JobStatus.CANCELLED,
        }
    ),
    JobStatus.CLAIMED: frozenset(
        {
            JobStatus.RUNNING,
            JobStatus.COMPLETED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
            JobStatus.PENDING,  # TTL reclaim
        }
    ),
    JobStatus.RUNNING: frozenset(
        {
            JobStatus.COMPLETED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
        }
    ),
    JobStatus.COMPLETED: frozenset(),
    JobStatus.FAILED: frozenset(),
    JobStatus.CANCELLED: frozenset(),
}


def agent_hint_for(skill: LifecycleSkill) -> str:
    return SKILL_AGENT_HINT[skill]


def is_terminal(status: JobStatus) -> bool:
    return status in TERMINAL_STATUSES


def can_transition(from_status: JobStatus, to_status: JobStatus) -> bool:
    if from_status == to_status:
        return True
    return to_status in ALLOWED_TRANSITIONS.get(from_status, frozenset())


def _cursor_coordination_hint(
    job_id: str, skill: LifecycleSkill, *, design_path: str | None
) -> str:
    if skill == LifecycleSkill.PLAN:
        return (
            f"Run /plan (or Task→architect) using job {job_id}; "
            f"claim via POST /jobs/{job_id}/claim"
        )
    if skill == LifecycleSkill.IMPLEMENT:
        path = design_path or "designs/{{service}}_design.md"
        return f"Run /implement from {path}; claim job {job_id}"
    if skill == LifecycleSkill.VERIFY:
        return f"Run /verify for job {job_id}; claim via POST /jobs/{job_id}/claim"
    return (
        f"Run /evolve for job {job_id}; claim via POST /jobs/{job_id}/claim "
        "(plan→implement→verify)"
    )


def pickup_hint(job_id: str, skill: LifecycleSkill, *, design_path: str | None) -> str:
    """Operator hint for job pickup — Autonomous is the product path.

    Cursor coordination is appended only when ``EMPERY_CURSOR_SALVAGE=1``
    (advanced salvage; not the default success story).
    """
    import os

    base = (
        "Preferred: ECC Autonomous Mode (enable EIC mode + enqueue intention). "
        f"Track job {job_id} until verify PASSED."
    )
    salvage = os.environ.get("EMPERY_CURSOR_SALVAGE", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if not salvage:
        return base
    return (
        base
        + " Cursor salvage: "
        + _cursor_coordination_hint(job_id, skill, design_path=design_path)
    )
