# ---
# EliteEW · Empery World
# https://eliteew.ru
# Author: po&T && TZBrand
# ---
# Purpose:
# Register Desktop-domain routers: shell config, app/admin surfaces, Site Studio, KIRS and Site Manager ops.
# Invariants:
# - Public Site Studio wildcard gateway is registered separately before catch-all routes.
# - Operator-only Site Manager ops stays under authenticated `/api/v1/desktop/*`, never public site hosts.
# Related:
# - api/routers/site_manager_ops.py
# - api/routers/desktop_sites.py
# - api/routers/kirs.py
# ---
"""Desktop domain: user desktop config, Site Manager and admin."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI  # type: ignore[import-untyped]


def register_domain_desktop(app: FastAPI) -> None:
    """Register desktop and desktop admin routers."""
    from api.routers.desktop import router as desktop_router  # noqa: PLC0415
    from api.routers.desktop_admin import router as desktop_admin_router  # noqa: PLC0415
    from api.routers.desktop_ai_chat import router as desktop_ai_chat_router  # noqa: PLC0415
    from api.routers.desktop_sites import router as desktop_sites_router  # noqa: PLC0415
    from api.routers.kirs import router as kirs_router  # noqa: PLC0415
    from api.routers.poemma import router as poemma_router  # noqa: PLC0415
    from api.routers.product_desktop import router as product_desktop_router  # noqa: PLC0415
    from api.routers.site_manager_ops import router as site_manager_ops_router  # noqa: PLC0415
    from api.routers.site_studio_ai import router as site_studio_ai_router  # noqa: PLC0415
    from api.routers.system_gaf_admin import router as system_gaf_admin_router  # noqa: PLC0415

    app.include_router(
        desktop_router,
        prefix="/api/v1",
        tags=["Desktop - User Desktop Configuration"],
    )
    app.include_router(
        desktop_ai_chat_router,
        prefix="/api/v1",
    )
    app.include_router(
        desktop_admin_router,
        prefix="/api/v1",
        tags=["Desktop - App Store Admin"],
    )
    app.include_router(
        system_gaf_admin_router,
        prefix="/api/v1",
    )
    app.include_router(
        desktop_sites_router,
        prefix="/api/v1",
        tags=["Desktop - Site Studio"],
    )
    app.include_router(
        site_studio_ai_router,
        prefix="/api/v1",
        tags=["Desktop - Site Studio AI"],
    )
    app.include_router(
        kirs_router,
        prefix="/api/v1",
        tags=["Desktop - KIRS"],
    )
    app.include_router(
        site_manager_ops_router,
        prefix="/api/v1",
        tags=["Desktop - Site Manager Ops"],
    )
    app.include_router(
        poemma_router,
        prefix="/api/v1",
        tags=["Desktop - Poemma"],
    )
    app.include_router(
        product_desktop_router,
        prefix="/api/v1",
        tags=["Desktop - Product (EWDesk, feedback, assistant)"],
    )

    from api.routers.imperorg import router as imperorg_router  # noqa: PLC0415
    from api.routers.kbsew_gateway import router as kbsew_gateway_router  # noqa: PLC0415

    app.include_router(
        imperorg_router,
        prefix="/api/v1",
        tags=["Desktop - ImperorG"],
    )
    app.include_router(kbsew_gateway_router)
