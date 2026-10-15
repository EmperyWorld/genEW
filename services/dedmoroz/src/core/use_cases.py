"""Companion chat use cases for dedmoroz — living Nervas, identity-gated, no echo."""

from __future__ import annotations

from typing import Any

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.integration.identity_verifier import IdentityPrincipal
from core.logging import log_event

from services.dedmoroz.src.data.schemas import (
    MessageListResponse,
    MessageResponse,
    SendMessageRequest,
)
from services.dedmoroz.src.integration.identity_adapter import strip_bearer_token
from services.dedmoroz.src.integration.nervas_client import NervasClient

_SYSTEM = (
    "Ты Дедушка Мороз на Empery Desktop. Отвечай тепло, коротко и по-русски, "
    "если пользователь пишет по-русски. Без markdown-огорождений и без фейковых "
    "заглушек. Ты живой собеседник через Nervas, не echo-бот."
)


class DedmorozUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._logger = container.resolve("logger")

    def _store(self):
        return self._container.resolve("chat_store")

    def _nervas(self) -> NervasClient:
        return self._container.resolve("nervas_client")

    def _config(self):
        return self._container.resolve("config")

    def _require_actor(self, authorization: str | None) -> IdentityPrincipal:
        token = strip_bearer_token(authorization)
        try:
            verifier = self._container.resolve("identity_verifier")
        except KeyError as exc:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_UNAVAILABLE",
                    message="Identity verifier is not available",
                    details={"reason": "identity_verifier not registered"},
                ),
                http_status=503,
            ) from exc
        try:
            return verifier.verify_token(token)
        except ServiceError:
            raise
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="dedmoroz.identity.rejected",
                message="Identity verifier rejected token",
                level=40,
                reason=str(exc),
            )
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="DEDMOROZ_UNAUTHORIZED",
                    message="Identity verification failed",
                    details={"reason": str(exc)},
                ),
                http_status=401,
            ) from exc

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
            "version": "0.2.0",
            "nervas": {
                "base_url": cfg.eic_api_base,
                "ready": nervas_ok,
                "detail": detail,
                "backend": backend,
            },
        }

    async def send(
        self,
        req: SendMessageRequest,
        *,
        authorization: str | None,
    ) -> MessageResponse:
        self._require_actor(authorization)
        store = self._store()
        user_msg = await store.append("user", req.content)
        history = await store.list(limit=24)
        messages: list[dict[str, str]] = [{"role": "system", "content": _SYSTEM}]
        for m in history:
            if m.role not in {"user", "assistant"}:
                continue
            messages.append({"role": m.role, "content": m.content})
        try:
            raw = await self._nervas().chat(messages=messages)
        except Exception as exc:  # noqa: BLE001
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="DEDMOROZ_NERVAS_FAILED",
                    message=f"Nervas chat failed: {exc}",
                ),
                http_status=502,
            ) from exc
        message = raw.get("message") if isinstance(raw, dict) else None
        content = ""
        if isinstance(message, dict):
            content = str(message.get("content") or "").strip()
        if not content:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="DEDMOROZ_NERVAS_EMPTY",
                    message="Nervas returned empty assistant content",
                ),
                http_status=502,
            )
        await store.append("assistant", content)
        return MessageResponse(
            id=user_msg.id,
            role=user_msg.role,
            content=user_msg.content,
            created_at=user_msg.created_at,
        )

    async def list_messages(
        self,
        *,
        authorization: str | None,
        limit: int = 50,
    ) -> MessageListResponse:
        self._require_actor(authorization)
        msgs = await self._store().list(limit=limit)
        items = [
            MessageResponse(
                id=m.id, role=m.role, content=m.content, created_at=m.created_at
            )
            for m in msgs
        ]
        return MessageListResponse(messages=items, count=len(items))
