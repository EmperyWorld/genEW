"""Health history ring buffer tests."""

from datetime import datetime, timezone

from services.empery_control_center_api.src.data.schemas import ServiceHealthItem
from services.empery_control_center_api.src.integration.health_history import (
    HealthHistoryBuffer,
)


def _item(name: str, health: str) -> ServiceHealthItem:
    return ServiceHealthItem(
        name=name,
        health=health,  # type: ignore[arg-type]
        checked_at=datetime.now(timezone.utc),
    )


def test_health_history_records_samples_and_changes() -> None:
    buf = HealthHistoryBuffer(max_samples=5, max_changes=10)
    t1 = datetime(2026, 7, 22, 12, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 7, 22, 12, 1, tzinfo=timezone.utc)

    buf.record(
        [_item("svc_a", "ok"), _item("svc_b", "ok")],
        checked_at=t1,
        ok_count=2,
        degraded_count=0,
        down_count=0,
        unknown_count=0,
        alert=False,
    )
    buf.record(
        [_item("svc_a", "ok"), _item("svc_b", "down")],
        checked_at=t2,
        ok_count=1,
        degraded_count=0,
        down_count=1,
        unknown_count=0,
        alert=True,
    )

    assert len(buf.history()) == 2
    assert buf.history()[0].ok_count == 2
    assert buf.history()[1].alert is True

    changes = buf.recent_changes()
    assert len(changes) == 1
    assert changes[0].service_name == "svc_b"
    assert changes[0].from_health == "ok"
    assert changes[0].to_health == "down"
