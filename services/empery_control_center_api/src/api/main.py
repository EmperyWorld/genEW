"""FastAPI entry point and registry registration for empery_control_center_api."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.cors import apply_lab_cors
from core.api.responses import register_standard_error_handlers
from core.container import ServiceContainer
from core.event_bus import (
    create_event_bus,
    ensure_event_bus_started,
    ensure_event_bus_stopped,
)
from core.logging import configure_logging, log_event
from core.registry import GlobalServiceRegistry, ServiceManifest
from services.empery_control_center_api.config import ServiceConfig, get_config
from services.empery_control_center_api.src.api.auth_middleware import EccAuthMiddleware
from services.empery_control_center_api.src.api.autonomous_routes import (
    router as autonomous_router,
)
from services.empery_control_center_api.src.api.routes_factory import (
    router as factory_router,
)
from services.empery_control_center_api.src.api.routes_evolve import (
    router as evolve_router,
)
from services.empery_control_center_api.src.api.routes_ops import (
    router as ops_router,
)
from services.empery_control_center_api.src.api.routes import router
from services.empery_control_center_api.src.api.routes_auth import (
    router as auth_router,
)
# eic:ui-import:ai_chat
from services.empery_control_center_api.src.api.routes_ai_chat import (
    router as ai_chat_router,
)
from services.empery_control_center_api.src.core.ai_chat_bff_use_cases import (
    EccAiChatBffUseCases,
)
from services.empery_control_center_api.src.integration.ai_chat_client import (
    AiChatClient,
)
# eic:ui-import:dedmoroz
from services.empery_control_center_api.src.api.routes_dedmoroz import (
    router as dedmoroz_router,
)
from services.empery_control_center_api.src.core.dedmoroz_bff_use_cases import (
    EccDedmorozBffUseCases,
)
from services.empery_control_center_api.src.integration.dedmoroz_client import (
    DedmorozClient,
)
# eic:ui-import:asm_c7_ops_20261006070638
from services.empery_control_center_api.src.api.routes_asm_c7_ops_20261006070638 import (
    router as asm_c7_ops_20261006070638_router,
)
from services.empery_control_center_api.src.core.asm_c7_ops_20261006070638_bff_use_cases import (
    EccAsmC7Ops20261006070638BffUseCases,
)
from services.empery_control_center_api.src.integration.asm_c7_ops_20261006070638_client import (
    AsmC7Ops20261006070638Client,
)
# eic:ui-import:loshkovskiy
from services.empery_control_center_api.src.api.routes_loshkovskiy import (
    router as loshkovskiy_router,
)
from services.empery_control_center_api.src.core.loshkovskiy_bff_use_cases import (
    EccLoshkovskiyBffUseCases,
)
from services.empery_control_center_api.src.integration.loshkovskiy_client import (
    LoshkovskiyClient,
)
# eic:ui-import:asm_prod_acc_20261006100320
from services.empery_control_center_api.src.api.routes_asm_prod_acc_20261006100320 import (
    router as asm_prod_acc_20261006100320_router,
)
from services.empery_control_center_api.src.core.asm_prod_acc_20261006100320_bff_use_cases import (
    EccAsmProdAcc20261006100320BffUseCases,
)
from services.empery_control_center_api.src.integration.asm_prod_acc_20261006100320_client import (
    AsmProdAcc20261006100320Client,
)
# eic:ui-import:asm_prod_acc_20261006110325
from services.empery_control_center_api.src.api.routes_asm_prod_acc_20261006110325 import (
    router as asm_prod_acc_20261006110325_router,
)
from services.empery_control_center_api.src.core.asm_prod_acc_20261006110325_bff_use_cases import (
    EccAsmProdAcc20261006110325BffUseCases,
)
from services.empery_control_center_api.src.integration.asm_prod_acc_20261006110325_client import (
    AsmProdAcc20261006110325Client,
)
from services.empery_control_center_api.src.api.routes_identity import (
    router as identity_router,
)
from services.empery_control_center_api.src.api.ws import ws_router
from services.empery_control_center_api.src.core.auth_use_cases import EccAuthUseCases
from services.empery_control_center_api.src.core.identity_bff_use_cases import (
    EccIdentityBffUseCases,
)
from services.empery_control_center_api.src.core.event_bridge import EventBridge
from services.empery_control_center_api.src.core.use_cases import EccUseCases
from services.empery_control_center_api.src.core.ws_hub import WsHub
from services.empery_control_center_api.src.data.audit_reader import AuditReader
from services.empery_control_center_api.src.data.job_store import JobStore
from services.empery_control_center_api.src.data.sandbox_store import (
    SandboxSessionStore,
)
from services.empery_control_center_api.src.integration.eic_gateway_adapter import (
    wire_eic_gateway,
)
from services.empery_control_center_api.src.integration.event_bridge import (
    EicIntentionBridge,
)
from services.empery_control_center_api.src.integration.eic_job_sync import (
    EicJobStoreSync,
)
from services.empery_control_center_api.src.integration.orchestration_paths import (
    OrchestrationPaths,
)
from services.empery_control_center_api.src.integration.registry_adapter import (
    RegistrySnapshotAdapter,
)
from services.empery_control_center_api.src.integration.identity_client import (
    IdentityClient,
)
from services.empery_control_center_api.src.integration.service_health_prober import (
    ServiceHealthProber,
)


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def _wire_dependencies(container: ServiceContainer, config: ServiceConfig) -> None:
    """
    Register service-local providers into the shared ServiceContainer.

    Wave 2 DI: ``config`` + ``ecc_config`` are ECC ServiceConfig; never register
    EIC settings under ``config``. EIC keeps ``eic_config`` (resolve via
    ``resolve_eic_config``). ``event_bus`` is first-wins.
    """
    logger = configure_logging(config.service_name)
    # Dedicated ECC keys — do not rely on overwriting EIC's eic_config.
    container.register("ecc_config", lambda _c, cfg=config: cfg)
    container.register("ecc_logger", lambda _c, log=logger: log)
    container.register("logger", lambda _c, log=logger: log)
    container.register("config", lambda _c, cfg=config: cfg)
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: create_event_bus())

    container.register(
        "orchestration_paths",
        lambda c, cfg=config: OrchestrationPaths.from_config(cfg),
    )
    container.register(
        "job_store",
        lambda c, cfg=config: JobStore(
            c.resolve("orchestration_paths"),
            cfg,
            c.resolve("logger"),
        ),
    )
    container.register(
        "audit_reader",
        lambda c, cfg=config: AuditReader(
            c.resolve("orchestration_paths"),
            c.resolve("logger"),
            max_lines=cfg.max_audit_lines,
        ),
    )
    if not container.has("registry_snapshot"):
        # Standalone compose/uvicorn: discover all modules via Global Service Registry.
        # Tests/pre-wired apps inject registry_snapshot explicitly.
        from core.registry import register_all_services

        discovered = register_all_services()
        container.register(
            "registry_snapshot",
            lambda _c, reg=discovered: RegistrySnapshotAdapter(reg),
        )

    container.register(
        "ws_hub",
        lambda c: WsHub(c.resolve("logger")),
    )
    container.register(
        "event_bridge",
        lambda c: EventBridge(
            c.resolve("event_bus"),
            c.resolve("ws_hub"),
            c.resolve("logger"),
        ),
    )
    container.register(
        "eic_intention_bridge",
        lambda c, cfg=config: EicIntentionBridge(
            c.resolve("event_bus"),
            cfg,
            c.resolve("logger"),
        ),
    )
    container.register(
        "eic_job_store_sync",
        lambda c: EicJobStoreSync(
            c.resolve("event_bus"),
            c.resolve("job_store"),
            c.resolve("logger"),
        ),
    )
    container.register(
        "service_health_prober",
        lambda c, cfg=config: ServiceHealthProber(
            c.resolve("registry_snapshot"),
            service_bases=dict(cfg.service_health_bases),
            timeout_ms=cfg.health_probe_timeout_ms,
            cache_ttl_ms=cfg.health_services_cache_ttl_ms,
            self_service_name=cfg.service_name,
            logger=c.resolve("logger"),
            orchestration_root=Path(cfg.orchestration_root),
            dynamic_bases_path=Path(cfg.orchestration_root)
            / "ecc"
            / "dynamic_health_bases.json",
        ),
    )
    container.register(
        "sandbox_store",
        lambda _c: SandboxSessionStore(),
    )
    container.register(
        "ecc_use_cases",
        lambda c: EccUseCases(c),
    )
    container.register(
        "identity_client",
        lambda c, cfg=config: IdentityClient(
            base_url=cfg.identity_api_base,
            logger=c.resolve("logger"),
        ),
    )
    container.register(
        "ecc_auth_use_cases",
        lambda c: EccAuthUseCases(c),
    )
    container.register(
        "ecc_identity_bff_use_cases",
        lambda c: EccIdentityBffUseCases(c),
    )

    # eic:ui-wire:ai_chat
    container.register(
        "ai_chat_client",
        lambda c, cfg=config: AiChatClient(
            base_url=cfg.ai_chat_api_base,
            logger=c.resolve("logger"),
        ),
    )
    container.register(
        "ecc_ai_chat_bff_use_cases",
        lambda c: EccAiChatBffUseCases(c),
    )

    # eic:ui-wire:dedmoroz
    container.register(
        "dedmoroz_client",
        lambda c, cfg=config: DedmorozClient(
            base_url=cfg.dedmoroz_api_base,
            logger=c.resolve("logger"),
        ),
    )
    container.register(
        "ecc_dedmoroz_bff_use_cases",
        lambda c: EccDedmorozBffUseCases(c),
    )


    # eic:ui-wire:asm_c7_ops_20261006070638
    container.register(
        "asm_c7_ops_20261006070638_client",
        lambda c, cfg=config: AsmC7Ops20261006070638Client(
            base_url=cfg.asm_c7_ops_20261006070638_api_base,
            logger=c.resolve("logger"),
        ),
    )
    container.register(
        "ecc_asm_c7_ops_20261006070638_bff_use_cases",
        lambda c: EccAsmC7Ops20261006070638BffUseCases(c),
    )

    # eic:ui-wire:loshkovskiy
    container.register(
        "loshkovskiy_client",
        lambda c, cfg=config: LoshkovskiyClient(
            base_url=cfg.loshkovskiy_api_base,
            logger=c.resolve("logger"),
        ),
    )
    container.register(
        "ecc_loshkovskiy_bff_use_cases",
        lambda c: EccLoshkovskiyBffUseCases(c),
    )

    # eic:ui-wire:asm_prod_acc_20261006100320
    container.register(
        "asm_prod_acc_20261006100320_client",
        lambda c, cfg=config: AsmProdAcc20261006100320Client(
            base_url=cfg.asm_prod_acc_20261006100320_api_base,
            logger=c.resolve("logger"),
        ),
    )
    container.register(
        "ecc_asm_prod_acc_20261006100320_bff_use_cases",
        lambda c: EccAsmProdAcc20261006100320BffUseCases(c),
    )

    # eic:ui-wire:asm_prod_acc_20261006110325
    container.register(
        "asm_prod_acc_20261006110325_client",
        lambda c, cfg=config: AsmProdAcc20261006110325Client(
            base_url=cfg.asm_prod_acc_20261006110325_api_base,
            logger=c.resolve("logger"),
        ),
    )
    container.register(
        "ecc_asm_prod_acc_20261006110325_bff_use_cases",
        lambda c: EccAsmProdAcc20261006110325BffUseCases(c),
    )

    wire_eic_gateway(container)


def create_app(
    container: ServiceContainer | None = None,
    config: ServiceConfig | None = None,
) -> FastAPI:
    """Build the FastAPI application for this service."""
    runtime_config = config or get_config()
    app_container = container or ServiceContainer()
    _wire_dependencies(app_container, runtime_config)
    manifest = load_manifest()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store: JobStore = app.state.container.resolve("job_store")
        store.ensure_layout()
        bridge: EventBridge = app.state.container.resolve("event_bridge")
        bridge.subscribe_all(runtime_config.event_subscribe_topics)
        job_sync: EicJobStoreSync = app.state.container.resolve("eic_job_store_sync")
        job_sync.start()
        bus = app.state.container.resolve("event_bus")
        await ensure_event_bus_started(bus)

        async def _hot_registry_on_reflex(event) -> None:  # type: ignore[no-untyped-def]
            """Discover newly scaffolded services after Implementer turns."""
            try:
                role = (event.payload or {}).get("role")
                name = event.name or ""
                if name == "eic.loop.role_finished" and role not in {
                    "implementer",
                    "fix",
                }:
                    return
                uc: EccUseCases = app.state.container.resolve("ecc_use_cases")
                await uc.registry_refresh()
            except Exception:  # noqa: BLE001
                log_event(
                    app.state.container.resolve("logger"),
                    event="ecc.registry.hot_reload_failed",
                    message="Hot registry refresh failed",
                    level=logging.WARNING,
                )

        bus.subscribe("eic.intention.completed", _hot_registry_on_reflex)
        bus.subscribe("eic.loop.role_finished", _hot_registry_on_reflex)
        log_event(
            app.state.container.resolve("logger"),
            event="ecc.app.startup",
            message="empery_control_center_api started",
            port=runtime_config.port,
        )
        try:
            yield
        finally:
            bus.unsubscribe("eic.intention.completed", _hot_registry_on_reflex)
            bus.unsubscribe("eic.loop.role_finished", _hot_registry_on_reflex)
            job_sync.stop()
            await ensure_event_bus_stopped(app.state.container.resolve("event_bus"))
            bridge.unsubscribe_all()
            log_event(
                app.state.container.resolve("logger"),
                event="ecc.app.shutdown",
                message="empery_control_center_api stopped",
            )

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description=(
            "Empery Control Center API — Command Gateway, "
            "Event Streamer, State Provider"
        ),
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    register_standard_error_handlers(
        app,
        service_prefix="ECC",
        service_name=runtime_config.service_name,
    )
    app.add_middleware(EccAuthMiddleware)
    # CORS must be outermost so 401/403 from auth still carry Allow-Origin.
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    app.include_router(router, prefix="/api/v1")
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(identity_router, prefix="/api/v1")
    # eic:ui-mount:asm_prod_acc_20261006110325
    app.include_router(asm_prod_acc_20261006110325_router, prefix="/api/v1")
    # eic:ui-mount:asm_prod_acc_20261006100320
    app.include_router(asm_prod_acc_20261006100320_router, prefix="/api/v1")
    # eic:ui-mount:loshkovskiy
    app.include_router(loshkovskiy_router, prefix="/api/v1")
    # eic:ui-mount:asm_c7_ops_20261006070638
    app.include_router(asm_c7_ops_20261006070638_router, prefix="/api/v1")
    # eic:ui-mount:dedmoroz
    app.include_router(dedmoroz_router, prefix="/api/v1")
    # eic:ui-mount:ai_chat
    app.include_router(ai_chat_router, prefix="/api/v1")
    if runtime_config.autonomous_gateway_enabled:
        app.include_router(autonomous_router, prefix="/api/v1")
    app.include_router(factory_router, prefix="/api/v1")
    app.include_router(evolve_router, prefix="/api/v1")
    app.include_router(ops_router, prefix="/api/v1")
    app.include_router(ws_router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    """Register this service in the Global Service Registry."""
    reg_ref = registry

    def _snapshot_factory(_c: ServiceContainer) -> RegistrySnapshotAdapter:
        return RegistrySnapshotAdapter(reg_ref)

    registry.container.register("registry_snapshot", _snapshot_factory)
    wire_eic_gateway(registry.container)
    registry.register(load_manifest(), create_app)


def run() -> None:
    """Uvicorn entry for standalone local development."""
    import uvicorn

    config = get_config()
    uvicorn.run(
        "services.empery_control_center_api.src.api.main:create_app",
        factory=True,
        host=config.host,
        port=config.port,
        log_level=config.log_level.lower(),
    )


if __name__ == "__main__":
    run()
