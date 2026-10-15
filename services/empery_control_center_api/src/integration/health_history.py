"""In-memory ring buffer for service health probe history."""

from __future__ import annotations

from collections import deque
from datetime import datetime

from services.empery_control_center_api.src.data.schemas import (
    HealthHistorySample,
    HealthStatusChange,
    ServiceHealthItem,
)

HealthLiteral = str


class HealthHistoryBuffer:
    """Retain recent aggregate snapshots and per-service status transitions."""

    def __init__(
        self,
        *,
        max_samples: int = 48,
        max_changes: int = 64,
    ) -> None:
        self._samples: deque[HealthHistorySample] = deque(maxlen=max_samples)
        self._changes: deque[HealthStatusChange] = deque(maxlen=max_changes)
        self._last_by_service: dict[str, HealthLiteral] = {}

    def record(
        self,
        items: list[ServiceHealthItem],
        *,
        checked_at: datetime,
        ok_count: int,
        degraded_count: int,
        down_count: int,
        unknown_count: int,
        alert: bool,
    ) -> None:
        sample = HealthHistorySample(
            checked_at=checked_at,
            ok_count=ok_count,
            degraded_count=degraded_count,
            down_count=down_count,
            unknown_count=unknown_count,
            alert=alert,
        )
        self._samples.append(sample)

        for item in items:
            prev = self._last_by_service.get(item.name)
            current = item.health
            self._last_by_service[item.name] = current
            if prev is None or prev == current:
                continue
            if prev == "ok" and current == "ok":
                continue
            self._changes.append(
                HealthStatusChange(
                    service_name=item.name,
                    from_health=prev,  # type: ignore[arg-type]
                    to_health=current,  # type: ignore[arg-type]
                    changed_at=checked_at,
                )
            )

    def history(self) -> list[HealthHistorySample]:
        return list(self._samples)

    def recent_changes(self) -> list[HealthStatusChange]:
        return list(reversed(self._changes))
