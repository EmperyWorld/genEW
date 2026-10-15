from fastapi.testclient import TestClient

from core.registry import register_all_services
from services.desktop_shell.config import ServiceConfig, clear_config_cache
from services.desktop_shell.src.api.main import create_app


def _app():
    clear_config_cache()
    cfg = ServiceConfig(
        database_url="sqlite+pysqlite:///:memory:",
        auto_create_tables=True,
    )
    return create_app(config=cfg)


def test_health_and_bootstrap(monkeypatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    with TestClient(_app()) as client:
        h = client.get("/api/v1/health")
        assert h.status_code == 200
        assert h.json()["status"] == "ok"
        b = client.get("/api/v1/shell-bootstrap")
        assert b.status_code == 200
        body = b.json()
        assert body["schema_version"] == 1
        assert "control_center" in body["installed"]["app_ids"]
        assert len(body["items"]) >= 1
        assert len(body["catalog"]) >= 2


def test_catalog_register(monkeypatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    with TestClient(_app()) as client:
        res = client.post(
            "/api/v1/catalog/apps",
            json={
                "app_id": "notes_lite",
                "title": "Notes",
                "app_component": "notes_lite",
                "category": "apps",
                "description": "Assembled from recipe",
            },
        )
        assert res.status_code == 200
        assert res.json()["app_id"] == "notes_lite"
        apps = client.get("/api/v1/catalog/apps").json()
        assert any(a["app_id"] == "notes_lite" for a in apps)
        boot = client.get("/api/v1/shell-bootstrap").json()
        assert "notes_lite" in boot["installed"]["app_ids"]
        assert any(i.get("app_component") == "notes_lite" for i in boot["items"])


def test_registered_in_global_registry(monkeypatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    registry = register_all_services()
    assert "desktop_shell" in registry.list_services()


def test_cors_allows_desktop_origin(monkeypatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    for origin in (
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://192.168.1.136:5175",
    ):
        clear_config_cache()
        cfg = ServiceConfig(
            database_url="sqlite+pysqlite:///:memory:",
            auto_create_tables=True,
        )
        with TestClient(create_app(config=cfg)) as client:
            res = client.options(
                "/api/v1/shell-bootstrap",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "GET",
                },
            )
            assert res.status_code == 200
            assert res.headers.get("access-control-allow-origin") == origin
            get = client.get(
                "/api/v1/shell-bootstrap",
                headers={"Origin": origin},
            )
            assert get.status_code == 200
            assert get.headers.get("access-control-allow-origin") == origin
