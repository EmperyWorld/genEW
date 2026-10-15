#!/usr/bin/env python3
# ---
# EliteEW · Empery World
# https://eliteew.ru
# Author: po&T <keysray70@gmail.com>
# ---
# Purpose:
# PRESENT-style two-phase JSON slide generator for EWRP and classic presentations (outline → per-slide content).
# Invariants:
# - LLM calls use OpenAI-compat chat with ``response_format: json_object`` (llama ``format=json``) and thinking disabled when supported.
# - Slide count is normalized to the requested ``slide_count`` (trim/pad with fallbacks on parse failures).
# Related:
# - api/services/ewrp_service.py
# - api/utils/llm_json_extract.py
# - api/utils/llm_openai_compat_http.py
# ---
"""
Presentation Content Generator Service (PRESENT-style JSON slides).

This service is a Python adaptation of the legacy PRESENT generator located in:
- PRESENT/src/services/ai/presentationContentGenerator.ts
- PRESENT/src/services/ai/presentationPrompts.ts

It generates a structured list of slide dictionaries that can be stored in
presentations.slides_json and later converted to Markdown / Reveal.js.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

import aiohttp  # type: ignore[import-not-found]

from api.core.unified_config import unified_settings
from api.schemas.presentation import OutlineSlide, SlideJson, SlideKind
from api.services.ewrp_content_quality import (
    EWRP_CONTENT_SOURCE_MONOLITHIC,
    EWRP_CONTENT_SOURCE_TEMPLATE_FALLBACK,
    EWRP_CONTENT_SOURCE_TWO_PHASE,
    ewrp_template_fallback_bullets,
)
from api.utils.llama_keep_alive import llama_keep_alive_from_settings
from api.utils.llm_json_extract import (
    extract_llm_json_payload,
    extract_slides_list_from_llm,
    salvage_text_from_llama_server_error,
)
from api.utils.llm_openai_compat_http import aiohttp_compat_chat_completion_json

logger = logging.getLogger(__name__)


def _ewrp_llama_debug_enabled() -> bool:
    return os.environ.get("EWRP_LLAMA_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}


def ewrp_outline_num_predict(slide_count: int) -> int:
    """Scale outline token budget: 20-slide decks need more than 2048 tokens."""
    count = max(1, int(slide_count))
    return max(2048, min(8192, count * 140 + 512))


def ewrp_monolithic_num_predict(slide_count: int) -> int:
    """Scale monolithic JSON budget for full deck + imagePrompt fields."""
    count = max(1, int(slide_count))
    return max(4096, min(16384, count * 320 + 1024))


@dataclass
class PresentationSlidesGenerationResult:
    slides: list[dict[str, Any]]
    content_source: str


@dataclass
class _LlmJsonCallResult:
    raw: str
    finish_reason: str | None = None


@dataclass
class PresentationGenerationConfig:
    """Configuration for structured presentation generation."""

    topic: str
    slide_count: int
    type_key: str = "educational"  # pitch_deck, educational, conference, etc.
    audience: str | None = None
    tone: str | None = None
    additional_context: str | None = None
    outline_temperature: float = 0.4
    slide_content_temperature: float = 0.7


class PresentationContentGeneratorService:
    """
    PRESENT-style JSON slide generator.

    Generates a JSON object with a \"slides\" array where each slide is a dict
    similar to GeneratedSlideContent from the TS implementation.
    """

    def __init__(self, llama_base_url: str | None = None) -> None:
        self.llama_base_url = llama_base_url or "http://stack2-llama:11434"
        self.default_model = unified_settings.default_ai_model

    @staticmethod
    def _structured_llm_options(base: dict[str, Any] | None) -> dict[str, Any]:
        """Chat options for stack2 thinking models: prefer visible JSON, merge reasoning if content is empty."""
        opts = dict(base or {})
        opts.setdefault("openai_sidecar_merge_reasoning", True)
        return opts

    async def _call_llm_for_json_with_meta(
        self,
        session: aiohttp.ClientSession,
        *,
        prompt: str,
        model_name: str,
        options: dict[str, Any],
        timeout: aiohttp.ClientTimeout,
    ) -> _LlmJsonCallResult:
        """Single non-stream chat call; returns raw assistant text and finish_reason."""
        llm_opts = self._structured_llm_options(options)
        last_exc: BaseException | None = None
        for chat_template_kwargs in ({"enable_thinking": False}, None):
            try:
                result = await aiohttp_compat_chat_completion_json(
                    session,
                    self.llama_base_url,
                    model=model_name,
                    messages=[{"role": "user", "content": prompt}],
                    options=llm_opts,
                    keep_alive=llama_keep_alive_from_settings(),
                    timeout=timeout,
                    response_format={"type": "json_object"},
                    chat_template_kwargs=chat_template_kwargs,
                )
                raw = str(result.get("response", "") or "")
                if raw.strip():
                    finish = result.get("finish_reason")
                    finish_reason = str(finish) if finish is not None else None
                    return _LlmJsonCallResult(raw=raw, finish_reason=finish_reason)
            except RuntimeError as exc:
                last_exc = exc
                salvaged = salvage_text_from_llama_server_error(str(exc))
                if salvaged:
                    logger.warning(
                        "EWRP LLM: recovered JSON-bearing text from HTTP error (len=%s)",
                        len(salvaged),
                    )
                    return _LlmJsonCallResult(raw=salvaged, finish_reason="recovered_from_error")
        if last_exc is not None:
            raise last_exc
        msg = "Empty LLM response for structured JSON"
        raise RuntimeError(msg)

    async def _call_llm_for_json(
        self,
        session: aiohttp.ClientSession,
        *,
        prompt: str,
        model_name: str,
        options: dict[str, Any],
        timeout: aiohttp.ClientTimeout,
    ) -> str:
        result = await self._call_llm_for_json_with_meta(
            session,
            prompt=prompt,
            model_name=model_name,
            options=options,
            timeout=timeout,
        )
        return result.raw

    async def _call_llm_for_json_retry_on_length(
        self,
        session: aiohttp.ClientSession,
        *,
        prompt: str,
        model_name: str,
        options: dict[str, Any],
        timeout: aiohttp.ClientTimeout,
        max_predict_cap: int,
    ) -> _LlmJsonCallResult:
        """Call LLM once; on ``finish_reason=length`` retry with a higher num_predict (capped)."""
        first = await self._call_llm_for_json_with_meta(
            session,
            prompt=prompt,
            model_name=model_name,
            options=options,
            timeout=timeout,
        )
        if first.finish_reason != "length":
            return first
        current = int(options.get("num_predict") or 2048)
        boosted = min(max_predict_cap, max(current + 1024, int(current * 1.75)))
        if boosted <= current:
            return first
        logger.warning(
            "EWRP LLM response truncated (finish_reason=length); retrying with num_predict=%s (was %s)",
            boosted,
            current,
        )
        retry_opts = dict(options)
        retry_opts["num_predict"] = boosted
        return await self._call_llm_for_json_with_meta(
            session,
            prompt=prompt,
            model_name=model_name,
            options=retry_opts,
            timeout=timeout,
        )

    async def generate_presentation_slides(
        self,
        config: PresentationGenerationConfig,
        model: str | None = None,
    ) -> PresentationSlidesGenerationResult:
        """
        Generate structured slides as JSON using Llama.

        Preferred path (two-phase, PRESENT-style):
        1) Generate outline as a pure JSON array of OutlineSlide objects.
        2) For each outline slide, generate a single SlideJson object with full content.

        Fallback path:
        - Use legacy monolithic JSON generation (single request with all slides)
          and parse it via _parse_slides_from_response.

        Returns:
            list[dict[str, Any]]: normalized slide dictionaries (SlideJson dumped with aliases).
        """
        model_name = model or self.default_model

        try:
            logger.info(
                "Generating structured JSON slides (two-phase): topic='%s', slides=%s, type=%s, model=%s",
                config.topic,
                config.slide_count,
                config.type_key,
                model_name,
            )
            outline = await self._generate_outline(config, model_name)
            if not outline:
                msg = "Empty outline from model"
                raise RuntimeError(msg)

            slides: list[SlideJson] = []
            for outline_slide in outline:
                try:
                    slide = await self._generate_slide_content(
                        outline_slide=outline_slide,
                        outline=outline,
                        config=config,
                        model_name=model_name,
                    )
                    slides.append(slide)
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "Failed to generate content for slide %s: %s",
                        outline_slide.slide_number,
                        exc,
                    )

            if not slides:
                msg = "No slides generated in two-phase mode"
                raise RuntimeError(msg)

            # Normalize slide count: sort by slide_number, then trim/pad
            slides_sorted = sorted(slides, key=lambda s: s.slide_number)
            if len(slides_sorted) > config.slide_count:
                slides_sorted = slides_sorted[: config.slide_count]
            elif len(slides_sorted) < config.slide_count:
                logger.info(
                    "Two-phase generation produced %s slides, retrying missing from outline (%s total)",
                    len(slides_sorted),
                    config.slide_count,
                )
                have = {s.slide_number for s in slides_sorted}
                async with aiohttp.ClientSession() as pad_session:
                    for outline_slide in outline:
                        if len(slides_sorted) >= config.slide_count:
                            break
                        if outline_slide.slide_number in have:
                            continue
                        try:
                            slides_sorted.append(
                                await self._generate_slide_content(
                                    outline_slide=outline_slide,
                                    outline=outline,
                                    config=config,
                                    model_name=model_name,
                                    session=pad_session,
                                )
                            )
                            have.add(outline_slide.slide_number)
                        except Exception as exc:  # noqa: BLE001
                            logger.warning(
                                "EWRP pad slide %s failed: %s; using outline notes",
                                outline_slide.slide_number,
                                exc,
                            )
                            slides_sorted.append(self._slide_from_outline_only(outline_slide, config))
                            have.add(outline_slide.slide_number)
                slides_sorted = sorted(slides_sorted, key=lambda s: s.slide_number)[: config.slide_count]

            logger.info("Structured JSON presentation generated (two-phase): %s slides", len(slides_sorted))
            out = [slide.model_dump(by_alias=True) for slide in slides_sorted]
            for slide in out:
                slide["content_source"] = EWRP_CONTENT_SOURCE_TWO_PHASE
            if _ewrp_llama_debug_enabled():
                for idx, s in enumerate(out):
                    logger.info(
                        "[EWRP LLAMA] final slide[%s]: title=%r, content=%s, keys=%s",
                        idx,
                        s.get("title"),
                        s.get("content"),
                        list(s.keys()),
                    )
            return PresentationSlidesGenerationResult(
                slides=out,
                content_source=EWRP_CONTENT_SOURCE_TWO_PHASE,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Two-phase JSON slide generation failed, falling back to monolithic mode: %s",
                exc,
            )
            return await self._generate_slides_monolithic(config, model_name)

    # ---------------------------------------------------------------------
    # Prompt building (adapted from PRESENT/presentationPrompts.ts)
    # ---------------------------------------------------------------------

    def _build_prompt(self, config: PresentationGenerationConfig) -> str:
        """Build system + task prompt based on presentation type."""
        system_context = self._system_context()

        # Default to educational style when not pitch_deck
        body = self._pitch_deck_body(config) if config.type_key == "pitch_deck" else self._educational_body(config)

        return f"{system_context}\n\n{body}"

    @staticmethod
    def _system_context() -> str:
        """Premium Russian system context (shortened version of SYSTEM_CONTEXT)."""
        return """
