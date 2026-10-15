"""Site Studio scaffold — Nervas HTML preview peer (not studio_job /jobs)."""

from __future__ import annotations

import json
from typing import Any


def site_studio_file_map(
    action: Any,
    service_name: str,
    *,
    features: list[str],
    port: int,
    domain_hint: str,
) -> dict[str, str]:
    """Preview peer: POST /api/v1/preview → Nervas HTML. Desktop-first; ECC optional."""
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        manifest_ui_block,
    )

    env_prefix = service_name.upper()
    use_case_class = "".join(p.capitalize() for p in service_name.split("_")) + "UseCases"
    feat = [t for t in features if t != "reflex_scaffold"]
    for token in ("health", "site_preview", "nervas_html", "desktop_ui"):
        if token not in feat:
            feat.append(token)
    manifest = {
        "name": service_name,
        "version": "0.1.0",
        "features": feat,
        "entry_point": "src/api/main.py",
        "dependencies": ["empery_intelligence_core"],
        "publishes": [f"{service_name}.preview.generated"],
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
        "src/core/html_extract.py": _HTML_EXTRACT,
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


_MODELS = '''"""Domain models for site studio preview (Pydantic boundaries)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class PreviewRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=400)
    brief: str = Field(min_length=1, max_length=4000)
    language: str = Field(default="ru", max_length=16)


class PreviewResponse(BaseModel):
    draft_id: str
    title: str
    topic: str
    html: str
    backend: str = ""
    model: str | None = None
    status: Literal["ready"] = "ready"


class DraftSummary(BaseModel):
    draft_id: str
    title: str
    topic: str
    status: Literal["ready"] = "ready"
'''


_HTML_EXTRACT = '''"""Extract a single HTML document from Nervas assistant text."""

from __future__ import annotations

import re


_FENCE_RE = re.compile(
    r"```(?:html|HTML)?\\s*\\n(.*?)```",
    re.DOTALL,
)


def extract_html_document(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        raise ValueError("empty Nervas reply")

    fenced = _FENCE_RE.search(text)
    if fenced:
        text = fenced.group(1).strip()

    lower = text.lower()
    start = lower.find("<!doctype html")
    if start < 0:
        start = lower.find("<html")
    if start >= 0:
        text = text[start:]
        end = text.lower().rfind("</html>")
        if end >= 0:
            text = text[: end + len("</html>")]

    if "<html" not in text.lower():
        text = (
            "<!DOCTYPE html><html><head><meta charset=\\"utf-8\\">"
            "<meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1\\">"
            f"<title>Site Studio</title></head><body>{text}</body></html>"
        )
    return text.strip()
'''


_REPOSITORY = '''"""In-memory draft store for site studio previews (no persistent DB yet)."""

from __future__ import annotations

from dataclasses import dataclass
from threading import Lock


@dataclass
class DraftRecord:
    draft_id: str
    title: str
    topic: str
    brief: str
    html: str
    backend: str
    model: str | None


class DraftRepository:
    def __init__(self) -> None:
        self._lock = Lock()
        self._items: dict[str, DraftRecord] = {}

    def save(self, record: DraftRecord) -> DraftRecord:
        with self._lock:
            self._items[record.draft_id] = record
            return record

    def get(self, draft_id: str) -> DraftRecord | None:
        with self._lock:
            return self._items.get(draft_id)

    def list_recent(self, *, limit: int = 20) -> list[DraftRecord]:
        with self._lock:
            items = list(self._items.values())
        return list(reversed(items[-limit:]))
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

from typing import Any
from uuid import uuid4

from core.container import ServiceContainer
from services.{service_name}.src.core.html_extract import extract_html_document
from services.{service_name}.src.core.models import (
    DraftSummary,
    PreviewRequest,
    PreviewResponse,
)
from services.{service_name}.src.data.repository import DraftRecord, DraftRepository
from services.{service_name}.src.integration.nervas_client import NervasClient

_SYSTEM = (
    "You are Site Studio on Empery Desktop. Generate ONE complete standalone HTML5 "
    "landing page. Output only HTML (optional ```html fence). Include inline CSS, "
    "semantic sections (hero, features, CTA), responsive layout. No external scripts, "
    "no tracking, no FakeAI placeholders. Match the requested language."
)


class {use_case_class}:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _config(self):
        return self._container.resolve("config")

    def _nervas(self) -> NervasClient:
        return self._container.resolve("nervas_client")

    def _drafts(self) -> DraftRepository:
        return self._container.resolve("draft_repository")

    async def health(self) -> dict[str, Any]:
        cfg = self._config()
        nervas_ok = False
        detail: str | None = None
        backend: str | None = None
        try:
            body = await self._nervas().health()
            nervas = body.get("nervas") if isinstance(body, dict) else None
            if isinstance(nervas, dict):
                nervas_ok = bool(nervas.get("ready"))
                detail = str(nervas.get("detail") or nervas.get("backend") or "ok")
                backend = str(nervas.get("backend") or "")
            else:
                detail = "missing nervas block"
        except Exception as exc:  # noqa: BLE001
            detail = str(exc)[:200]
        return {{
            "status": "ok" if nervas_ok else "degraded",
            "service": cfg.service_name,
            "nervas": {{
                "base_url": cfg.eic_api_base,
                "ready": nervas_ok,
                "detail": detail,
                "backend": backend,
            }},
            "mode": "preview_html",
        }}

    async def generate_preview(self, body: PreviewRequest) -> PreviewResponse:
        cfg = self._config()
        user = (
            f"Title: {{body.title.strip()}}\\n"
            f"Topic: {{body.topic.strip()}}\\n"
            f"Language: {{body.language.strip() or 'ru'}}\\n"
            f"Brief:\\n{{body.brief.strip()}}\\n\\n"
            "Produce the full HTML document now."
        )
        raw = await self._nervas().chat(
            messages=[
                {{"role": "system", "content": _SYSTEM}},
                {{"role": "user", "content": user}},
            ],
            max_tokens=cfg.max_tokens,
        )
        message_raw = raw.get("message")
        message: dict[str, Any] = (
            message_raw if isinstance(message_raw, dict) else {{}}
        )
        content = str(message.get("content") or "")
        html = extract_html_document(content)
        draft_id = uuid4().hex[:12]
        backend = str(raw.get("backend") or "")
        model = raw.get("model")
        model_s = str(model) if model else None
        self._drafts().save(
            DraftRecord(
                draft_id=draft_id,
                title=body.title.strip(),
                topic=body.topic.strip(),
                brief=body.brief.strip(),
                html=html,
                backend=backend,
                model=model_s,
            )
        )
        return PreviewResponse(
            draft_id=draft_id,
            title=body.title.strip(),
            topic=body.topic.strip(),
            html=html,
            backend=backend,
            model=model_s,
        )

    def get_preview(self, draft_id: str) -> PreviewResponse:
        record = self._drafts().get(draft_id)
        if record is None:
            raise KeyError(draft_id)
        return PreviewResponse(
            draft_id=record.draft_id,
            title=record.title,
            topic=record.topic,
            html=record.html,
            backend=record.backend,
            model=record.model,
        )

    def list_drafts(self) -> list[DraftSummary]:
        return [
            DraftSummary(
                draft_id=item.draft_id,
                title=item.title,
                topic=item.topic,
            )
            for item in self._drafts().list_recent()
        ]
'''


def _routes(service_name: str, use_case_class: str) -> str:
    return f'''"""HTTP routes for {service_name}."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

from services.{service_name}.src.core.models import (
    DraftSummary,
    PreviewRequest,
    PreviewResponse,
)
from services.{service_name}.src.core.use_cases import {use_case_class}

router = APIRouter()


def _uc(request: Request) -> {use_case_class}:
    return request.app.state.container.resolve("service_use_cases")


@router.get("/health")
async def health(request: Request) -> dict:
    return await _uc(request).health()


@router.post("/preview", response_model=PreviewResponse)
async def generate_preview(request: Request, body: PreviewRequest) -> PreviewResponse:
    try:
        return await _uc(request).generate_preview(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/drafts", response_model=list[DraftSummary])
async def list_drafts(request: Request) -> list[DraftSummary]:
    return _uc(request).list_drafts()


@router.get("/drafts/{{draft_id}}", response_model=PreviewResponse)
async def get_draft(request: Request, draft_id: str) -> PreviewResponse:
    try:
        return _uc(request).get_preview(draft_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="draft not found") from exc


@router.get("/drafts/{{draft_id}}/html", response_class=HTMLResponse)
async def get_draft_html(request: Request, draft_id: str) -> HTMLResponse:
    try:
        preview = _uc(request).get_preview(draft_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="draft not found") from exc
    return HTMLResponse(content=preview.html)
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
from services.{service_name}.src.data.repository import DraftRepository
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
    container.register("draft_repository", lambda _c: DraftRepository())
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
        description="Empery Site Studio — Nervas HTML preview peer (no admin/provisioning)",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    register_standard_error_handlers(
        app,
        service_prefix="SITE",
        service_name=runtime_config.service_name,
    )
    app.include_router(router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    registry.register(load_manifest(), create_app)
'''


def _test_health(service_name: str) -> str:
    from services.empery_intelligence_core.src.integration.scaffold_test_emitters import (
        site_studio_api_test,
    )

    return site_studio_api_test(service_name)



def _test_domain(service_name: str) -> str:
    return f'''"""Domain helpers for {service_name}."""

from services.{service_name}.src.core.html_extract import extract_html_document


def test_extract_html_document_fenced() -> None:
    raw = "```html\\n<html><body>x</body></html>\\n```"
    out = extract_html_document(raw)
    assert "<html" in out.lower()
    assert "x" in out
'''
