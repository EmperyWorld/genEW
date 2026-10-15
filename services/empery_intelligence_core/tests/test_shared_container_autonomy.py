"""Life Test 1 (production path): shared registry container ECC↔EIC autonomy."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core.event_bus import EventBus
from core.registry import GlobalServiceRegistry
from services.empery_control_center_api.config import (
    ServiceConfig as EccConfig,
)
from services.empery_control_center_api.src.api.main import (
    create_app as create_ecc_app,
)
from services.empery_intelligence_core.config import (
    ServiceConfig as EicConfig,
)
from services.empery_intelligence_core.config import clear_config_cache
from services.empery_intelligence_core.src.api.main import (
    _wire_dependencies,
    create_app as create_eic_app,
    load_manifest,
)
from services.empery_intelligence_core.tests.conftest import _inject_test_nervas_fake


@pytest.fixture(autouse=True)
def _clear_caches() -> Iterator[None]:
    clear_config_cache()
    yield
    clear_config_cache()


def test_shared_container_ecc_autonomous_enqueue(tmp_path: Path) -> None:
    """EIC wires first; ECC create_app must not break eic_config / enqueue."""
    repo = Path(__file__).resolve().parents[3]
    orch = tmp_path / "orchestration"
    orch.mkdir(parents=True)

    registry = GlobalServiceRegistry()
    bus = EventBus()
    registry.container.register("event_bus", lambda _c: bus)
    _inject_test_nervas_fake(registry.container)

    eic_cfg = EicConfig(
        orchestration_root=str(orch),
        workspace_root=str(repo),
        agents_root=str(repo / ".cursor" / "agents"),
        skills_root=str(repo / ".cursor" / "skills"),
        worker_enabled=False,
        autonomous_enabled=True,
        use_fake_nervas=False,
        provider_id="fake",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'mem.db'}",
        provider_config_path=str(tmp_path / "nervas.json"),
        provider_runtime_path=str(tmp_path / "provider_runtime.json"),
    )
    _wire_dependencies(registry.container, eic_cfg)
    registry.register(load_manifest(), create_eic_app)

    assert registry.container.resolve("eic_config").autonomous_enabled is True

    ecc_cfg = EccConfig(
        orchestration_root=str(orch),
        port=8006,
        autonomous_gateway_enabled=True,
        require_auth=False,
    )
    # Production path: ECC app factory on the *same* shared container.
    ecc_app = create_ecc_app(container=registry.container, config=ecc_cfg)

    assert registry.container.resolve("eic_config").autonomous_enabled is True
    # ECC owns shared "config" now.
    assert registry.container.resolve("config").service_name == "empery_control_center_api"
    # Wave 2 DI golden rules: ecc_config alias + eic_config never overwritten.
    assert registry.container.resolve("ecc_config").service_name == "empery_control_center_api"
    assert registry.container.has("eic_config")
    assert registry.container.resolve("eic_config").autonomous_enabled is True
    assert registry.container.resolve("eic_config").service_name == "empery_intelligence_core"

    with TestClient(ecc_app) as client:
        mode = client.get("/api/v1/autonomous/mode")
        assert mode.status_code == 200, mode.text
        assert mode.json()["enabled"] is True

        created = client.post(
            "/api/v1/autonomous/intentions",
            json={
                "intention": "Plan a tiny demo module via shared container",
                "service_name": "demo_shared",
                "features": ["plan"],
            },
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["job"]["status"] in {"queued", "running", "paused"}
        job_id = body["job"]["id"]

        listed = client.get("/api/v1/autonomous/jobs")
        assert listed.status_code == 200
        ids = {j["id"] for j in listed.json()["jobs"]}
        assert job_id in ids
