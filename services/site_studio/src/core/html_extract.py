"""Extract a single HTML document from Nervas assistant text."""

from __future__ import annotations

import re


_FENCE_RE = re.compile(
    r"```(?:html|HTML)?\s*\n(.*?)```",
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
        # Wrap fragment into a minimal document — still real LLM content, not FakeAI stub.
        text = (
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            f"<title>Site Studio</title></head><body>{text}</body></html>"
        )
    return text.strip()
