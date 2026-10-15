# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Allowlist and merge helpers for user folder icon ids stored in desktop_items.meta.folder_icon.
# Invariants:
# - Only known icon ids are persisted; unknown values are dropped on write.
# - System folders must not receive client folder_icon writes (enforced in router).
# Related:
# - api/routers/desktop.py
# ---

from __future__ import annotations

from typing import Any

USER_FOLDER_ICON_META_KEY = "folder_icon"

USER_FOLDER_ICON_IDS: frozenset[str] = frozenset(
    {
        "star",
        "heart",
        "bookmark",
        "briefcase",
        "tag",
        "archive",
        "chart",
        "code",
        "lightbulb",
        "gift",
        "camera",
        "key",
        "flag",
        "puzzle",
        "book",
        "sparkles",
    }
)

DEFAULT_USER_FOLDER_ICON_ID = "star"


def normalize_user_folder_icon(value: object | None) -> str | None:
    if not isinstance(value, str):
        return None
    token = value.strip()
    return token if token in USER_FOLDER_ICON_IDS else None


def merge_desktop_item_meta_for_write(
    existing: dict[str, Any] | None,
    incoming: dict[str, Any] | None,
    *,
    allow_folder_icon: bool,
) -> dict[str, Any]:
    merged: dict[str, Any] = dict(existing or {})
    if not allow_folder_icon or not isinstance(incoming, dict):
        return merged
    if USER_FOLDER_ICON_META_KEY not in incoming:
        return merged
    icon = normalize_user_folder_icon(incoming.get(USER_FOLDER_ICON_META_KEY))
    if icon:
        merged[USER_FOLDER_ICON_META_KEY] = icon
    else:
        merged.pop(USER_FOLDER_ICON_META_KEY, None)
    return merged


def sanitize_desktop_item_meta_for_persist(
    *,
    item_type: str,
    is_system: bool,
    meta: dict[str, Any] | None,
) -> dict[str, Any]:
    raw = dict(meta or {})
    if item_type != "FOLDER" or is_system:
        raw.pop(USER_FOLDER_ICON_META_KEY, None)
        return raw
    icon = normalize_user_folder_icon(raw.get(USER_FOLDER_ICON_META_KEY))
    if icon:
        raw[USER_FOLDER_ICON_META_KEY] = icon
    else:
        raw.pop(USER_FOLDER_ICON_META_KEY, None)
    return raw
