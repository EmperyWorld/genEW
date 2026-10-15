"""File-backed Intention store under eic/intentions/{pending,running,paused,archive}/."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from core.errors import ServiceError, StandardizedErrorResponse
from core.logging import log_event

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.core.reflexes.lifecycle import (
    can_transition,
    is_terminal,
)
from services.empery_intelligence_core.src.core.reflexes.models import (
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopCheckpoint,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class IntentionStore:
    """Process-local file queue with asyncio lock serialization."""

    def __init__(
        self,
        paths: EicOrchestrationPaths,
        config: ServiceConfig,
        logger: logging.Logger,
    ) -> None:
        self._paths = paths
        self._config = config
        self._logger = logger
        self._lock = asyncio.Lock()

    def ensure_layout(self) -> None:
        for directory in (
            self._paths.eic_root,
            self._paths.intentions_root,
            self._paths.pending_dir,
            self._paths.running_dir,
            self._paths.paused_dir,
            self._paths.archive_dir,
            self._paths.designs_root,
            self._paths.reports_root,
        ):
            directory.mkdir(parents=True, exist_ok=True)

    def _dir_for_status(self, status: IntentionStatus) -> Path:
        if status == IntentionStatus.PENDING:
            return self._paths.pending_dir
        if status == IntentionStatus.RUNNING:
            return self._paths.running_dir
        if status == IntentionStatus.PAUSED:
            return self._paths.paused_dir
        return self._paths.archive_dir

    def _intention_path(self, intention_id: UUID, status: IntentionStatus) -> Path:
        return self._dir_for_status(status) / f"{intention_id}.json"

    def _find_path(self, intention_id: UUID) -> Path | None:
        for directory in (
            self._paths.pending_dir,
            self._paths.running_dir,
            self._paths.paused_dir,
            self._paths.archive_dir,
        ):
            candidate = directory / f"{intention_id}.json"
            if candidate.is_file():
                return candidate
        return None

    def _read_file(self, path: Path) -> Intention:
        return Intention.model_validate_json(path.read_text(encoding="utf-8"))

    def _atomic_write(self, path: Path, intention: Intention) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(intention.model_dump_json(indent=2), encoding="utf-8")
        tmp.replace(path)

    def _move(
        self,
        intention: Intention,
        *,
        from_status: IntentionStatus,
        to_status: IntentionStatus,
    ) -> None:
        src = self._intention_path(intention.id, from_status)
        dst = self._intention_path(intention.id, to_status)
        self._atomic_write(dst, intention)
        if src.resolve() != dst.resolve() and src.is_file():
            src.unlink()

    def _not_found(self, intention_id: UUID) -> ServiceError:
        return ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_INTENTION_NOT_FOUND",
                message=f"Intention '{intention_id}' not found",
                details={"intention_id": str(intention_id)},
            ),
            http_status=404,
        )

    def _invalid_transition(
        self,
        intention_id: UUID,
        from_status: IntentionStatus,
        to_status: IntentionStatus,
    ) -> ServiceError:
        return ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_INVALID_TRANSITION",
                message=(
                    f"Invalid intention transition "
                    f"{from_status.value} → {to_status.value}"
                ),
                details={
                    "intention_id": str(intention_id),
                    "from_status": from_status.value,
                    "to_status": to_status.value,
                },
            ),
            http_status=409,
        )

    async def create(self, intention: Intention) -> Intention:
        async with self._lock:
            self.ensure_layout()
            if self._find_path(intention.id) is not None:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_INVALID_TRANSITION",
                        message=f"Intention '{intention.id}' already exists",
                        details={"intention_id": str(intention.id)},
                    ),
                    http_status=409,
                )
            path = self._intention_path(intention.id, IntentionStatus.PENDING)
            pending = intention.model_copy(
                update={"status": IntentionStatus.PENDING, "updated_at": _utc_now()}
            )
            self._atomic_write(path, pending)
            log_event(
                self._logger,
                event="eic.intention_store.created",
                message="Intention file written",
                intention_id=str(pending.id),
                kind=pending.kind.value,
            )
            return pending

    async def get(self, intention_id: UUID) -> Intention | None:
        async with self._lock:
            path = self._find_path(intention_id)
            if path is None:
                return None
            return self._read_file(path)

    async def list(
        self,
        *,
        status: IntentionStatus | None,
        kind: IntentionKind | None,
        limit: int,
    ) -> list[Intention]:
        async with self._lock:
            items: list[Intention] = []
            for directory in (
                self._paths.pending_dir,
                self._paths.running_dir,
                self._paths.paused_dir,
                self._paths.archive_dir,
            ):
                if not directory.is_dir():
                    continue
                for path in directory.glob("*.json"):
                    if path.name.endswith(".tmp"):
                        continue
                    try:
                        items.append(self._read_file(path))
                    except Exception:  # noqa: BLE001 — skip corrupt files
                        log_event(
                            self._logger,
                            event="eic.intention_store.read_error",
                            message="Skipping unreadable intention file",
                            level=logging.WARNING,
                            path=str(path),
                        )
            if status is not None:
                items = [i for i in items if i.status == status]
            if kind is not None:
                items = [i for i in items if i.kind == kind]
            items.sort(key=lambda i: i.created_at, reverse=True)
            return items[: max(limit, 0)]

    async def claim_next(self, claimed_by: str) -> Intention | None:
        async with self._lock:
            self.ensure_layout()
            pending_files = sorted(
                self._paths.pending_dir.glob("*.json"),
                key=lambda p: p.stat().st_mtime,
            )
            for path in pending_files:
                try:
                    intention = self._read_file(path)
                except Exception:  # noqa: BLE001
                    log_event(
                        self._logger,
                        event="eic.intention_store.read_error",
                        message="Skipping unreadable pending intention",
                        level=logging.WARNING,
                        path=str(path),
                    )
                    continue
                if intention.status != IntentionStatus.PENDING:
                    continue
                now = _utc_now()
                claimed = intention.model_copy(
                    update={
                        "status": IntentionStatus.RUNNING,
                        "claimed_by": claimed_by,
                        "started_at": intention.started_at or now,
                        "updated_at": now,
                        "checkpoint": intention.checkpoint.model_copy(
                            update={"updated_at": now}
                        ),
                    }
                )
                self._move(
                    claimed,
                    from_status=IntentionStatus.PENDING,
                    to_status=IntentionStatus.RUNNING,
                )
                return claimed
            return None

    async def update_checkpoint(
        self, intention_id: UUID, checkpoint: LoopCheckpoint
    ) -> Intention:
        async with self._lock:
            path = self._find_path(intention_id)
            if path is None:
                raise self._not_found(intention_id)
            intention = self._read_file(path)
            updated = intention.model_copy(
                update={
                    "checkpoint": checkpoint.model_copy(
                        update={"updated_at": _utc_now()}
                    ),
                    "updated_at": _utc_now(),
                }
            )
            self._atomic_write(path, updated)
            return updated

    async def save(self, intention: Intention) -> Intention:
        """Overwrite intention at its current status directory (atomic)."""
        async with self._lock:
            path = self._find_path(intention.id)
            if path is None:
                raise self._not_found(intention.id)
            current = self._read_file(path)
            if current.status != intention.status:
                self._move(
                    intention,
                    from_status=current.status,
                    to_status=intention.status,
                )
            else:
                self._atomic_write(path, intention)
            return intention

    async def pause(
        self, intention_id: UUID, *, reason: str | None = None
    ) -> Intention:
        async with self._lock:
            path = self._find_path(intention_id)
            if path is None:
                raise self._not_found(intention_id)
            intention = self._read_file(path)
            if not can_transition(intention.status, IntentionStatus.PAUSED):
                raise self._invalid_transition(
                    intention_id, intention.status, IntentionStatus.PAUSED
                )
            now = _utc_now()
            cp = intention.checkpoint.model_copy(
                update={
                    "last_error": reason or intention.checkpoint.last_error,
                    "updated_at": now,
                }
            )
            updated = intention.model_copy(
                update={
                    "status": IntentionStatus.PAUSED,
                    "checkpoint": cp,
                    "updated_at": now,
                }
            )
            self._move(
                updated,
                from_status=intention.status,
                to_status=IntentionStatus.PAUSED,
            )
            return updated

    async def resume(self, intention_id: UUID) -> Intention:
        """paused → pending so the worker can re-claim at checkpoint.stage."""
        async with self._lock:
            path = self._find_path(intention_id)
            if path is None:
                raise self._not_found(intention_id)
            intention = self._read_file(path)
            if intention.status != IntentionStatus.PAUSED:
                raise self._invalid_transition(
                    intention_id, intention.status, IntentionStatus.PENDING
                )
            now = _utc_now()
            cp = intention.checkpoint.model_copy(
                update={
                    "last_error": None
                    if intention.checkpoint.last_error == "interrupted"
                    else intention.checkpoint.last_error,
                    "updated_at": now,
                }
            )
            updated = intention.model_copy(
                update={
                    "status": IntentionStatus.PENDING,
                    "claimed_by": None,
                    "checkpoint": cp,
                    "updated_at": now,
                }
            )
            self._move(
                updated,
                from_status=IntentionStatus.PAUSED,
                to_status=IntentionStatus.PENDING,
            )
            return updated

    async def cancel(self, intention_id: UUID) -> Intention:
        async with self._lock:
            path = self._find_path(intention_id)
            if path is None:
                raise self._not_found(intention_id)
            intention = self._read_file(path)
            if is_terminal(intention.status):
                raise self._invalid_transition(
                    intention_id, intention.status, IntentionStatus.CANCELLED
                )
            if not can_transition(intention.status, IntentionStatus.CANCELLED):
                raise self._invalid_transition(
                    intention_id, intention.status, IntentionStatus.CANCELLED
                )
            now = _utc_now()
            updated = intention.model_copy(
                update={
                    "status": IntentionStatus.CANCELLED,
                    "finished_at": now,
                    "updated_at": now,
                    "result_summary": intention.result_summary or "Cancelled",
                }
            )
            self._move(
                updated,
                from_status=intention.status,
                to_status=IntentionStatus.CANCELLED,
            )
            return updated

    async def complete(
        self, intention_id: UUID, *, result_summary: str | None = None
    ) -> Intention:
        async with self._lock:
            path = self._find_path(intention_id)
            if path is None:
                raise self._not_found(intention_id)
            intention = self._read_file(path)
            if not can_transition(intention.status, IntentionStatus.COMPLETED):
                raise self._invalid_transition(
                    intention_id, intention.status, IntentionStatus.COMPLETED
                )
            now = _utc_now()
            cp = intention.checkpoint.model_copy(
                update={"stage": intention.checkpoint.stage, "updated_at": now}
            )
            # Prefer DONE stage on success
            from services.empery_intelligence_core.src.core.reflexes.models import (
                LoopStage,
            )

            cp = cp.model_copy(update={"stage": LoopStage.DONE, "updated_at": now})
            updated = intention.model_copy(
                update={
                    "status": IntentionStatus.COMPLETED,
                    "checkpoint": cp,
                    "finished_at": now,
                    "updated_at": now,
                    "result_summary": result_summary or intention.result_summary,
                }
            )
            self._move(
                updated,
                from_status=intention.status,
                to_status=IntentionStatus.COMPLETED,
            )
            return updated

    async def fail(self, intention_id: UUID, *, error_message: str) -> Intention:
        async with self._lock:
            path = self._find_path(intention_id)
            if path is None:
                raise self._not_found(intention_id)
            intention = self._read_file(path)
            if not can_transition(intention.status, IntentionStatus.FAILED):
                raise self._invalid_transition(
                    intention_id, intention.status, IntentionStatus.FAILED
                )
            now = _utc_now()
            cp = intention.checkpoint.model_copy(
                update={"last_error": error_message, "updated_at": now}
            )
            updated = intention.model_copy(
                update={
                    "status": IntentionStatus.FAILED,
                    "checkpoint": cp,
                    "error_message": error_message,
                    "finished_at": now,
                    "updated_at": now,
                }
            )
            self._move(
                updated,
                from_status=intention.status,
                to_status=IntentionStatus.FAILED,
            )
            return updated

    async def recover_running(self) -> list[Intention]:
        """On boot: running/ → paused with last_error=interrupted (Life Test 3)."""
        async with self._lock:
            self.ensure_layout()
            recovered: list[Intention] = []
            for path in list(self._paths.running_dir.glob("*.json")):
                try:
                    intention = self._read_file(path)
                except Exception:  # noqa: BLE001
                    log_event(
                        self._logger,
                        event="eic.intention_store.read_error",
                        message="Skipping unreadable running intention",
                        level=logging.WARNING,
                        path=str(path),
                    )
                    continue
                now = _utc_now()
                cp = intention.checkpoint.model_copy(
                    update={"last_error": "interrupted", "updated_at": now}
                )
                paused = intention.model_copy(
                    update={
                        "status": IntentionStatus.PAUSED,
                        "checkpoint": cp,
                        "updated_at": now,
                        "claimed_by": None,
                    }
                )
                self._move(
                    paused,
                    from_status=IntentionStatus.RUNNING,
                    to_status=IntentionStatus.PAUSED,
                )
                recovered.append(paused)
                log_event(
                    self._logger,
                    event="eic.intention_store.recovered",
                    message="Running intention recovered to paused",
                    intention_id=str(paused.id),
                    stage=paused.checkpoint.stage.value,
                )
            return recovered

    async def reclaim_stale_running(self) -> list[Intention]:
        """TTL reclaim: stale running → paused(interrupted)."""
        async with self._lock:
            recovered: list[Intention] = []
            ttl = self._config.intention_stale_running_seconds
            for path in list(self._paths.running_dir.glob("*.json")):
                try:
                    intention = self._read_file(path)
                except Exception:  # noqa: BLE001
                    continue
                updated_at = intention.updated_at
                if updated_at.tzinfo is None:
                    updated_at = updated_at.replace(tzinfo=timezone.utc)
                age = (_utc_now() - updated_at).total_seconds()
                if age < ttl:
                    continue
                now = _utc_now()
                cp = intention.checkpoint.model_copy(
                    update={"last_error": "interrupted", "updated_at": now}
                )
                paused = intention.model_copy(
                    update={
                        "status": IntentionStatus.PAUSED,
                        "checkpoint": cp,
                        "updated_at": now,
                        "claimed_by": None,
                    }
                )
                self._move(
                    paused,
                    from_status=IntentionStatus.RUNNING,
                    to_status=IntentionStatus.PAUSED,
                )
                recovered.append(paused)
            return recovered

    async def depths(self) -> dict[str, int]:
        async with self._lock:
            return {
                "pending": len(list(self._paths.pending_dir.glob("*.json"))),
                "running": len(list(self._paths.running_dir.glob("*.json"))),
                "paused": len(list(self._paths.paused_dir.glob("*.json"))),
                "archive": len(list(self._paths.archive_dir.glob("*.json"))),
            }

    @property
    def paths(self) -> EicOrchestrationPaths:
        return self._paths
