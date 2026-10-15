"""Runtime dependency injection container."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypeVar

T = TypeVar("T")


class ServiceContainer:
    """Resolves service dependencies at runtime without hardcoded imports."""

    def __init__(self) -> None:
        self._providers: dict[str, Callable[["ServiceContainer"], Any]] = {}
        self._singletons: dict[str, Any] = {}
        self._singleton_flags: dict[str, bool] = {}

    def register(
        self,
        name: str,
        provider: Callable[["ServiceContainer"], Any],
        *,
        singleton: bool = True,
    ) -> None:
        """Register a dependency provider by name."""
        self._providers[name] = provider
        self._singleton_flags[name] = singleton
        # Re-registration must invalidate any cached instance.
        if name in self._singletons:
            del self._singletons[name]

    def resolve(self, name: str) -> Any:
        """Resolve a dependency by name."""
        if name in self._singletons:
            return self._singletons[name]
        if name not in self._providers:
            raise KeyError(f"Dependency '{name}' is not registered in ServiceContainer")
        instance = self._providers[name](self)
        if self._singleton_flags.get(name, True):
            self._singletons[name] = instance
        return instance

    def has(self, name: str) -> bool:
        return name in self._providers or name in self._singletons

    def unregister(self, name: str) -> bool:
        """Remove a provider (and cached singleton) if present."""
        existed = name in self._providers or name in self._singletons
        self._providers.pop(name, None)
        self._singletons.pop(name, None)
        self._singleton_flags.pop(name, None)
        return existed
