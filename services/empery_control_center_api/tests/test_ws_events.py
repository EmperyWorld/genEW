"""WebSocket EventStreamer: EventBus publish → WS frame."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from core.event_bus import Event
from services.empery_control_center_api.tests.conftest import (
    RecordingEventBus,
    build_test_app,
)


def test_ws_hello_and_receives_eventbus_publish(tmp_path: Path) -> None:
    bus = RecordingEventBus()
    app, _ = build_test_app(tmp_path, event_bus=bus)
    with TestClient(app) as client:
        with client.websocket_connect("/api/v1/ws/events") as ws:
            hello = ws.receive_json()
            assert hello["type"] == "hello"
            assert hello["payload"]["service"] == "empery_control_center_api"
            assert "ecc.job.created" in hello["payload"]["subscribed_topics"]
            assert "task.created" in hello["payload"]["subscribed_topics"]

            assert client.portal is not None
            client.portal.call(
                bus.publish,
                Event(
                    name="task.created",
                    payload={"task_id": "abc", "title": "demo"},
                ),
            )
            msg = ws.receive_json()
            assert msg["type"] == "event"
            assert msg["event_name"] == "task.created"
            assert msg["payload"]["task_id"] == "abc"


def test_ws_receives_job_created_from_command(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        with client.websocket_connect("/api/v1/ws/events") as ws:
            _ = ws.receive_json()  # hello
            r = client.post(
                "/api/v1/commands/plan",
                json={
                    "intent": "Plan via WS test",
                    "service_name": "ws_demo_service",
                },
            )
            assert r.status_code == 201
            msg = ws.receive_json()
            assert msg["type"] == "event"
            assert msg["event_name"] == "ecc.job.created"
            assert msg["payload"]["service_name"] == "ws_demo_service"


def test_ws_registry_refresh_notification(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        with client.websocket_connect("/api/v1/ws/events") as ws:
            assert ws.receive_json()["type"] == "hello"
            r = client.post("/api/v1/registry/refresh")
            assert r.status_code == 200, r.text
            msg = ws.receive_json()
            assert msg["type"] == "registry"
            assert msg["event_name"] == "ecc.registry.refreshed"
            assert "count" in msg["payload"]
            assert "service_names" in msg["payload"]


def test_ws_topic_filter(tmp_path: Path) -> None:
    bus = RecordingEventBus()
    app, _ = build_test_app(tmp_path, event_bus=bus)
    with TestClient(app) as client:
        with client.websocket_connect(
            "/api/v1/ws/events?topics=ecc.registry.refreshed"
        ) as ws:
            assert ws.receive_json()["type"] == "hello"
            assert client.portal is not None
            client.portal.call(
                bus.publish,
                Event(name="task.created", payload={"task_id": "x"}),
            )
            client.portal.call(
                bus.publish,
                Event(
                    name="ecc.registry.refreshed",
                    payload={"service_names": [], "count": 0},
                ),
            )
            msg = ws.receive_json()
            assert msg["type"] == "registry"
            assert msg["event_name"] == "ecc.registry.refreshed"


def test_ws_ping(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        with client.websocket_connect("/api/v1/ws/events") as ws:
            _ = ws.receive_json()
            ws.send_json({"type": "ping", "topics": []})
            msg = ws.receive_json()
            assert msg["type"] == "heartbeat"
            assert msg["payload"]["pong"] is True


def test_ws_disconnect_cleans_hub(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        with client.websocket_connect("/api/v1/ws/events") as ws:
            assert ws.receive_json()["type"] == "hello"
            hub = app.state.container.resolve("ws_hub")
            assert hub.client_count() == 1
        assert app.state.container.resolve("ws_hub").client_count() == 0