🔥 ТЫ — ЭЛИТНЫЙ ДИЗАЙНЕР ПРЕЗЕНТАЦИЙ МИРОВОГО КЛАССА

КРИТИЧЕСКИЕ ПРАВИЛА:
- ВЕСЬ контент (title, content, speakerNotes) ТОЛЬКО на РУССКОМ языке.
- ИСКЛЮЧЕНИЕ: поле imagePrompt ВСЕГДА на АНГЛИЙСКОМ для AI генерации изображений.
- Заголовки: 3–7 слов, мощные и конкретные.
- Пункты: 8–15 слов, без воды, с цифрами и фактами где возможно.
- Никаких случайных символов, U+FFFD replacement characters, mojibake или нечитаемых строк.

СТИЛЬ ИЗОБРАЖЕНИЙ (imagePrompt на английском):
- premium, ultra high quality, 8k resolution
- cinematic lighting, professional photography
- minimalist, modern, clean design
- no text, no watermarks, no logos
""".strip()

    @staticmethod
    def _educational_body(config: PresentationGenerationConfig) -> str:
        audience = config.audience or "студенты"
        tone = config.tone or "casual"
        tone_rus = (
            "дружелюбный и понятный"
            if tone == "casual"
            else "технический и глубокий"
            if tone == "technical"
            else "профессиональный"
        )
        additional = f"КОНТЕКСТ: {config.additional_context}" if config.additional_context else ""

        return f"""
