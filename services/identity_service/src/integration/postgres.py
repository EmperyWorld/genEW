"""Postgres/SQLite connectivity adapter using core DatabaseManager."""

from __future__ import annotations

import logging

from core.data.database import DatabaseManager
from core.errors import ServiceError, StandardizedErrorResponse
from core.logging import log_event
from services.identity_service.config import ServiceConfig


class PostgresAdapter:
    """
    Database connectivity adapter for health/readiness checks.

    Engine lifecycle is owned by ``DatabaseManager`` (resolved via DI).
    """

    def __init__(
        self,
        config: ServiceConfig,
        database: DatabaseManager,
        logger: logging.Logger,
    ) -> None:
        self._config = config
        self._database = database
        self._logger = logger
        self._ready = False

    @property
    def database_url(self) -> str:
        return self._config.database_url

    @property
    def database(self) -> DatabaseManager:
        return self._database

    async def ensure_ready(self) -> None:
        """Validate that the DatabaseManager can reach the configured database."""
        if self._ready:
            return
        if not self._config.database_url:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="POSTGRES_NOT_CONFIGURED",
                    message="database_url is not configured",
                )
            )
        try:
            self._database.ping()
        except Exception as exc:  # noqa: BLE001 — mapped at boundary
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="POSTGRES_UNAVAILABLE",
                    message="Database is not reachable",
                    details={"reason": str(exc)},
                ),
                http_status=503,
            ) from exc
        self._ready = True
        log_event(
            self._logger,
            event="postgres.ready",
            message="Database adapter ready",
            database_url=self._redact_url(self._config.database_url),
        )

    @staticmethod
    def _redact_url(url: str) -> str:
        if "@" not in url:
            return url
        scheme, rest = url.split("://", 1)
        credentials, host_part = rest.split("@", 1)
        if ":" in credentials:
            user = credentials.split(":", 1)[0]
            return f"{scheme}://{user}:***@{host_part}"
        return f"{scheme}://***@{host_part}"
