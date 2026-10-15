"""Video Studio scaffold — ComfyUI Wan image-to-video peer (not studio_job /jobs queue)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def video_studio_file_map(
    action: Any,
    service_name: str,
    *,
    features: list[str],
    port: int,
    domain_hint: str,
) -> dict[str, str]:
    """Comfy peer: multipart POST /generate → poll /jobs → /videos. Desktop-first; ECC optional."""
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        manifest_ui_block,
    )

    env_prefix = service_name.upper()
    use_case_class = "".join(p.capitalize() for p in service_name.split("_")) + "UseCases"
    feat = [t for t in features if t != "reflex_scaffold"]
    for token in ("health", "image_to_video", "comfy_proxy", "desktop_ui"):
        if token not in feat:
            feat.append(token)
    manifest = {
        "name": service_name,
        "version": "0.1.0",
        "features": feat,
        "entry_point": "src/api/main.py",
        "dependencies": [],
        "publishes": [
            f"{service_name}.job.queued",
            f"{service_name}.job.completed",
        ],
        "subscribes": [],
        "ui": manifest_ui_block(
            service_name,
            required=False,
            skip_reason=(
                "Backend peer API only; ECC product UI deferred — "
                "Desktop/API health is the readiness surface."
            ),
        ),
    }
    return {
        "manifest.json": json.dumps(manifest, indent=2) + "\n",
        "config.py": _config_py(service_name, port, env_prefix),
        "src/core/models.py": _MODELS,
        "src/core/use_cases.py": _use_cases(service_name, use_case_class),
        "src/integration/comfy_client.py": _COMFY_CLIENT,
        "src/integration/workflow.py": _WORKFLOW,
        "src/integration/__init__.py": (
            '"""HTTP peer adapters — ComfyClient; never Fake* in src/."""\n'
        ),
        "src/api/routes.py": _routes(service_name, use_case_class),
        "src/api/main.py": _main(service_name, use_case_class),
        "workflows/image_to_video.json": _workflow_json(action),
        "tests/test_health.py": _test_health(service_name, use_case_class),
    }


def _workflow_json(action: Any) -> str:
    root = Path(getattr(action, "_root", Path.cwd()))
    src = root / "services" / "video_studio" / "workflows" / "image_to_video.json"
    if src.is_file():
        return src.read_text(encoding="utf-8")
    fallback = (
        Path(__file__).resolve().parents[3]
        / "video_studio"
        / "workflows"
        / "image_to_video.json"
    )
    if fallback.is_file():
        return fallback.read_text(encoding="utf-8")
    raise FileNotFoundError("image_to_video.json not found for video_studio scaffold")


def _config_py(service_name: str, port: int, env_prefix: str) -> str:
    return f'''"""Configuration for {service_name}."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _csv_env(key: str, default: str) -> list[str]:
    raw = os.environ.get(key, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


class ServiceConfig(BaseModel):
    service_name: str = Field(default="{service_name}")
    host: str = Field(default="0.0.0.0")
    port: int = Field(default={port})
    log_level: str = Field(default="INFO")
    comfy_base_url: str = Field(
        default="http://192.168.1.136:31003",
        description="ComfyUI HTTP base (COMFY_BASE_URL)",
    )
    workflow_path: str = Field(
        default="",
        description="Path to image_to_video.json; empty = package workflows/",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
        ],
    )
    comfy_timeout_seconds: float = Field(default=120.0)
    default_length: int = Field(default=81, ge=5, le=161)


def default_workflow_path() -> Path:
    return Path(__file__).resolve().parent / "workflows" / "image_to_video.json"


