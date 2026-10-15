"""Shared fixtures for empery_intelligence_core (Nervas + Memory + Reflexes + Autonomous)."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.container import ServiceContainer
from core.event_bus import EventBus
from core.integration.nervas import NervasBackendId
from core.logging import configure_logging
from services.empery_intelligence_core.config import ServiceConfig, clear_config_cache
from services.empery_intelligence_core.src.api.main import (
    _wire_dependencies,
    create_app,
)
from services.empery_intelligence_core.src.api.wire_memory import (
    bootstrap_memory,
    wire_memory,
)
from services.empery_intelligence_core.src.api.wire_reflexes import wire_reflexes
from services.empery_intelligence_core.src.core.autonomous_use_cases import (
    EicAutonomousUseCases,
)
from services.empery_intelligence_core.src.core.engine.contracts import (
    InMemoryIntentionSource,
    IntentionHandle,
)
from services.empery_intelligence_core.tests.fakes import (
    InMemoryMemoryPort,
    InMemoryNervasProviderRegistry,
    InMemoryQueuePort,
)
from services.empery_intelligence_core.src.core.memory.settings import (
    MemoryConfig,
    clear_memory_config_cache,
)
from services.empery_intelligence_core.src.data.intention_store import IntentionStore
from services.empery_intelligence_core.src.data.schemas_autonomous import ProviderId
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)

_REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(autouse=True)
def _unit_tests_prefer_local_assembler(monkeypatch: pytest.MonkeyPatch) -> None:
    """Hermetic unit path: in-process Mechanics unless a test clears/overrides.

    Production code default remains grpc when env is unset outside pytest.
    """
    monkeypatch.setenv("EIC_ASSEMBLER_TRANSPORT", "local")
    monkeypatch.setenv("EIC_VERIFIER_TRANSPORT", "local")


class RecordingEventBus(EventBus):
    def __init__(self) -> None:
        super().__init__()
        self.published: list = []

    async def publish(self, event) -> None:  # type: ignore[no-untyped-def]
        self.published.append(event)
        await super().publish(event)


def make_config(tmp_path: Path, **overrides) -> ServiceConfig:
    agents = _REPO_ROOT / ".cursor" / "agents"
    skills = _REPO_ROOT / ".cursor" / "skills"
    values: dict = {
        "orchestration_root": str(tmp_path / "orchestration"),
        "workspace_root": str(tmp_path),
        "agents_root": str(agents),
        "skills_root": str(skills),
        "worker_enabled": False,
        "auto_resume_on_boot": True,
        "allow_shell_pytest": False,
        "autonomous_enabled": True,
        "max_fix_loops": 3,
        "use_fake_nervas": False,
        "allow_autonomous_fakes": True,
        "require_deploy_agent": False,
        "auto_deploy_on_implement": False,
        "provider_id": "fake",
        "nervas_backend": NervasBackendId.FAKE,
        "provider_config_path": str(tmp_path / "eic_nervas_runtime.json"),
        "provider_runtime_path": str(tmp_path / "provider_runtime.json"),
        "database_url": f"sqlite+pysqlite:///{tmp_path / 'memory.db'}",
        "llama_base_url": "http://127.0.0.1:8080",
        "llm_base_url": "http://127.0.0.1:8080",
    }
    values.update(overrides)
    return ServiceConfig(**values)


def make_store(tmp_path: Path, **cfg_overrides) -> IntentionStore:
    cfg = make_config(tmp_path, **cfg_overrides)
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    store = IntentionStore(paths, cfg, configure_logging("eic_test_store"))
    store.ensure_layout()
    return store


def _inject_test_nervas_fake(container: ServiceContainer) -> None:
    """Register FakeNervas for unit tests (never used from runtime src)."""
    from core.logging import configure_logging
    from tests.fakes.fake_nervas import FakeNervasProvider

    if not container.has("logger"):
        container.register(
            "logger", lambda _c: configure_logging("eic_test")
        )
    if not container.has("nervas_fake"):
        container.register(
            "nervas_fake",
            lambda c: FakeNervasProvider(c.resolve("logger")),
        )


def make_container(
    tmp_path: Path, **cfg_overrides
) -> tuple[ServiceContainer, RecordingEventBus, ServiceConfig]:
    from tests.fakes.fake_nervas_stub import FakeNervasStub

    cfg = make_config(tmp_path, **cfg_overrides)
    container = ServiceContainer()
    bus = RecordingEventBus()
    container.register("event_bus", lambda _c: bus)
    container.register("nervas_provider", lambda _c: FakeNervasStub())
    wire_reflexes(container, cfg)
    return container, bus, cfg


def build_eic_app(tmp_path: Path, **cfg_overrides):
    """Full EIC app with FakeNervas + in-memory autonomous ports (CI)."""
    cfg = make_config(
        tmp_path,
        workspace_root=str(_REPO_ROOT),
        **cfg_overrides,
    )
    container = ServiceContainer()
    bus = RecordingEventBus()
    container.register("event_bus", lambda _c: bus)
    _inject_test_nervas_fake(container)

    queue = InMemoryQueuePort(cfg, provider_id=ProviderId.FAKE)
    memory = InMemoryMemoryPort()
    registry = InMemoryNervasProviderRegistry(cfg, queue=queue)
    container.register("eic_queue_port", lambda _c: queue)
    container.register("eic_memory_port", lambda _c: memory)
    container.register("nervas_provider_registry", lambda _c: registry)

    app = create_app(container=container, config=cfg)

    # Re-bind autonomous fakes after full wiring (Reflexes may overwrite queue port).
    container.register("eic_queue_port", lambda _c: queue)
    container.register("eic_memory_port", lambda _c: memory)
    container.register("nervas_provider_registry", lambda _c: registry)
    container.register(
        "eic_autonomous_use_cases",
        lambda c: EicAutonomousUseCases(c),
    )
    return app, bus, container


@pytest.fixture(autouse=True)
def _force_fake_nervas(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> Iterator[None]:
    """Default EIC unit tests: in-memory bus + autonomous fakes (no EIC_USE_FAKE_NERVAS)."""
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    monkeypatch.setenv("EIC_USE_FAKE_NERVAS", "false")
    monkeypatch.setenv("EIC_ALLOW_AUTONOMOUS_FAKES", "true")
    monkeypatch.setenv("EIC_REQUIRE_DEPLOY_AGENT", "false")
    monkeypatch.setenv("EIC_AUTO_DEPLOY_ON_IMPLEMENT", "false")
    monkeypatch.setenv("EIC_NERVAS_BACKEND", "fake")
    monkeypatch.setenv("EIC_PROVIDER", "fake")
    monkeypatch.setenv("EIC_WORKSPACE_ROOT", str(_REPO_ROOT))
    monkeypatch.setenv(
        "EIC_PROVIDER_CONFIG_PATH",
        str(tmp_path / "eic_nervas_runtime.json"),
    )
    monkeypatch.delenv("EIC_OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("EIC_ANTHROPIC_API_KEY", raising=False)
    clear_config_cache()
    yield
    clear_config_cache()


@pytest.fixture
def workspace_root() -> Path:
    return _REPO_ROOT


@pytest.fixture
def service_config(tmp_path: Path) -> ServiceConfig:
    """Isolated workspace; prompts load from the real repo agents/skills trees."""
    clear_config_cache()
    return make_config(
        tmp_path,
        workspace_root=str(tmp_path),
        worker_enabled=False,
    )


@pytest.fixture
def wired_container(service_config: ServiceConfig) -> ServiceContainer:
    container = ServiceContainer()
    container.register("event_bus", lambda _c: EventBus())
    _inject_test_nervas_fake(container)
    _wire_dependencies(container, service_config)
    bootstrap_memory(container, service_config)
    return container


@pytest.fixture
def intention_source(wired_container: ServiceContainer) -> InMemoryIntentionSource:
    source: InMemoryIntentionSource = wired_container.resolve("intention_source")
    source.seed(
        IntentionHandle(
            intention_id="int-test-1",
            summary="Build a hello module",
            payload={"scope": "demo"},
        )
    )
    return source


@pytest.fixture
def app(service_config: ServiceConfig):
    container = ServiceContainer()
    container.register("event_bus", lambda _c: EventBus())
    _inject_test_nervas_fake(container)
    return create_app(container=container, config=service_config)


def make_memory_config(tmp_repo: Path, **overrides) -> MemoryConfig:
    """Isolated MemoryConfig rooted at a temp repo tree."""
    orch = tmp_repo / ".cursor" / "orchestration"
    orch.mkdir(parents=True, exist_ok=True)
    (tmp_repo / ".cursor" / "rules").mkdir(parents=True, exist_ok=True)
    (orch / "designs").mkdir(parents=True, exist_ok=True)
    (orch / "reports").mkdir(parents=True, exist_ok=True)
    (orch / "proposals").mkdir(parents=True, exist_ok=True)
    blueprint = orch / "SYSTEM_BLUEPRINT.md"
    if not blueprint.exists():
        blueprint.write_text("# Blueprint\n", encoding="utf-8")
    db_path = tmp_repo / "memory.db"
    values: dict = {
        "database_url": f"sqlite+pysqlite:///{db_path}",
        "auto_create_tables": True,
        "embedding_backend": "stub",
        "embedding_dims": 64,
        "orchestration_root": str(orch),
        "repo_root": str(tmp_repo),
        "allow_doc_apply": False,
        "allow_rules_apply": False,
    }
    values.update(overrides)
    return MemoryConfig(**values)


def build_memory_app(cfg: MemoryConfig | ServiceConfig) -> FastAPI:
    """Memory-focused FastAPI app (full EIC create_app with isolated config)."""
    if isinstance(cfg, MemoryConfig):
        service_cfg = make_config(
            Path(cfg.repo_root or "."),
            database_url=cfg.database_url,
            orchestration_root=cfg.orchestration_root,
            repo_root=cfg.repo_root,
            allow_doc_apply=cfg.allow_doc_apply,
            allow_rules_apply=cfg.allow_rules_apply,
            embedding_backend=cfg.embedding_backend,
            embedding_dims=cfg.embedding_dims,
            auto_create_tables=cfg.auto_create_tables,
            worker_enabled=False,
            workspace_root=str(cfg.repo_root or "."),
        )
    else:
        service_cfg = cfg
    container = ServiceContainer()
    container.register("event_bus", lambda _c: EventBus())
    _inject_test_nervas_fake(container)
    # Ensure memory providers exist even if sibling wires race.
    wire_memory(container, service_cfg)
    return create_app(container=container, config=service_cfg)


@pytest.fixture
def tmp_repo(tmp_path: Path) -> Path:
    """Temp repo layout for memory doc proposal / apply tests."""
    clear_memory_config_cache()
    orch = tmp_path / ".cursor" / "orchestration"
    orch.mkdir(parents=True, exist_ok=True)
    (tmp_path / ".cursor" / "rules").mkdir(parents=True, exist_ok=True)
    for sub in ("designs", "reports", "proposals"):
        (orch / sub).mkdir(parents=True, exist_ok=True)
    (orch / "SYSTEM_BLUEPRINT.md").write_text("# Blueprint\n", encoding="utf-8")
    return tmp_path


@pytest.fixture
def client(tmp_repo: Path):
    """HTTP client against a memory-capable EIC app rooted at tmp_repo."""
    cfg = make_memory_config(tmp_repo)
    with TestClient(build_memory_app(cfg)) as test_client:
        yield test_client
    clear_memory_config_cache()