Создай ПРЕМИУМ образовательную презентацию на тему \"{config.topic}\" для аудитории: {audience}.

ТРЕБОВАНИЯ:
- Ровно {config.slide_count} слайдов
- Тон: {tone_rus}
- Язык: ТОЛЬКО РУССКИЙ (кроме imagePrompt)
- Стиль: TED Talk + университетская лекция
{additional}

ФОРМАТ ОДНОГО СЛАЙДА (JSON):
{{
  "slideNumber": number,
  "type": "title" | "content" | "image" | "quote",
  "title": "Заголовок на русском",
  "content": ["Пункт 1", "Пункт 2", "Пункт 3"],
  "speakerNotes": "Заметки преподавателя на русском",
  "imagePrompt": "Detailed English description for AI image generation, premium, 8k, no text"
}}

ВЫВОД:
- Ответ: {{"slides": [ ... ]}}
""".strip()

    @staticmethod
    def _pitch_deck_body(config: PresentationGenerationConfig) -> str:
        audience = config.audience or "инвесторы"
        additional = f"КОНТЕКСТ: {config.additional_context}" if config.additional_context else ""

        return f"""
Создай ПРЕМИУМ pitch deck на тему \"{config.topic}\" для аудитории: {audience}.

ТРЕБОВАНИЯ:
- Ровно {config.slide_count} слайдов.
- Язык: ТОЛЬКО РУССКИЙ для title/content/speakerNotes, imagePrompt на АНГЛИЙСКОМ.

