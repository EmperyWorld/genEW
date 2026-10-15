"""Hot-reload Hands-stamped ECC BFF routers without process restart."""

from __future__ import annotations

import importlib
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from core.logging import log_event

_API_DIR = Path(__file__).resolve().parents[1] / "api"
_PLATFORM_ROUTE_STEMS = frozenset(
    {
        "routes",
        "routes_auth",
        "routes_identity",
        "routes_factory",
        "routes_evolve",
        "autonomous_routes",
    }
)
_SERVICE_FROM_ROUTES = re.compile(r"^routes_(.+)$")


def _pascal(service_name: str) -> str:
    return "".join(part.capitalize() for part in service_name.split("_"))


def discover_stamped_service_names() -> list[str]:
    names: list[str] = []
    if not _API_DIR.is_dir():
        return names
    for path in sorted(_API_DIR.glob("routes_*.py")):
        stem = path.stem
        if stem in _PLATFORM_ROUTE_STEMS:
            continue
        m = _SERVICE_FROM_ROUTES.match(stem)
        if not m:
            continue
        service = m.group(1)
        uc = (
            Path(__file__).resolve().parents[1]
            / "core"
            / f"{service}_bff_use_cases.py"
        )
        if uc.is_file():
            names.append(service)
    return names


def _paths_for_prefix(app: FastAPI, prefix: str) -> set[str]:
    full = f"/api/v1{prefix}" if prefix.startswith("/") else f"/api/v1/{prefix}"
    found: set[str] = set()
    for route in app.routes:
        path = getattr(route, "path", None)
        if isinstance(path, str) and (path == full or path.startswith(full + "/")):
            found.add(path)
    return found


def _resolve_base_url(config: Any, service_name: str) -> str:
    attr = f"{service_name}_api_base"
    val = getattr(config, attr, None)
    if isinstance(val, str) and val.strip():
        return val.strip()
    env_key = f"{service_name.upper()}_API_BASE"
    env_val = os.environ.get(env_key, "").strip()
    if env_val:
        return env_val
    # Compose DNS default — peer HTTP on private net.
    return f"http://{service_name}:8000"


def reload_stamped_bff_routes(
    app: FastAPI,
    *,
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    """Import/reload stamped route modules, wire DI, include_router if missing."""
    log = logger or logging.getLogger("empery_control_center_api.bff_hot_reload")
    container = app.state.container
    config = container.resolve("config")
    mounted: list[str] = []
    reloaded: list[str] = []
    errors: list[dict[str, str]] = []

    for service_name in discover_stamped_service_names():
        try:
            routes_mod_name = (
                f"services.empery_control_center_api.src.api.routes_{service_name}"
            )
            uc_mod_name = (
                f"services.empery_control_center_api.src.core."
                f"{service_name}_bff_use_cases"
            )
            client_mod_name = (
                f"services.empery_control_center_api.src.integration."
                f"{service_name}_client"
            )
            pascal = _pascal(service_name)
            client_cls_name = f"{pascal}Client"
            uc_cls_name = f"Ecc{pascal}BffUseCases"

            for mod_name in (client_mod_name, uc_mod_name, routes_mod_name):
                if mod_name in sys.modules:
                    importlib.reload(sys.modules[mod_name])
                    reloaded.append(mod_name)
                else:
                    importlib.import_module(mod_name)

            routes_mod = importlib.import_module(routes_mod_name)
            uc_mod = importlib.import_module(uc_mod_name)
            client_mod = importlib.import_module(client_mod_name)
            router = getattr(routes_mod, "router", None)
            client_cls = getattr(client_mod, client_cls_name, None)
            uc_cls = getattr(uc_mod, uc_cls_name, None)
            if router is None or client_cls is None or uc_cls is None:
                raise RuntimeError(
                    f"missing router/client/uc for {service_name}"
                )

            client_key = f"{service_name}_client"
            uc_key = f"ecc_{service_name}_bff_use_cases"
            base_url = _resolve_base_url(config, service_name)

            # Always re-bind so reload picks new classes after importlib.reload.
            container.register(
                client_key,
                lambda c, cls=client_cls, url=base_url: cls(
                    base_url=url,
                    logger=c.resolve("logger"),
                ),
            )
            container.register(
                uc_key,
                lambda c, cls=uc_cls: cls(c),
            )

            prefix = str(getattr(router, "prefix", "") or "")
            if not _paths_for_prefix(app, prefix):
                app.include_router(router, prefix="/api/v1")
                mounted.append(service_name)
            else:
                # Already mounted — routes module reloaded; FastAPI keeps old
                # endpoints. Mark as refreshed DI-only (restart still needed for
                # path shape changes). Callers treat ok=True when DI wired.
                mounted.append(f"{service_name}:di")
        except Exception as exc:  # noqa: BLE001
            errors.append({"service": service_name, "error": str(exc)[:300]})
            log_event(
                log,
                event="ecc.bff.hot_reload_service_failed",
                message="Failed to hot-reload stamped BFF route",
                service_name=service_name,
                error=str(exc)[:300],
                level=logging.WARNING,
            )

    ok = len(errors) == 0
    result = {
        "ok": ok,
        "reload_mode": "hot",
        "services": discover_stamped_service_names(),
        "mounted": mounted,
        "reloaded_modules": reloaded[:40],
        "errors": errors,
    }
    log_event(
        log,
        event="ecc.bff.hot_reload_done",
        message="Stamped BFF hot reload finished",
        ok=ok,
        mounted=len(mounted),
        errors=len(errors),
    )
    return result
