"""Image Studio scaffold — ComfyUI text-to-image peer (not studio_job /jobs queue)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def image_studio_file_map(
    action: Any,
    service_name: str,
    *,
    features: list[str],
    port: int,
    domain_hint: str,
) -> dict[str, str]:
    """Comfy peer: POST /api/v1/generate → poll /jobs → /images. Desktop-first; ECC optional."""
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        manifest_ui_block,
    )

    env_prefix = service_name.upper()
    use_case_class = "".join(p.capitalize() for p in service_name.split("_")) + "UseCases"
    feat = [t for t in features if t != "reflex_scaffold"]
    for token in ("health", "text_to_image", "comfy_proxy", "desktop_ui"):
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
        "workflows/text_to_image.json": _workflow_json(action),
        "tests/test_health.py": _test_health(service_name, use_case_class),
    }


def _workflow_json(action: Any) -> str:
    root = Path(getattr(action, "_root", Path.cwd()))
    src = root / "services" / "image_studio" / "workflows" / "text_to_image.json"
    if src.is_file():
        return src.read_text(encoding="utf-8")
    fallback = (
        Path(__file__).resolve().parents[3]
        / "image_studio"
        / "workflows"
        / "text_to_image.json"
    )
    if fallback.is_file():
        return fallback.read_text(encoding="utf-8")
    raise FileNotFoundError("text_to_image.json not found for image_studio scaffold")


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
        description="Path to text_to_image.json; empty = package workflows/",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
        ],
    )
    comfy_timeout_seconds: float = Field(default=60.0)


def default_workflow_path() -> Path:
    return Path(__file__).resolve().parent / "workflows" / "text_to_image.json"


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
        comfy_timeout_seconds=float(_env("COMFY_TIMEOUT_SECONDS", "60")),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
'''


_MODELS = '''"""Domain models for image studio (Pydantic boundaries)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    width: int = Field(default=1024, ge=64, le=2048)
    height: int = Field(default=1024, ge=64, le=2048)
    seed: int | None = Field(default=None, ge=0)


class GenerateResponse(BaseModel):
    prompt_id: str
    status: Literal["queued"] = "queued"


class ImageRef(BaseModel):
    filename: str
    subfolder: str = ""
    type: str = "output"


