"""HTTP embedding backend — OpenAI-compatible /embeddings when URL configured."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

from core.logging import log_event


class HttpEmbedding:
    """POST {base}/embeddings with {\"input\": text} — OpenAI-compatible shape."""

    def __init__(
        self,
        *,
        base_url: str,
        dims: int = 384,
        model: str | None = None,
        api_key: str | None = None,
        logger: logging.Logger | None = None,
        timeout_s: float = 30.0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._dims = dims
        self._model = model
        self._api_key = api_key
        self._logger = logger or logging.getLogger("eic.embeddings.http")
        self._timeout = timeout_s

    @property
    def dims(self) -> int:
        return self._dims

    def embed(self, text: str) -> list[float]:
        url = f"{self._base}/embeddings"
        payload: dict[str, Any] = {"input": text}
        if self._model:
            payload["model"] = self._model
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            log_event(
                self._logger,
                event="eic.embeddings.http_failed",
                message=str(exc)[:300],
                level=logging.WARNING,
            )
            raise RuntimeError(f"HTTP embedding failed: {exc}") from exc
        vec = _parse_embedding_response(raw)
        if len(vec) != self._dims:
            # Accept server dims; update advertised dims for this instance
            self._dims = len(vec)
        return vec


def _parse_embedding_response(raw: Any) -> list[float]:
    if isinstance(raw, dict):
        data = raw.get("data")
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict) and isinstance(first.get("embedding"), list):
                return [float(x) for x in first["embedding"]]
        if isinstance(raw.get("embedding"), list):
            return [float(x) for x in raw["embedding"]]
    raise RuntimeError("unexpected embeddings response shape")
