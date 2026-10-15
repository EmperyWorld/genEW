"""Repository-level tests against sqlite DatabaseManager."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from uuid import uuid4

from core.data.database import DatabaseManager
from services.task_orchestrator_service.src.core.models import (
    Task,
    TaskPriority,
    TaskStatus,
)
from services.task_orchestrator_service.src.data.orm import Base
from services.task_orchestrator_service.src.data.repository import TaskRepository


def _repository() -> TaskRepository:
    db = DatabaseManager.from_url("sqlite+pysqlite:///:memory:")
    db.create_all(Base.metadata)
    logger = logging.getLogger("test_task_db")
    return TaskRepository(db, logger)


def _task(
    *,
    title: str = "Task",
    status: TaskStatus = TaskStatus.BACKLOG,
    assignee_id=None,
) -> Task:
    now = datetime.now(timezone.utc)
    user = uuid4()
    return Task(
        id=uuid4(),
        title=title,
        description="d",
        status=status,
        priority=TaskPriority.MEDIUM,
        assignee_id=assignee_id,
        created_by=user,
        updated_by=user,
        created_at=now,
        updated_at=now,
    )


def test_create_get_list_update() -> None:
    repository = _repository()

    async def _run() -> None:
        assignee = uuid4()
        first = await repository.create_task(
            _task(title="One", status=TaskStatus.TODO, assignee_id=assignee)
        )
        second = await repository.create_task(_task(title="Two", status=TaskStatus.DONE))

        fetched = await repository.get_task(first.id)
        assert fetched is not None
        assert fetched.title == "One"
        assert fetched.assignee_id == assignee

        all_tasks = await repository.list_tasks(
            limit=50, status=None, assignee_id=None
        )
        assert {t.id for t in all_tasks} == {first.id, second.id}

        todo_only = await repository.list_tasks(
            limit=50, status=TaskStatus.TODO, assignee_id=None
        )
        assert len(todo_only) == 1
        assert todo_only[0].id == first.id

        by_assignee = await repository.list_tasks(
            limit=50, status=None, assignee_id=assignee
        )
        assert len(by_assignee) == 1
        assert by_assignee[0].id == first.id

        now = datetime.now(timezone.utc)
        updated = Task(
            id=first.id,
            title="One edited",
            description=first.description,
            status=TaskStatus.IN_PROGRESS,
            priority=TaskPriority.HIGH,
            assignee_id=first.assignee_id,
            created_by=first.created_by,
            updated_by=first.created_by,
            created_at=first.created_at,
            updated_at=now,
        )
        saved = await repository.update_task(updated)
        assert saved.title == "One edited"
        assert saved.status == TaskStatus.IN_PROGRESS
        assert saved.priority == TaskPriority.HIGH

    asyncio.run(_run())
