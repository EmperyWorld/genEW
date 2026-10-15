"""Presentation AI scaffold — Nervas slide jobs + history + style chat (EWRP-shaped)."""

from __future__ import annotations

import json
from typing import Any


def presentation_ai_file_map(
    action: Any,
    service_name: str,
    *,
    features: list[str],
    port: int,
    domain_hint: str,
) -> dict[str, str]:
    """Peer: presentations CRUD/history + style chat via EIC Nervas. Desktop-first."""
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        manifest_ui_block,
    )

    _ = action, domain_hint
    env_prefix = service_name.upper()
    use_case_class = "".join(p.capitalize() for p in service_name.split("_")) + "UseCases"
    feat = [t for t in features if t != "reflex_scaffold"]
    for token in ("health", "presentations", "style_chat", "nervas_slides", "desktop_ui"):
        if token not in feat:
            feat.append(token)
    manifest = {
        "name": service_name,
        "version": "0.1.0",
        "features": feat,
        "entry_point": "src/api/main.py",
        "dependencies": ["empery_intelligence_core"],
        "publishes": [
            f"{service_name}.presentation.created",
            f"{service_name}.presentation.ready",
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
        "src/core/slide_extract.py": _SLIDE_EXTRACT,
        "src/core/use_cases.py": _use_cases(service_name, use_case_class),
        "src/data/repository.py": _REPOSITORY,
        "src/integration/nervas_client.py": _NERVAS_CLIENT,
        "src/integration/__init__.py": (
            '"""HTTP peer adapters — NervasClient → EIC; never Fake* in src/."""\n'
        ),
        "src/api/routes.py": _routes(service_name, use_case_class),
        "src/api/main.py": _main(service_name, use_case_class),
        "tests/test_health.py": _test_health(service_name),
        "tests/test_domain.py": _test_domain(service_name),
    }


def _config_py(service_name: str, port: int, env_prefix: str) -> str:
    return f'''"""Configuration for {service_name}."""

from __future__ import annotations

import os
from functools import lru_cache

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
    eic_api_base: str = Field(
        default="http://127.0.0.1:8007",
        description="EIC HTTP base for Nervas (EIC_API_BASE)",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
        ],
    )
    nervas_timeout_seconds: float = Field(default=180.0)
    max_tokens: int = Field(default=4096, ge=256, le=16384)


@lru_cache
def get_config() -> ServiceConfig:
    return ServiceConfig(
        host=_env("{env_prefix}_HOST", "0.0.0.0"),
        port=int(_env("{env_prefix}_PORT", _env("PORT", "{port}"))),
        log_level=_env("LOG_LEVEL", "INFO"),
        eic_api_base=_env("EIC_API_BASE", "http://127.0.0.1:8007").strip().rstrip("/"),
        cors_origins=_csv_env(
            "{env_prefix}_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174",
        ),
        nervas_timeout_seconds=float(_env("{env_prefix}_NERVAS_TIMEOUT", "180")),
        max_tokens=int(_env("{env_prefix}_MAX_TOKENS", "4096")),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
'''


_MODELS = '''"""Domain models for presentation jobs (Pydantic boundaries)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Slide(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    bullets: list[str] = Field(default_factory=list)


class CreatePresentationRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=400)
    style_brief: str = Field(default="", max_length=4000)
    num_slides: int = Field(default=5, ge=3, le=20)
    language: str = Field(default="ru", max_length=16)


class PresentationSummary(BaseModel):
    id: str
    title: str
    topic: str
    status: Literal["queued", "generating", "ready", "failed"]
    num_slides: int
    created_at: str


class PresentationDetail(BaseModel):
    id: str
    title: str
    topic: str
    style_brief: str = ""
    status: Literal["queued", "generating", "ready", "failed"]
    progress: int = 0
    num_slides: int
    slides: list[Slide] = Field(default_factory=list)
    error_message: str | None = None
    backend: str = ""
    model: str | None = None
    created_at: str


class StyleChatRequest(BaseModel):
    messages: list[dict[str, str]] = Field(min_length=1)
    presentation_id: str | None = None


class StyleChatResponse(BaseModel):
    message: dict[str, str]
    backend: str = ""
    model: str | None = None
'''


_SLIDE_EXTRACT = '''"""Extract slide JSON from Nervas assistant text."""

from __future__ import annotations

import json
import re
from typing import Any


_FENCE_RE = re.compile(
    r"```(?:json|JSON)?\\s*\\n(.*?)```",
    re.DOTALL,
)


def extract_slides(raw: str, *, num_slides: int) -> list[dict[str, Any]]:
    text = (raw or "").strip()
    if not text:
        raise ValueError("empty Nervas reply")

    fenced = _FENCE_RE.search(text)
    if fenced:
        text = fenced.group(1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        start = text.find("[")
        end = text.rfind("]")
    if start < 0 or end <= start:
        raise ValueError("Nervas reply missing JSON slides")

    payload = json.loads(text[start : end + 1])
    if isinstance(payload, dict):
        slides = payload.get("slides")
    else:
        slides = payload
    if not isinstance(slides, list) or not slides:
        raise ValueError("slides array empty")

    out: list[dict[str, Any]] = []
    for item in slides[:num_slides]:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        bullets_raw = item.get("bullets") or item.get("points") or []
        if not title:
            continue
        bullets = [str(b).strip() for b in bullets_raw if str(b).strip()]
        out.append({"title": title, "bullets": bullets})
    if not out:
        raise ValueError("no valid slides parsed")
    return out
'''


_REPOSITORY = '''"""In-memory presentation store (history dashboard seed; Alembic later)."""

from __future__ import annotations

from dataclasses import dataclass, field
from threading import Lock
from typing import Any


@dataclass
class PresentationRecord:
    id: str
    title: str
    topic: str
    style_brief: str
    num_slides: int
    status: str
    progress: int
    slides: list[dict[str, Any]] = field(default_factory=list)
    error_message: str | None = None
    backend: str = ""
    model: str | None = None
    created_at: str = ""


class PresentationRepository:
    def __init__(self) -> None:
        self._lock = Lock()
        self._items: dict[str, PresentationRecord] = {}

    def save(self, record: PresentationRecord) -> PresentationRecord:
        with self._lock:
            self._items[record.id] = record
            return record

    def get(self, presentation_id: str) -> PresentationRecord | None:
        with self._lock:
            return self._items.get(presentation_id)

    def list_recent(self, *, limit: int = 50) -> list[PresentationRecord]:
        with self._lock:
            items = list(self._items.values())
        items.sort(key=lambda r: r.created_at, reverse=True)
        return items[:limit]
'''


_NERVAS_CLIENT = '''"""
HTTP client for EIC Nervas — peers call EIC over HTTP, never import EIC internals.
"""

from __future__ import annotations

from typing import Any

import httpx


class NervasClient:
    def __init__(self, base_url: str, *, timeout_seconds: float = 180.0) -> None:
        self.base_url = base_url.rstrip("/")
        self._timeout = httpx.Timeout(timeout_seconds, connect=15.0)

    async def health(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.get(f"{self.base_url}/api/v1/health")
            res.raise_for_status()
            data = res.json()
            return data if isinstance(data, dict) else {}

    async def chat(
        self,
        *,
        messages: list[dict[str, str]],
        temperature: float = 0.35,
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{self.base_url}/api/v1/nervas/chat",
                json={
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            if res.status_code >= 400:
                raise RuntimeError(
                    f"Nervas chat failed: HTTP {res.status_code} — {res.text[:500]}"
                )
            data = res.json()
            if not isinstance(data, dict):
                raise RuntimeError("Nervas returned non-object response")
            return data
'''


def _use_cases(service_name: str, use_case_class: str) -> str:
    return f'''"""Use cases for {service_name}."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from core.container import ServiceContainer
from services.{service_name}.src.core.models import (
    CreatePresentationRequest,
    PresentationDetail,
    PresentationSummary,
    Slide,
    StyleChatRequest,
    StyleChatResponse,
)
from services.{service_name}.src.core.slide_extract import extract_slides
from services.{service_name}.src.data.repository import (
    PresentationRecord,
    PresentationRepository,
)
from services.{service_name}.src.integration.nervas_client import NervasClient

_SLIDE_SYSTEM = (
    "You are Empery Presentation AI. Return ONLY JSON "
    '{{"slides":[{{"title":"...","bullets":["..."]}}]}} '
    "with the requested number of slides. No markdown prose outside JSON. "
    "Match the requested language. No FakeAI placeholders."
)

_STYLE_SYSTEM = (
    "You are a presentation style advisor on Empery Desktop. "
    "Give concise, actionable advice on visual style, tone, and slide structure. "
    "No FakeAI placeholders."
)


class {use_case_class}:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _config(self):
        return self._container.resolve("config")

    def _nervas(self) -> NervasClient:
        return self._container.resolve("nervas_client")

    def _repo(self) -> PresentationRepository:
        return self._container.resolve("presentation_repository")

    async def health(self) -> dict[str, Any]:
        cfg = self._config()
        nervas_meta: dict[str, Any] = {{"ready": False, "detail": "unreachable"}}
        try:
            raw = await self._nervas().health()
            nested = raw.get("nervas") if isinstance(raw, dict) else None
            if isinstance(nested, dict):
                nervas_meta = {{
                    "ready": bool(nested.get("ready")),
                    "detail": nested.get("detail") or "ok",
                    "backend": nested.get("backend"),
                }}
            elif isinstance(raw, dict) and raw.get("status") == "ok":
                nervas_meta = {{"ready": True, "detail": "ok"}}
        except Exception as exc:  # noqa: BLE001 — boundary health
            nervas_meta = {{"ready": False, "detail": str(exc)[:200]}}
        return {{
            "service": cfg.service_name,
            "status": "ok" if nervas_meta.get("ready") else "degraded",
            "nervas": nervas_meta,
        }}

    async def create_presentation(
        self, body: CreatePresentationRequest
    ) -> PresentationDetail:
        cfg = self._config()
        pid = str(uuid4())
        now = datetime.now(timezone.utc).isoformat()
        record = PresentationRecord(
            id=pid,
            title=body.title.strip(),
            topic=body.topic.strip(),
            style_brief=(body.style_brief or "").strip(),
            num_slides=body.num_slides,
            status="generating",
            progress=10,
            created_at=now,
        )
        self._repo().save(record)

        user = (
            f"Language: {{body.language}}\\n"
            f"Title: {{record.title}}\\n"
            f"Topic: {{record.topic}}\\n"
            f"Style: {{record.style_brief or 'professional clean'}}\\n"
            f"Num slides: {{body.num_slides}}\\n"
            "Return JSON slides only."
        )
        try:
            raw = await self._nervas().chat(
                messages=[
                    {{"role": "system", "content": _SLIDE_SYSTEM}},
                    {{"role": "user", "content": user}},
                ],
                max_tokens=cfg.max_tokens,
            )
            content = ""
            msg = raw.get("message") if isinstance(raw, dict) else None
            if isinstance(msg, dict):
                content = str(msg.get("content") or "")
            slides = extract_slides(content, num_slides=body.num_slides)
            record.slides = slides
            record.status = "ready"
            record.progress = 100
            record.backend = str(raw.get("backend") or "")
            record.model = raw.get("model") if isinstance(raw.get("model"), str) else None
            self._repo().save(record)
        except Exception as exc:  # noqa: BLE001 — persist failure
            record.status = "failed"
            record.progress = 100
            record.error_message = str(exc)[:500]
            self._repo().save(record)
            raise RuntimeError(record.error_message) from exc

        return self._to_detail(record)

    def list_presentations(self) -> list[PresentationSummary]:
        return [
            PresentationSummary(
                id=item.id,
                title=item.title,
                topic=item.topic,
                status=item.status,  # type: ignore[arg-type]
                num_slides=item.num_slides,
                created_at=item.created_at,
            )
            for item in self._repo().list_recent()
        ]

    def get_presentation(self, presentation_id: str) -> PresentationDetail:
        record = self._repo().get(presentation_id)
        if record is None:
            raise KeyError(presentation_id)
        return self._to_detail(record)

    async def style_chat(self, body: StyleChatRequest) -> StyleChatResponse:
        cfg = self._config()
        context = ""
        if body.presentation_id:
            rec = self._repo().get(body.presentation_id)
            if rec is not None:
                context = (
                    f"Active presentation: title={{rec.title}}, topic={{rec.topic}}, "
                    f"style_brief={{rec.style_brief}}"
                )
        messages = [{{"role": "system", "content": _STYLE_SYSTEM}}]
        if context:
            messages.append({{"role": "system", "content": context}})
        for m in body.messages:
            role = str(m.get("role") or "user")
            content = str(m.get("content") or "").strip()
            if content:
                messages.append({{"role": role, "content": content}})
        raw = await self._nervas().chat(
            messages=messages,
            temperature=0.4,
            max_tokens=min(2048, cfg.max_tokens),
        )
        msg = raw.get("message") if isinstance(raw, dict) else None
        if not isinstance(msg, dict) or not msg.get("content"):
            raise RuntimeError("Nervas style chat returned empty message")
        return StyleChatResponse(
            message={{
                "role": str(msg.get("role") or "assistant"),
                "content": str(msg.get("content")),
            }},
            backend=str(raw.get("backend") or ""),
            model=raw.get("model") if isinstance(raw.get("model"), str) else None,
        )

    def _to_detail(self, record: PresentationRecord) -> PresentationDetail:
        return PresentationDetail(
            id=record.id,
            title=record.title,
            topic=record.topic,
            style_brief=record.style_brief,
            status=record.status,  # type: ignore[arg-type]
            progress=record.progress,
            num_slides=record.num_slides,
            slides=[Slide.model_validate(s) for s in record.slides],
            error_message=record.error_message,
            backend=record.backend,
            model=record.model,
            created_at=record.created_at,
        )
'''


def _routes(service_name: str, use_case_class: str) -> str:
    return f'''"""HTTP routes for {service_name}."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from services.{service_name}.src.core.models import (
    CreatePresentationRequest,
    PresentationDetail,
    PresentationSummary,
    StyleChatRequest,
    StyleChatResponse,
)
from services.{service_name}.src.core.use_cases import {use_case_class}

router = APIRouter()


def _uc(request: Request) -> {use_case_class}:
    return request.app.state.container.resolve("service_use_cases")


@router.get("/health")
async def health(request: Request) -> dict:
    return await _uc(request).health()


@router.post("/presentations", response_model=PresentationDetail)
async def create_presentation(
    request: Request, body: CreatePresentationRequest
) -> PresentationDetail:
    try:
        return await _uc(request).create_presentation(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/presentations", response_model=list[PresentationSummary])
async def list_presentations(request: Request) -> list[PresentationSummary]:
    return _uc(request).list_presentations()


@router.get("/presentations/{{presentation_id}}", response_model=PresentationDetail)
async def get_presentation(
    request: Request, presentation_id: str
) -> PresentationDetail:
    try:
        return _uc(request).get_presentation(presentation_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="presentation not found") from exc


@router.post("/style/chat", response_model=StyleChatResponse)
async def style_chat(request: Request, body: StyleChatRequest) -> StyleChatResponse:
    try:
        return await _uc(request).style_chat(body)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
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
from services.{service_name}.src.data.repository import PresentationRepository
from services.{service_name}.src.integration.nervas_client import NervasClient


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
        "nervas_client",
        lambda _c, cfg=config: NervasClient(
            cfg.eic_api_base,
            timeout_seconds=cfg.nervas_timeout_seconds,
        ),
    )
    container.register("presentation_repository", lambda _c: PresentationRepository())
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
            eic_api_base=runtime_config.eic_api_base,
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
        description="Empery Presentation AI — Nervas slide jobs + history + style chat",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    register_standard_error_handlers(
        app,
        service_prefix="PRES",
        service_name=runtime_config.service_name,
    )
    app.include_router(router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    registry.register(load_manifest(), create_app)
'''


def _test_health(service_name: str) -> str:
    from services.empery_intelligence_core.src.integration.scaffold_test_emitters import (
        presentation_ai_api_test,
    )

    return presentation_ai_api_test(service_name)



def _test_domain(service_name: str) -> str:
    return f'''"""Domain helpers for {service_name}."""

from services.{service_name}.src.core.slide_extract import extract_slides


def test_extract_slides_fenced() -> None:
    raw = (
        "```json\\n"
        '{{"slides":[{{"title":"A","bullets":["1"]}},{{"title":"B","bullets":["2"]}}]}}'
        "\\n```"
    )
    out = extract_slides(raw, num_slides=2)
    assert len(out) == 2
    assert out[0]["title"] == "A"
'''
