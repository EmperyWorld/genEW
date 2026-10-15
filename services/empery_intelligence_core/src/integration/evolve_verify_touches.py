"""Evolve verify gate selection from selected_option.touches + UI-surface intent."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_FACTORY_TOUCHES = frozenset({"api", "manifest", "db", "events", "deploy"})

# Operator asks for a visible surface change — verify must run ECC + Desktop gates
# even when Nervas selected_option omitted ui/desktop (api/events-only picks).
_UI_SURFACE_MARKERS = (
    "вкладк",  # вкладка / вкладкой / вкладки
    "jtbd",
    "jobs-to-be-done",
    "jobs to be done",
    "интерфейс",
    "interface",
    "dashboard",
    "дашборд",
    "desktop",
    "экран",
    "screen",
    "layout",
    "навигац",
    "sidebar",
    "research",
    "исследован",
    "улучшить ui",
    "improve ui",
    "ux",
)

# Short English tokens — word-boundary match to avoid false positives.
_UI_SURFACE_SHORT = ("tab", "ui")


def is_ui_surface_intent(text: str | None) -> bool:
    """True when operator/option prose asks for a visible UI/Desktop delta."""
    hay = (text or "").strip().lower()
    if not hay:
        return False
    for marker in _UI_SURFACE_MARKERS:
        if marker in hay:
            return True
    for token in _UI_SURFACE_SHORT:
        if re.search(rf"(?<![a-z0-9_]){re.escape(token)}(?![a-z0-9_])", hay):
            return True
    return False


def _intent_prose(metadata: dict[str, Any], intent: str | None) -> str:
    selected = metadata.get("selected_option")
    selected_bits: list[str] = []
    if isinstance(selected, dict):
        selected_bits.extend(
            [
                str(selected.get("title") or ""),
                str(selected.get("delta_summary") or ""),
                str(selected.get("id") or ""),
            ]
        )
    return " ".join(
        [
            intent or "",
            str(metadata.get("intent") or ""),
            str(metadata.get("operator_intent") or ""),
            *selected_bits,
        ]
    )


def _normalize_touches(metadata: dict[str, Any]) -> frozenset[str]:
    selected = metadata.get("selected_option")
    if not isinstance(selected, dict):
        return frozenset()
    touches = selected.get("touches")
    if not isinstance(touches, list):
        return frozenset()
    return frozenset(str(t).lower() for t in touches if t)


def capsule_exists(workspace: Path | None, service_name: str | None) -> bool:
    if workspace is None or not service_name:
        return False
    return (workspace / "services" / service_name / "manifest.json").is_file()


def desktop_mount_exists(workspace: Path | None, service_name: str | None) -> bool:
    if workspace is None or not service_name:
        return False
    return (
        workspace
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service_name}.tsx"
    ).is_file()


def read_ui_required(
    workspace: Path | None, service_name: str | None
) -> bool | None:
    """Return manifest ui.required; None if unknown / missing."""
    if workspace is None or not service_name:
        return None
    mf = workspace / "services" / service_name / "manifest.json"
    if not mf.is_file():
        return None
    try:
        data = json.loads(mf.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    ui = data.get("ui") if isinstance(data, dict) else None
    if not isinstance(ui, dict):
        # Missing ui block → treat as required (default product surface).
        return True
    if "required" not in ui:
        return True
    return bool(ui.get("required"))


def evolve_touch_gates(
    metadata: dict[str, Any],
    *,
    intent: str | None = None,
    workspace: Path | None = None,
    service_name: str | None = None,
    capsule_present: bool | None = None,
    ui_required: bool | None = None,
    mount_present: bool | None = None,
) -> dict[str, bool]:
    """Return which verify gates to run for product evolve (not genesis).

    Honesty rules (Factory Closeout W3):
    - ``factory`` is always True when the capsule exists (Fake*/DoD scan).
    - ``ui`` / ``desktop`` from touches ∪ UI-surface intent ∪
      (ui.required is not False) ∪ desktop mount already present.
    """
    touches = _normalize_touches(metadata)
    force_surface = is_ui_surface_intent(_intent_prose(metadata, intent))

    if capsule_present is None:
        capsule_present = capsule_exists(workspace, service_name)
    if mount_present is None:
        mount_present = desktop_mount_exists(workspace, service_name)
    if ui_required is None and workspace is not None and service_name:
        ui_required = read_ui_required(workspace, service_name)

    force_product_ui = (
        (ui_required is not False and capsule_present)
        or bool(mount_present)
    )

    return {
        "factory": bool(capsule_present) or bool(touches & _FACTORY_TOUCHES),
        "ui": "ui" in touches or force_surface or force_product_ui,
        "desktop": "desktop" in touches or force_surface or force_product_ui,
    }
