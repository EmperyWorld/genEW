"""Registry registration and provider resolution."""

from __future__ import annotations

from fastapi.testclient import TestClient

from core.registry import GlobalServiceRegistry, register_all_services
from services.empery_intelligence_core.config import clear_config_cache
from services.empery_intelligence_core.src.api.main import register


def test_register_resolves_nervas_and_engine() -> None:
    clear_config_cache()
    registry = GlobalServiceRegistry()
    register(registry)
    assert "empery_intelligence_core" in registry.list_services()
    assert registry.container.has("nervas_provider")
    assert registry.container.has("headless_engine")
    assert registry.container.resolve("nervas_provider") is not None
    assert registry.container.resolve("headless_engine") is not None


def test_register_all_services_includes_eic_before_ecc() -> None:
    registry = register_all_services()
    names = registry.list_services()
    assert "empery_intelligence_core" in names
    assert "empery_control_center_api" in names


def test_create_app_health(app) -> None:
    with TestClient(app) as client:
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        body = r.json()
        assert body["service"] == "empery_intelligence_core"
        assert body["nervas"]["backend"] == "fake"
        assert body["nervas"]["ready"] is True
