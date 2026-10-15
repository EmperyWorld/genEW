"""Normalize bullet text on EWRP slide dicts (bullets vs LLM ``content`` vs ``body``)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def normalize_ewrp_slide_bullets(slide: Mapping[str, Any]) -> list[str]:
    """
    Return non-empty bullet lines for HTML/PDF and API preview.

    Generator and some paths store points under ``content`` (SlideJson alias);
    editor and DB usually use ``bullets``. Rebuild must honor both.
    """
    out: list[str] = []

    def _append_non_empty(s: str) -> None:
        t = s.strip()
        if t:
            out.append(t)

    def _from_list(items: list[Any]) -> None:
        for x in items:
            if x is None:
                continue
            _append_non_empty(str(x))

    raw_bullets = slide.get("bullets")
    if isinstance(raw_bullets, str):
        for ln in raw_bullets.splitlines():
            _append_non_empty(ln)
    elif isinstance(raw_bullets, list):
        _from_list(raw_bullets)

    if not out:
        content = slide.get("content")
        if isinstance(content, str):
            for ln in content.splitlines():
                _append_non_empty(ln)
        elif isinstance(content, list):
            _from_list(content)

    if not out:
        body = slide.get("body")
        if isinstance(body, str):
            for ln in body.splitlines():
                _append_non_empty(ln)

    return out
