"""Ports for desktop_shell."""

from __future__ import annotations

from typing import Protocol

from services.desktop_shell.src.core.models import DesktopItem, ShellBootstrap


class DesktopShellStore(Protocol):
    def bootstrap(self) -> ShellBootstrap: ...
    def list_items(self) -> list[DesktopItem]: ...
