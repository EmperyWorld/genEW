"""DI wiring + worker lifecycle helpers for EIC Reflexes."""

from __future__ import annotations

import logging

from core.container import ServiceContainer
from core.event_bus import EventBus, create_event_bus
from core.logging import configure_logging, log_event

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.core.reflexes import events as ev
from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
    HeadlessAgentLoop,
)
from services.empery_intelligence_core.src.core.reflexes.intention_worker import (
    IntentionWorker,
)
from services.empery_intelligence_core.src.core.reflexes.queue_port import (
    EicQueuePortAdapter,
)
from services.empery_intelligence_core.src.core.reflexes.use_cases import (
    ReflexesUseCases,
)
from services.empery_intelligence_core.src.data.intention_store import IntentionStore
from services.empery_intelligence_core.src.integration.ecc_bridge_adapter import (
    EccBridgeAdapter,
)
from services.empery_intelligence_core.src.integration.memory_hook_adapter import (
    MemoryHookAdapter,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.prompt_templates import (
    PromptTemplateLoader,
)
from services.empery_intelligence_core.src.integration.assembler_factory import (
    build_assembler_port,
)
from services.empery_intelligence_core.src.integration.assembler_progress import (
    LiveAssemblerProgressPublisher,
)
from services.empery_intelligence_core.src.integration.verifier_factory import (
    build_verifier_port,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)


def wire_reflexes(container: ServiceContainer, config: ServiceConfig) -> None:
    """Register Reflexes providers into the shared ServiceContainer."""
    # Bind EIC config under a dedicated name so ECC cannot clobber it via "config".
    container.register("eic_config", lambda _c, cfg=config: cfg)
    if not container.has("config"):
        container.register("config", lambda _c, cfg=config: cfg)
    if not container.has("logger"):
        container.register(
            "logger", lambda _c: configure_logging(config.service_name)
        )
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: create_event_bus())

    paths = EicOrchestrationPaths.from_config(config)
    container.register("eic_orchestration_paths", lambda _c, p=paths: p)
    container.register(
        "intention_store",
        lambda c, cfg=config: IntentionStore(
            c.resolve("eic_orchestration_paths"),
            cfg,
            c.resolve("logger"),
        ),
    )
    container.register(
        "prompt_templates",
        lambda c: PromptTemplateLoader(c.resolve("eic_orchestration_paths")),
    )
    container.register(
        "assembler_progress_publisher",
        lambda c: LiveAssemblerProgressPublisher(
            c.resolve("event_bus"),
            logger=c.resolve("logger"),
        ),
    )
    container.register(
        "assembler",
        lambda c: build_assembler_port(
            logger=c.resolve("logger"),
            on_progress=c.resolve("assembler_progress_publisher"),
        ),
    )
    container.register(
        "verifier",
        lambda c: build_verifier_port(logger=c.resolve("logger")),
    )
    container.register(
        "workspace_tools",
        lambda c, cfg=config: WorkspaceToolAdapter(
            c.resolve("eic_orchestration_paths"),
            cfg,
            c.resolve("logger"),
            assembler=c.resolve("assembler"),
            verifier=c.resolve("verifier"),
        ),
    )

    if not container.has("nervas_provider"):
        raise RuntimeError(
            "nervas_provider is not registered. Wire Nervas in main.py before "
            "wire_reflexes(), or pre-register a test FakeNervasStub from tests/fakes."
        )
    def _memory_hooks(c: ServiceContainer) -> MemoryHookAdapter:
        memory = None
        # Optional Architect 2 provider — never resolve eic_memory_hooks itself.
        if c.has("eic_memory_use_cases"):
            try:
                memory = c.resolve("eic_memory_use_cases")
            except Exception:  # noqa: BLE001
                memory = None
        return MemoryHookAdapter(memory, c.resolve("logger"))

    container.register("eic_memory_hooks", _memory_hooks)

    container.register(
        "eic_ecc_bridge",
        lambda c: EccBridgeAdapter(c.resolve("event_bus"), c.resolve("logger")),
    )
    container.register(
        "headless_agent_loop",
        lambda c, cfg=config: HeadlessAgentLoop(
            c.resolve("intention_store"),
            c.resolve("prompt_templates"),
            c.resolve("nervas_provider"),
            c.resolve("workspace_tools"),
            c.resolve("eic_memory_hooks"),
            c.resolve("eic_ecc_bridge"),
            c.resolve("event_bus"),
            cfg,
            c.resolve("logger"),
            context_pack=(
                c.resolve("eic_context_pack") if c.has("eic_context_pack") else None
            ),
        ),
    )
    container.register(
        "intention_worker",
        lambda c, cfg=config: IntentionWorker(
            c.resolve("intention_store"),
            c.resolve("headless_agent_loop"),
            c.resolve("event_bus"),
            cfg,
            c.resolve("logger"),
        ),
    )
    container.register(
        "eic_reflexes_use_cases",
        lambda c: ReflexesUseCases(c),
    )
    container.register(
        "eic_queue_port",
        lambda c: EicQueuePortAdapter(c.resolve("eic_reflexes_use_cases"), c),
    )


async def start_worker(container: ServiceContainer, config: ServiceConfig) -> None:
    """Lifespan helper: layout, recover, subscribe, start worker."""
    import asyncio

    store: IntentionStore = container.resolve("intention_store")
    store.ensure_layout()
    worker: IntentionWorker = container.resolve("intention_worker")
    await worker.recover_and_resume()

    bus: EventBus = container.resolve("event_bus")
    uc: ReflexesUseCases = container.resolve("eic_reflexes_use_cases")
    bus.subscribe(ev.INTENTION_REQUESTED, uc.handle_intention_requested)

    # Bind asyncio loop so StreamAssembly progress can publish from to_thread.
    if container.has("assembler_progress_publisher"):
        publisher = container.resolve("assembler_progress_publisher")
        bind = getattr(publisher, "bind_loop", None)
        if callable(bind):
            bind(asyncio.get_running_loop())

    if config.worker_enabled:
        # Respect autonomous_enabled: if False, start but pause claiming
        if not config.autonomous_enabled:
            worker.set_paused(True)
        await worker.start()

    log_event(
        container.resolve("logger"),
        event="eic.reflexes.lifespan_started",
        message="Reflexes worker lifecycle started",
        worker_enabled=config.worker_enabled,
        autonomous_enabled=config.autonomous_enabled,
    )


async def stop_worker(container: ServiceContainer) -> None:
    if container.has("intention_worker"):
        worker: IntentionWorker = container.resolve("intention_worker")
        await worker.stop()
    log_event(
        container.resolve("logger")
        if container.has("logger")
        else logging.getLogger("empery_intelligence_core"),
        event="eic.reflexes.lifespan_stopped",
        message="Reflexes worker lifecycle stopped",
    )
