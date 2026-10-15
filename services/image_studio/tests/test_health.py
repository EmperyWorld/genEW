"""image_studio health + generate with mocked Comfy client."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from core.registry import register_all_services
from services.image_studio.config import (
    ServiceConfig,
    clear_config_cache,
    default_workflow_path,
)
from services.image_studio.src.api.main import create_app
from services.image_studio.src.integration.comfy_client import ComfyClient


class _FakeComfy(ComfyClient):
    def __init__(self) -> None:
        super().__init__("http://comfy.test")
        self._history: dict[str, Any] = {}

    async def system_stats(self) -> dict[str, Any]:
        return {"devices": [{"name": "fake-gpu"}]}

    async def queue_prompt(self, workflow: dict[str, Any]) -> str:
        assert "83:27" in workflow
        self._history["pid-1"] = {
            "status": {"completed": True},
            "outputs": {
                "60": {
                    "images": [
                        {
                            "filename": "out.png",
                            "subfolder": "",
                            "type": "output",
                        }
                    ]
                }
            },
        }
        return "pid-1"

    async def history(self, prompt_id: str) -> dict[str, Any] | None:
        return self._history.get(prompt_id)

    async def view_image(
        self,
        *,
        filename: str,
        subfolder: str = "",
        folder_type: str = "output",
    ) -> bytes:
        return b"\x89PNG\r\n\x1a\nfake"


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    clear_config_cache()
    wf = tmp_path / "text_to_image.json"
    wf.write_text(default_workflow_path().read_text(encoding="utf-8"), encoding="utf-8")
    cfg = ServiceConfig(
        comfy_base_url="http://comfy.test",
        workflow_path=str(wf),
        cors_origins=["http://127.0.0.1:5174"],
    )
    app = create_app(config=cfg)
    fake = _FakeComfy()
    app.state.container.register("comfy_client", lambda _c: fake)
    with TestClient(app) as c:
        yield c
    clear_config_cache()


def test_health_and_generate(client: TestClient) -> None:
    h = client.get("/api/v1/health")
    assert h.status_code == 200
    body = h.json()
    assert body["service"] == "image_studio"
    assert body["comfy"]["reachable"] is True

    g = client.post(
        "/api/v1/generate",
        json={"prompt": "a red cube", "width": 512, "height": 512},
    )
    assert g.status_code == 200
    prompt_id = g.json()["prompt_id"]
    assert prompt_id == "pid-1"

    job = client.get(f"/api/v1/jobs/{prompt_id}")
    assert job.status_code == 200
    assert job.json()["status"] == "completed"
    assert job.json()["images"][0]["filename"] == "out.png"

    img = client.get("/api/v1/images", params={"filename": "out.png"})
    assert img.status_code == 200
    assert img.content.startswith(b"\x89PNG")


def test_registered_in_global_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    registry = register_all_services()
    assert "image_studio" in registry.list_services()
