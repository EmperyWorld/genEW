"""Memory-slice configuration (EIC_* env fields used by Atoms / docs)."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _env_bool(key: str, default: bool) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def default_database_url() -> str:
    """Prefer repo-local sqlite; Docker may override via EIC_DATABASE_URL."""
    local = Path(".data/eic/memory.db").resolve()
    return f"sqlite+pysqlite:///{local}"


class MemoryConfig(BaseModel):
    """Immutable memory configuration. Compatible with parent EIC ServiceConfig fields."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "empery_intelligence_core"
    database_url: str = Field(default_factory=default_database_url)
    auto_create_tables: bool = True
    embedding_backend: str = "stub"  # stub | local | none | http
    embedding_dims: int = 384
    embedding_base_url: str | None = None
    retrieve_default_limit: int = 8
    retrieve_max_limit: int = 32
    orchestration_root: str = ".cursor/orchestration"
    repo_root: str | None = None
    allow_doc_apply: bool = False
    allow_rules_apply: bool = False
    context_token_budget: int = 2000
    hybrid_embedding_weight: float = 0.7
    hybrid_fts_weight: float = 0.3
    log_level: str = "INFO"

    @property
    def doc_proposals_dir(self) -> str:
        return str(Path(self.orchestration_root) / "proposals")


@lru_cache
def get_memory_config() -> MemoryConfig:
    """Load memory config from EIC_* environment variables."""
    default_auto = True
    url = _env("EIC_DATABASE_URL", default_database_url())
    if url.startswith("postgresql") or url.startswith("postgres"):
        default_auto = False
    return MemoryConfig(
        database_url=url,
        auto_create_tables=_env_bool("EIC_AUTO_CREATE_TABLES", default_auto),
        embedding_backend=_env("EIC_EMBEDDING_BACKEND", "stub").lower(),
        embedding_dims=int(_env("EIC_EMBEDDING_DIMS", "384")),
        embedding_base_url=_env("EIC_EMBEDDING_BASE_URL", "") or None,
        retrieve_default_limit=int(_env("EIC_MEMORY_RETRIEVE_LIMIT", "8")),
        retrieve_max_limit=int(_env("EIC_MEMORY_RETRIEVE_MAX", "32")),
        orchestration_root=_env("EIC_ORCHESTRATION_ROOT", ".cursor/orchestration"),
        repo_root=_env("EIC_REPO_ROOT", "") or None,
        allow_doc_apply=_env_bool("EIC_ALLOW_DOC_APPLY", False),
        allow_rules_apply=_env_bool("EIC_ALLOW_RULES_APPLY", False),
        context_token_budget=int(_env("EIC_CONTEXT_TOKEN_BUDGET", "2000")),
        log_level=_env("LOG_LEVEL", "INFO"),
    )


def clear_memory_config_cache() -> None:
    get_memory_config.cache_clear()
