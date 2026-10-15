"""
Relative proxy paths allowed per EWGen SET template backend router.
"""

from __future__ import annotations

from typing import Dict, List

# Paths after /api/modules/{id}/proxy/ — forwarded to module backend router.
TEMPLATE_PROXY_ROUTES: Dict[str, List[str]] = {
    "crud": ["/items", "/items/*"],
    "dashboard": ["/metrics"],
    "chat": ["/messages", "/messages/*", "/rooms", "/rooms/*"],
    "report": ["/reports", "/reports/*"],
    "kanban": ["/board", "/tasks", "/tasks/*"],
    "presentation": ["/slides"],
}


def proxy_routes_for_template(template_id: str, be_prefix: str) -> List[str]:
    """Full and relative API paths for module proxy allowlist."""
    relative = TEMPLATE_PROXY_ROUTES.get(template_id) or []
    full: List[str] = []
    prefix = be_prefix.rstrip("/")
    for route in relative:
        full.append(route)
        if prefix:
            full.append(f"{prefix}{route}")
    return full
