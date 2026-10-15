"""Search facade port for ECC / autonomous consumers."""

from __future__ import annotations

from typing import Any

from services.empery_intelligence_core.src.core.memory.models import AtomKind
from services.empery_intelligence_core.src.core.memory.use_cases import MemoryUseCases
from services.empery_intelligence_core.src.data.memory.schemas import RetrieveRequest


class MemorySearchFacade:
    """Thin facade over MemoryUseCases.retrieve for in-process DI consumers."""

    def __init__(self, memory_use_cases: MemoryUseCases) -> None:
        self._memory = memory_use_cases

    async def search(
        self,
        query: str,
        *,
        kinds: list[AtomKind] | None = None,
        service_name: str | None = None,
        tags: list[str] | None = None,
        limit: int = 8,
        mode: str = "hybrid",
    ) -> dict[str, Any]:
        response = await self._memory.retrieve(
            RetrieveRequest(
                query=query,
                kinds=kinds,
                service_name=service_name,
                tags=tags,
                limit=limit,
                mode=mode,  # type: ignore[arg-type]
            )
        )
        return response.model_dump(mode="json")