@lru_cache
def get_config() -> ServiceConfig:
    wf = _env("{env_prefix}_WORKFLOW_PATH", "").strip()
    return ServiceConfig(
        host=_env("{env_prefix}_HOST", "0.0.0.0"),
        port=int(_env("{env_prefix}_PORT", _env("PORT", "{port}"))),
        log_level=_env("LOG_LEVEL", "INFO"),
        comfy_base_url=_env(
            "COMFY_BASE_URL",
            "http://192.168.1.136:31003",
        )
        .strip()
        .rstrip("/"),
        workflow_path=wf or str(default_workflow_path()),
        cors_origins=_csv_env(
            "{env_prefix}_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174",
        ),
        comfy_timeout_seconds=float(_env("COMFY_TIMEOUT_SECONDS", "120")),
        default_length=int(_env("{env_prefix}_DEFAULT_LENGTH", "81")),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
'''


_MODELS = '''"""Domain models for video studio (Pydantic boundaries)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class GenerateResponse(BaseModel):
    prompt_id: str
    status: Literal["queued"] = "queued"
    run_id: str | None = None


class VideoRef(BaseModel):
    filename: str
    subfolder: str = ""
    type: str = "output"


class JobStatus(BaseModel):
    prompt_id: str
    status: Literal["queued", "running", "completed", "failed"]
    error: str | None = None
    videos: list[VideoRef] = Field(default_factory=list)
    raw_status: dict[str, Any] = Field(default_factory=dict)
'''


_COMFY_CLIENT = '''"""
Thin ComfyUI HTTP client — adapted from EliteEW comfyui_client_core / execution
(reference/eliteew/packs/studios/comfyui/). Empery-owned; no EliteEW imports.
"""

from __future__ import annotations

from typing import Any

import httpx


class ComfyClient:
    def __init__(self, base_url: str, *, timeout_seconds: float = 120.0) -> None:
        self.base_url = base_url.rstrip("/")
        self._timeout = httpx.Timeout(timeout_seconds, connect=15.0)

    async def system_stats(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.get(f"{self.base_url}/system_stats")
            res.raise_for_status()
            data = res.json()
            if isinstance(data, list):
                return data[0] if data else {}
            if isinstance(data, dict):
                return data
            return {}

    async def upload_image(self, image_bytes: bytes, filename: str) -> str:
        if not filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")):
            filename = f"{filename}.png"
        files = {"image": (filename, image_bytes, "application/octet-stream")}
        data = {"overwrite": "true"}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{self.base_url}/upload/image",
                files=files,
                data=data,
            )
            if res.status_code >= 400:
                raise RuntimeError(
                    f"ComfyUI upload failed: HTTP {res.status_code} — {res.text[:500]}"
                )
            out = res.json()
            name = str(out.get("name") or filename)
            subfolder = str(out.get("subfolder") or "").strip()
            return f"{subfolder}/{name}" if subfolder else name

    async def queue_prompt(self, workflow: dict[str, Any]) -> str:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{self.base_url}/prompt",
                json={"prompt": workflow},
            )
            if res.status_code >= 400:
                raise RuntimeError(
                    f"ComfyUI queue failed: HTTP {res.status_code} — {res.text[:500]}"
                )
            data = res.json()
            prompt_id = data.get("prompt_id")
            if not prompt_id:
                raise RuntimeError("ComfyUI returned no prompt_id")
            return str(prompt_id)

    async def history(self, prompt_id: str) -> dict[str, Any] | None:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.get(f"{self.base_url}/history/{prompt_id}")
            if res.status_code >= 400:
                return None
            data = res.json()
            if not isinstance(data, dict):
                return None
            entry = data.get(prompt_id)
            return entry if isinstance(entry, dict) else None

    async def view_file(
        self,
        *,
        filename: str,
        subfolder: str = "",
        folder_type: str = "output",
    ) -> bytes:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.get(
                f"{self.base_url}/view",
                params={
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": folder_type,
                },
            )
            res.raise_for_status()
            return res.content
'''


_WORKFLOW = '''"""Load and parameterize the Wan 2.2 image-to-video workflow."""

from __future__ import annotations

import copy
import json
import secrets
from pathlib import Path
from typing import Any
from uuid import uuid4


def load_workflow_template(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("workflow template must be a JSON object")
    return data


def build_image_to_video_workflow(
    template: dict[str, Any],
    *,
    image_filename: str,
    prompt: str,
    negative_prompt: str = "",
    seed: int | None = None,
    width: int | None = None,
    height: int | None = None,
    length: int | None = None,
    run_id: str | None = None,
) -> dict[str, Any]:
    """
    Inject image / prompts / seed into Wan I2V node IDs:
    LoadImage 97, positive CLIP 129:93, negative CLIP 129:89,
    WanImageToVideo 129:98, KSampler seed 129:86, SaveVideo 108.
    """
    workflow = copy.deepcopy(template)
    text = (prompt or "").strip()
    if not text:
        raise ValueError("prompt is required")
    image_name = (image_filename or "").strip()
    if not image_name:
        raise ValueError("image_filename is required")

    required = ("97", "129:93", "129:89", "129:98", "129:86", "108")
    missing = [node for node in required if node not in workflow]
    if missing:
        raise ValueError(f"workflow missing expected Wan I2V node ids: {missing}")

    resolved_seed = seed if seed is not None else secrets.randbelow(2**31 - 1) + 1
    resolved_run = run_id or uuid4().hex[:12]

    workflow["97"]["inputs"]["image"] = image_name
    workflow["129:93"]["inputs"]["text"] = text
    workflow["129:89"]["inputs"]["text"] = (negative_prompt or "").strip()
    workflow["129:86"]["inputs"]["noise_seed"] = resolved_seed
    if width is not None:
        workflow["129:98"]["inputs"]["width"] = width
    if height is not None:
        workflow["129:98"]["inputs"]["height"] = height
    if length is not None:
        workflow["129:98"]["inputs"]["length"] = length
    workflow["108"]["inputs"]["filename_prefix"] = f"video/Wan2.2_i2v_{resolved_run}"
    return workflow
'''


def _use_cases(service_name: str, use_case_class: str) -> str:
    return f'''"""Use cases for {service_name}."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from core.container import ServiceContainer
from services.{service_name}.src.core.models import (
    GenerateResponse,
    JobStatus,
    VideoRef,
)
from services.{service_name}.src.integration.comfy_client import ComfyClient
from services.{service_name}.src.integration.workflow import (
    build_image_to_video_workflow,
    load_workflow_template,
)


class {use_case_class}:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _config(self):
        return self._container.resolve("config")

    def _comfy(self) -> ComfyClient:
        return self._container.resolve("comfy_client")

    async def health(self) -> dict[str, Any]:
        cfg = self._config()
        comfy_ok = False
        comfy_detail: str | None = None
        try:
            stats = await self._comfy().system_stats()
            comfy_ok = True
            devices = stats.get("devices") if isinstance(stats, dict) else None
            if isinstance(devices, list) and devices:
                first = devices[0] if isinstance(devices[0], dict) else {{}}
                comfy_detail = str(first.get("name") or "ok")
            else:
                comfy_detail = "ok"
        except Exception as exc:  # noqa: BLE001
            comfy_detail = str(exc)[:200]
        return {{
            "status": "ok" if comfy_ok else "degraded",
            "service": cfg.service_name,
            "comfy": {{
                "base_url": cfg.comfy_base_url,
                "reachable": comfy_ok,
                "detail": comfy_detail,
            }},
            "workflow": "wan2.2_i2v",
        }}

    async def generate(
        self,
        *,
        prompt: str,
        image_bytes: bytes,
        image_filename: str,
        negative_prompt: str = "",
        seed: int | None = None,
        width: int | None = None,
        height: int | None = None,
        length: int | None = None,
    ) -> GenerateResponse:
        cfg = self._config()
        if not image_bytes:
            raise ValueError("image is required")
        uploaded = await self._comfy().upload_image(image_bytes, image_filename)
        run_id = uuid4().hex[:12]
        template = load_workflow_template(Path(cfg.workflow_path))
        workflow = build_image_to_video_workflow(
            template,
            image_filename=uploaded,
            prompt=prompt,
            negative_prompt=negative_prompt,
            seed=seed,
            width=width,
            height=height,
            length=length if length is not None else cfg.default_length,
            run_id=run_id,
        )
        prompt_id = await self._comfy().queue_prompt(workflow)
        return GenerateResponse(prompt_id=prompt_id, run_id=run_id)

    async def job_status(self, prompt_id: str) -> JobStatus:
        entry = await self._comfy().history(prompt_id)
        if entry is None:
            return JobStatus(prompt_id=prompt_id, status="queued")

        raw_status = entry.get("status")
        status_block: dict[str, Any] = raw_status if isinstance(raw_status, dict) else {{}}
        if status_block.get("exception"):
            return JobStatus(
                prompt_id=prompt_id,
                status="failed",
                error=str(status_block.get("exception")),
                raw_status=status_block,
            )

        videos = _extract_video_refs(entry)
        if videos or status_block.get("completed"):
            return JobStatus(
                prompt_id=prompt_id,
                status="completed",
                videos=videos,
                raw_status=status_block,
            )
        return JobStatus(
            prompt_id=prompt_id,
            status="running",
            raw_status=status_block,
        )

    async def view_video(
        self,
        *,
        filename: str,
        subfolder: str = "",
        folder_type: str = "output",
    ) -> bytes:
        return await self._comfy().view_file(
            filename=filename,
            subfolder=subfolder,
            folder_type=folder_type,
        )


def _extract_video_refs(execution: dict[str, Any]) -> list[VideoRef]:
    outputs = execution.get("outputs")
    if not isinstance(outputs, dict):
        return []
    refs: list[VideoRef] = []
    seen: set[tuple[str, str]] = set()
    for node_out in outputs.values():
        if not isinstance(node_out, dict):
            continue
        raw = (
            node_out.get("gifs")
            or node_out.get("videos")
            or ([node_out["video"]] if isinstance(node_out.get("video"), dict) else None)
            or node_out.get("images")
        )
        if not isinstance(raw, list):
            continue
        for item in raw:
            if not isinstance(item, dict):
                continue
            filename = item.get("filename")
            if not filename:
                continue
            subfolder = str(item.get("subfolder") or "")
            key = (str(filename), subfolder)
            if key in seen:
                continue
            seen.add(key)
            refs.append(
                VideoRef(
                    filename=str(filename),
                    subfolder=subfolder,
                    type=str(item.get("type") or "output"),
                )
            )
    return refs
'''


def _routes(service_name: str, use_case_class: str) -> str:
    return f'''"""HTTP routes for {service_name}."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response

from services.{service_name}.src.core.models import GenerateResponse, JobStatus
from services.{service_name}.src.core.use_cases import {use_case_class}

router = APIRouter()

_MAX_IMAGE_BYTES = 10 * 1024 * 1024


def _uc(request: Request) -> {use_case_class}:
    return request.app.state.container.resolve("service_use_cases")


@router.get("/health")
async def health(request: Request) -> dict:
    return await _uc(request).health()


@router.post("/generate", response_model=GenerateResponse)
async def generate(
    request: Request,
    prompt: str = Form(..., min_length=1, max_length=4000),
    image: UploadFile = File(...),
    negative_prompt: str = Form(default=""),
    seed: int | None = Form(default=None),
    width: int | None = Form(default=None),
    height: int | None = Form(default=None),
    length: int | None = Form(default=None),
) -> GenerateResponse:
    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="image is empty")
    if len(raw) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="image exceeds 10MB")
    filename = image.filename or "source.png"
    try:
        return await _uc(request).generate(
            prompt=prompt,
            image_bytes=raw,
            image_filename=filename,
            negative_prompt=negative_prompt,
            seed=seed,
            width=width,
            height=height,
            length=length,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/jobs/{{prompt_id}}", response_model=JobStatus)
async def job_status(request: Request, prompt_id: str) -> JobStatus:
    return await _uc(request).job_status(prompt_id)


@router.get("/videos")
async def get_video(
    request: Request,
    filename: str = Query(..., min_length=1),
    subfolder: str = Query(default=""),
    folder_type: str = Query(default="output", alias="type"),
) -> Response:
    try:
        data = await _uc(request).view_video(
            filename=filename,
            subfolder=subfolder,
            folder_type=folder_type,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    media = "video/mp4"
    lower = filename.lower()
    if lower.endswith(".webm"):
        media = "video/webm"
    elif lower.endswith(".webp"):
        media = "image/webp"
    elif lower.endswith(".gif"):
        media = "image/gif"
    return Response(content=data, media_type=media)
'''


def _main(service_name: str, use_case_class: str) -> str:
    return f'''"""FastAPI entry point and registry registration for {service_name}."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.cors import apply_lab_cors
from core.api.responses import register_standard_error_handlers
from core.container import ServiceContainer
from core.event_bus import (
    create_event_bus,
    ensure_event_bus_started,
    ensure_event_bus_stopped,
)
from core.logging import configure_logging, log_event
from core.registry import GlobalServiceRegistry, ServiceManifest
from services.{service_name}.config import ServiceConfig, get_config
from services.{service_name}.src.api.routes import router
from services.{service_name}.src.core.use_cases import {use_case_class}
from services.{service_name}.src.integration.comfy_client import ComfyClient


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def _wire_dependencies(container: ServiceContainer, config: ServiceConfig) -> None:
    logger = configure_logging(config.service_name)
    container.register("logger", lambda _c: logger)
    container.register("config", lambda _c: config)
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: create_event_bus())
    container.register(
        "comfy_client",
        lambda _c, cfg=config: ComfyClient(
            cfg.comfy_base_url,
            timeout_seconds=cfg.comfy_timeout_seconds,
        ),
    )
    container.register(
        "service_use_cases",
        lambda c: {use_case_class}(c),
    )


