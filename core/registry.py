"""Global Service Registry for EWorld module discovery."""

from __future__ import annotations

import importlib
import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field

from core.container import ServiceContainer
from core.data.database import DatabaseManager
from core.event_bus import Event, EventBus, RedisEventBus, create_event_bus

_logger = logging.getLogger("core.registry")


class ServiceUiManifest(BaseModel):
    """ECC product-UI contract (service-ui.mdc). Prefer manifest over design SoT."""

    model_config = ConfigDict(frozen=True)

    required: bool = True
    skip_reason: str | None = None
    feature_key: str | None = None
    route: str | None = None
    nav_label_key: str | None = None
    bff_prefix: str | None = None
    # Lab/probe surfaces may deep-link but must not sit in primary nav unless lab UX.
    lab: bool = False


class ServiceManifest(BaseModel):
    """Validated service manifest contract."""

    model_config = ConfigDict(frozen=True)

    name: str
    version: str
    features: list[str] = Field(default_factory=list)
    entry_point: str
    # Hard runtime/service deps (HTTP clients, required peer modules).
    dependencies: list[str] = Field(default_factory=list)
    # EventBus topics this service publishes (async fan-out; not hard deps).
    publishes: list[str] = Field(default_factory=list)
    # EventBus topics this service subscribes to (async consumers; not hard deps).
    subscribes: list[str] = Field(default_factory=list)
    # Product UI SoT for ECC/Desktop gates (P4.1).
    ui: ServiceUiManifest | None = None


ServiceFactory = Callable[[ServiceContainer], FastAPI]


def database_manager_key(service_name: str) -> str:
    """Per-service DatabaseManager provider key (avoids first-wins DB collisions)."""
    return f"database_manager:{service_name}"


def register_service_database_manager(
    container: ServiceContainer,
    service_name: str,
    database_url: str,
    *,
    echo: bool = False,
) -> None:
    """
    Register a lazy DatabaseManager for ``service_name``.

    Each service resolves its own namespaced manager — never a shared
    ``database_manager`` key that first-wins across modules.
    """
    key = database_manager_key(service_name)
    if not container.has(key):
        container.register(
            key,
            lambda _c, url=database_url, e=echo: DatabaseManager.from_url(
                url, echo=e
            ),
        )


def resolve_service_database_manager(
    container: ServiceContainer,
    service_name: str,
) -> DatabaseManager:
    """Resolve the DatabaseManager registered for ``service_name``."""
    return container.resolve(database_manager_key(service_name))


class GlobalServiceRegistry:
    """Discovers and registers standalone service modules."""

    def __init__(self) -> None:
        self._services: dict[str, ServiceFactory] = {}
        self._manifests: dict[str, ServiceManifest] = {}
        self.container = ServiceContainer()
        # Lazy: avoid fail-fast Redis requirement at import time (pytest collection).
        self._event_bus: EventBus | RedisEventBus | None = None
        self.container.register("event_bus", lambda _c: self.event_bus)

    @property
    def event_bus(self) -> EventBus | RedisEventBus:
        if self._event_bus is None:
            self._event_bus = create_event_bus()
        return self._event_bus

    @event_bus.setter
    def event_bus(self, bus: EventBus | RedisEventBus) -> None:
        self._event_bus = bus

    def register_database_manager(
        self,
        database_url: str,
        *,
        service_name: str,
        echo: bool = False,
    ) -> None:
        """
        Register a per-service DatabaseManager in the shared ServiceContainer.

        Registration is lazy: the engine is created on first ``resolve``.
        """
        register_service_database_manager(
            self.container,
            service_name,
            database_url,
            echo=echo,
        )

    def register(
        self,
        manifest: ServiceManifest,
        factory: ServiceFactory,
    ) -> None:
        """Register a service factory and its manifest."""
        self._manifests[manifest.name] = manifest
        self._services[manifest.name] = factory
        self.container.register(
            manifest.name,
            lambda c, f=factory: f(c),
        )

    def get_factory(self, name: str) -> ServiceFactory:
        if name not in self._services:
            raise KeyError(f"Service '{name}' is not registered")
        return self._services[name]

    def get_manifest(self, name: str) -> ServiceManifest:
        if name not in self._manifests:
            raise KeyError(f"Service '{name}' is not registered")
        return self._manifests[name]

    def list_services(self) -> list[str]:
        return sorted(self._services.keys())

    def has_service(self, name: str) -> bool:
        return name in self._services

    def unregister(self, name: str) -> bool:
        """Drop a service from the in-memory registry (Hands teardown / disk prune)."""
        if name not in self._services and name not in self._manifests:
            return False
        self._services.pop(name, None)
        self._manifests.pop(name, None)
        self.container.unregister(name)
        return True

    def create_app(self, name: str) -> FastAPI:
        """Create a service app via ServiceContainer resolution."""
        return self.container.resolve(name)


