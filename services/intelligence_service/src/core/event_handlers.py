"""Event Bus handlers for task lifecycle topics (thin wrappers)."""

from __future__ import annotations

from core.event_bus import Event
from services.intelligence_service.src.core.use_cases import IntelligenceUseCases


async def on_task_created(use_cases: IntelligenceUseCases, event: Event) -> None:
    """Delegate task.created handling to use cases."""
    await use_cases.handle_task_created(event)


async def on_task_updated(use_cases: IntelligenceUseCases, event: Event) -> None:
    """Delegate task.updated handling to use cases."""
    await use_cases.handle_task_updated(event)
