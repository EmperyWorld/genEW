"""Environment-specific configuration for empery_intelligence_core."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from core.integration.nervas import NervasBackendId


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _env_bool(key: str, default: bool) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _csv_env(key: str, default: str) -> list[str]:
    raw = os.environ.get(key, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


def _first_env(*keys: str, default: str = "") -> str:
    for key in keys:
        value = os.environ.get(key)
        if value is not None and value.strip() != "":
            return value
    return default


def _default_database_url() -> str:
    local = Path(".data/eic/memory.db").resolve()
    return f"sqlite+pysqlite:///{local}"


def _parse_nervas_backend(raw: str) -> NervasBackendId:
    normalized = raw.strip().lower()
    aliases = {
        "local": NervasBackendId.LOCAL_LLAMA,
        "local_llama": NervasBackendId.LOCAL_LLAMA,
        "openai": NervasBackendId.OPENAI,
        "anthropic": NervasBackendId.ANTHROPIC,
        "fake": NervasBackendId.FAKE,
    }
    if normalized in aliases:
        return aliases[normalized]
    try:
        return NervasBackendId(normalized)
    except ValueError:
        return NervasBackendId.LOCAL_LLAMA


class ServiceConfig(BaseModel):
    """Immutable runtime configuration shared by Nervas / Memory / Reflexes / Interface."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "empery_intelligence_core"
    host: str = "0.0.0.0"
    port: int = 8007
    log_level: str = "INFO"

    # Nervas / LLM
    llm_base_url: str = "http://127.0.0.1:8080"
    llama_base_url: str = "http://127.0.0.1:8080"
    llama_chat_path: str = "/v1/chat/completions"
    llama_model: str = "local-model"
    provider_id: str = "local"
    nervas_backend: NervasBackendId = NervasBackendId.LOCAL_LLAMA
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    anthropic_base_url: str = "https://api.anthropic.com"
    openai_model: str | None = "gpt-4o-mini"
    anthropic_model: str | None = "claude-sonnet-4-20250514"
    nervas_timeout_s: float = 120.0
    use_fake_nervas: bool = False
    nervas_fallback_local: bool = False
    provider_config_path: str = ".cursor/orchestration/eic_nervas_runtime.json"
    provider_runtime_path: str = ".cursor/orchestration/eic/provider_runtime.json"
    allow_autonomous_fakes: bool = False
    llm_health_timeout_ms: int = 2000

    # Autonomous / Reflexes
    autonomous_enabled: bool = False
    worker_enabled: bool = True
    auto_resume_on_boot: bool = True
    worker_poll_seconds: float = 1.0
    claimed_by_label: str = "eic-worker"
    max_fix_loops: int = 3
    allow_shell_pytest: bool = False
    engine_allow_service_writes: bool = False
    allow_compose_commands: bool = False
    compose_command_timeout_s: float = 300.0
    # Primary in-loop deploy path (empery_deploy_agent). Required when auto_deploy is on.
    deploy_agent_url: str = "http://empery_deploy_agent:8010"
    # Per-HTTP call timeout for deploy-agent (up / health / refresh).
    deploy_agent_timeout_s: float = 120.0
    # Overall asyncio.wait_for budgets so intentions FAIL instead of stalling in running.
    deploy_blocking_budget_s: float = 180.0
    live_verify_budget_s: float = 150.0
    # Hands UI refresh (Desktop/ECC vite bake) — cold builds can exceed deploy HTTP timeout.
    ui_rebuild_timeout_s: float = 600.0
    # ECC bake after genesis (separate budget; Desktop runs first).
    ecc_ui_rebuild_timeout_s: float = 600.0
    require_deploy_agent: bool = True
    auto_scaffold_on_implement: bool = True
    auto_deploy_on_implement: bool = True
    # Optional ECC hot-refresh after successful deploy (compose DNS).
    ecc_registry_refresh_url: str = (
        "http://empery_control_center_api:8006/api/v1/registry/refresh"
    )
    mesh_token: str = Field(
        default="",
        description="Shared secret for ECC registry refresh (EIC_MESH_TOKEN / EMPERY_MESH_TOKEN)",
    )
    intention_stale_running_seconds: int = 3600
    agent_exec_mode: str = Field(
        default="workspace",
        description=(
            "Autonomous implementer mode: workspace | agent_container | podman_exec. "
            "podman_exec requires an explicit socket mount (never default)."
        ),
    )

    # Paths
    orchestration_root: str = ".cursor/orchestration"
    workspace_root: str = "."
    agents_root: str = ".cursor/agents"
    skills_root: str = ".cursor/skills"
    eic_subdir: str = "eic"
    intentions_subdir: str = "intentions"
    designs_subdir: str = "designs"
    reports_subdir: str = "reports"
    repo_root: str | None = None

    # Memory
    database_url: str = Field(default_factory=_default_database_url)
    auto_create_tables: bool = True
    embedding_backend: str = "stub"
    embedding_dims: int = 384
    retrieve_default_limit: int = 8
    retrieve_max_limit: int = 32
    allow_doc_apply: bool = False
    allow_rules_apply: bool = False
    context_token_budget: int = 2000
    hybrid_embedding_weight: float = 0.7
    hybrid_fts_weight: float = 0.3
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
        ],
        description="Browser origins allowed to call Nervas (EIC_CORS_ORIGINS)",
    )