def create_app(
    container: ServiceContainer | None = None,
    config: ServiceConfig | None = None,
) -> FastAPI:
    runtime_config = config or get_config()
    app_container = container or ServiceContainer()
    _wire_dependencies(app_container, runtime_config)
    manifest = load_manifest()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        bus = app.state.container.resolve("event_bus")
        await ensure_event_bus_started(bus)
        log_event(
            app.state.container.resolve("logger"),
            event="{service_name}.app.startup",
            message="{service_name} started",
            port=runtime_config.port,
            comfy_base_url=runtime_config.comfy_base_url,
        )
        try:
            yield
        finally:
            await ensure_event_bus_stopped(bus)
            log_event(
                app.state.container.resolve("logger"),
                event="{service_name}.app.shutdown",
                message="{service_name} stopped",
            )

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="Empery Video Studio — ComfyUI Wan image-to-video peer",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    register_standard_error_handlers(
        app,
        service_prefix="VID",
        service_name=runtime_config.service_name,
    )
    app.include_router(router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    registry.register(load_manifest(), create_app)
'''


def _test_health(service_name: str, use_case_class: str) -> str:
    return f'''"""{service_name} health + generate with mocked Comfy client."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from services.{service_name}.config import (
    ServiceConfig,
    clear_config_cache,
    default_workflow_path,
)
from services.{service_name}.src.api.main import create_app
from services.{service_name}.src.integration.comfy_client import ComfyClient


class _FakeComfy(ComfyClient):
    def __init__(self) -> None:
        super().__init__("http://comfy.test")
        self._history: dict[str, Any] = {{}}
        self.last_workflow: dict[str, Any] | None = None

    async def system_stats(self) -> dict[str, Any]:
        return {{"devices": [{{"name": "fake-gpu"}}]}}

    async def upload_image(self, image_bytes: bytes, filename: str) -> str:
        assert image_bytes
        return filename

    async def queue_prompt(self, workflow: dict[str, Any]) -> str:
        assert "97" in workflow
        assert workflow["97"]["inputs"]["image"]
        self.last_workflow = workflow
        self._history["pid-v1"] = {{
            "status": {{"completed": True}},
            "outputs": {{
                "108": {{
                    "gifs": [
                        {{
                            "filename": "Wan2.2_i2v_x_00001_.mp4",
                            "subfolder": "video",
                            "type": "output",
                        }}
                    ]
                }}
            }},
        }}
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
        return b"\\x00\\x00\\x00\\x18ftypmp42fake"


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
    assert body["service"] == "{service_name}"
    assert body["comfy"]["reachable"] is True

    g = c.post(
        "/api/v1/generate",
        data={{"prompt": "camera slowly orbits the subject"}},
        files={{"image": ("seed.png", b"\\x89PNG\\r\\n\\x1a\\nfake", "image/png")}},
    )
    assert g.status_code == 200
    prompt_id = g.json()["prompt_id"]
    assert prompt_id == "pid-v1"
    assert fake.last_workflow is not None
    assert "camera slowly" in fake.last_workflow["129:93"]["inputs"]["text"]

    job = c.get(f"/api/v1/jobs/{{prompt_id}}")
    assert job.status_code == 200
    assert job.json()["status"] == "completed"
    assert job.json()["videos"][0]["filename"].endswith(".mp4")

    vid = c.get(
        "/api/v1/videos",
        params={{"filename": "Wan2.2_i2v_x_00001_.mp4", "subfolder": "video"}},
    )
    assert vid.status_code == 200
    assert vid.content.startswith(b"\\x00\\x00\\x00\\x18ftyp")
'''
