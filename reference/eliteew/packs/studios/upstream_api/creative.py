# ---
# EliteEW · Empery World
# https://eliteew.ru
# Author: po&T && TZBrand
# ---
# Purpose:
# Register creative/document FastAPI routers under canonical API prefixes, including isolated document/music contours.
# Invariants:
# - Product routers remain thin registration points; business logic stays in routers/services.
# - New creative apps must be mounted under `/api/v1` unless a legacy compatibility route is intentional.
# - Document Editor V2 is mounted only under `/api/v1/doc-editor-v2`; no legacy alias is registered.
# - MusicForge is mounted as a separate `/api/v1/music-forge/*` product, not as a Music Evolution alias.
# Related:
# - api/routers/music_evolution.py
# - api/routers/music_forge.py
# - api/routers/music_generator.py
# - api/routers/doc_editor_v2.py
# ---
"""Creative and document domain: unified_editor, elite_editor, doc_editor and doc_editor_v2."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI  # type: ignore[import-untyped]


def register_domain_creative(app: FastAPI) -> None:
    """Register creative and document service routers."""
    from api.routers.doc_editor import router as doc_editor  # noqa: PLC0415
    from api.routers.doc_editor_v2 import router as doc_editor_v2  # noqa: PLC0415
    from api.routers.elite_editor import router as elite_editor  # noqa: PLC0415
    from api.routers.ewrp import router as ewrp_router  # noqa: PLC0415
    from api.routers.image_studio import router as image_studio_router  # noqa: PLC0415
    from api.routers.music_batch_tests import router as music_batch_tests_router  # noqa: PLC0415
    from api.routers.music_evolution import router as music_evolution_router  # noqa: PLC0415
    from api.routers.music_forge import router as music_forge_router  # noqa: PLC0415
    from api.routers.music_forge_admin import router as music_forge_admin_router  # noqa: PLC0415
    from api.routers.music_generator import router as music_generator_router  # noqa: PLC0415
    from api.routers.music_generator_v3 import router as music_generator_v3_router  # noqa: PLC0415
    from api.routers.paperless_integration import router as paperless_integration  # noqa: PLC0415
    from api.routers.unified_editor import router as unified_editor  # noqa: PLC0415
    from api.routers.video_studio import router as video_studio_router  # noqa: PLC0415

    app.include_router(
        image_studio_router,
        prefix="/api/v1",
        tags=["Image Studio - Text-to-image and Image Edit (ComfyUI)"],
    )
    app.include_router(
        video_studio_router,
        prefix="/api/v1",
        tags=["Video Studio - Image-to-Video (Wan 2.2 I2V)"],
    )
    app.include_router(
        music_generator_router,
        prefix="/api/v1",
        tags=["Music Generator - Lyrics + ComfyUI Ace Step"],
    )
    app.include_router(
        music_generator_v3_router,
        prefix="/api/v1",
        tags=["Music Generator V3 - Independent Ace Step 1.5"],
    )
    app.include_router(
        music_batch_tests_router,
        prefix="/api/v1",
        tags=["Music Generator Batch Tests"],
    )
    app.include_router(
        music_evolution_router,
        prefix="/api/v1",
        tags=["Music Evolution - XL Base backend-first"],
    )
    app.include_router(
        music_forge_router,
        prefix="/api/v1",
        tags=["MusicForge - backend-first ACE 1.5 MVP"],
    )
    app.include_router(
        music_forge_admin_router,
        prefix="/api/v1",
        tags=["MusicForge Admin - operator stats and config"],
    )
    app.include_router(unified_editor, prefix="/api/v1", tags=["Unified Editor - AI Document Processing"])
    app.include_router(elite_editor, prefix="/api/v1", tags=["Elite Document Editor - Ultimate Production System"])
    app.include_router(
        doc_editor,
        prefix="/api/v1/doc-editor",
        tags=["Ultimate Document Editor - AI + ComfyUI + Tika"],  # cSpell:ignore Tika
    )
    app.include_router(
        doc_editor_v2,
        prefix="/api/v1/doc-editor-v2",
        tags=["Document Editor V2 - Unified Content Foundation"],
    )
    app.include_router(
        paperless_integration,
        prefix="/api/v1",
        tags=["Paperless Integration"],
    )
    app.include_router(unified_editor, prefix="/api", tags=["Unified Editor - AI Document Processing (Legacy)"])
    app.include_router(
        elite_editor,
        prefix="/api",
        tags=["Elite Document Editor - Ultimate Production System (Legacy)"],
    )
    app.include_router(
        doc_editor,
        prefix="/api/doc-editor",
        tags=["Ultimate Document Editor - AI + ComfyUI + Tika (Legacy)"],  # cSpell:ignore Tika
    )
    app.include_router(
        ewrp_router,
        prefix="/api/v1",
        tags=["EWRP - Revolutionary Presentations"],
    )