ФОРМАТ:
{{
  "slides": [
    {{
      "slideNumber": 1,
      "type": "title",
      "title": "Заголовок на русском",
      "content": ["Слоган 1", "Слоган 2"],
      "speakerNotes": "Детальные заметки спикера на русском",
      "imagePrompt": "Futuristic abstract logo design, premium 3D render, 8k, no text"
    }}
  ]
}}

{additional}

Ответ: {{"slides": [ ... ]}}
""".strip()

    # ---------------------------------------------------------------------
    # Outline and slide helpers (two-phase generation)
    # ---------------------------------------------------------------------

    async def _generate_outline(
        self,
        config: PresentationGenerationConfig,
        model_name: str,
    ) -> list[OutlineSlide]:
        """Generate high-level outline as a pure JSON array of OutlineSlide objects."""
        audience = config.audience or "аудитория"
        additional = f"КОНТЕКСТ: {config.additional_context}" if config.additional_context else ""
        system_context = self._system_context()
        prompt = f"""
{system_context}

Сначала спланируй СТРУКТУРУ презентации на тему \"{config.topic}\" для аудитории: {audience}.

ТВОЯ ЗАДАЧА НА ЭТОМ ЭТАПЕ:
- Сформировать список слайдов (outline) длиной ровно {config.slide_count}.
- Для каждого слайда указать:
  - "slideNumber": порядковый номер с 1.
  - "type": "title" | "section" | "content" | "image" | "quote" | "code".
  - "title": короткий заголовок (3–7 слов, на русском).
  - "section": опциональное название раздела (на русском).
  - "notes": короткие плановые заметки (1–2 предложения, на русском).

