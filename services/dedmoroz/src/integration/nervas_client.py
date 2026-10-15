"""
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
        temperature: float = 0.55,
        max_tokens: int = 1024,
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
