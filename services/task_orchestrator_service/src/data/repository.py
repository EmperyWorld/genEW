"""Task data repository backed by DatabaseManager / SQLAlchemy."""

from __future__ import annotations

import logging
from datetime import timezone
from uuid import UUID

from sqlalchemy import select

from core.data.database import DatabaseManager
from core.logging import log_event
from services.task_orchestrator_service.src.core.models import (
    Task,
    TaskPriority,
    TaskStatus,
)
from services.task_orchestrator_service.src.data.orm import TaskRow


class TaskRepository:
    """Postgres/SQLite-backed data-access boundary for Kanban tasks."""

    def __init__(self, database: DatabaseManager, logger: logging.Logger) -> None:
        self._db = database
        self._logger = logger

    def _to_task(self, row: TaskRow) -> Task:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        updated = row.updated_at
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        return Task(
            id=row.id,  # type: ignore[arg-type]
            title=row.title,
            description=row.description,
            status=TaskStatus(row.status),
            priority=TaskPriority(row.priority),
            assignee_id=row.assignee_id,  # type: ignore[arg-type]
            created_by=row.created_by,  # type: ignore[arg-type]
            updated_by=row.updated_by,  # type: ignore[arg-type]
            created_at=created,
            updated_at=updated,
        )

    async def create_task(self, task: Task) -> Task:
        with self._db.session_scope() as session:
            row = TaskRow(
                id=task.id,
                title=task.title,
                description=task.description,
                status=task.status.value,
                priority=task.priority.value,
                assignee_id=task.assignee_id,
                created_by=task.created_by,
                updated_by=task.updated_by,
                created_at=task.created_at,
                updated_at=task.updated_at,
            )
            session.add(row)
            session.flush()
            saved = self._to_task(row)
        log_event(
            self._logger,
            event="task.repo.created",
            message="Task persisted",
            task_id=str(saved.id),
        )
        return saved

    async def get_task(self, task_id: UUID) -> Task | None:
        with self._db.session_scope() as session:
            row = session.get(TaskRow, task_id)
            if row is None:
                return None
            return self._to_task(row)

    async def list_tasks(
        self,
        *,
        limit: int,
        status: TaskStatus | None,
        assignee_id: UUID | None,
    ) -> list[Task]:
        with self._db.session_scope() as session:
            stmt = select(TaskRow).order_by(TaskRow.updated_at.desc()).limit(limit)
            if status is not None:
                stmt = stmt.where(TaskRow.status == status.value)
            if assignee_id is not None:
                stmt = stmt.where(TaskRow.assignee_id == assignee_id)
            rows = session.scalars(stmt).all()
            return [self._to_task(row) for row in rows]

    async def update_task(self, task: Task) -> Task:
        with self._db.session_scope() as session:
            row = session.get(TaskRow, task.id)
            if row is None:
                raise KeyError(f"Task '{task.id}' not found")
            row.title = task.title
            row.description = task.description
            row.status = task.status.value
            row.priority = task.priority.value
            row.assignee_id = task.assignee_id
            row.created_by = task.created_by
            row.updated_by = task.updated_by
            row.updated_at = task.updated_at
            session.flush()
            saved = self._to_task(row)
        log_event(
            self._logger,
            event="task.repo.updated",
            message="Task updated",
            task_id=str(saved.id),
        )
        return saved
