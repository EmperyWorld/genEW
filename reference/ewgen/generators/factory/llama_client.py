"""
Backend Llama client — OpenAI-compatible completions for factory intake.
"""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

DEFAULT_LLAMA_URL = "http://192.168.1.111:8080"
DEFAULT_LLAMA_MODEL = "gemma-4-E4B-it-UD-Q8_K_XL.gguf"
DEFAULT_LLAMA_TIMEOUT = float(os.getenv("EWGEN_LLAMA_TIMEOUT", "120"))


class LlamaClientError(Exception):
    """Llama HTTP or response error."""


class LlamaClient:
    """Minimal OpenAI-compatible client for stack2-llama-chat."""

    def __init__(
        self,
        *,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: float = DEFAULT_LLAMA_TIMEOUT,
    ):
        if base_url:
            resolved = base_url
        else:
            try:
                from generators.factory.llm_runtime import current_base_url

                resolved = current_base_url()
            except Exception:  # noqa: BLE001
                resolved = os.getenv("EWGEN_LLAMA_URL", DEFAULT_LLAMA_URL)
        self._base_url = resolved.rstrip("/")
        self._model = model or os.getenv("EWGEN_LLAMA_MODEL", DEFAULT_LLAMA_MODEL)
        self._timeout_seconds = timeout_seconds

    def complete(self, prompt: str, *, temperature: float = 0.1) -> str:
        payload = {
            "model": self._model,
            "prompt": prompt,
            "stream": False,
            "temperature": temperature,
            "max_tokens": int(os.getenv("EWGEN_LLAMA_MAX_TOKENS", "2048")),
        }
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{self._base_url}/v1/completions",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout_seconds) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except urllib.error.URLError as error:
            raise LlamaClientError(f"Llama request failed: {error}") from error

        try:
            parsed: Dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError as error:
            raise LlamaClientError("Llama returned non-JSON body") from error

        choices = parsed.get("choices") or []
        if choices and isinstance(choices[0], dict):
            text = choices[0].get("text")
            if isinstance(text, str) and text.strip():
                return text.strip()

        legacy = parsed.get("response")
        if isinstance(legacy, str) and legacy.strip():
            return legacy.strip()

        raise LlamaClientError("Llama completion response missing text")


def extract_json_object(text: str) -> Dict[str, Any]:
    """Extract the first JSON object from LLM output."""
    cleaned = text.strip()
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
    if fence_match:
        cleaned = fence_match.group(1)

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in LLM output")

    return json.loads(cleaned[start : end + 1])


_llama_client: Optional[LlamaClient] = None


def get_llama_client(*, force_new: bool = False) -> LlamaClient:
    global _llama_client
    if _llama_client is None or force_new:
        _llama_client = LlamaClient()
    return _llama_client


def reset_llama_client() -> LlamaClient:
    """Rebuild client after runtime endpoint switch."""
    return get_llama_client(force_new=True)
