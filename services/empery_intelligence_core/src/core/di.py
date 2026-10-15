"""Shared DI helpers for Empery Intelligence Core."""

from __future__ import annotations

from core.container import ServiceContainer
from core.data.database import DatabaseManager
from core.registry import (
    database_manager_key,
    register_service_database_manager,
    resolve_service_database_manager,
)
from services.empery_intelligence_core.config import ServiceConfig

# Canonical provider names when ECC and EIC share one ServiceContainer:
# - ``config`` / ``ecc_config`` → ECC ServiceConfig only
# - ``eic_config`` → EIC ServiceConfig (never overwrite with ECC)
# - ``event_bus`` → first-wins singleton (shared Redis-backed bus is OK)
# - ``database_manager:{service}`` → per-service; never bare ``database_manager``
# Forbidden: registering EIC settings under ``config`` after ECC is wired,
# or resolving EIC settings via bare ``config`` when ``eic_config`` exists.


def resolve_eic_config(container: ServiceContainer) -> ServiceConfig:
    """
    Resolve EIC ServiceConfig without colliding with ECC ``config``.

    Prefer ``eic_config`` on shared containers; fall back to ``config`` only
    for standalone EIC processes.
    """
    if container.has("eic_config"):
        return container.resolve("eic_config")
    return container.resolve("config")


def register_eic_database_manager(
    container: ServiceContainer,
    config: ServiceConfig,
    *,
    echo: bool = False,
) -> None:
    """Register EIC memory DB under ``database_manager:empery_intelligence_core``."""
    register_service_database_manager(
        container,
        config.service_name,
        config.database_url,
        echo=echo,
    )


def resolve_eic_database_manager(container: ServiceContainer) -> DatabaseManager:
    """Resolve EIC DatabaseManager from the namespaced DI key."""
    cfg = resolve_eic_config(container)
    return resolve_service_database_manager(container, cfg.service_name)


__all__ = [
    "database_manager_key",
    "register_eic_database_manager",
    "resolve_eic_config",
    "resolve_eic_database_manager",
    "resolve_service_database_manager",
]