# Singleton registry instance used by the orchestration layer.
registry = GlobalServiceRegistry()


_SERVICES_REGISTERED = False

# Boot-time static modules (always registered first).
_STATIC_SERVICE_MODULES: tuple[tuple[str, str], ...] = (
    ("core_auth_service", "services.core_auth_service.src.api.main"),
    ("analytics_service", "services.analytics_service.src.api.main"),
    ("identity_service", "services.identity_service.src.api.main"),
    ("task_orchestrator_service", "services.task_orchestrator_service.src.api.main"),
    ("intelligence_service", "services.intelligence_service.src.api.main"),
    ("empery_intelligence_core", "services.empery_intelligence_core.src.api.main"),
    ("empery_control_center_api", "services.empery_control_center_api.src.api.main"),
)


def _services_root() -> Path:
    return Path(__file__).resolve().parent.parent / "services"


def discover_manifest_names(services_root: Path | None = None) -> list[str]:
    """Return service directory names that contain a valid manifest.json."""
    root = services_root or _services_root()
    if not root.is_dir():
        return []
    names: list[str] = []
    for path in sorted(root.iterdir()):
        if not path.is_dir() or path.name.startswith("_"):
            continue
        manifest_path = path / "manifest.json"
        if not manifest_path.is_file():
            continue
        try:
            raw = json.loads(manifest_path.read_text(encoding="utf-8"))
            name = str(raw.get("name") or path.name)
        except (json.JSONDecodeError, OSError):
            continue
        names.append(name)
    return names


def _extend_services_path(services_root: Path) -> None:
    """Allow ``import services.<new>`` from a bind-mounted / alternate services tree."""
    try:
        import services as services_pkg
    except Exception:  # noqa: BLE001
        return
    root = str(services_root.resolve())
    paths = list(getattr(services_pkg, "__path__", []))
    if root not in paths:
        try:
            services_pkg.__path__.append(root)  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            return


def register_service_module(
    module_path: str,
    reg: GlobalServiceRegistry | None = None,
    *,
    reload: bool = False,
    services_root: Path | None = None,
) -> bool:
    """
    Import ``module_path`` and call its ``register(registry)`` if present.

    Returns True when a new (or reloaded) registration was applied.
    """
    import sys

    target = reg or registry
    if services_root is not None:
        _extend_services_path(services_root)
    try:
        if reload and module_path in sys.modules:
            mod = importlib.reload(importlib.import_module(module_path))
        else:
            mod = importlib.import_module(module_path)
    except Exception as exc:  # noqa: BLE001
        _logger.warning("registry import failed for %s: %s", module_path, exc)
        return False
    register_fn = getattr(mod, "register", None)
    if not callable(register_fn):
        return False
    # Infer name from module path: services.<name>.src.api.main
    parts = module_path.split(".")
    name = parts[1] if len(parts) > 1 else module_path
    already = target.has_service(name)
    if already and not reload:
        return False
    try:
        register_fn(target)
    except Exception as exc:  # noqa: BLE001
        _logger.warning("registry.register failed for %s: %s", module_path, exc)
        return False
    return True


