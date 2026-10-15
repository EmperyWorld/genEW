"""Pydantic contracts for ECC → asm_prod_acc_20261006110325 metrics BFF."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class EccMetricView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    label: str
    value: str
    unit: str | None = None
    updated_at: datetime | None = None


class EccMetricListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    metrics: list[EccMetricView]
    count: int
