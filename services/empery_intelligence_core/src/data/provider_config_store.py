"""In-memory + JSON file store for Nervas runtime provider config (no secrets)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict

from core.integration.nervas import NervasBackendId
from core.logging import log_event
from services.empery_intelligence_core.config import ServiceConfig


class NervasRuntimeConfig(BaseModel):
    """Mutable non-secret Nervas runtime settings."""

    model_config = ConfigDict(frozen=True)

    active_backend: NervasBackendId
    local_base_url: str
    local_model: str
    openai_model: str | None = None
    anthropic_model: str | None = None
    source: Literal["env", "runtime_override", "ecc"] = "env"
    updated_at: str | None = None


class NervasRuntimeConfigView(BaseModel):
    """Public config view — never includes API keys."""

    model_config = ConfigDict(frozen=True)

    active_backend: NervasBackendId
    local_base_url: str
    local_model: str
    openai_configured: bool
    anthropic_configured: bool
    openai_model: str | None = None
    anthropic_model: str | None = None
    source: Literal["env", "runtime_override", "ecc"] = "env"


class NervasRuntimeConfigUpdate(BaseModel):
    """Partial runtime config update (no API key fields)."""

    model_config = ConfigDict(frozen=True)

    active_backend: NervasBackendId | None = None
    local_base_url: str | None = None
    local_model: str | None = None
    openai_model: str | None = None
    anthropic_model: str | None = None
    source: Literal["env", "runtime_override", "ecc"] | None = None


class ProviderConfigStore(Protocol):
    """Persistence boundary for Nervas runtime config."""

    def get(self) -> NervasRuntimeConfig: ...

    def update(self, patch: NervasRuntimeConfigUpdate) -> NervasRuntimeConfig: ...

    def to_view(
        self,
        *,
        openai_configured: bool,
        anthropic_configured: bool,
    ) -> NervasRuntimeConfigView: ...


class FileProviderConfigStore:
    """In-memory runtime config with optional JSON file persistence."""

    def __init__(
        self,
        config: ServiceConfig,
        logger: logging.Logger | None = None,
    ) -> None:
        self._config = config
        self._logger = logger or logging.getLogger("empery_intelligence_core.provider_config")
        self._path = Path(config.provider_config_path)
        self._current = self._load_or_default()

    def get(self) -> NervasRuntimeConfig:
        return self._current

    def update(self, patch: NervasRuntimeConfigUpdate) -> NervasRuntimeConfig:
        data = self._current.model_dump()
        for key, value in patch.model_dump(exclude_none=True).items():
            data[key] = value
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        if patch.source is None and patch.model_dump(exclude_none=True):
            data["source"] = "runtime_override"
        self._current = NervasRuntimeConfig.model_validate(data)
        self._persist()
        log_event(
            self._logger,
            event="nervas.config.persisted",
            message="Nervas runtime config updated",
            active_backend=self._current.active_backend.value,
            source=self._current.source,
        )
        return self._current

    def to_view(
        self,
        *,
        openai_configured: bool,
        anthropic_configured: bool,
    ) -> NervasRuntimeConfigView:
        cfg = self._current
        return NervasRuntimeConfigView(
            active_backend=cfg.active_backend,
            local_base_url=cfg.local_base_url,
            local_model=cfg.local_model,
            openai_configured=openai_configured,
            anthropic_configured=anthropic_configured,
            openai_model=cfg.openai_model,
            anthropic_model=cfg.anthropic_model,
            source=cfg.source,
        )

    def _load_or_default(self) -> NervasRuntimeConfig:
        default = NervasRuntimeConfig(
            active_backend=self._config.nervas_backend,
            local_base_url=self._config.llama_base_url,
            local_model=self._config.llama_model,
            openai_model=self._config.openai_model,
            anthropic_model=self._config.anthropic_model,
            source="env",
        )
        if not self._path.is_file():
            return default
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            merged = default.model_dump()
            for key in (
                "active_backend",
                "local_base_url",
                "local_model",
                "openai_model",
                "anthropic_model",
                "updated_at",
            ):
                if key in raw and raw[key] is not None:
                    merged[key] = raw[key]
            merged["source"] = "runtime_override"
            return NervasRuntimeConfig.model_validate(merged)
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            log_event(
                self._logger,
                event="nervas.config.load_failed",
                message="Failed to load provider config file; using env defaults",
                level=logging.WARNING,
                reason=str(exc),
                path=str(self._path),
            )
            return default

    def _persist(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "active_backend": self._current.active_backend.value,
            "local_base_url": self._current.local_base_url,
            "local_model": self._current.local_model,
            "openai_model": self._current.openai_model,
            "anthropic_model": self._current.anthropic_model,
            "updated_at": self._current.updated_at,
        }
        self._path.write_text(
            json.dumps(payload, indent=2) + "\n",
            encoding="utf-8",
        )
