"""File-backed JobStore under orchestration/jobs/{pending,claimed,archive}/."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from core.errors import ServiceError, StandardizedErrorResponse
from core.logging import log_event

from services.empery_control_center_api.config import ServiceConfig
from services.empery_control_center_api.src.core.job_lifecycle import (
    TERMINAL_STATUSES,
    can_transition,
    is_terminal,
)
from services.empery_control_center_api.src.core.models import (
    JobStatus,
    LifecycleSkill,
    OrchestrationJob,
)
from services.empery_control_center_api.src.data.schemas import UpdateJobRequest
from services.empery_control_center_api.src.integration.orchestration_paths import (
    OrchestrationPaths,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class JobStore:
    """Process-local file job queue with asyncio lock serialization."""

    def __init__(
        self,
        paths: OrchestrationPaths,
        config: ServiceConfig,
        logger: logging.Logger,
    ) -> None:
        self._paths = paths
        self._config = config
        self._logger = logger
        self._lock = asyncio.Lock()

    def ensure_layout(self) -> None:
        for directory in (
            self._paths.jobs_root,
            self._paths.pending_dir,
            self._paths.claimed_dir,
            self._paths.archive_dir,
            self._paths.designs_root,
            self._paths.reports_root,
            self._paths.intents_root,
            self._paths.audit_path.parent,
        ):
            directory.mkdir(parents=True, exist_ok=True)

    def _dir_for_status(self, status: JobStatus) -> Path:
        if status == JobStatus.PENDING:
            return self._paths.pending_dir
        if status in {JobStatus.CLAIMED, JobStatus.RUNNING}:
            return self._paths.claimed_dir
        return self._paths.archive_dir

    def _job_path(self, job_id: UUID, status: JobStatus) -> Path:
        return self._dir_for_status(status) / f"{job_id}.json"

    def _find_path(self, job_id: UUID) -> Path | None:
        for directory in (
            self._paths.pending_dir,
            self._paths.claimed_dir,
            self._paths.archive_dir,
        ):
            candidate = directory / f"{job_id}.json"
            if candidate.is_file():
                return candidate
        return None

    def _read_file(self, path: Path) -> OrchestrationJob:
        return OrchestrationJob.model_validate_json(path.read_text(encoding="utf-8"))

    def _atomic_write(self, path: Path, job: OrchestrationJob) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(job.model_dump_json(indent=2), encoding="utf-8")
        tmp.replace(path)

    def _move_job(
        self,
        job: OrchestrationJob,
        *,
        from_status: JobStatus,
        to_status: JobStatus,
    ) -> None:
        src = self._job_path(job.id, from_status)
        dst = self._job_path(job.id, to_status)
        self._atomic_write(dst, job)
        if src.resolve() != dst.resolve() and src.is_file():
            src.unlink()

    def _not_found(self, job_id: UUID) -> ServiceError:
        return ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_JOB_NOT_FOUND",
                message=f"Job '{job_id}' not found",
                details={"job_id": str(job_id)},
            ),
            http_status=404,
        )

    def _invalid_transition(
        self, job_id: UUID, from_status: JobStatus, to_status: JobStatus
    ) -> ServiceError:
        return ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_INVALID_TRANSITION",
                message=(
                    f"Invalid job transition {from_status.value} → {to_status.value}"
                ),
                details={
                    "job_id": str(job_id),
                    "from_status": from_status.value,
                    "to_status": to_status.value,
                },
            ),
            http_status=409,
        )

    async def create(self, job: OrchestrationJob) -> OrchestrationJob:
        async with self._lock:
            self.ensure_layout()
            path = self._job_path(job.id, JobStatus.PENDING)
            if path.exists() or self._find_path(job.id) is not None:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="ECC_INVALID_TRANSITION",
                        message=f"Job '{job.id}' already exists",
                        details={"job_id": str(job.id)},
                    ),
                    http_status=409,
                )
            self._atomic_write(path, job)
            log_event(
                self._logger,
                event="ecc.job_store.created",
                message="Job file written",
                job_id=str(job.id),
                skill=job.skill.value,
            )
            return job

    async def get(self, job_id: UUID) -> OrchestrationJob | None:
        async with self._lock:
            path = self._find_path(job_id)
            if path is None:
                return None
            return self._read_file(path)

    async def list(
        self,
        *,
        status: JobStatus | None,
        skill: LifecycleSkill | None,
        limit: int,
    ) -> list[OrchestrationJob]:
        async with self._lock:
            jobs: list[OrchestrationJob] = []
            for directory in (
                self._paths.pending_dir,
                self._paths.claimed_dir,
                self._paths.archive_dir,
            ):
                if not directory.is_dir():
                    continue
                for path in directory.glob("*.json"):
                    try:
                        jobs.append(self._read_file(path))
                    except Exception:  # noqa: BLE001 — skip corrupt files
                        log_event(
                            self._logger,
                            event="ecc.job_store.read_error",
                            message="Skipping unreadable job file",
                            level=logging.WARNING,
                            path=str(path),
                        )
            if status is not None:
                jobs = [j for j in jobs if j.status == status]
            if skill is not None:
                jobs = [j for j in jobs if j.skill == skill]
            jobs.sort(key=lambda j: j.created_at, reverse=True)
            return jobs[: max(limit, 0)]

    def _maybe_reclaim_unlocked(self, job: OrchestrationJob) -> OrchestrationJob:
        """TTL reclaim assuming lock is held."""
        if job.status != JobStatus.CLAIMED or job.claimed_at is None:
            return job
        claimed_at = job.claimed_at
        if claimed_at.tzinfo is None:
            claimed_at = claimed_at.replace(tzinfo=timezone.utc)
        age = (_utc_now() - claimed_at).total_seconds()
        if age < self._config.job_claim_ttl_seconds:
            return job
        reclaimed = job.model_copy(
            update={
                "status": JobStatus.PENDING,
                "claimed_at": None,
                "claimed_by": None,
                "updated_at": _utc_now(),
            }
        )
        self._move_job(
            reclaimed, from_status=JobStatus.CLAIMED, to_status=JobStatus.PENDING
        )
        log_event(
            self._logger,
            event="ecc.job_store.reclaimed",
            message="Stale claim reclaimed",
            job_id=str(job.id),
        )
        return reclaimed

    async def claim(self, job_id: UUID, claimed_by: str) -> OrchestrationJob:
        async with self._lock:
            path = self._find_path(job_id)
            if path is None:
                raise self._not_found(job_id)
            job = self._maybe_reclaim_unlocked(self._read_file(path))
            if job.status != JobStatus.PENDING:
                raise self._invalid_transition(
                    job_id, job.status, JobStatus.CLAIMED
                )
            now = _utc_now()
            updated = job.model_copy(
                update={
                    "status": JobStatus.CLAIMED,
                    "claimed_at": now,
                    "claimed_by": claimed_by,
                    "updated_at": now,
                }
            )
            self._move_job(
                updated, from_status=JobStatus.PENDING, to_status=JobStatus.CLAIMED
            )
            return updated

    async def update(self, job_id: UUID, patch: UpdateJobRequest) -> OrchestrationJob:
        async with self._lock:
            path = self._find_path(job_id)
            if path is None:
                raise self._not_found(job_id)
            job = self._read_file(path)
            if is_terminal(job.status) and patch.status is not None:
                raise self._invalid_transition(job_id, job.status, patch.status)

            new_status = patch.status or job.status
            if patch.status is not None and not can_transition(job.status, new_status):
                raise self._invalid_transition(job_id, job.status, new_status)

            updates: dict = {"updated_at": _utc_now()}
            if patch.status is not None:
                updates["status"] = patch.status
            if patch.result_summary is not None:
                updates["result_summary"] = patch.result_summary
            if patch.error_message is not None:
                updates["error_message"] = patch.error_message
            if patch.artifact_paths is not None:
                updates["artifact_paths"] = patch.artifact_paths
            if patch.design_path is not None:
                updates["design_path"] = patch.design_path
            if patch.report_path is not None:
                updates["report_path"] = patch.report_path
            if patch.metadata is not None:
                merged = {**job.metadata, **patch.metadata}
                updates["metadata"] = merged
            if patch.mode is not None:
                updates["mode"] = patch.mode

            updated = job.model_copy(update=updates)
            self._move_job(updated, from_status=job.status, to_status=updated.status)
            return updated

    async def cancel(self, job_id: UUID) -> OrchestrationJob:
        async with self._lock:
            path = self._find_path(job_id)
            if path is None:
                raise self._not_found(job_id)
            job = self._read_file(path)
            if job.status in TERMINAL_STATUSES:
                raise self._invalid_transition(
                    job_id, job.status, JobStatus.CANCELLED
                )
            if not can_transition(job.status, JobStatus.CANCELLED):
                raise self._invalid_transition(
                    job_id, job.status, JobStatus.CANCELLED
                )
            updated = job.model_copy(
                update={
                    "status": JobStatus.CANCELLED,
                    "updated_at": _utc_now(),
                    "result_summary": job.result_summary or "Cancelled",
                }
            )
            self._move_job(
                updated, from_status=job.status, to_status=JobStatus.CANCELLED
            )
            return updated
