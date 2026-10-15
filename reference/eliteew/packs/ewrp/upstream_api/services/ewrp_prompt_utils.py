# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# EWRP image-prompt sanitization and quality heuristics (no aiohttp/UGS).
# Invariants:
# - Slide visuals must not invite readable text: scrub text-bait subjects before Comfy.
# Related:
# - api/services/ewrp_service.py
# - documentation/product/EWRP-REVOLUTIONARY-PRESENTATIONS.md
# ---
"""Санитизация и эвристики качества промптов изображений EWRP (без aiohttp/UGS)."""

from __future__ import annotations

import re

# Типичный мусор: транслитерация RU→LAT, метки «слайд», кавычки с названиями.
_EWRP_PROMPT_JUNK_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\b(slayd|sklad|fitnes-klub|fitness-klub|klyuchev|novosti|korpus|prezentats)\w*\b"),
    re.compile(r"(?i)\bfitnes\b(?!\w)"),
    re.compile(r"(?i)\bklub\b"),
    re.compile(r"(?i)concept\s*:\s*"),
    re.compile(r"(?i)\bslide\s*\d+\s*:"),
    re.compile(r"(?i)\bplazma\b"),
)

# Subjects that make z-image-turbo paint gibberish letters even with anti-text suffixes.
_EWRP_TEXT_BAIT_REPLACEMENTS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"(?i)\b(roadside|street|neon|vintage|glowing)\s+signs?\b"),
        "abstract glowing landmark sculpture",
    ),
    (re.compile(r"(?i)\b(billboard|marquee|signage|storefront\s+sign)\b"), "soft light sculpture"),
    (re.compile(r"(?i)\bsigns?\b"), "light form"),
    (
        re.compile(r"(?i)\b(architectural\s+)?blueprints?\b"),
        "clean abstract geometric plan lines without labels",
    ),
    (
        re.compile(r"(?i)\b(business\s+)?documents?\b"),
        "blank paper sheets with empty surface",
    ),
    (re.compile(r"(?i)\b(papers?|forms?)\b(?=[^,]*(desk|table|marble))"), "blank paper"),
    (
        re.compile(r"(?i)\bbusiness\s+cards?\b"),
        "blank matte card rectangle with empty face",
    ),
    (
        re.compile(r"(?i)\b(dashboard|infographic|spreadsheet)\b"),
        "abstract glowing geometric curves",
    ),
    (
        re.compile(r"(?i)\b(data\s+)?(charts?|graphs?|heat\s*maps?)\b"),
        "abstract glowing curves without labels or numbers",
    ),
    (
        re.compile(r"(?i)\b(newspaper|magazine|poster|flyer|brochure|menu)\b"),
        "abstract printed texture without letters",
    ),
    (
        re.compile(r"(?i)\b(ui|hud|interface|screen\s+with\s+text|monitor\s+with\s+text)\b"),
        "blank luminous screen glow",
    ),
    (re.compile(r"(?i)\b(caption|lettering|typography|title\s+block)\b"), "clean empty space"),
)

_EWRP_SLIDE_NO_TEXT_SUFFIX = (
    ", text-free image: absolutely no readable text, no letters, no numbers, no captions, "
    "no signage, no labels, no UI, no logos, no watermarks, no people"
)


def sanitize_ewrp_raw_image_prompt(raw: str) -> str:
    """Убирает префиксы concept/slide, кавычки и лишние пробелы из сырого промпта."""
    s = (raw or "").strip()
    if not s:
        return ""
    s = s.replace("\u201c", '"').replace("\u201d", '"').replace("\u00ab", "").replace("\u00bb", "")
    s = re.sub(r'["\'][^"\']{0,120}["\']', " ", s)
    s = re.sub(r"(?i)\b(final answer|answer|ответ)\s*:\s*", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" ,")
    return s[:900]


def scrub_ewrp_text_bait_subjects(prompt: str) -> str:
    """Replace subjects that reliably cause z-image to render gibberish text."""
    s = (prompt or "").strip()
    if not s:
        return ""
    for pattern, replacement in _EWRP_TEXT_BAIT_REPLACEMENTS:
        s = pattern.sub(replacement, s)
    return re.sub(r"\s+", " ", s).strip(" ,")


def ensure_ewrp_slide_no_text_clause(prompt: str) -> str:
    """Always attach a strong visual-only anti-text clause for slide backgrounds."""
    base = (prompt or "").strip().rstrip(" ,.")
    if not base:
        return (
            "professional editorial illustration, soft cinematic light, clean composition,"
            f" abstract presentation visual{_EWRP_SLIDE_NO_TEXT_SUFFIX}"
        )
    low = base.lower()
    if "text-free image" in low or "no readable text" in low:
        return base
    return f"{base}{_EWRP_SLIDE_NO_TEXT_SUFFIX}"


def ewrp_image_prompt_is_low_quality(s: str) -> bool:
    """True если промпт похож на транслит/мета-текст, а не на визуальное описание."""
    t = (s or "").strip()
    if len(t) < 12:
        return True
    if any("\u0400" <= c <= "\u04ff" for c in t):
        return True
    low = t.lower()
    if low.count(",") > 18 or len(t) > 700:
        return True
    return any(rx.search(t) for rx in _EWRP_PROMPT_JUNK_PATTERNS)