{additional}

ФОРМАТ ВЫВОДА:
- JSON-массив слайдов (или объект с ключом "slides").
Пример:
[
  {{
    "slideNumber": 1,
    "type": "title",
    "title": "Введение в тему",
    "section": "Введение",
    "notes": "Кратко представить тему и цель презентации."
  }},
  {{
    "slideNumber": 2,
    "type": "content",
    "title": "Ключевые понятия",
    "section": "Базовые понятия",
    "notes": "Дать определения основным терминам."
  }}
]
""".strip()

        outline_timeout = float(unified_settings.ewrp_llama_outline_timeout_sec)
        outline_predict = ewrp_outline_num_predict(config.slide_count)
        async with aiohttp.ClientSession() as session:
            llm_result = await self._call_llm_for_json_retry_on_length(
                session,
                prompt=prompt,
                model_name=model_name,
                options={"temperature": config.outline_temperature, "top_p": 0.9, "num_predict": outline_predict},
                timeout=aiohttp.ClientTimeout(total=outline_timeout),
                max_predict_cap=8192,
            )
            raw = llm_result.raw

        if _ewrp_llama_debug_enabled():
            logger.info(
                "[EWRP LLAMA] outline response raw_len=%s, raw_preview=%s",
                len(raw),
                (raw[:400] + "..." if len(raw) > 400 else raw) if raw else "(empty)",
            )
        if not raw or not raw.strip():
            logger.warning("EWRP outline LLM response is empty")
        parsed = self._parse_outline_from_response(raw, config)
        if _ewrp_llama_debug_enabled():
            logger.info(
                "[EWRP LLAMA] outline parsed: count=%s, titles=%s",
                len(parsed),
                [getattr(o, "title", str(o)) for o in parsed],
            )
        return parsed

    @staticmethod
    def _slide_from_outline_only(
        outline_slide: OutlineSlide,
        config: PresentationGenerationConfig,
    ) -> SlideJson:
        """Minimal slide from outline when per-slide LLM/JSON fails (no user-facing placeholder strings)."""
        bullets: list[str] = []
        if outline_slide.notes and outline_slide.notes.strip():
            bullets.append(outline_slide.notes.strip())
        elif outline_slide.section and outline_slide.section.strip():
            bullets.append(outline_slide.section.strip())
        else:
            bullets.append(f"Развитие темы «{config.topic}».")
        return SlideJson(
            slideNumber=outline_slide.slide_number,
            type=outline_slide.kind.value,
            title=outline_slide.title,
            content=bullets,
            speakerNotes=outline_slide.notes or "",
        )

    async def _generate_slide_content(
        self,
        outline_slide: OutlineSlide,
        outline: list[OutlineSlide],
        config: PresentationGenerationConfig,
        model_name: str,
        session: aiohttp.ClientSession | None = None,
    ) -> SlideJson:
        """Generate full SlideJson for a single outline element."""
        system_context = self._system_context()
        outline_summary_lines: list[str] = []
        for item in outline:
            prefix = f"{item.slide_number}. [{item.kind.value}] "
            outline_summary_lines.append(f"{prefix}{item.title}")
        outline_summary = "\n".join(outline_summary_lines)

        additional = f"\nКОНТЕКСТ ПРЕЗЕНТАЦИИ:\n{config.additional_context}" if config.additional_context else ""

        prompt = f"""
{system_context}

