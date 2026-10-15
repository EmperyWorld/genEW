"""HTTP adapter for dedmoroz chat peer."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_control_center_api.src.integration.identity_client import (
    strip_bearer_token,
)


def _unavailable(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="DEDMOROZ_UNAVAILABLE",
            message="dedmoroz service is not available",
            details={"reason": reason},
        ),
        http_status=503,
    )


class DedmorozClient:
    def __init__(
        self,
        *,
        base_url: str = "http://dedmoroz:8039",
        logger: logging.Logger,
        timeout_seconds: float = 30.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._logger = logger
        self._timeout_seconds = timeout_seconds

    async def list_messages(
        self, authorization: str | None, *, limit: int = 50
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{self._base_url}/api/v1/messages"
        return await self._json("GET", url, token, params={"limit": limit})

    async def send_message(
        self, authorization: str | None, *, content: str
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{self._base_url}/api/v1/messages"
        return await self._json(
            "POST", url, token, json_body={"content": content}
        )

    async def _json(
        self,
        method: str,
        url: str,
        token: str | None,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers: dict[str, str] = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                res = await client.request(
                    method, url, headers=headers, params=params, json=json_body
                )
        except httpx.HTTPError as exc:
            raise _unavailable(str(exc)) from exc
        if res.status_code >= 400:
            raise _unavailable(f"HTTP {res.status_code}: {res.text[:200]}")
        data = res.json()
        if not isinstance(data, dict):
            raise _unavailable("invalid JSON object")
        return data
