# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# EWRP landing-style HTML template: one 100vh section per slide for Playwright PDF capture.
# Invariants:
# - Fonts are self-hosted (relative fonts/); never fonts.googleapis.com at runtime.
# Related:
# - api/services/ewrp_font_assets.py
# - api/services/ewrp_service.py
# ---
"""
EWRP — landing-style HTML template for revolutionary presentations.

One section per slide (100vh), viewport 1920×1080 for consistent PDF.
Design: CSS variables, Cormorant Garamond + Inter, dark gradient backgrounds,
two-column layout when image, hero vs content image sizes.
"""

import re
from typing import Any

from api.services.ewrp_font_assets import ewrp_font_face_css
from api.services.ewrp_slide_bullets import normalize_ewrp_slide_bullets


def _strip_slide_number_prefix(title: str) -> str:
    """Remove leading 'Слайд N:' or 'Слайд N :' so titles show content only."""
    if not title:
        return title
    return re.sub(r"^\s*Слайд\s*\d+\s*:\s*", "", title, flags=re.IGNORECASE).strip()


def _escape_html(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


_EWRP_LAYOUT_KEYS = frozenset(
    {
        "default",
        "section",
        "steps",
        "closing",
        "quote",
        "kpi",
        "fullbleed",
        "statement",
        "split",
        "grid",
    }
)

# Визуальные темы итогового PDF (фон, акценты) — не путать с раскладкой буллетов (layout).
PRESENTATION_THEME_IDS = frozenset(
    {
        "classic",
        "midnight",
        "ember",
        "aurora",
        "paper",
        "editorial",
        "brutal",
        "noir",
        "linen",
    }
)

_THEME_LLM_HINTS: dict[str, str] = {
    "classic": (
        "Визуальный стиль итоговой презентации (PDF): тёмный фон, бирюзовый акцент, современный деловой вид. "
        "Структура слайдов — как у корпоративного доклада: ясные заголовки, 3–6 коротких буллетов на слайде."
    ),
    "midnight": (
        "Визуальный стиль PDF: глубокий «ночной» сине-фиолетовый фон, холодные акценты. "
        "Тон текста — сдержанный, профессиональный; избегай пустых лозунгов."
    ),
    "ember": (
        "Визуальный стиль PDF: тёплые закатные акценты (янтарь, коралл) на тёмном фоне. "
        "Допустима чуть более живая подача в буллетах, но факты и логика структуры важнее эмоции."
    ),
    "aurora": (
        "Визуальный стиль PDF: изумрудно-бирюзовые акценты, «северное сияние». "
        "Можно яркие формулировки в пунктах, сохраняй связность с темой."
    ),
    "paper": (
        "Визуальный стиль PDF: светлый фон, тёмный текст (читабельность как на бумаге). "
        "Формулировки контрастные, без бледных общих фраз; буллеты короткие."
    ),
    "editorial": (
        "Визуальный стиль PDF: редакционный журнальный вид — крупные заголовки, воздух, сдержанная элегантность. "
        "Тон текста уверенный, без канцелярита; абзацы и буллеты лаконичны."
    ),
    "brutal": (
        "Визуальный стиль PDF: техно-брутал — контраст, моноширинные акценты, прямые линии. "
        "Формулировки короткие, ударные; без украшательств и «маркетинговой воды»."
    ),
    "noir": (
        "Визуальный стиль PDF: киношный нуар — почти чёрный фон, золотистый акцент, минимум бликов. "
        "Текст сдержанный, драматичные формулировки только если уместны факты."
    ),
    "linen": (
        "Визуальный стиль PDF: тёплый светлый фон «льняная бумага», тёмно-коричневый текст, спокойный деловой тон. "
        "Буллеты короткие; читабельность важнее эффекта."
    ),
}

# Доп. CSS после базовых правил: переопределяет фон и переменные для body.ewrp-theme-* .
_PRESENTATION_THEME_EXTRA: dict[str, str] = {
    "midnight": """
    body.ewrp-theme-midnight {
      --ewrp-bg-base: #020617;
      --ewrp-bg-slate: #0f172a;
      --ewrp-accent: #a5b4fc;
      --ewrp-accent-dim: #6366f1;
      --ewrp-text: #f1f5f9;
      --ewrp-text-secondary: #cbd5e1;
      --ewrp-text-muted: #94a3b8;
    }
    body.ewrp-theme-midnight {
      background: radial-gradient(circle at top, rgba(30, 27, 75, 0.95) 0%, var(--ewrp-bg-base) 55%, #020617 100%);
    }
    body.ewrp-theme-midnight .ewrp-slide {
      background: radial-gradient(circle at top left, rgba(79, 70, 229, 0.22), transparent 55%),
                  radial-gradient(circle at bottom right, rgba(99, 102, 241, 0.2), transparent 58%),
                  linear-gradient(160deg, #0f172a 0%, #020617 40%, #020617 100%);
    }
    body.ewrp-theme-midnight .ewrp-slide::before {
      background: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(129, 140, 248, 0.18), transparent 50%);
    }
    body.ewrp-theme-midnight .ewrp-slide-first {
      background: radial-gradient(circle at top, rgba(129, 140, 248, 0.22), transparent 55%),
                  radial-gradient(circle at bottom, rgba(30, 27, 75, 0.95), #0f172a),
                  linear-gradient(165deg, #020617 0%, #4f46e5 28%, #312e81 58%, #020617 100%);
    }
    body.ewrp-theme-midnight .ewrp-slide-first::before {
      background: radial-gradient(ellipse 70% 60% at 50% 30%, rgba(165, 180, 252, 0.28), transparent 58%);
    }
    """,
    "ember": """
    body.ewrp-theme-ember {
      --ewrp-bg-base: #1c0a0a;
      --ewrp-bg-slate: #292018;
      --ewrp-accent: #fb923c;
      --ewrp-accent-dim: #ea580c;
      --ewrp-text: #fff7ed;
      --ewrp-text-secondary: #fed7aa;
      --ewrp-text-muted: #fdba74;
    }
    body.ewrp-theme-ember {
      background: radial-gradient(circle at top, rgba(127, 29, 29, 0.5) 0%, var(--ewrp-bg-base) 52%, #0c0a09 100%);
    }
    body.ewrp-theme-ember .ewrp-slide {
      background: radial-gradient(circle at top left, rgba(234, 88, 12, 0.2), transparent 55%),
                  radial-gradient(circle at bottom right, rgba(185, 28, 28, 0.18), transparent 58%),
                  linear-gradient(160deg, #292018 0%, #1c0a0a 38%, #0c0a09 100%);
    }
    body.ewrp-theme-ember .ewrp-slide::before {
      background: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(251, 146, 60, 0.2), transparent 50%);
    }
    body.ewrp-theme-ember .ewrp-slide-first {
      background: radial-gradient(circle at top, rgba(251, 146, 60, 0.25), transparent 55%),
                  radial-gradient(circle at bottom, rgba(69, 10, 10, 0.92), #1c0a0a),
                  linear-gradient(165deg, #0c0a09 0%, #c2410c 30%, #9a3412 55%, #1c0a0a 100%);
    }
    body.ewrp-theme-ember .ewrp-slide-first::before {
      background: radial-gradient(ellipse 70% 60% at 50% 30%, rgba(253, 186, 116, 0.3), transparent 58%);
    }
    """,
    "aurora": """
    body.ewrp-theme-aurora {
      --ewrp-bg-base: #022c22;
      --ewrp-bg-slate: #064e3b;
      --ewrp-accent: #2dd4bf;
      --ewrp-accent-dim: #14b8a6;
      --ewrp-text: #ecfdf5;
      --ewrp-text-secondary: #a7f3d0;
      --ewrp-text-muted: #6ee7b7;
    }
    body.ewrp-theme-aurora {
      background: radial-gradient(circle at top, rgba(6, 78, 59, 0.95) 0%, var(--ewrp-bg-base) 52%, #022c22 100%);
    }
    body.ewrp-theme-aurora .ewrp-slide {
      background: radial-gradient(circle at top left, rgba(45, 212, 191, 0.18), transparent 55%),
                  radial-gradient(circle at bottom right, rgba(52, 211, 153, 0.16), transparent 58%),
                  linear-gradient(160deg, #064e3b 0%, #022c22 38%, #022c22 100%);
    }
    body.ewrp-theme-aurora .ewrp-slide::before {
      background: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(45, 212, 191, 0.22), transparent 50%);
    }
    body.ewrp-theme-aurora .ewrp-slide-first {
      background: radial-gradient(circle at top, rgba(52, 211, 153, 0.28), transparent 55%),
                  radial-gradient(circle at bottom, rgba(6, 78, 59, 0.95), #022c22),
                  linear-gradient(165deg, #022c22 0%, #0d9488 28%, #047857 55%, #022c22 100%);
    }
    body.ewrp-theme-aurora .ewrp-slide-first::before {
      background: radial-gradient(ellipse 70% 60% at 50% 30%, rgba(110, 231, 183, 0.32), transparent 58%);
    }
    """,
    "paper": """
    body.ewrp-theme-paper {
      --ewrp-bg-base: #f1f5f9;
      --ewrp-bg-slate: #e2e8f0;
      --ewrp-accent: #0d9488;
      --ewrp-accent-dim: #0f766e;
      --ewrp-text: #0f172a;
      --ewrp-text-secondary: #334155;
      --ewrp-text-muted: #64748b;
      --ewrp-brand-footer: rgba(51, 65, 85, 0.55);
    }
    body.ewrp-theme-paper {
      background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
      color: var(--ewrp-text-secondary);
    }
    body.ewrp-theme-paper .ewrp-slide {
      background: linear-gradient(165deg, #ffffff 0%, #f1f5f9 45%, #e2e8f0 100%);
      border-bottom: 1px solid rgba(15, 23, 42, 0.08);
    }
    body.ewrp-theme-paper .ewrp-slide::before {
      background: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(13, 148, 136, 0.12), transparent 50%);
    }
    body.ewrp-theme-paper .ewrp-slide::after {
      opacity: 0.06;
      background-image:
        linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(15,23,42,0.05) 1px, transparent 1px);
    }
    body.ewrp-theme-paper .ewrp-slide-first {
      background: radial-gradient(circle at top, rgba(13, 148, 136, 0.15), transparent 55%),
                  linear-gradient(165deg, #f8fafc 0%, #ccfbf1 35%, #f1f5f9 100%);
    }
    body.ewrp-theme-paper .ewrp-slide-first::before {
      background: radial-gradient(ellipse 70% 60% at 50% 30%, rgba(13, 148, 136, 0.18), transparent 58%);
    }
    body.ewrp-theme-paper .ewrp-slide-header {
      color: rgba(51, 65, 85, 0.75);
    }
    body.ewrp-theme-paper .ewrp-slide-statement-body {
      color: #1e293b;
    }
    body.ewrp-theme-paper .ewrp-slide-split-card,
    body.ewrp-theme-paper .ewrp-slide-grid-card,
    body.ewrp-theme-paper .ewrp-slide-kpi-item {
      background: rgba(255,255,255,0.85);
      border-color: rgba(15, 23, 42, 0.1);
    }
    body.ewrp-theme-paper .ewrp-glass {
      background: rgba(255, 255, 255, 0.88);
      border-color: rgba(15, 23, 42, 0.12);
      color: #1e293b;
    }
    body.ewrp-theme-paper .ewrp-slide-steps-list li::before {
      color: #042f2e;
    }
    """,
    "editorial": """
    body.ewrp-theme-editorial {
      --ewrp-bg-base: #141214;
      --ewrp-bg-slate: #1c1917;
      --ewrp-accent: #be123c;
      --ewrp-accent-dim: #9f1239;
      --ewrp-text: #faf7f5;
      --ewrp-text-secondary: #e7e2dd;
      --ewrp-text-muted: #a8a29e;
      --ewrp-pad-x: 88px;
      --ewrp-pad-y: 64px;
    }
    body.ewrp-theme-editorial {
      background: radial-gradient(ellipse 120% 80% at 50% 0%, rgba(190, 18, 60, 0.08), transparent 50%),
                  linear-gradient(180deg, #0c0a09 0%, #141214 40%, #1c1917 100%);
    }
    body.ewrp-theme-editorial .ewrp-slide {
      background: linear-gradient(165deg, #1c1917 0%, #141214 50%, #0f0e0d 100%);
      border-bottom: 1px solid rgba(245, 240, 236, 0.06);
    }
    body.ewrp-theme-editorial .ewrp-slide::before {
      background: radial-gradient(ellipse 90% 45% at 50% -15%, rgba(190, 18, 60, 0.14), transparent 55%);
    }
    body.ewrp-theme-editorial .ewrp-slide::after {
      opacity: 0.05;
    }
    body.ewrp-theme-editorial .ewrp-slide-first {
      background: radial-gradient(ellipse 80% 55% at 50% 15%, rgba(190, 18, 60, 0.12), transparent 60%),
                  linear-gradient(168deg, #0c0a09 0%, #292524 42%, #1c1917 100%);
    }
    body.ewrp-theme-editorial .ewrp-slide-first::before {
      background: radial-gradient(ellipse 75% 50% at 50% 25%, rgba(250, 247, 245, 0.06), transparent 60%);
    }
    body.ewrp-theme-editorial .ewrp-slide-title {
      font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif;
      font-weight: 600;
      letter-spacing: 0.01em;
    }
    body.ewrp-theme-editorial .ewrp-slide-bullets,
    body.ewrp-theme-editorial .ewrp-slide-lead,
    body.ewrp-theme-editorial .ewrp-slide-subtitle {
      font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif;
    }
    body.ewrp-theme-editorial .ewrp-slide-quote-block {
      font-family: 'Playfair Display', Georgia, serif;
    }
    body.ewrp-theme-editorial .ewrp-slide-accent {
      width: 96px;
      height: 2px;
      background: linear-gradient(90deg, var(--ewrp-accent), rgba(190, 18, 60, 0.25));
      border-radius: 0;
    }
    body.ewrp-theme-editorial .ewrp-slide-progress-bar {
      background: linear-gradient(90deg, var(--ewrp-accent), rgba(190, 18, 60, 0.55));
    }
    body.ewrp-theme-editorial .ewrp-slide-bullets li::before {
      width: 3px;
      height: 0.95em;
      border-radius: 1px;
      top: 0.42em;
      background: linear-gradient(180deg, var(--ewrp-accent), var(--ewrp-accent-dim));
      box-shadow: none;
    }
    body.ewrp-theme-editorial .ewrp-slide-split-card,
    body.ewrp-theme-editorial .ewrp-slide-grid-card,
    body.ewrp-theme-editorial .ewrp-slide-kpi-item {
      background: rgba(255, 255, 255, 0.035);
      border-radius: 14px;
      border: 1px solid rgba(245, 240, 236, 0.08);
    }
    body.ewrp-theme-editorial .ewrp-slide-steps-list li::before {
      border-radius: 10px;
      background: linear-gradient(135deg, var(--ewrp-accent), var(--ewrp-accent-dim));
      color: #fff5f5;
    }
    body.ewrp-theme-editorial .ewrp-glass {
      background: rgba(20, 18, 20, 0.72);
      border: 1px solid rgba(245, 240, 236, 0.1);
    }
    body.ewrp-theme-editorial .ewrp-slide-fullbleed .ewrp-slide-image::after {
      background: radial-gradient(circle at 22% 18%, rgba(190, 18, 60, 0.18), transparent 52%),
                  linear-gradient(90deg, rgba(12, 10, 9, 0.88) 0%, rgba(12, 10, 9, 0.42) 58%, rgba(12, 10, 9, 0.82) 100%);
    }
    """,
    "brutal": """
    body.ewrp-theme-brutal {
      --ewrp-bg-base: #050505;
      --ewrp-bg-slate: #0a0a0a;
      --ewrp-accent: #a3e635;
      --ewrp-accent-dim: #84cc16;
      --ewrp-text: #fafafa;
      --ewrp-text-secondary: #d4d4d4;
      --ewrp-text-muted: #a3a3a3;
      --ewrp-pad-x: 64px;
    }
    body.ewrp-theme-brutal {
      background: #030303;
    }
    body.ewrp-theme-brutal .ewrp-slide {
      background: linear-gradient(90deg, rgba(163, 230, 53, 0.07) 0%, rgba(163, 230, 53, 0) 12%, #0a0a0a 12%, #0a0a0a 100%);
      border-bottom: 1px solid rgba(163, 230, 53, 0.12);
      border-radius: 0;
    }
    body.ewrp-theme-brutal .ewrp-slide::before {
      background: none;
    }
    body.ewrp-theme-brutal .ewrp-slide::after {
      opacity: 0.18;
      background-image:
        linear-gradient(rgba(163, 230, 53, 0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(163, 230, 53, 0.05) 1px, transparent 1px);
    }
    body.ewrp-theme-brutal .ewrp-slide-first {
      background: linear-gradient(90deg, rgba(163, 230, 53, 0.12) 0%, rgba(163, 230, 53, 0) 18%, #050505 18%, #050505 100%);
    }
    body.ewrp-theme-brutal .ewrp-slide-first::before {
      background: none;
    }
    body.ewrp-theme-brutal .ewrp-slide-title {
      font-family: 'IBM Plex Mono', ui-monospace, monospace;
      font-weight: 600;
      letter-spacing: -0.03em;
      text-transform: uppercase;
      font-size: clamp(1.5rem, 2.8vw, 2.15rem);
    }
    body.ewrp-theme-brutal .ewrp-slide-first .ewrp-slide-title {
      font-size: clamp(2.1rem, 4vw, 3.2rem);
    }
    body.ewrp-theme-brutal .ewrp-slide-bullets,
    body.ewrp-theme-brutal .ewrp-slide-lead,
    body.ewrp-theme-brutal .ewrp-slide-closing-lead,
    body.ewrp-theme-brutal .ewrp-slide-statement-body {
      font-family: 'IBM Plex Sans', 'Inter', system-ui, sans-serif;
    }
    body.ewrp-theme-brutal .ewrp-slide-accent {
      width: 72px;
      height: 4px;
      border-radius: 0;
      background: var(--ewrp-accent);
    }
    body.ewrp-theme-brutal .ewrp-slide-progress-bar {
      background: linear-gradient(90deg, var(--ewrp-accent), rgba(163, 230, 53, 0.5));
      border-radius: 0;
    }
    body.ewrp-theme-brutal .ewrp-slide-bullets li::before {
      width: 8px;
      height: 8px;
      border-radius: 0;
      background: var(--ewrp-accent);
      box-shadow: none;
    }
    body.ewrp-theme-brutal .ewrp-slide-image {
      border-radius: 4px;
      box-shadow: 0 0 0 2px rgba(163, 230, 53, 0.35), 0 20px 40px rgba(0, 0, 0, 0.6);
    }
    body.ewrp-theme-brutal .ewrp-slide-split-card,
    body.ewrp-theme-brutal .ewrp-slide-grid-card,
    body.ewrp-theme-brutal .ewrp-slide-kpi-item {
      border-radius: 4px;
      border: 2px solid rgba(163, 230, 53, 0.28);
      background: rgba(0, 0, 0, 0.45);
      box-shadow: none;
    }
    body.ewrp-theme-brutal .ewrp-slide-kpi-value {
      font-family: 'IBM Plex Mono', monospace;
    }
    body.ewrp-theme-brutal .ewrp-slide-steps-list li::before {
      border-radius: 2px;
      width: 38px;
      height: 38px;
      background: var(--ewrp-accent);
      color: #052e16;
      font-family: 'IBM Plex Mono', monospace;
    }
    body.ewrp-theme-brutal .ewrp-slide-quote-block {
      font-family: 'IBM Plex Mono', Georgia, serif;
      font-size: clamp(1.35rem, 2.6vw, 2.2rem);
      letter-spacing: -0.02em;
    }
    body.ewrp-theme-brutal .ewrp-glass {
      border-radius: 4px;
      border: 2px solid rgba(163, 230, 53, 0.25);
      background: rgba(5, 5, 5, 0.75);
      backdrop-filter: blur(8px);
    }
    body.ewrp-theme-brutal .ewrp-slide-fullbleed .ewrp-slide-image::after {
      background: linear-gradient(90deg, rgba(5, 5, 5, 0.9) 0%, rgba(5, 5, 5, 0.35) 55%, rgba(5, 5, 5, 0.85) 100%),
                  radial-gradient(circle at 15% 20%, rgba(163, 230, 53, 0.15), transparent 50%);
    }
    """,
    "noir": """
    body.ewrp-theme-noir {
      --ewrp-bg-base: #030303;
      --ewrp-bg-slate: #0a0a0a;
      --ewrp-accent: #d4af37;
      --ewrp-accent-dim: #a67c00;
      --ewrp-text: #f5f0e6;
      --ewrp-text-secondary: #d6d0c4;
      --ewrp-text-muted: #9c958a;
    }
    body.ewrp-theme-noir {
      background: radial-gradient(ellipse 100% 60% at 50% 0%, rgba(212, 175, 55, 0.06), transparent 45%),
                  #020202;
    }
    body.ewrp-theme-noir .ewrp-slide {
      background: linear-gradient(160deg, #0c0c0c 0%, #030303 55%, #020202 100%);
      border-bottom: 1px solid rgba(212, 175, 55, 0.08);
    }
    body.ewrp-theme-noir .ewrp-slide::before {
      background: radial-gradient(ellipse 85% 40% at 50% -10%, rgba(212, 175, 55, 0.09), transparent 55%);
    }
    body.ewrp-theme-noir .ewrp-slide::after {
      opacity: 0.035;
    }
    body.ewrp-theme-noir .ewrp-slide-first {
      background: radial-gradient(ellipse 70% 50% at 50% 20%, rgba(212, 175, 55, 0.1), transparent 55%),
                  linear-gradient(168deg, #000000 0%, #14100a 38%, #0a0a0a 100%);
    }
    body.ewrp-theme-noir .ewrp-slide-first::before {
      background: radial-gradient(ellipse 65% 45% at 50% 30%, rgba(212, 175, 55, 0.12), transparent 58%);
    }
    body.ewrp-theme-noir .ewrp-slide-title {
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    body.ewrp-theme-noir .ewrp-slide-accent {
      width: 48px;
      height: 2px;
      background: linear-gradient(90deg, var(--ewrp-accent), rgba(212, 175, 55, 0.35));
      border-radius: 1px;
    }
    body.ewrp-theme-noir .ewrp-slide-progress-bar {
      background: linear-gradient(90deg, var(--ewrp-accent), rgba(212, 175, 55, 0.45));
    }
    body.ewrp-theme-noir .ewrp-slide-bullets li::before {
      background: radial-gradient(circle, var(--ewrp-accent) 0%, var(--ewrp-accent-dim) 100%);
      box-shadow: 0 0 12px rgba(212, 175, 55, 0.25);
    }
    body.ewrp-theme-noir .ewrp-slide-split-card,
    body.ewrp-theme-noir .ewrp-slide-grid-card,
    body.ewrp-theme-noir .ewrp-slide-kpi-item {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(212, 175, 55, 0.12);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    }
    body.ewrp-theme-noir .ewrp-slide-split-card:first-child {
      border-top: 3px solid var(--ewrp-accent);
    }
    body.ewrp-theme-noir .ewrp-slide-split-card:last-child {
      border-top: 3px solid var(--ewrp-accent-dim);
    }
    body.ewrp-theme-noir .ewrp-slide-steps-list li::before {
      background: linear-gradient(135deg, var(--ewrp-accent), var(--ewrp-accent-dim));
      color: #1a1508;
      box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.35);
    }
    body.ewrp-theme-noir .ewrp-glass {
      background: rgba(3, 3, 3, 0.65);
      border: 1px solid rgba(212, 175, 55, 0.15);
    }
    body.ewrp-theme-noir .ewrp-slide-fullbleed .ewrp-slide-image::after {
      background: radial-gradient(circle at 25% 22%, rgba(212, 175, 55, 0.12), transparent 50%),
                  linear-gradient(90deg, rgba(2, 2, 2, 0.9) 0%, rgba(2, 2, 2, 0.4) 55%, rgba(2, 2, 2, 0.88) 100%);
    }
    body.ewrp-theme-noir .ewrp-slide-kpi-value {
      color: var(--ewrp-accent);
    }
    """,
    "linen": """
    body.ewrp-theme-linen {
      --ewrp-bg-base: #f0ebe3;
      --ewrp-bg-slate: #e6dfd4;
      --ewrp-accent: #0f766e;
      --ewrp-accent-dim: #115e59;
      --ewrp-text: #1c1917;
      --ewrp-text-secondary: #44403c;
      --ewrp-text-muted: #78716c;
      --ewrp-brand-footer: rgba(68, 64, 60, 0.55);
    }
    body.ewrp-theme-linen {
      background: linear-gradient(180deg, #faf7f2 0%, #ebe4d8 100%);
      color: var(--ewrp-text-secondary);
    }
    body.ewrp-theme-linen .ewrp-slide {
      background: linear-gradient(168deg, #fdfcfa 0%, #f0ebe3 48%, #e8e0d4 100%);
      border-bottom: 1px solid rgba(28, 25, 23, 0.07);
    }
    body.ewrp-theme-linen .ewrp-slide::before {
      background: radial-gradient(ellipse 85% 45% at 50% -15%, rgba(15, 118, 110, 0.1), transparent 52%);
    }
    body.ewrp-theme-linen .ewrp-slide::after {
      opacity: 0.05;
      background-image:
        linear-gradient(rgba(68, 64, 60, 0.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(68, 64, 60, 0.06) 1px, transparent 1px);
    }
    body.ewrp-theme-linen .ewrp-slide-first {
      background: radial-gradient(ellipse 75% 55% at 50% 12%, rgba(15, 118, 110, 0.12), transparent 55%),
                  linear-gradient(170deg, #fffefb 0%, #e0f2f1 32%, #f0ebe3 100%);
    }
    body.ewrp-theme-linen .ewrp-slide-first::before {
      background: radial-gradient(ellipse 70% 50% at 50% 28%, rgba(15, 118, 110, 0.14), transparent 58%);
    }
    body.ewrp-theme-linen .ewrp-slide-header {
      color: rgba(68, 64, 60, 0.72);
    }
    body.ewrp-theme-linen .ewrp-slide-title {
      font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif;
      color: var(--ewrp-text);
    }
    body.ewrp-theme-linen .ewrp-slide-bullets,
    body.ewrp-theme-linen .ewrp-slide-lead,
    body.ewrp-theme-linen .ewrp-slide-statement-body,
    body.ewrp-theme-linen .ewrp-slide-closing-lead {
      font-family: 'Source Serif 4', Georgia, serif;
    }
    body.ewrp-theme-linen .ewrp-slide-accent {
      background: linear-gradient(90deg, var(--ewrp-accent), rgba(15, 118, 110, 0.45));
    }
    body.ewrp-theme-linen .ewrp-slide-progress {
      background: rgba(28, 25, 23, 0.07);
    }
    body.ewrp-theme-linen .ewrp-slide-progress-bar {
      background: linear-gradient(90deg, var(--ewrp-accent), rgba(17, 94, 89, 0.65));
    }
    body.ewrp-theme-linen .ewrp-slide-bullets li::before {
      background: linear-gradient(135deg, var(--ewrp-accent), var(--ewrp-accent-dim));
      box-shadow: 0 1px 3px rgba(15, 118, 110, 0.25);
    }
    body.ewrp-theme-linen .ewrp-slide-subtitle {
      color: var(--ewrp-text-secondary);
    }
    body.ewrp-theme-linen .ewrp-slide-closing-list {
      color: var(--ewrp-text-secondary);
    }
    body.ewrp-theme-linen .ewrp-slide-split-card,
    body.ewrp-theme-linen .ewrp-slide-grid-card,
    body.ewrp-theme-linen .ewrp-slide-kpi-item {
      background: rgba(255, 255, 255, 0.72);
      border: 1px solid rgba(28, 25, 23, 0.09);
      box-shadow: 0 10px 28px rgba(28, 25, 23, 0.06);
    }
    body.ewrp-theme-linen .ewrp-slide-steps-list li::before {
      background: linear-gradient(135deg, var(--ewrp-accent), var(--ewrp-accent-dim));
      color: #f0fdfa;
    }
    body.ewrp-theme-linen .ewrp-glass {
      background: rgba(255, 255, 255, 0.82);
      border: 1px solid rgba(28, 25, 23, 0.1);
      color: var(--ewrp-text);
    }
    body.ewrp-theme-linen .ewrp-slide-fullbleed .ewrp-slide-image::after {
      background: linear-gradient(90deg, rgba(250, 247, 242, 0.92) 0%, rgba(250, 247, 242, 0.45) 55%, rgba(240, 235, 227, 0.88) 100%),
                  radial-gradient(circle at 20% 20%, rgba(15, 118, 110, 0.12), transparent 52%);
    }
    body.ewrp-theme-linen .ewrp-slide-image {
      box-shadow: 0 18px 40px rgba(28, 25, 23, 0.12), 0 0 0 1px rgba(28, 25, 23, 0.06);
    }
    """,
}


def normalize_presentation_theme(raw: str | None) -> str:
    """Canonical theme id for PDF/HTML; default ``classic`` (текущий лазурный тёмный вид)."""
    if not isinstance(raw, str):
        return "classic"
    key = raw.strip().lower().replace("-", "_")
    if key in PRESENTATION_THEME_IDS:
        return key
    return "classic"


def presentation_theme_content_hint(theme_id: str) -> str:
    """Короткая инструкция для модели контента под выбранный визуальный стиль."""
    tid = normalize_presentation_theme(theme_id)
    return _THEME_LLM_HINTS.get(tid, _THEME_LLM_HINTS["classic"])


def _presentation_theme_style_block(theme_id: str) -> str:
    tid = normalize_presentation_theme(theme_id)
    if tid == "classic":
        return ""
    return _PRESENTATION_THEME_EXTRA.get(tid, "")


def normalize_ewrp_layout_key(raw: str | None) -> str | None:
    """Canonical layout key for API/DB, or None if empty/invalid."""
    if not isinstance(raw, str):
        return None
    key = raw.strip().lower().replace("-", "_")
    if key in _EWRP_LAYOUT_KEYS:
        return key
    return None


def _normalize_explicit_layout(slide: dict[str, Any]) -> str | None:
    """If slide sets ``layout`` or ``slide_layout``, return a known key or None."""
    raw = slide.get("layout") or slide.get("slide_layout")
    if not isinstance(raw, str):
        return None
    key = raw.strip().lower().replace("-", "_")
    if key in _EWRP_LAYOUT_KEYS:
        return key
    return None


def _looks_like_numbered_steps(bullets: list[Any]) -> bool:
    if not (3 <= len(bullets) <= 6):
        return False
    starts_numbered = 0
    for b in bullets:
        s = str(b).strip()
        if len(s) >= 2 and s[0].isdigit() and (s[1] in (".", ")", " ")):
            starts_numbered += 1
    return starts_numbered >= max(2, len(bullets) // 2)


def _infer_layout(slide: dict[str, Any], index: int, total: int) -> str:
    """Infer layout or honor explicit ``layout`` / ``slide_layout`` on the slide dict."""
    if index == 0:
        return "default"
    explicit = _normalize_explicit_layout(slide)
    # Включая ключ ``default`` («Список с акцентом»): иначе явный выбор сбрасывался эвристикой.
    if explicit is not None:
        return explicit

    bullets = normalize_ewrp_slide_bullets(slide) if isinstance(slide, dict) else []
    img = slide.get("image_filename")
    # Section: no bullets and no image → служебный / разделительный слайд
    if not img and not bullets:
        return "section"
    # Steps: numbered-like bullets without image
    if not img and _looks_like_numbered_steps(bullets):
        return "steps"
    # Closing: последний слайд без картинки, 2–4 коротких буллета → финальный акцент
    if index == total - 1 and not img and 2 <= len(bullets) <= 4 and all(len(str(b).strip()) < 90 for b in bullets):
        return "closing"
    # Long single bullet → narrative statement (not pull-quote)
    if not img and len(bullets) == 1:
        one = str(bullets[0]).strip()
        if len(one) > 110:
            return "statement"
        return "quote"
    # Two parallel theses (not closing: that already matched last-slide short lists)
    if not img and len(bullets) == 2 and all(len(str(b).strip()) < 140 for b in bullets):
        return "split"
    # KPI: короткие числовые буллеты без картинки
    if not img and 2 <= len(bullets) <= 4:
        short = all(len(str(b).strip()) < 55 for b in bullets)
        has_digit = any(any(c.isdigit() or c in "%" for c in str(b)) for b in bullets)
        if short and has_digit:
            return "kpi"
    # Grid of short points (not numbered steps)
    if (
        not img
        and 4 <= len(bullets) <= 6
        and all(len(str(b).strip()) < 95 for b in bullets)
        and not _looks_like_numbered_steps(bullets)
    ):
        return "grid"
    # Fullbleed: has image, short content → make image a background hero
    if img and 1 <= len(bullets) <= 3:
        avg_len = sum(len(str(b).strip()) for b in bullets) / max(len(bullets), 1)
        if avg_len < 70:
            return "fullbleed"
    return "default"


def build_ewrp_html(
    presentation_title: str,
    slides: list[dict[str, Any]],
    *,
    presentation_theme: str = "classic",
) -> str:
    """
    Build a single HTML document: each slide is a full-viewport section.
    slides[i]: { "title": str, "bullets": list[str], "image_filename": str | None, optional "layout": str }
    First bullet can be rendered as a "lead" line (highlight); rest as list.
    Optional ``layout`` / ``slide_layout`` forces template (ignored on slide 0).
    ``presentation_theme`` задаёт визуальный стиль PDF (фон, палитра): classic, midnight, ember, aurora, paper,
    editorial, brutal, noir, linen.
    """
    theme_id = normalize_presentation_theme(presentation_theme)
    theme_extra_css = _presentation_theme_style_block(theme_id)
    global_title_esc = _escape_html(presentation_title)
    total_slides = len(slides)
    sections_html: list[str] = []
    for i, slide in enumerate(slides):
        title = _strip_slide_number_prefix(slide.get("title") or "")
        bullets = normalize_ewrp_slide_bullets(slide) if isinstance(slide, dict) else []
        img = slide.get("image_filename")
        lead = ""
        rest_bullets = bullets
        if len(bullets) >= 2:
            lead = bullets[0]
            rest_bullets = bullets[1:]
        elif len(bullets) == 1:
            rest_bullets = bullets

        layout = _infer_layout(slide, i, total_slides)
        layout_class = ""
        if layout == "quote":
            layout_class = " ewrp-slide-quote"
        elif layout == "kpi":
            layout_class = " ewrp-slide-kpi"
        elif layout == "section":
            layout_class = " ewrp-slide-section"
        elif layout == "steps":
            layout_class = " ewrp-slide-steps"
        elif layout == "fullbleed":
            layout_class = " ewrp-slide-fullbleed"
        elif layout == "closing":
            layout_class = " ewrp-slide-closing"
        elif layout == "statement":
            layout_class = " ewrp-slide-statement"
        elif layout == "split":
            layout_class = " ewrp-slide-split"
        elif layout == "grid":
            layout_class = " ewrp-slide-grid"

        title_esc = _escape_html(title)
        lead_esc = _escape_html(lead) if lead else ""
        # bullets_html вычисляется только для default-лейаута, для остальных типов строим свои блоки
        bullets_html = ""

        image_block = ""
        if img:
            image_block = f'<div class="ewrp-slide-image"><img src="{_escape_html(img)}" alt="" /></div>'

        is_first = i == 0
        has_image = " ewrp-slide-has-image" if img else ""
        slide_type = "title" if is_first else "content"
        hero_class = " ewrp-slide-hero" if is_first and img else ""
        first_class = " ewrp-slide-first" if is_first else ""

        progress_pct = int(100 * (i + 1) / total_slides) if total_slides else 0
        progress_bar = (
            f'<div class="ewrp-slide-progress">'
            f'<div class="ewrp-slide-progress-bar" style="width:{progress_pct}%"></div></div>'
        )
        brand_block = '<div class="ewrp-slide-brand">Empery World</div>'

        if layout == "quote":
            quote_text = lead_esc or (_escape_html(str(bullets[0])) if bullets else "")
            content_inner = f"""
      <h2 class="ewrp-slide-title ewrp-slide-quote-title">{title_esc}</h2>
      <blockquote class="ewrp-slide-quote-block">{quote_text}</blockquote>"""
        elif layout == "kpi":
            kpi_items = bullets[:4]
            kpi_html = "".join(
                f'<div class="ewrp-slide-kpi-item"><span class="ewrp-slide-kpi-value">{_escape_html(str(b).strip())}</span></div>'
                for b in kpi_items
            )
            content_inner = f"""
      <h2 class="ewrp-slide-title ewrp-slide-kpi-title">{title_esc}</h2>
      <span class="ewrp-slide-accent"></span>
      <div class="ewrp-slide-kpi-grid">{kpi_html}</div>"""
        elif layout == "section":
            # Разделительный слайд: крупный заголовок по центру
            content_inner = f"""
      <h2 class="ewrp-slide-title ewrp-slide-section-title">{title_esc}</h2>"""
        elif layout == "closing":
            closing_items = bullets[:3]
            closing_lead = _escape_html(str(closing_items[0]).strip()) if closing_items else ""
            closing_rest = closing_items[1:]
            closing_rest_html = "".join(f"<li>{_escape_html(str(b).strip())}</li>" for b in closing_rest)
            content_inner = f"""
      <h2 class="ewrp-slide-title ewrp-slide-closing-title">{title_esc}</h2>
      <p class="ewrp-slide-closing-lead">{closing_lead}</p>
      <ul class="ewrp-slide-closing-list">{closing_rest_html}</ul>"""
        elif layout == "steps":
            steps_items = bullets[:6]
            steps_html = "".join(f"<li>{_escape_html(str(b).strip())}</li>" for b in steps_items)
            content_inner = f"""
      <h2 class="ewrp-slide-title ewrp-slide-steps-title">{title_esc}</h2>
      <span class="ewrp-slide-accent"></span>
      <ol class="ewrp-slide-steps-list">{steps_html}</ol>"""
        elif layout == "statement":
            body = _escape_html(str(bullets[0]).strip()) if bullets else ""
            content_inner = f"""
      <h2 class="ewrp-slide-title ewrp-slide-statement-title">{title_esc}</h2>
      <span class="ewrp-slide-accent"></span>
      <p class="ewrp-slide-statement-body">{body}</p>"""
        elif layout == "split":
            b1 = _escape_html(str(bullets[0]).strip()) if len(bullets) >= 1 else ""
            b2 = _escape_html(str(bullets[1]).strip()) if len(bullets) >= 2 else ""
            content_inner = f"""
      <h2 class="ewrp-slide-title ewrp-slide-split-title">{title_esc}</h2>
      <span class="ewrp-slide-accent"></span>
      <div class="ewrp-slide-split-cols">
        <div class="ewrp-slide-split-card"><p>{b1}</p></div>
        <div class="ewrp-slide-split-card"><p>{b2}</p></div>
      </div>"""
        elif layout == "grid":
            items = bullets[:6]
            cards_html = "".join(
                f'<div class="ewrp-slide-grid-card"><p>{_escape_html(str(b).strip())}</p></div>' for b in items
            )
            content_inner = f"""
      <h2 class="ewrp-slide-title ewrp-slide-grid-title">{title_esc}</h2>
      <span class="ewrp-slide-accent"></span>
      <div class="ewrp-slide-grid-cards">{cards_html}</div>"""
        else:
            lead_block = ""
            if lead_esc and not is_first:
                lead_block = f'<p class="ewrp-slide-lead">{lead_esc}</p>'
            elif lead_esc and is_first:
                lead_block = f'<p class="ewrp-slide-subtitle">{lead_esc}</p>'
            # Ограничиваем количество буллетов, чтобы слайд не превращался в простыню
            visible_bullets = list(rest_bullets)
            max_bullets_default = 7
            if len(visible_bullets) > max_bullets_default:
                extra = len(visible_bullets) - max_bullets_default
                visible_bullets = visible_bullets[:max_bullets_default]
                visible_bullets.append(f"... ещё {extra} пункт(ов)")
            bullets_html = "".join(f"<li>{_escape_html(b)}</li>" for b in visible_bullets)
            content_inner = f"""
      <h2 class="ewrp-slide-title">{title_esc}</h2>
      <span class="ewrp-slide-accent"></span>
      {lead_block}
      <ul class="ewrp-slide-bullets">{bullets_html}</ul>"""

        if layout == "fullbleed":
            content_inner = f"""
      <div class="ewrp-glass">
{content_inner}
      </div>"""

        sections_html.append(
            f"""
<section class="ewrp-slide{has_image}{first_class}{hero_class}{layout_class}" data-slide="{i + 1}" data-slide-type="{slide_type}" data-layout="{layout}">
  <div class="ewrp-slide-header">{global_title_esc}</div>
  {brand_block}
  {progress_bar}
  <div class="ewrp-slide-inner">
    <div class="ewrp-slide-content">
{content_inner}
    </div>
    {image_block}
  </div>
</section>"""
        )

    font_faces = ewrp_font_face_css()
    if not font_faces:
        # Hard fail would break unit HTML snapshots; log via missing CSS comment for operators.
        font_faces = "/* EWRP fonts missing — run python3 EliteEW/api/static/ewrp/vendor_ewrp_fonts.py */"

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{_escape_html(presentation_title)}</title>
  <style>
{font_faces}
    :root {{
      --ewrp-bg-base: #0a0f1a;
      --ewrp-bg-slate: #0f172a;
      --ewrp-accent: #06b6d4;
      --ewrp-accent-dim: #0891b2;
      --ewrp-text: #f8fafc;
      --ewrp-text-secondary: #cbd5e1;
      --ewrp-text-muted: #94a3b8;
      --ewrp-pad-x: 72px;
      --ewrp-pad-y: 56px;
      --ewrp-max-text: 1120px;
      --ewrp-max-grid: 1320px;
      --ewrp-gap: 52px;
      --ewrp-brand-footer: rgba(255, 255, 255, 0.35);
    }}
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html {{ font-size: 16px; }}
    body {{
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: radial-gradient(circle at top, rgba(15, 23, 42, 1) 0%, var(--ewrp-bg-base) 52%, #020617 100%);
      color: var(--ewrp-text-secondary);
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }}
    .ewrp-slide {{
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--ewrp-pad-y) var(--ewrp-pad-x);
      position: relative;
      background: radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 55%),
                  radial-gradient(circle at bottom right, rgba(6, 182, 212, 0.18), transparent 60%),
                  linear-gradient(160deg, var(--ewrp-bg-slate) 0%, #020617 35%, #020617 100%);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }}
    .ewrp-slide::before {{
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(6, 182, 212, 0.12), transparent 50%);
      pointer-events: none;
    }}
    .ewrp-slide::after {{
      content: '';
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 64px 64px;
      opacity: 0.12;
      pointer-events: none;
      mask-image: radial-gradient(circle at 50% 30%, rgba(0,0,0,1), rgba(0,0,0,0));
    }}
    .ewrp-slide-first {{
      background: radial-gradient(circle at top, rgba(56, 189, 248, 0.18), transparent 55%),
                  radial-gradient(circle at bottom, rgba(8, 47, 73, 0.95), rgba(15, 23, 42, 1)),
                  linear-gradient(165deg, #020617 0%, var(--ewrp-accent) 25%, #0e7490 55%, #020617 100%);
    }}
    .ewrp-slide-first::before {{
      background: radial-gradient(ellipse 70% 60% at 50% 30%, rgba(6, 182, 212, 0.24), transparent 58%);
    }}
    /* Хамелеон только для темы «Классика»: иначе правила nth-of-type перекрывают --ewrp-accent темы */
    body.ewrp-theme-classic .ewrp-slide:nth-of-type(2) {{
      --ewrp-accent: #22c55e;
      --ewrp-accent-dim: #16a34a;
    }}
    body.ewrp-theme-classic .ewrp-slide:nth-of-type(3) {{
      --ewrp-accent: #8b5cf6;
      --ewrp-accent-dim: #7c3aed;
    }}
    body.ewrp-theme-classic .ewrp-slide:nth-of-type(4) {{
      --ewrp-accent: #f97316;
      --ewrp-accent-dim: #ea580c;
    }}
    body.ewrp-theme-classic .ewrp-slide:nth-of-type(5) {{
      --ewrp-accent: #ec4899;
      --ewrp-accent-dim: #db2777;
    }}
    body.ewrp-theme-classic .ewrp-slide:nth-of-type(6) {{
      --ewrp-accent: #2dd4bf;
      --ewrp-accent-dim: #14b8a6;
    }}
    body.ewrp-theme-classic .ewrp-slide:nth-of-type(7) {{
      --ewrp-accent: #38bdf8;
      --ewrp-accent-dim: #0ea5e9;
    }}
    body.ewrp-theme-classic .ewrp-slide:nth-of-type(8) {{
      --ewrp-accent: #a78bfa;
      --ewrp-accent-dim: #8b5cf6;
    }}
    body.ewrp-theme-classic .ewrp-slide:nth-of-type(9) {{
      --ewrp-accent: #fbbf24;
      --ewrp-accent-dim: #f59e0b;
    }}
    body.ewrp-theme-classic .ewrp-slide:nth-of-type(10) {{
      --ewrp-accent: #fb7185;
      --ewrp-accent-dim: #f43f5e;
    }}
    body.ewrp-theme-classic .ewrp-slide:nth-of-type(11) {{
      --ewrp-accent: #4ade80;
      --ewrp-accent-dim: #22c55e;
    }}
    body.ewrp-theme-classic .ewrp-slide:nth-of-type(12) {{
      --ewrp-accent: #2dd4bf;
      --ewrp-accent-dim: #0d9488;
    }}
    .ewrp-slide-header {{
      position: absolute;
      top: 20px;
      left: var(--ewrp-pad-x);
      font-size: 0.8rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(148,163,184,0.7);
      max-width: 40vw;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      z-index: 2;
    }}
    .ewrp-slide-inner {{
      max-width: var(--ewrp-max-text);
      width: 100%;
      position: relative;
      z-index: 1;
    }}
    .ewrp-slide-has-image .ewrp-slide-inner {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--ewrp-gap);
      align-items: center;
      max-width: var(--ewrp-max-grid);
    }}
    .ewrp-slide-first.ewrp-slide-has-image .ewrp-slide-inner {{
      display: block;
      max-width: var(--ewrp-max-text);
    }}
    .ewrp-slide-has-image .ewrp-slide-content {{ min-width: 0; }}
    .ewrp-slide-title {{
      font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
      font-size: clamp(1.9rem, 3.4vw, 2.6rem);
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 12px;
      color: var(--ewrp-text);
      letter-spacing: -0.02em;
      max-width: 26ch;
    }}
    .ewrp-slide-first .ewrp-slide-title {{
      font-size: clamp(2.7rem, 5vw, 4.1rem);
      text-align: center;
      line-height: 1.08;
      margin-bottom: 10px;
      max-width: 20ch;
      margin-left: auto;
      margin-right: auto;
    }}
    .ewrp-slide-accent {{
      display: block;
      width: 56px;
      height: 3px;
      background: linear-gradient(90deg, var(--ewrp-accent), rgba(6, 182, 212, 0.4));
      border-radius: 2px;
      margin-bottom: 24px;
    }}
    .ewrp-slide-first .ewrp-slide-accent {{
      margin: 16px auto 24px;
      width: 80px;
    }}
    .ewrp-slide-lead {{
      font-size: clamp(1rem, 1.5vw, 1.25rem);
      line-height: 1.55;
      color: var(--ewrp-text-muted);
      margin-bottom: 20px;
      font-weight: 500;
      max-width: 40rem;
    }}
    .ewrp-slide-subtitle {{
      font-size: clamp(1.05rem, 1.6vw, 1.35rem);
      line-height: 1.6;
      color: rgba(241,245,249,0.96);
      margin-top: 10px;
      margin-bottom: 16px;
      font-weight: 500;
      max-width: 44rem;
      margin-left: auto;
      margin-right: auto;
    }}
    .ewrp-slide-bullets {{
      list-style: none;
      padding-left: 0;
      font-size: clamp(0.9375rem, 1.2vw, 1.125rem);
      line-height: 1.7;
      color: var(--ewrp-text-secondary);
      min-height: 1.5em;
      max-width: 46rem;
    }}
    .ewrp-slide-bullets li {{
      position: relative;
      padding-left: 28px;
      margin-bottom: 10px;
    }}
    .ewrp-slide-bullets li::before {{
      content: '';
      position: absolute;
      left: 0;
      top: 0.55em;
      width: 7px;
      height: 7px;
      background: linear-gradient(135deg, var(--ewrp-accent), var(--ewrp-accent-dim));
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(6, 182, 212, 0.35);
    }}
    .ewrp-slide-image {{
      position: relative;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 24px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(148,163,184,0.35);
      background: radial-gradient(circle at top, rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 1));
      width: fit-content;
      max-width: 100%;
      justify-self: center;
    }}
    .ewrp-slide-image img {{
      display: block;
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 58vh;
      object-fit: contain;
      vertical-align: middle;
    }}
    .ewrp-slide-hero .ewrp-slide-image {{
      border-radius: 24px;
      max-width: 70%;
      margin: 0 auto 24px;
    }}
    .ewrp-slide-hero .ewrp-slide-image img {{
      max-height: 50vh;
      max-width: 100%;
    }}
    .ewrp-slide-first .ewrp-slide-inner {{
      text-align: center;
    }}
    .ewrp-slide-first .ewrp-slide-content {{
      margin: 0 auto;
      max-width: 52rem;
    }}
    .ewrp-slide-first .ewrp-slide-bullets {{
      text-align: left;
      display: inline-block;
      margin: 0 auto;
    }}
    .ewrp-slide-progress {{
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: rgba(255,255,255,0.08);
      z-index: 2;
    }}
    .ewrp-slide-progress-bar {{
      height: 100%;
      background: linear-gradient(90deg, var(--ewrp-accent), rgba(6, 182, 212, 0.6));
      border-radius: 0 2px 0 0;
      transition: width 0.3s ease;
    }}
    .ewrp-slide-brand {{
      position: absolute;
      bottom: 26px;
      left: var(--ewrp-pad-x);
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: var(--ewrp-brand-footer);
      z-index: 2;
    }}
    .ewrp-slide-quote .ewrp-slide-inner {{
      max-width: 52rem;
      text-align: center;
    }}
    .ewrp-slide-quote .ewrp-slide-quote-title {{
      font-size: clamp(1.5rem, 2.5vw, 2rem);
      margin-bottom: 28px;
      max-width: none;
    }}
    .ewrp-slide-quote-block {{
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: clamp(1.75rem, 3.2vw, 2.75rem);
      font-weight: 600;
      line-height: 1.35;
      color: var(--ewrp-text);
      margin: 0;
      padding: 0 1rem;
    }}
    .ewrp-slide-quote-block::before {{
      content: '"';
      color: var(--ewrp-accent);
      opacity: 0.7;
    }}
    .ewrp-slide-quote-block::after {{
      content: '"';
      color: var(--ewrp-accent);
      opacity: 0.7;
    }}
    .ewrp-slide-kpi .ewrp-slide-inner {{
      max-width: var(--ewrp-max-grid);
    }}
    .ewrp-slide-kpi .ewrp-slide-kpi-title {{
      margin-bottom: 28px;
      max-width: none;
    }}
    .ewrp-slide-kpi-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 28px;
    }}
    .ewrp-slide-kpi-item {{
      text-align: center;
      padding: 20px 16px;
      background: rgba(255,255,255,0.04);
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.08);
    }}
    .ewrp-slide-kpi-value {{
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: clamp(1.75rem, 2.8vw, 2.25rem);
      font-weight: 700;
      color: var(--ewrp-accent);
    }}
    .ewrp-slide-section .ewrp-slide-inner {{
      max-width: 52rem;
      text-align: center;
    }}
    .ewrp-slide-section-title {{
      font-size: clamp(2.3rem, 4vw, 3.2rem);
      letter-spacing: 0.02em;
      text-transform: uppercase;
      margin-top: 12px;
      margin-bottom: 8px;
    }}
    .ewrp-slide-section .ewrp-slide-accent {{
      margin: 20px auto 0;
    }}
    .ewrp-slide-closing .ewrp-slide-inner {{
      max-width: 52rem;
      text-align: center;
    }}
    .ewrp-slide-closing-title {{
      font-size: clamp(2.1rem, 3.6vw, 3rem);
      margin-bottom: 18px;
      max-width: 22ch;
      margin-left: auto;
      margin-right: auto;
    }}
    .ewrp-slide-closing-lead {{
      font-size: clamp(1.05rem, 1.6vw, 1.3rem);
      line-height: 1.6;
      color: rgba(226,232,240,0.96);
      margin-bottom: 14px;
    }}
    .ewrp-slide-closing-list {{
      list-style: none;
      padding-left: 0;
      margin-top: 4px;
      font-size: clamp(0.95rem, 1.3vw, 1.1rem);
      line-height: 1.6;
      color: var(--ewrp-text-secondary);
    }}
    .ewrp-slide-closing-list li::before {{
      content: '•';
      margin-right: 0.5em;
      color: var(--ewrp-accent);
    }}
    .ewrp-slide-image::after {{
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, transparent 50%, rgba(2, 6, 23, 0.25) 100%);
      pointer-events: none;
      border-radius: inherit;
    }}
    .ewrp-glass {{
      background: rgba(2, 6, 23, 0.55);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 22px;
      padding: 32px 34px;
      box-shadow: 0 28px 60px rgba(0,0,0,0.45);
      backdrop-filter: blur(10px);
    }}
    .ewrp-slide-fullbleed {{
      padding: 72px var(--ewrp-pad-x);
    }}
    .ewrp-slide-fullbleed .ewrp-slide-inner {{
      display: block;
      max-width: 62rem;
      min-height: 100%;
    }}
    .ewrp-slide-fullbleed .ewrp-slide-content {{
      max-width: 62rem;
      position: relative;
      z-index: 1;
    }}
    .ewrp-slide-fullbleed .ewrp-slide-image {{
      position: absolute;
      inset: 0;
      border-radius: 0;
      box-shadow: none;
      background: #020617;
      z-index: 0;
    }}
    .ewrp-slide-fullbleed .ewrp-slide-image img {{
      width: 100%;
      height: 100%;
      max-height: none;
      object-fit: cover;
    }}
    .ewrp-slide-fullbleed .ewrp-slide-image::after {{
      background: radial-gradient(circle at 20% 20%, rgba(6, 182, 212, 0.20), transparent 55%),
                  linear-gradient(90deg, rgba(2, 6, 23, 0.85) 0%, rgba(2, 6, 23, 0.35) 60%, rgba(2, 6, 23, 0.75) 100%);
      opacity: 1;
    }}
    .ewrp-slide-steps .ewrp-slide-steps-title {{
      max-width: 28ch;
    }}
    .ewrp-slide-steps-list {{
      margin-top: 14px;
      padding-left: 0;
      list-style: none;
      counter-reset: step;
      max-width: 48rem;
    }}
    .ewrp-slide-steps-list li {{
      counter-increment: step;
      position: relative;
      padding-left: 56px;
      margin-bottom: 16px;
      line-height: 1.6;
      color: var(--ewrp-text-secondary);
    }}
    .ewrp-slide-steps-list li::before {{
      content: counter(step);
      position: absolute;
      left: 0;
      top: 0.1em;
      width: 36px;
      height: 36px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      font-weight: 700;
      color: #001018;
      background: linear-gradient(135deg, var(--ewrp-accent), rgba(6, 182, 212, 0.55));
      box-shadow: 0 0 0 1px rgba(255,255,255,0.12), 0 14px 28px rgba(0,0,0,0.35);
    }}
    .ewrp-slide-statement .ewrp-slide-inner {{
      max-width: 56rem;
    }}
    .ewrp-slide-statement-title {{
      max-width: 28ch;
    }}
    .ewrp-slide-statement-body {{
      font-size: clamp(1.05rem, 1.55vw, 1.35rem);
      line-height: 1.72;
      color: rgba(226,232,240,0.96);
      margin-top: 8px;
      max-width: 52rem;
    }}
    .ewrp-slide-split .ewrp-slide-inner {{
      max-width: var(--ewrp-max-grid);
    }}
    .ewrp-slide-split-title {{
      max-width: 28ch;
    }}
    .ewrp-slide-split-cols {{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 28px;
      margin-top: 8px;
      align-items: stretch;
    }}
    .ewrp-slide-split-card {{
      padding: 22px 22px;
      background: rgba(255,255,255,0.04);
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.09);
      box-shadow: 0 18px 40px rgba(0,0,0,0.28);
    }}
    .ewrp-slide-split-card p {{
      margin: 0;
      font-size: clamp(0.98rem, 1.35vw, 1.15rem);
      line-height: 1.65;
      color: var(--ewrp-text-secondary);
    }}
    .ewrp-slide-split-card:first-child {{
      border-top: 3px solid var(--ewrp-accent);
    }}
    .ewrp-slide-split-card:last-child {{
      border-top: 3px solid var(--ewrp-accent-dim);
    }}
    .ewrp-slide-grid .ewrp-slide-inner {{
      max-width: var(--ewrp-max-grid);
    }}
    .ewrp-slide-grid-title {{
      max-width: 30ch;
    }}
    .ewrp-slide-grid-cards {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-top: 8px;
    }}
    .ewrp-slide-grid-card {{
      padding: 18px 16px;
      background: rgba(255,255,255,0.035);
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.08);
      min-height: 5.5rem;
    }}
    .ewrp-slide-grid-card p {{
      margin: 0;
      font-size: clamp(0.92rem, 1.2vw, 1.05rem);
      line-height: 1.58;
      color: var(--ewrp-text-secondary);
    }}
    .ewrp-slide-grid-card::before {{
      content: '';
      display: block;
      width: 36px;
      height: 3px;
      border-radius: 2px;
      background: linear-gradient(90deg, var(--ewrp-accent), transparent);
      margin-bottom: 12px;
    }}
{theme_extra_css}
  </style>
</head>
<body class="ewrp-presentation ewrp-theme-{theme_id}">
  {"".join(sections_html)}
</body>
</html>"""