Сейчас ты создаёшь ПОЛНЫЙ КОНТЕНТ для конкретного слайда презентации.

ОБЩАЯ ТЕМА: \"{config.topic}\"
OUTLINE ВСЕЙ ПРЕЗЕНТАЦИИ (для контекста):
{outline_summary}

ТЕКУЩИЙ СЛАЙД:
- Номер: {outline_slide.slide_number}
- Тип: {outline_slide.kind.value}
- Заголовок: {outline_slide.title}
- Раздел: {outline_slide.section or "—"}
- Плановые заметки: {outline_slide.notes or "—"}
{additional}

ТРЕБОВАНИЯ К КОНТЕНТУ:
- Заголовок оставь близким к заданному, можно слегка улучшить формулировку.
- Сгенерируй 3–7 буллетов (массив "content"), каждый 8–15 слов, без воды.
- Все буллеты И ЗАМЕТКИ только на РУССКОМ языке.
- Никаких случайных символов, U+FFFD replacement characters, mojibake или нечитаемых строк.
- Если тип слайда "image" — сделай упор на визуальные идеи.
- Поле "speakerNotes" — 2–4 предложения на русском, поясняющие, что рассказывать.
- Поле "imagePrompt" — ТОЛЬКО НА АНГЛИЙСКОМ: короткая сцена (свет, стиль, объекты). Без транслитерации русских слов латиницей, без «Слайд N», без префикса "concept:".

