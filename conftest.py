"""Repository-wide pytest hooks for Empery hardening."""

from __future__ import annotations

import os

# Must run before ``core.registry`` import during test collection (singleton
# calls ``create_event_bus()`` at module load). Force override — compose/.env
# may export EVENT_BUS_ALLOW_IN_MEMORY=false into the shell.
os.environ["EVENT_BUS_ALLOW_IN_MEMORY"] = "true"
os.environ.pop("EVENT_BUS_REDIS_URL", None)
os.environ.pop("REDIS_URL", None)

import pytest


@pytest.fixture(autouse=True)
def _event_bus_test_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Per-test isolation: in-memory bus unless a test sets Redis URLs.

    Production/compose sets REDIS_URL; fail-fast applies when neither Redis
    nor EVENT_BUS_ALLOW_IN_MEMORY is configured.
    """
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    monkeypatch.delenv("EVENT_BUS_REDIS_URL", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)
