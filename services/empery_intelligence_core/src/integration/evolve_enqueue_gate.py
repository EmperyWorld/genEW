"""Helpers for evolve enqueue fail-closed gates."""

from __future__ import annotations

from pathlib import Path
from typing import Any


_EVOLVE_MARKERS = (
    "evolve ",
    "evolve:",
    "improve service",
    "enhance service",
    "refactor service",
    "upgrade service",
    "delta for",
    "изменить сервис",
    "улучшить сервис",
    "доработать сервис",
)

_CREATE_MARKERS = (
    "create_service",
    "create a service",
    "new service",
    "scaffold",
    "genesis",
    "создать сервис",
    "новый сервис",
)


def _is_create_intent(intent: str) -> bool:
    text = (intent or "").lower()
    return any(m in text for m in _CREATE_MARKERS)


def looks_like_evolve_intent(intent: str, *, kind: str | None = None, metadata: dict[str, Any] | None = None) -> bool:
    """True for product evolve (propose→pick), not autonomous genesis using evolve loop."""
    meta = metadata or {}
    if str(meta.get("kind") or "").lower() == "evolve":
        return True
    if _is_create_intent(intent):
        return False
    text = (intent or "").lower()
    if any(m in text for m in _EVOLVE_MARKERS):
        return True
    # Explicit request kind evolve without create markers
    if (kind or "").lower() == "evolve" and "create" not in text and "scaffold" not in text:
        # Bare EVOLVE kind with improve-ish intent already handled; avoid blocking
        # generic EVOLVE creates that use full loop without the word create.
        return "evolve" in text or "improve" in text or "enhance" in text or "refactor" in text
    return False


def evolve_enqueue_violation(
    metadata: dict[str, Any], *, intent: str, kind: str
) -> str | None:
    """Return error if product-evolve enqueue lacks selected_option XOR skip."""
    if not looks_like_evolve_intent(intent, kind=kind, metadata=metadata):
        return None
    skip = metadata.get("evolve_skip_propose")
    skip_true = skip is True or str(skip).lower() in {"1", "true", "yes", "on"}
    selected = metadata.get("selected_option")
    has_option = isinstance(selected, dict) and bool(
        selected.get("id") or selected.get("title")
    )
    if skip_true and has_option:
        return (
            "evolve enqueue: set either selected_option or evolve_skip_propose, not both"
        )
    if skip_true or has_option:
        return None
    return (
        "evolve enqueue requires metadata.selected_option "
        "or metadata.evolve_skip_propose=true"
    )


def evolve_missing_capsule_message(service_name: str | None) -> str:
    """Operator-facing message when Evolve targets a missing capsule."""
    name = (service_name or "").strip() or "<service>"
    return (
        f"evolve requires existing capsule services/{name}/ (manifest missing); "
        "use Create / create_service for new products — Evolve does not invent "
        "capsules (EIC_EVOLVE_NO_CAPSULE)"
    )


def evolve_missing_capsule_violation(
    *,
    workspace: Path | str,
    service_name: str | None,
    kind: str | None,
    intent: str = "",
    metadata: dict[str, Any] | None = None,
) -> str | None:
    """Fail closed when product Evolve targets a missing capsule (not genesis)."""
    if (kind or "").lower() != "evolve":
        return None
    meta = metadata or {}
    if not looks_like_evolve_intent(intent, kind=kind, metadata=meta):
        return None
    name = (service_name or "").strip()
    if not name:
        return evolve_missing_capsule_message(None)
    root = Path(workspace)
    if (root / "services" / name / "manifest.json").is_file():
        return None
    return evolve_missing_capsule_message(name)