ФОРМАТ ВЫВОДА:
- Один JSON-объект слайда.
Пример:
{{
  "slideNumber": {outline_slide.slide_number},
  "type": "{outline_slide.kind.value}",
  "title": "Улучшенный заголовок слайда",
  "content": ["Пункт 1", "Пункт 2", "Пункт 3"],
  "speakerNotes": "Развёрнутые заметки спикера.",
  "imagePrompt": "Ultra detailed illustration, premium, 8k, no text"
}}
""".strip()

        slide_timeout = float(unified_settings.ewrp_llama_slide_timeout_sec)
        owns_session = session is None
        if owns_session:
            session = aiohttp.ClientSession()
        assert session is not None
        try:
            raw = await self._call_llm_for_json(
                session,
                prompt=prompt,
                model_name=model_name,
                options={
                    "temperature": config.slide_content_temperature,
                    "top_p": 0.9,
                    "num_predict": 2048,
                },
                timeout=aiohttp.ClientTimeout(total=slide_timeout),
            )
        finally:
            if owns_session:
                await session.close()

        if _ewrp_llama_debug_enabled():
            logger.info(
                "[EWRP LLAMA] slide %s response: raw_len=%s, raw_preview=%s",
                outline_slide.slide_number,
                len(raw),
                (raw[:350] + "..." if len(raw) > 350 else raw) if raw else "(empty)",
            )
        if not raw or not raw.strip():
            logger.warning(
                "EWRP slide %s LLM response is empty",
                outline_slide.slide_number,
            )

        try:
            data = extract_llm_json_payload(raw)
        except ValueError as exc:
            logger.warning(
                "Failed to parse JSON for slide %s: %s",
                outline_slide.slide_number,
                exc,
            )
            return self._slide_from_outline_only(outline_slide, config)

        # Llama often returns only the content array ["bullet1", "bullet2", ...]
        if isinstance(data, list) and data and isinstance(data[0], str):
            raw_slide = {
                "slideNumber": outline_slide.slide_number,
                "type": outline_slide.kind.value,
                "title": outline_slide.title,
                "content": data,
            }
        elif isinstance(data, list):
            raw_slide = data[0] if data else {}
        else:
            raw_slide = data

        if not isinstance(raw_slide, dict):
            raw_slide = {}

        raw_slide.setdefault("slideNumber", outline_slide.slide_number)
        raw_slide.setdefault("type", outline_slide.kind.value)
        raw_slide.setdefault("title", outline_slide.title)
        raw_slide.setdefault("content", raw_slide.get("content") or [])

        validated = SlideJson.model_validate(raw_slide)
        bullets = getattr(validated, "bullets", []) or getattr(validated, "content", [])
        if _ewrp_llama_debug_enabled():
            logger.info(
                "[EWRP LLAMA] slide %s parsed: title=%r, bullets_len=%s, bullets_preview=%s",
                outline_slide.slide_number,
                validated.title,
                len(bullets),
                (bullets[:3] if len(bullets) > 3 else bullets),
            )
        return validated

    def _parse_outline_from_response(
        self,
        raw_response: str,
        config: PresentationGenerationConfig,
    ) -> list[OutlineSlide]:
        """Parse OutlineSlide list from LLM response."""
        items = extract_slides_list_from_llm(raw_response)
        if items is None:
            try:
                extract_llm_json_payload(raw_response)
            except ValueError as exc:
                logger.warning(
                    "Failed to parse JSON outline for topic '%s': %s.",
                    config.topic,
                    exc,
                )
            else:
                logger.warning(
                    "Parsed outline structure is not a list for topic '%s'.",
                    config.topic,
                )
            fallback_outline: list[OutlineSlide] = []
            for i in range(1, config.slide_count + 1):
                fallback_outline.append(
                    OutlineSlide(
                        slideNumber=i,
                        type=SlideKind.TITLE.value if i == 1 else SlideKind.CONTENT.value,
                        title=f"Слайд {i}: {config.topic}",
                    )
                )
            return fallback_outline

        outline: list[OutlineSlide] = []
        for idx, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            raw_item = dict(item)
            raw_item.setdefault("slideNumber", raw_item.get("slideNumber") or idx)
            raw_item.setdefault("type", raw_item.get("type") or SlideKind.CONTENT.value)
            raw_item.setdefault("title", raw_item.get("title") or f"Слайд {idx}: {config.topic}")
            try:
                outline.append(OutlineSlide.model_validate(raw_item))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Skipping invalid outline slide %s: %s", idx, exc)

        if len(outline) > config.slide_count:
            outline = outline[: config.slide_count]
        elif len(outline) < config.slide_count:
            for i in range(len(outline) + 1, config.slide_count + 1):
                outline.append(
                    OutlineSlide(
                        slideNumber=i,
                        type=SlideKind.CONTENT.value,
                        title=f"Слайд {i}: {config.topic}",
                    )
                )

        return outline

    # ---------------------------------------------------------------------
    # Response parsing / normalization
    # ---------------------------------------------------------------------

    def _parse_slides_from_response(
        self,
        raw_response: str,
        config: PresentationGenerationConfig,
    ) -> tuple[list[dict[str, Any]], bool]:
        """Extract and normalize slides from LLM response. Second value: True when template fallback used."""
        items = extract_slides_list_from_llm(raw_response)
        if items is None:
            try:
                extract_llm_json_payload(raw_response)
            except ValueError as exc:
                logger.warning(
                    "Failed to parse JSON slides for topic '%s': %s. Using fallback slides.",
                    config.topic,
                    exc,
                )
            else:
                logger.warning(
                    "Parsed slides structure is not a list for topic '%s'. Using fallback.",
                    config.topic,
                )
            return self._fallback_slides(config), True

        slides_raw = items

        normalized_models: list[SlideJson] = []
        for idx, slide in enumerate(slides_raw, start=1):
            if not isinstance(slide, dict):
                continue
            raw_slide = dict(slide)
            raw_slide.setdefault("slideNumber", raw_slide.get("slideNumber") or idx)
            raw_slide.setdefault("type", raw_slide.get("type") or SlideKind.CONTENT.value)
            raw_slide.setdefault("title", raw_slide.get("title") or f"Слайд {idx}: {config.topic}")
            raw_slide.setdefault("content", raw_slide.get("content") or [])
            try:
                normalized_models.append(SlideJson.model_validate(raw_slide))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Skipping invalid slide %s: %s", idx, exc)

        if not normalized_models:
            return self._fallback_slides(config), True

        # Ensure slide count roughly matches requested count
        if len(normalized_models) > config.slide_count:
            normalized_models = normalized_models[: config.slide_count]
        elif len(normalized_models) < config.slide_count:
            for i in range(len(normalized_models), config.slide_count):
                slide_number = i + 1
                fallback_dict = {
                    "slideNumber": slide_number,
                    "type": SlideKind.CONTENT.value,
                    "title": f"Слайд {slide_number}: {config.topic}",
                    "content": ["Автоматически добавленный слайд."],
                    "speakerNotes": "",
                    "imagePrompt": None,
                }
                try:
                    normalized_models.append(SlideJson.model_validate(fallback_dict))
                except Exception as exc:
                    logger.debug(
                        "[STEP] presentation_slide_fallback_validate_skip slide=%s err=%s",
                        slide_number,
                        exc,
                    )
                    continue

        dumped = [model.model_dump(by_alias=True) for model in normalized_models]
        for slide in dumped:
            slide["content_source"] = EWRP_CONTENT_SOURCE_MONOLITHIC
        return dumped, False

    async def _generate_slides_monolithic(
        self,
        config: PresentationGenerationConfig,
        model_name: str,
    ) -> PresentationSlidesGenerationResult:
        """Legacy single-request JSON generation; kept as a fallback path."""
        prompt = self._build_prompt(config)

        logger.info(
            "Generating structured JSON presentation (monolithic): topic='%s', slides=%s, type=%s, model=%s",
            config.topic,
            config.slide_count,
            config.type_key,
            model_name,
        )

        slide_timeout = float(unified_settings.ewrp_llama_slide_timeout_sec)
        mono_predict = ewrp_monolithic_num_predict(config.slide_count)
        async with aiohttp.ClientSession() as session:
            llm_result = await self._call_llm_for_json_retry_on_length(
                session,
                prompt=prompt,
                model_name=model_name,
                options={"temperature": 0.7, "top_p": 0.9, "num_predict": mono_predict},
                timeout=aiohttp.ClientTimeout(total=slide_timeout),
                max_predict_cap=16384,
            )
            raw = llm_result.raw

        slides, used_template_fallback = self._parse_slides_from_response(raw, config)
        content_source = (
            EWRP_CONTENT_SOURCE_TEMPLATE_FALLBACK if used_template_fallback else EWRP_CONTENT_SOURCE_MONOLITHIC
        )
        logger.info(
            "Structured JSON presentation generated (monolithic): %s slides source=%s",
            len(slides),
            content_source,
        )
        return PresentationSlidesGenerationResult(slides=slides, content_source=content_source)

    @staticmethod
    def _fallback_slides(config: PresentationGenerationConfig) -> list[dict[str, Any]]:
        """Last-resort slides when monolithic JSON parsing fails (topic-based bullets, not placeholders)."""
        bullet_a, bullet_b = ewrp_template_fallback_bullets(config.topic)
        slides: list[dict[str, Any]] = []
        for i in range(1, config.slide_count + 1):
            slides.append(
                {
                    "slideNumber": i,
                    "type": "content" if i > 1 else "title",
                    "title": f"Слайд {i}: {config.topic}",
                    "content": [bullet_a, bullet_b],
                    "speakerNotes": "",
                    "imagePrompt": None,
                    "content_source": EWRP_CONTENT_SOURCE_TEMPLATE_FALLBACK,
                }
            )
        return slides