def discover_and_register_dynamic(
    reg: GlobalServiceRegistry | None = None,
    *,
    services_root: Path | None = None,
    reload_existing: bool = False,
) -> list[str]:
    """
    Scan ``services/*/manifest.json`` and register any missing modules.

    Also prunes in-memory entries whose capsule directory/manifest is gone so
    ECC map/health counts do not keep ghost Hands services after delete.

    Hot-reload path for Reflex genesis — does not require process restart.
    """
    target = reg or registry
    root = services_root or _services_root()
    _extend_services_path(root)
    added: list[str] = []
    static_names = {name for name, _ in _STATIC_SERVICE_MODULES}
    on_disk = set(discover_manifest_names(root))
    for name in list(target.list_services()):
        if name in static_names:
            continue
        if name not in on_disk:
            if target.unregister(name):
                _logger.info("registry pruned missing capsule: %s", name)
    for name in sorted(on_disk):
        if name in static_names and target.has_service(name) and not reload_existing:
            continue
        module_path = f"services.{name}.src.api.main"
        if target.has_service(name) and not reload_existing:
            continue
        if register_service_module(
            module_path,
            target,
            reload=reload_existing and target.has_service(name),
            services_root=root,
        ):
            added.append(name)
        elif target.has_service(name) and name not in added:
            # Newly visible after race
            pass
    return added


async def publish_registry_updated(
    reg: GlobalServiceRegistry | None = None,
    *,
    added: list[str] | None = None,
) -> None:
    """Publish ``registry.updated`` (+ ECC mirror topic) on the shared EventBus."""
    target = reg or registry
    names = target.list_services()
    payload = {
        "service_names": names,
        "count": len(names),
        "added": list(added or []),
    }
    try:
        await target.event_bus.publish(
            Event(name="registry.updated", payload=payload)
        )
        await target.event_bus.publish(
            Event(name="ecc.registry.refreshed", payload=payload)
        )
    except Exception as exc:  # noqa: BLE001
        _logger.warning("failed to publish registry.updated: %s", exc)


def register_all_services(
    *,
    include_dynamic: bool = True,
) -> GlobalServiceRegistry:
    """
    Import and register every discovered service module.

    Service modules expose `register(registry)` and must not be imported
    elsewhere for business logic — only through this discovery entrypoint.

    After the static boot set is loaded once, subsequent calls still scan
    ``services/*/manifest.json`` for newly scaffolded modules (hot registry).
    """
    global _SERVICES_REGISTERED
    if not _SERVICES_REGISTERED:
        for _name, module_path in _STATIC_SERVICE_MODULES:
            register_service_module(module_path, registry, reload=False)
        _SERVICES_REGISTERED = True

    if include_dynamic:
        discover_and_register_dynamic(registry)
    return registry


def reload_manifests_from_disk(
    reg: GlobalServiceRegistry | None = None,
    *,
    services_root: Path | None = None,
) -> list[str]:
    """
    Re-read ``services/*/manifest.json`` into the in-memory registry.

    Updates manifests for already-registered services so host bind-mount edits
    (dependencies / publishes / subscribes) appear without a process restart.
    Does not replace factories — only refreshes ``ServiceManifest`` records.
    """
    target = reg or registry
    root = services_root or _services_root()
    if not root.is_dir():
        return []
    updated: list[str] = []
    for path in sorted(root.iterdir()):
        if not path.is_dir() or path.name.startswith("_"):
            continue
        manifest_path = path / "manifest.json"
        if not manifest_path.is_file():
            continue
        try:
            raw = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest = ServiceManifest.model_validate(raw)
        except (json.JSONDecodeError, OSError, Exception) as exc:  # noqa: BLE001
            _logger.warning("manifest reload skipped for %s: %s", path.name, exc)
            continue
        if not target.has_service(manifest.name):
            continue
        previous = target.get_manifest(manifest.name)
        if previous.model_dump() != manifest.model_dump():
            target._manifests[manifest.name] = manifest
            updated.append(manifest.name)
    return updated


def refresh_service_registry(
    *,
    services_root: Path | None = None,
) -> tuple[GlobalServiceRegistry, list[str]]:
    """Ensure static set + discover new manifests. Returns (registry, added_names)."""
    register_all_services(include_dynamic=False)
    added = discover_and_register_dynamic(registry, services_root=services_root)
    # Always re-sync manifests from disk so event topics / hard deps stay honest.
    reload_manifests_from_disk(registry, services_root=services_root)
    return registry, added

