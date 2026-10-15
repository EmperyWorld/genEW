"""Domain contracts for asm_prod_acc_20261006110325."""

from __future__ import annotations

from typing import Protocol

from services.asm_prod_acc_20261006110325.src.data.schemas import MetricCreate, MetricView


class MetricRepositoryPort(Protocol):
    async def create(self, payload: MetricCreate) -> MetricView: ...

    async def list_items(self, *, limit: int = 50) -> list[MetricView]: ...
