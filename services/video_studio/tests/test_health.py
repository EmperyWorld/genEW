"""video_studio health + generate with mocked Comfy client."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from core.registry import register_all_services
from services.video_studio.config import (
    ServiceConfig,
    clear_config_cache,
    default_workflow_path,
)
from services.video_studio.src.api.main import create_app
from services.video_studio.src.integration.comfy_client import ComfyClient


class _FakeComfy(ComfyClient):
    def __init__(self) -> None:
        super().__init__("http://comfy.test")
        self._history: dict[str, Any] = {}
        self.last_workflow: dict[str, Any] | None = None

    async def system_stats(self) -> dict[str, Any]:
        return {"devices": [{"name": "fake-gpu"}]}

    async def upload_image(self, image_bytes: bytes, filename: str) -> str:
        assert image_bytes
        return filename

    async def queue_prompt(self, workflow: dict[str, Any]) -> str:
        assert "97" in workflow
        assert workflow["97"]["inputs"]["image"]
        self.last_workflow = workflow
        self._history["pid-v1"] = {
            "status": {"completed": True},
            "outputs": {
                "108": {
                    "gifs": [
                        {
                            "filename": "Wan2.2_i2v_x_00001_.mp4",
                            "subfolder": "video",
                            "type": "output",
                        }
                    ]
                }
            },
        }
        return "pid-v1"

    async def history(self, prompt_id: str) -> dict[str, Any] | None:
        return self._history.get(prompt_id)

    async def view_file(
        self,
        *,
        filename: str,
        subfolder: str = "",
        folder_type: str = "output",
    ) -> bytes:
        return b"\x00\x00\x00\x18ftypmp42fake"


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    clear_config_cache()
    wf = tmp_path / "image_to_video.json"
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
        yield c, fake
    clear_config_cache()


def test_health_and_generate(client: tuple[TestClient, _FakeComfy]) -> None:
    c, fake = client
    h = c.get("/api/v1/health")
    assert h.status_code == 200
    body = h.json()
    assert body["service"] == "video_studio"
    assert body["comfy"]["reachable"] is True

    g = c.post(
        "/api/v1/generate",
        data={"prompt": "camera slowly orbits the subject"},
        files={"image": ("seed.png", b"\x89PNG\r\n\x1a\nfake", "image/png")},
    )
    assert g.status_code == 200
    prompt_id = g.json()["prompt_id"]
    assert prompt_id == "pid-v1"
    assert fake.last_workflow is not None
    assert "camera slowly" in fake.last_workflow["129:93"]["inputs"]["text"]

    job = c.get(f"/api/v1/jobs/{prompt_id}")
    assert job.status_code == 200
    assert job.json()["status"] == "completed"
    assert job.json()["videos"][0]["filename"].endswith(".mp4")

    vid = c.get(
        "/api/v1/videos",
        params={"filename": "Wan2.2_i2v_x_00001_.mp4", "subfolder": "video"},
    )
    assert vid.status_code == 200
    assert vid.content.startswith(b"\x00\x00\x00\x18ftyp")


def test_registered_in_global_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    registry = register_all_services()
    assert "video_studio" in registry.list_services()
