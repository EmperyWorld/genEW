"""Health endpoint tests."""

from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.registry import GlobalServiceRegistry, ServiceManifest
from services.empery_control_center_api.src.api.main import register
from services.empery_control_center_api.src.integration.service_health_prober import (
    map_remote_status,
)
from services.empery_control_center_api.tests.conftest import (
    build_test_app,
    make_config,
)


def _noop_factory(_c) -> FastAPI:  # noqa: ANN001
    return FastAPI()



def test_health_ok(tmp_path: Path) -> None:
    app, _bus = build_test_app(tmp_path)
    with TestClient(app) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ok"
        assert payload["service"] == "empery_control_center_api"
        assert payload["jobs_root_exists"] is True
        assert payload["audit_file_exists"] is False
        assert "ecc.job.created" in payload["subscribed_topics"]
        assert payload["ws_clients"] == 0
        assert payload["event_bus_backend"] == "memory"
        assert payload["event_bus_ok"] is True
        assert payload["redis_configured"] is False
        assert payload["auth_required"] is False
        assert payload.get("llm_ready") is None


def test_health_fabric_redis_backend(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EVENT_BUS_REDIS_URL", "redis://redis:6379/0")
    from core.event_bus import RedisEventBus

    class _StubRedisEventBus(RedisEventBus):
        """RedisEventBus identity without network on lifespan start."""

        def __init__(self) -> None:
            super().__init__("redis://redis:6379/0")

        async def start(self) -> None:
            return

        async def stop(self) -> None:
            return

    bus = _StubRedisEventBus()
    app, _bus = build_test_app(tmp_path, event_bus=bus)
    with TestClient(app) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["event_bus_backend"] == "redis"
        assert payload["event_bus_ok"] is True
        assert payload["redis_configured"] is True


def test_health_fabric_memory_not_ok_without_flag(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("EVENT_BUS_ALLOW_IN_MEMORY", raising=False)
    app, _bus = build_test_app(tmp_path)
    with TestClient(app) as client:
        response = client.get("/api/v1/health")
        payload = response.json()
        assert payload["event_bus_backend"] == "memory"
        assert payload["event_bus_ok"] is False
        assert payload["status"] == "degraded"


def test_health_lists_features_via_manifest(tmp_path: Path) -> None:
    app, _bus = build_test_app(tmp_path)
    with TestClient(app) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json()["version"] == "0.1.0"


def test_health_services_empty_registry(tmp_path: Path) -> None:
    """Explicit empty registry_snapshot → empty batch (no auto-discovery)."""
    from core.container import ServiceContainer
    from services.empery_control_center_api.src.api.main import create_app
    from services.empery_control_center_api.src.integration.registry_adapter import (
        RegistrySnapshotAdapter,
    )
    from services.empery_control_center_api.tests.conftest import RecordingEventBus

    class _Empty:
        def list_services(self) -> list[str]:
            return []

        def get_manifest(self, name: str):  # noqa: ANN001
            raise KeyError(name)

    container = ServiceContainer()
    bus = RecordingEventBus()
    container.register("event_bus", lambda _c: bus)
    container.register(
        "registry_snapshot",
        lambda _c: RegistrySnapshotAdapter(_Empty()),
    )
    app = create_app(container=container, config=make_config(tmp_path))
    with TestClient(app) as client:
        response = client.get("/api/v1/health/services")
        assert response.status_code == 200
        body = response.json()
        assert body["services"] == []
        assert body["ok_count"] == 0
        assert body["degraded_count"] == 0
        assert body["alert"] is False


def test_health_services_standalone_discovers_registry(tmp_path: Path) -> None:
    """uvicorn factory path auto-binds register_all_services()."""
    app, _bus = build_test_app(tmp_path)
    with TestClient(app) as client:
        response = client.get("/api/v1/health/services")
        assert response.status_code == 200
        names = {s["name"] for s in response.json()["services"]}
        assert "empery_control_center_api" in names
        assert names  # peers discovered from Global Service Registry
        self_item = next(
            s for s in response.json()["services"] if s["name"] == "empery_control_center_api"
        )
        assert self_item["health"] == "ok"


def test_health_services_local_and_unknown_and_probed(tmp_path: Path) -> None:
    registry = GlobalServiceRegistry()
    register(registry)
    registry.register(
        ServiceManifest(
            name="peer_ok_service",
            version="1.0.0",
            features=[],
            entry_point="services.peer_ok_service.src.api.main:create_app",
            dependencies=[],
        ),
        _noop_factory,
    )
    registry.register(
        ServiceManifest(
            name="peer_unmapped_service",
            version="1.0.0",
            features=[],
            entry_point="services.peer_unmapped_service.src.api.main:create_app",
            dependencies=[],
        ),
        _noop_factory,
    )
    cfg = make_config(
        tmp_path,
        service_health_bases={
            "peer_ok_service": "http://peer.example:9000",
        },
        health_probe_timeout_ms=500,
    )
    app, _bus = build_test_app(tmp_path, registry=registry, config=cfg)

    async def fake_get(self, url, **kwargs):  # noqa: ANN001, ANN003
        assert url == "http://peer.example:9000/api/v1/health"
        return httpx.Response(200, json={"status": "ok"})

    with patch.object(httpx.AsyncClient, "get", new=fake_get):
        with TestClient(app) as client:
            response = client.get("/api/v1/health/services")
            assert response.status_code == 200
            payload = response.json()
            by_name = {s["name"]: s for s in payload["services"]}
            assert by_name["empery_control_center_api"]["health"] == "ok"
            assert by_name["peer_ok_service"]["health"] == "ok"
            assert by_name["peer_unmapped_service"]["health"] == "unknown"
            assert by_name["peer_ok_service"]["checked_at"]
            assert payload["ok_count"] >= 2
            assert payload["unknown_count"] >= 1
            assert payload["alert"] is False


@pytest.mark.parametrize(
    ("payload", "status", "expected"),
    [
        ({"status": "ok"}, 200, "ok"),
        ({"status": "healthy"}, 200, "ok"),
        ({"status": "degraded"}, 200, "degraded"),
        ({"status": "down"}, 200, "down"),
        ({}, 200, "ok"),
        (None, 503, "down"),
        (None, 404, "degraded"),
    ],
)
def test_map_remote_status(payload, status, expected) -> None:  # noqa: ANN001
    assert map_remote_status(payload, status) == expected


def test_health_services_cache_coalesces_probes(tmp_path: Path) -> None:
    """Concurrent /health/services share one fan-out within TTL."""
    registry = GlobalServiceRegistry()
    register(registry)
    registry.register(
        ServiceManifest(
            name="peer_ok_service",
            version="1.0.0",
            features=[],
            entry_point="services.peer_ok_service.src.api.main:create_app",
            dependencies=[],
        ),
        _noop_factory,
    )
    cfg = make_config(
        tmp_path,
        service_health_bases={"peer_ok_service": "http://peer.example:9000"},
        health_probe_timeout_ms=500,
        health_services_cache_ttl_ms=5000,
    )
    app, _bus = build_test_app(tmp_path, registry=registry, config=cfg)
    calls = {"n": 0}

    async def counting_get(self, url, **kwargs):  # noqa: ANN001, ANN003
        calls["n"] += 1
        return httpx.Response(200, json={"status": "ok"})

    with patch.object(httpx.AsyncClient, "get", new=counting_get):
        with TestClient(app) as client:
            first = client.get("/api/v1/health/services")
            second = client.get("/api/v1/health/services")
            assert first.status_code == 200
            assert second.status_code == 200
            assert calls["n"] == 1


def test_health_services_probe_timeout_is_degraded(tmp_path: Path) -> None:
    registry = GlobalServiceRegistry()
    register(registry)
    registry.register(
        ServiceManifest(
            name="slow_peer",
            version="1.0.0",
            features=[],
            entry_point="services.slow_peer.src.api.main:create_app",
            dependencies=[],
        ),
        _noop_factory,
    )
    cfg = make_config(
        tmp_path,
        service_health_bases={"slow_peer": "http://slow.example:9001"},
    )
    app, _bus = build_test_app(tmp_path, registry=registry, config=cfg)

    async def timeout_get(self, url, **kwargs):  # noqa: ANN001, ANN003
        raise httpx.TimeoutException("timeout")

    with patch.object(httpx.AsyncClient, "get", new=timeout_get):
        with TestClient(app) as client:
            response = client.get("/api/v1/health/services")
            assert response.status_code == 200
            by_name = {s["name"]: s["health"] for s in response.json()["services"]}
            assert by_name["slow_peer"] == "degraded"
