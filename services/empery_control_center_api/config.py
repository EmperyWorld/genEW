"""Environment-specific configuration for empery_control_center_api."""

from __future__ import annotations

import json
import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field


DEFAULT_EVENT_SUBSCRIBE_TOPICS: tuple[str, ...] = (
    "ecc.job.created",
    "ecc.job.claimed",
    "ecc.job.status_changed",
    "ecc.job.completed",
    "ecc.job.failed",
    "ecc.registry.refreshed",
    "registry.updated",
    "task.created",
    "task.updated",
    "task.assigned",
    "task.insight.generated",
    "auth.user.registered",
    "auth.user.logged_in",
    "auth.register.succeeded",
    "auth.login.succeeded",
    "identity.user.registered",
    "identity.user.logged_in",
    "identity.role.assigned",
    "identity.password_reset.requested",
    "identity.password_reset.confirmed",
    "identity.token.issued",
    "identity.token.revoked",
    "desktop.shell.bootstrapped",
    "desktop.items.changed",
    "analytics.event.ingested",
    "image_studio.job.queued",
    "image_studio.job.completed",
    "video_studio.job.queued",
    "video_studio.job.completed",
    "music_forge.job.queued",
    "music_forge.job.completed",
    "site_studio.preview.generated",
    "ai_chat.message.created",
    "dedmoroz.message.created",
    "eic.intention.submitted",
    "eic.intention.created",
    "eic.intention.claimed",
    "eic.intention.stage_changed",
    "eic.intention.paused",
    "eic.intention.resumed",
    "eic.intention.completed",
    "eic.intention.failed",
    "eic.loop.role_started",
    "eic.loop.role_finished",
    "eic.assembler.step",
    "eic.job.queued",
    "eic.job.started",
    "eic.job.stage_changed",
    "eic.job.paused",
    "eic.job.resumed",
    "eic.job.completed",
    "eic.job.failed",
    "eic.job.cancelled",
    "eic.mode.changed",
    "eic.provider.changed",
    "eic.llm.health",
    "sandbox.probe.result",
)


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _env_bool(key: str, default: bool) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


_PROD_ENVS = frozenset({"production", "prod", "staging"})


def _default_require_auth() -> bool:
    """Production-safe default: auth required unless ECC_REQUIRE_AUTH=false."""
    return True


def _parse_topics(raw: str | None) -> list[str]:
    if raw is None or not raw.strip():
        return list(DEFAULT_EVENT_SUBSCRIBE_TOPICS)
    return [part.strip() for part in raw.split(",") if part.strip()]


