"""Event topic names published / consumed by Reflexes."""

from __future__ import annotations

INTENTION_CREATED = "eic.intention.created"
INTENTION_CLAIMED = "eic.intention.claimed"
INTENTION_STAGE_CHANGED = "eic.intention.stage_changed"
INTENTION_PAUSED = "eic.intention.paused"
INTENTION_RESUMED = "eic.intention.resumed"
INTENTION_COMPLETED = "eic.intention.completed"
INTENTION_FAILED = "eic.intention.failed"
INTENTION_REQUESTED = "eic.intention.requested"

LOOP_ROLE_STARTED = "eic.loop.role_started"
LOOP_ROLE_FINISHED = "eic.loop.role_finished"

# Mechanics progress (StreamAssembly / local assemble steps) → ECC WS console.
ASSEMBLER_STEP = "eic.assembler.step"

# ECC WS allowlist expects eic.job.* for Autonomous console progress.
JOB_QUEUED = "eic.job.queued"
JOB_STARTED = "eic.job.started"
JOB_STAGE_CHANGED = "eic.job.stage_changed"
JOB_PAUSED = "eic.job.paused"
JOB_RESUMED = "eic.job.resumed"
JOB_COMPLETED = "eic.job.completed"
JOB_FAILED = "eic.job.failed"
JOB_CANCELLED = "eic.job.cancelled"

INTENTION_TO_JOB: dict[str, str] = {
    INTENTION_CLAIMED: JOB_STARTED,
    INTENTION_STAGE_CHANGED: JOB_STAGE_CHANGED,
    INTENTION_PAUSED: JOB_PAUSED,
    INTENTION_RESUMED: JOB_RESUMED,
    INTENTION_COMPLETED: JOB_COMPLETED,
    INTENTION_FAILED: JOB_FAILED,
}


def job_mirror_payload(event_name: str, payload: dict) -> dict | None:
    """Build eic.job.* payload mirrored from an intention/loop event, or None."""
    mapped = INTENTION_TO_JOB.get(event_name)
    if mapped is None:
        return None
    job_id = payload.get("intention_id") or payload.get("job_id")
    if job_id is None:
        return None
    summary_bits = [
        str(payload[k])
        for k in (
            "to_stage",
            "stage",
            "result_summary",
            "error_message",
            "reason",
            "claimed_by",
        )
        if payload.get(k)
    ]
    message = f"{mapped}"
    if summary_bits:
        message = f"{mapped}: {', '.join(summary_bits)}"
    return {
        **payload,
        "job_id": str(job_id),
        "eic_event": event_name,
        "message": message,
    }

PUBLISHED_TOPICS: tuple[str, ...] = (
    INTENTION_CREATED,
    INTENTION_CLAIMED,
    INTENTION_STAGE_CHANGED,
    INTENTION_PAUSED,
    INTENTION_RESUMED,
    INTENTION_COMPLETED,
    INTENTION_FAILED,
    LOOP_ROLE_STARTED,
    LOOP_ROLE_FINISHED,
    ASSEMBLER_STEP,
    JOB_STARTED,
    JOB_STAGE_CHANGED,
    JOB_PAUSED,
    JOB_RESUMED,
    JOB_COMPLETED,
    JOB_FAILED,
)
