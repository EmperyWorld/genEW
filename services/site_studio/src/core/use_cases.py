"""Use cases for site_studio."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from core.container import ServiceContainer
from services.site_studio.src.core.html_extract import extract_html_document
from services.site_studio.src.core.models import (
    DraftSummary,
    PreviewRequest,
    PreviewResponse,
)
from services.site_studio.src.data.repository import DraftRecord, DraftRepository
from services.site_studio.src.integration.nervas_client import NervasClient

_SYSTEM = (
    "You are Site Studio on Empery Desktop. Generate ONE complete standalone HTML5 "
    "landing page. Output only HTML (optional ```html fence). Include inline CSS, "
    "semantic sections (hero, features, CTA), responsive layout. No external scripts, "
    "no tracking, no FakeAI placeholders. Match the requested language."
)


class SiteStudioUseCases:
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
        return {
            "status": "ok" if nervas_ok else "degraded",
            "service": cfg.service_name,
            "nervas": {
                "base_url": cfg.eic_api_base,
                "ready": nervas_ok,
                "detail": detail,
                "backend": backend,
            },
            "mode": "preview_html",
        }

    async def generate_preview(self, body: PreviewRequest) -> PreviewResponse:
        cfg = self._config()
        user = (
            f"Title: {body.title.strip()}\n"
            f"Topic: {body.topic.strip()}\n"
            f"Language: {body.language.strip() or 'ru'}\n"
            f"Brief:\n{body.brief.strip()}\n\n"
            "Produce the full HTML document now."
        )
        raw = await self._nervas().chat(
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": user},
            ],
            max_tokens=cfg.max_tokens,
        )
        message_raw = raw.get("message")
        message: dict[str, Any] = (
            message_raw if isinstance(message_raw, dict) else {}
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