@lru_cache
def get_config() -> ServiceConfig:
    """Return cached service configuration from environment variables."""
    use_fake = _env_bool("EIC_USE_FAKE_NERVAS", False)
    backend = (
        NervasBackendId.FAKE
        if use_fake
        else _parse_nervas_backend(
            _env("EIC_PROVIDER", _env("EIC_NERVAS_BACKEND", "local"))
        )
    )
    provider_id = {
        NervasBackendId.LOCAL_LLAMA: "local",
        NervasBackendId.OPENAI: "openai",
        NervasBackendId.ANTHROPIC: "anthropic",
        NervasBackendId.FAKE: "fake",
    }[backend]

    llama_base = _first_env(
        "EIC_LLM_BASE_URL",
        "EIC_LLAMA_BASE_URL",
        "AI_CHAT_BASE_URL",
        default="http://127.0.0.1:8080",
    )
    db_url = _first_env(
        "EIC_DATABASE_URL",
        "DATABASE_URL",
        default=_default_database_url(),
    )
    auto_create = _env_bool(
        "EIC_AUTO_CREATE_TABLES",
        not (db_url.startswith("postgresql") or db_url.startswith("postgres")),
    )

    return ServiceConfig(
        host=_env("EIC_API_HOST", _env("EIC_HOST", "0.0.0.0")),
        port=int(_env("EIC_API_PORT", _env("EIC_PORT", "8007"))),
        log_level=_env("LOG_LEVEL", "INFO"),
        llm_base_url=llama_base,
        llama_base_url=llama_base,
        llama_chat_path=_env("EIC_LLAMA_CHAT_PATH", "/v1/chat/completions"),
        llama_model=_env("EIC_LLAMA_MODEL", "local-model"),
        provider_id=provider_id,
        nervas_backend=backend,
        openai_api_key=_first_env("EIC_OPENAI_API_KEY", "OPENAI_API_KEY"),
        anthropic_api_key=_first_env("EIC_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
        openai_base_url=_env("EIC_OPENAI_BASE_URL", "https://api.openai.com/v1"),
        anthropic_base_url=_env(
            "EIC_ANTHROPIC_BASE_URL", "https://api.anthropic.com"
        ),
        openai_model=_env("EIC_OPENAI_MODEL", "gpt-4o-mini") or None,
        anthropic_model=_env("EIC_ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
        or None,
        nervas_timeout_s=float(_env("EIC_NERVAS_TIMEOUT_S", "120")),
        use_fake_nervas=use_fake,
        nervas_fallback_local=_env_bool("EIC_NERVAS_FALLBACK_LOCAL", False),
        provider_config_path=_env(
            "EIC_PROVIDER_CONFIG_PATH",
            ".cursor/orchestration/eic_nervas_runtime.json",
        ),
        provider_runtime_path=_env(
            "EIC_PROVIDER_RUNTIME_PATH",
            ".cursor/orchestration/eic/provider_runtime.json",
        ),
        llm_health_timeout_ms=int(_env("EIC_LLM_HEALTH_TIMEOUT_MS", "2000")),
        allow_autonomous_fakes=_env_bool("EIC_ALLOW_AUTONOMOUS_FAKES", False),
        autonomous_enabled=_env_bool("EIC_AUTONOMOUS_ENABLED", False),
        worker_enabled=_env_bool("EIC_WORKER_ENABLED", True),
        auto_resume_on_boot=_env_bool("EIC_AUTO_RESUME_ON_BOOT", True),
        worker_poll_seconds=float(_env("EIC_WORKER_POLL_SECONDS", "1")),
        claimed_by_label=_env("EIC_CLAIMED_BY_LABEL", "eic-worker"),
        max_fix_loops=int(_env("EIC_MAX_FIX_LOOPS", "3")),
        allow_shell_pytest=_env_bool("EIC_ALLOW_SHELL_PYTEST", False),
        engine_allow_service_writes=_env_bool(
            "EIC_ENGINE_ALLOW_SERVICE_WRITES", True
        ),
        allow_compose_commands=_env_bool("EIC_ALLOW_COMPOSE_COMMANDS", False),
        compose_command_timeout_s=float(
            _env("EIC_COMPOSE_COMMAND_TIMEOUT_S", "300")
        ),
        deploy_agent_url=_env(
            "EIC_DEPLOY_AGENT_URL", "http://empery_deploy_agent:8010"
        ),
        deploy_agent_timeout_s=float(_env("EIC_DEPLOY_AGENT_TIMEOUT_S", "120")),
        deploy_blocking_budget_s=float(
            _env("EIC_DEPLOY_BLOCKING_BUDGET_S", "180")
        ),
        live_verify_budget_s=float(_env("EIC_LIVE_VERIFY_BUDGET_S", "150")),
        ui_rebuild_timeout_s=float(_env("EIC_UI_REBUILD_TIMEOUT_S", "600")),
        ecc_ui_rebuild_timeout_s=float(
            _env("EIC_ECC_UI_REBUILD_TIMEOUT_S", _env("EIC_UI_REBUILD_TIMEOUT_S", "600"))
        ),
        require_deploy_agent=_env_bool("EIC_REQUIRE_DEPLOY_AGENT", True),
        auto_scaffold_on_implement=_env_bool(
            "EIC_AUTO_SCAFFOLD_ON_IMPLEMENT", True
        ),
        auto_deploy_on_implement=_env_bool("EIC_AUTO_DEPLOY_ON_IMPLEMENT", True),
        ecc_registry_refresh_url=_env(
            "EIC_ECC_REGISTRY_REFRESH_URL",
            "http://empery_control_center_api:8006/api/v1/registry/refresh",
        ),
        mesh_token=_env("EIC_MESH_TOKEN", _env("EMPERY_MESH_TOKEN", "")).strip(),
        intention_stale_running_seconds=int(
            _env("EIC_INTENTION_STALE_RUNNING_SECONDS", "3600")
        ),
        agent_exec_mode=_env("EIC_AGENT_EXEC_MODE", "workspace").strip().lower(),
        orchestration_root=_env(
            "EIC_ORCHESTRATION_ROOT", ".cursor/orchestration"
        ),
        workspace_root=_env("EIC_WORKSPACE_ROOT", "."),
        agents_root=_env("EIC_AGENTS_ROOT", ".cursor/agents"),
        skills_root=_env("EIC_SKILLS_ROOT", ".cursor/skills"),
        repo_root=_env("EIC_REPO_ROOT", "") or None,
        database_url=db_url,
        auto_create_tables=auto_create,
        embedding_backend=_env("EIC_EMBEDDING_BACKEND", "stub").lower(),
        embedding_dims=int(_env("EIC_EMBEDDING_DIMS", "384")),
        retrieve_default_limit=int(_env("EIC_MEMORY_RETRIEVE_LIMIT", "8")),
        retrieve_max_limit=int(_env("EIC_MEMORY_RETRIEVE_MAX", "32")),
        allow_doc_apply=_env_bool("EIC_ALLOW_DOC_APPLY", False),
        allow_rules_apply=_env_bool("EIC_ALLOW_RULES_APPLY", False),
        context_token_budget=int(_env("EIC_CONTEXT_TOKEN_BUDGET", "2000")),
        cors_origins=_csv_env(
            "EIC_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174",
        ),
    )


def clear_config_cache() -> None:
    """Clear cached config (for tests that mutate environment)."""
    get_config.cache_clear()