class JobStatus(BaseModel):
    prompt_id: str
    status: Literal["queued", "running", "completed", "failed"]
    error: str | None = None
    images: list[ImageRef] = Field(default_factory=list)
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
    def __init__(self, base_url: str, *, timeout_seconds: float = 60.0) -> None:
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

    async def view_image(
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


_WORKFLOW = '''"""Load and parameterize the z-image-turbo text_to_image workflow."""

from __future__ import annotations

import copy
import json
import secrets
from pathlib import Path
from typing import Any


def load_workflow_template(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("workflow template must be a JSON object")
    return data


def build_text_to_image_workflow(
    template: dict[str, Any],
    *,
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    seed: int | None = None,
) -> dict[str, Any]:
    """
    Inject prompt / size / seed into Elite text_to_image.json node IDs:
    CLIPTextEncode 83:27, EmptySD3LatentImage 83:13, KSampler 83:3.
    """
    workflow = copy.deepcopy(template)
    resolved_seed = seed if seed is not None else secrets.randbelow(2**31 - 1) + 1
    text = (prompt or "").strip()
    if not text:
        raise ValueError("prompt is required")

    if "83:27" not in workflow or "83:13" not in workflow or "83:3" not in workflow:
        raise ValueError("workflow missing expected z-image-turbo node ids")

    workflow["83:27"]["inputs"]["text"] = text
    workflow["83:13"]["inputs"]["width"] = width
    workflow["83:13"]["inputs"]["height"] = height
    workflow["83:3"]["inputs"]["seed"] = resolved_seed
    return workflow
'''


def _use_cases(service_name: str, use_case_class: str) -> str:
    return f'''"""Use cases for {service_name}."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from core.container import ServiceContainer
from services.{service_name}.src.core.models import (
    GenerateRequest,
    GenerateResponse,
    ImageRef,
    JobStatus,
)
from services.{service_name}.src.integration.comfy_client import ComfyClient
from services.{service_name}.src.integration.workflow import (
    build_text_to_image_workflow,
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
        }}

    async def generate(self, body: GenerateRequest) -> GenerateResponse:
        cfg = self._config()
        template = load_workflow_template(Path(cfg.workflow_path))
        workflow = build_text_to_image_workflow(
            template,
            prompt=body.prompt,
            width=body.width,
            height=body.height,
            seed=body.seed,
        )
        prompt_id = await self._comfy().queue_prompt(workflow)
        return GenerateResponse(prompt_id=prompt_id)

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

        images = _extract_image_refs(entry)
        if images or status_block.get("completed"):
            return JobStatus(
                prompt_id=prompt_id,
                status="completed",
                images=images,
                raw_status=status_block,
            )
        return JobStatus(
            prompt_id=prompt_id,
            status="running",
            raw_status=status_block,
        )

    async def view_image(
        self,
        *,
        filename: str,
        subfolder: str = "",
        folder_type: str = "output",
    ) -> bytes:
        return await self._comfy().view_image(
            filename=filename,
            subfolder=subfolder,
            folder_type=folder_type,
        )


def _extract_image_refs(execution: dict[str, Any]) -> list[ImageRef]:
    outputs = execution.get("outputs")
    if not isinstance(outputs, dict):
        return []
    refs: list[ImageRef] = []
    seen: set[tuple[str, str]] = set()
    for node_out in outputs.values():
        if not isinstance(node_out, dict):
            continue
        for image_info in node_out.get("images") or []:
            if not isinstance(image_info, dict):
                continue
            filename = image_info.get("filename")
            if not filename:
                continue
            subfolder = str(image_info.get("subfolder") or "")
            key = (str(filename), subfolder)
            if key in seen:
                continue
            seen.add(key)
            refs.append(
                ImageRef(
                    filename=str(filename),
                    subfolder=subfolder,
                    type=str(image_info.get("type") or "output"),
                )
            )
    return refs
'''


def _routes(service_name: str, use_case_class: str) -> str:
    return f'''"""HTTP routes for {service_name}."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from services.{service_name}.src.core.models import (
    GenerateRequest,
    GenerateResponse,
    JobStatus,
)
from services.{service_name}.src.core.use_cases import {use_case_class}

router = APIRouter()


def _uc(request: Request) -> {use_case_class}:
    return request.app.state.container.resolve("service_use_cases")


@router.get("/health")
async def health(request: Request) -> dict:
    return await _uc(request).health()


@router.post("/generate", response_model=GenerateResponse)
async def generate(request: Request, body: GenerateRequest) -> GenerateResponse:
    try:
        return await _uc(request).generate(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/jobs/{{prompt_id}}", response_model=JobStatus)
async def job_status(request: Request, prompt_id: str) -> JobStatus:
    return await _uc(request).job_status(prompt_id)


@router.get("/images")
async def get_image(
    request: Request,
    filename: str = Query(..., min_length=1),
    subfolder: str = Query(default=""),
    folder_type: str = Query(default="output", alias="type"),
) -> Response:
    try:
        data = await _uc(request).view_image(
            filename=filename,
            subfolder=subfolder,
            folder_type=folder_type,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    media = "image/png"
    lower = filename.lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        media = "image/jpeg"
    elif lower.endswith(".webp"):
        media = "image/webp"
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
        description="Empery Image Studio — ComfyUI text-to-image peer",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    register_standard_error_handlers(
        app,
        service_prefix="IMG",
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

    async def system_stats(self) -> dict[str, Any]:
        return {{"devices": [{{"name": "fake-gpu"}}]}}

    async def queue_prompt(self, workflow: dict[str, Any]) -> str:
        assert "83:27" in workflow
        self._history["pid-1"] = {{
            "status": {{"completed": True}},
            "outputs": {{
                "60": {{
                    "images": [
                        {{
                            "filename": "out.png",
                            "subfolder": "",
                            "type": "output",
                        }}
                    ]
                }}
            }},
        }}
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
        return b"\\x89PNG\\r\\n\\x1a\\nfake"


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
    assert body["service"] == "{service_name}"
    assert body["comfy"]["reachable"] is True

    g = client.post(
        "/api/v1/generate",
        json={{"prompt": "a red cube", "width": 512, "height": 512}},
    )
    assert g.status_code == 200
    prompt_id = g.json()["prompt_id"]
    assert prompt_id == "pid-1"

    job = client.get(f"/api/v1/jobs/{{prompt_id}}")
    assert job.status_code == 200
    assert job.json()["status"] == "completed"
    assert job.json()["images"][0]["filename"] == "out.png"

    img = client.get("/api/v1/images", params={{"filename": "out.png"}})
    assert img.status_code == 200
    assert img.content.startswith(b"\\x89PNG")
'''
