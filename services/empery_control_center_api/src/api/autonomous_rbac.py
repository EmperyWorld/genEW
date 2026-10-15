"""Role gates for Autonomous gateway write operations."""

from __future__ import annotations

_MUTATING = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Roles allowed to mutate Autonomous state (member kept for backward compatibility).
AUTONOMOUS_WRITE_ROLES: frozenset[str] = frozenset({"admin", "operator", "member"})


def is_autonomous_mutating_path(method: str, path: str) -> bool:
    """Return True when the route mutates Autonomous state under /api/v1/autonomous."""
    if method not in _MUTATING:
        return False
    return path == "/api/v1/autonomous" or path.startswith("/api/v1/autonomous/")


def can_autonomous_write(roles: list[str]) -> bool:
    """Return True when any assigned role grants Autonomous write access."""
    return bool(set(roles) & AUTONOMOUS_WRITE_ROLES)