def _csv_env(key: str, default: str) -> list[str]:
    raw = _env(key, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


def _parse_service_bases(raw: str | None) -> dict[str, str]:
    """Parse ``name=url,name=url`` or JSON object into service→base URL map."""
    if raw is None or not raw.strip():
        return {}
    text = raw.strip()
    if text.startswith("{"):
        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            return {}
        return {
            str(k).strip(): str(v).strip().rstrip("/")
            for k, v in parsed.items()
            if str(k).strip() and str(v).strip()
        }
    bases: dict[str, str] = {}
    for part in text.split(","):
        item = part.strip()
        if not item or "=" not in item:
            continue
        name, url = item.split("=", 1)
        name, url = name.strip(), url.strip().rstrip("/")
        if name and url:
            bases[name] = url
    return bases


class ServiceConfig(BaseModel):
    """Immutable runtime configuration loaded from the environment."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "empery_control_center_api"
    host: str = "0.0.0.0"
    port: int = 8006
    log_level: str = "INFO"
    orchestration_root: str = Field(
        default=".cursor/orchestration",
        description="Repo-relative or absolute orchestration root",
    )
    jobs_subdir: str = "jobs"
    audit_subdir: str = "audit"
    audit_filename: str = "events.jsonl"
    designs_subdir: str = "designs"
    reports_subdir: str = "reports"
    intents_subdir: str = "intents"
    event_subscribe_topics: list[str] = Field(
        default_factory=lambda: list(DEFAULT_EVENT_SUBSCRIBE_TOPICS),
    )
    ws_heartbeat_seconds: int = 30
    max_audit_lines: int = 500
    job_claim_ttl_seconds: int = 3600
    autonomous_gateway_enabled: bool = True
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        description="Allowed CORS origins (comma-separated ECC_CORS_ORIGINS)",
    )
    eic_api_base: str = Field(
        default="",
        description="HTTP base for EIC proxy when in-process providers are absent",
    )
    service_health_bases: dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Optional map of registry service name → HTTP base for "
            "GET /api/v1/health probes (ECC_SERVICE_HEALTH_BASES)"
        ),
    )
    health_probe_timeout_ms: int = Field(
        default=2000,
        description="Per-service health probe timeout in milliseconds",
    )
    health_services_cache_ttl_ms: int = Field(
        default=4000,
        description=(
            "TTL for /health/services probe results so concurrent UI clients "
            "share one fan-out (ECC_HEALTH_SERVICES_CACHE_TTL_MS)"
        ),
    )
    allow_demo_runner: bool = Field(
        default=False,
        description=(
            "Deprecated unused. Demo runner removed from ECC; "
            "ECC_ALLOW_DEMO_RUNNER is ignored."
        ),
    )
    identity_api_base: str = Field(
        default="http://localhost:8003",
        description="HTTP base for identity_service auth proxy (IDENTITY_API_BASE)",
    )
    # eic:ui-field:ai_chat
    ai_chat_api_base: str = Field(
        default="http://ai_chat:8035",
        description="HTTP base for ai_chat BFF (AI_CHAT_API_BASE)",
    )
    # eic:ui-field:dedmoroz
    dedmoroz_api_base: str = Field(
        default="http://dedmoroz:8039",
        description="HTTP base for dedmoroz BFF (DEDMOROZ_API_BASE)",
    )
    # eic:ui-field:asm_c7_ops_20261006070638
    asm_c7_ops_20261006070638_api_base: str = Field(
        default="http://asm_c7_ops_20261006070638:8032",
        description="HTTP base for asm_c7_ops_20261006070638 BFF (ASM_C7_OPS_20261006070638_API_BASE)",
    )
    # eic:ui-field:loshkovskiy
    loshkovskiy_api_base: str = Field(
        default="http://loshkovskiy:8043",
        description="HTTP base for loshkovskiy BFF (LOSHKOVSKIY_API_BASE)",
    )
    # eic:ui-field:asm_prod_acc_20261006100320
    asm_prod_acc_20261006100320_api_base: str = Field(
        default="http://asm_prod_acc_20261006100320:8054",
        description="HTTP base for asm_prod_acc_20261006100320 BFF (ASM_PROD_ACC_20261006100320_API_BASE)",
    )
    # eic:ui-field:asm_prod_acc_20261006110325
    asm_prod_acc_20261006110325_api_base: str = Field(
        default="http://asm_prod_acc_20261006110325:8060",
        description="HTTP base for asm_prod_acc_20261006110325 BFF (ASM_PROD_ACC_20261006110325_API_BASE)",
    )
    require_auth: bool = Field(
        default=True,
        description=(
            "When true, mutating /api/v1 routes require valid Bearer JWT "
            "(ECC_REQUIRE_AUTH; default true — lab must set false explicitly)"
        ),
    )
    mesh_token: str = Field(
        default="",
        description="Optional shared token for mesh/health probes (ECC_MESH_TOKEN)",
    )
    publish_eic_intentions: bool = Field(
        default=True,
        description="When true, publish ECC intentions onto the EIC EventBus bridge",
    )


@lru_cache
def get_config() -> ServiceConfig:
    """Return cached service configuration from environment variables."""
    return ServiceConfig(
        host=_env("ECC_API_HOST", "0.0.0.0"),
        port=int(_env("ECC_API_PORT", "8006")),
        log_level=_env("LOG_LEVEL", "INFO"),
        orchestration_root=_env("ECC_ORCHESTRATION_ROOT", ".cursor/orchestration"),
        ws_heartbeat_seconds=int(_env("ECC_WS_HEARTBEAT_SECONDS", "30")),
        max_audit_lines=int(_env("ECC_MAX_AUDIT_LINES", "500")),
        job_claim_ttl_seconds=int(_env("ECC_JOB_CLAIM_TTL_SECONDS", "3600")),
        event_subscribe_topics=_parse_topics(
            os.environ.get("ECC_EVENT_SUBSCRIBE_TOPICS")
        ),
        autonomous_gateway_enabled=_env_bool("ECC_AUTONOMOUS_GATEWAY", True),
        cors_origins=_csv_env(
            "ECC_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,"
            "http://127.0.0.1:5174,http://localhost:5174,"
            "http://127.0.0.1:5175,http://localhost:5175",
        ),
        eic_api_base=_env("EIC_API_BASE", "").strip(),
        service_health_bases=_parse_service_bases(
            os.environ.get("ECC_SERVICE_HEALTH_BASES")
        ),
        health_probe_timeout_ms=int(_env("ECC_HEALTH_PROBE_TIMEOUT_MS", "2000")),
        health_services_cache_ttl_ms=int(
            _env("ECC_HEALTH_SERVICES_CACHE_TTL_MS", "4000")
        ),
        allow_demo_runner=_env_bool("ECC_ALLOW_DEMO_RUNNER", False),
        identity_api_base=_env("IDENTITY_API_BASE", "http://localhost:8003")
        .strip()
        .rstrip("/"),
        # eic:ui-cfg:ai_chat
        ai_chat_api_base=_env("AI_CHAT_API_BASE", "http://ai_chat:8035")
        .strip()
        .rstrip("/"),
        # eic:ui-cfg:dedmoroz
        dedmoroz_api_base=_env("DEDMOROZ_API_BASE", "http://dedmoroz:8039")
        .strip()
        .rstrip("/"),
        # eic:ui-cfg:asm_c7_ops_20261006070638
        asm_c7_ops_20261006070638_api_base=_env("ASM_C7_OPS_20261006070638_API_BASE", "http://asm_c7_ops_20261006070638:8032")
        .strip()
        .rstrip("/"),
        # eic:ui-cfg:loshkovskiy
        loshkovskiy_api_base=_env("LOSHKOVSKIY_API_BASE", "http://loshkovskiy:8043")
        .strip()
        .rstrip("/"),
        # eic:ui-cfg:asm_prod_acc_20261006100320
        asm_prod_acc_20261006100320_api_base=_env("ASM_PROD_ACC_20261006100320_API_BASE", "http://asm_prod_acc_20261006100320:8054")
        .strip()
        .rstrip("/"),
        # eic:ui-cfg:asm_prod_acc_20261006110325
        asm_prod_acc_20261006110325_api_base=_env("ASM_PROD_ACC_20261006110325_API_BASE", "http://asm_prod_acc_20261006110325:8060")
        .strip()
        .rstrip("/"),
        require_auth=_env_bool("ECC_REQUIRE_AUTH", _default_require_auth()),
        mesh_token=_env("ECC_MESH_TOKEN", _env("EMPERY_MESH_TOKEN", "")).strip(),
        publish_eic_intentions=_env_bool("ECC_PUBLISH_EIC_INTENTIONS", True),
    )


def clear_config_cache() -> None:
    """Clear cached config (for tests that mutate environment)."""
    get_config.cache_clear()
