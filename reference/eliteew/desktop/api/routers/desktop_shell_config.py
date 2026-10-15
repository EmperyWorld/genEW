# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Desktop shell config and shell-state REST: theme/wallpaper, visual presets, MRU, windows snapshot, ETag.
# Wave C: Prometheus SLI on GET/PATCH ``/shell-state`` (ok / conflict_412 / error / 304).
# Invariants:
# - Mounted without extra prefix under parent ``/desktop`` router; OAuth2 on user-facing routes.
# - ``_get_desktop_user_id`` lazy-imports resolver from ``api.routers.desktop``.
# - Metrics emit is best-effort and must not change HTTP outcomes.
# Related:
# - api/routers/desktop_shell.py (aggregator)
# - api/routers/desktop_items.py
# - api/monitoring/metrics.py
# ---
"""Desktop shell config + shell-state API."""

import hashlib
import json
import time
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from api.core.auth import User as AuthUser
from api.core.database_manager import get_postgres_session
from api.core.oauth2_auth import require_oauth2_user
from api.models.desktop import (
    DEFAULT_DESKTOP_WALLPAPER,
    DesktopConfig,
    IconSize,
    Theme,
)
from api.monitoring.metrics import (
    observe_desktop_shell_state_get_304,
    observe_desktop_shell_state_patch,
)
from api.schemas.user_profile import DesktopIconStyle, DesktopWindowStyle

router = APIRouter(tags=["desktop"])


async def _get_desktop_user_id(
    current_user: AuthUser = Depends(require_oauth2_user),
    db: AsyncSession = Depends(get_postgres_session),
) -> UUID:
    from api.routers.desktop import get_desktop_user_id

    return await get_desktop_user_id(current_user=current_user, db=db)


def validate_window_instance_policy(
    *,
    allow_multiple_windows: bool,
    max_window_instances: int,
) -> None:
    """Validate and normalize per-app window instance constraints."""
    if max_window_instances < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Максимум окон должен быть не меньше 1",
        )
    if not allow_multiple_windows and max_window_instances != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Для single-instance приложения максимум окон должен быть равен 1",
        )


class Position(BaseModel):
    """Icon position; accepts int or float from frontend, stored as int."""

    x: int
    y: int

    @model_validator(mode="before")
    @classmethod
    def coerce_numbers(cls, v: object) -> object:
        if isinstance(v, dict):
            x, y = v.get("x"), v.get("y")
            return {"x": int(x) if x is not None else 20, "y": int(y) if y is not None else 20}
        return v


MAX_WALLPAPER_HISTORY = 15


def _normalize_wallpaper_history(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(v) for v in value if isinstance(v, str)]
    return []


def _update_wallpaper_history(config: DesktopConfig, new_wallpaper: str) -> None:
    """Update wallpapers_history for config with new wallpaper (most recent first)."""
    cfg: Any = config
    history = _normalize_wallpaper_history(getattr(cfg, "wallpapers_history", []))
    current = getattr(cfg, "wallpaper", None)
    if isinstance(current, str) and current and current not in history:
        history.insert(0, current)
    if new_wallpaper in history:
        history.remove(new_wallpaper)
    history.insert(0, new_wallpaper)
    if len(history) > MAX_WALLPAPER_HISTORY:
        history = history[:MAX_WALLPAPER_HISTORY]
    cfg.wallpapers_history = history


def _disable_legacy_floating_widget(config: DesktopConfig) -> bool:
    """Keep the deprecated floating DesktopWidget disabled in DB-backed config."""
    cfg: Any = config
    if getattr(cfg, "show_widget", False) is False:
        return False
    cfg.show_widget = False
    return True


class DesktopConfigCreate(BaseModel):
    wallpaper: str = Field(default=DEFAULT_DESKTOP_WALLPAPER)
    icon_size: IconSize = IconSize.MEDIUM
    show_widget: bool = False
    widget_position: Position = Field(default_factory=lambda: Position(x=20, y=20))
    theme: Theme = Theme.DARK
    accent_color: str = "purple"
    live_wallpaper: bool = False
    snap_to_grid: bool = True
    grid_step: str = "medium"
    widgets_panel_position: str = "top-right"
    compact_widgets: bool = False
    show_widgets_panel: bool = False


class DesktopConfigUpdate(BaseModel):
    wallpaper: str | None = None
    icon_size: IconSize | None = None
    show_widget: bool | None = None
    widget_position: Position | None = None
    theme: Theme | None = None
    accent_color: str | None = None
    live_wallpaper: bool | None = None
    snap_to_grid: bool | None = None
    grid_step: str | None = None
    widgets_panel_position: str | None = None
    compact_widgets: bool | None = None
    show_widgets_panel: bool | None = None
    wallpapers_history: list[str] | None = None


class DesktopConfigResponse(BaseModel):
    id: UUID
    user_id: UUID
    wallpaper: str
    icon_size: IconSize
    show_widget: bool
    widget_position: dict
    theme: Theme
    accent_color: str = "purple"
    live_wallpaper: bool = False
    snap_to_grid: bool = True
    grid_step: str = "medium"
    widgets_panel_position: str = "top-right"
    compact_widgets: bool = False
    show_widgets_panel: bool = False
    wallpapers_history: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


MAX_RECENT_APP_IDS = 24
MAX_RECENT_FILE_IDS = 24
MAX_RECENT_APP_DESKTOP_KEYS = 32
MAX_SHELL_TIMEZONE_LEN = 80
MAX_WINDOWS_SNAPSHOT_WINDOWS = 32
MAX_WINDOWS_SNAPSHOT_PATH = 16
MAX_WINDOWS_SNAPSHOT_PAYLOAD_KEYS = 40
MAX_WINDOWS_SNAPSHOT_STRING = 2_000
MAX_VISUAL_STYLE_PRESETS = 24
MAX_VISUAL_STYLE_PRESET_NAME_LEN = 120
MAX_VISUAL_STYLE_PRESET_ID_LEN = 120
MAX_VISUAL_STYLE_WALLPAPER_REF_LEN = 50_000
_ALLOWED_VISUAL_PRESET_THEMES = frozenset({"dark", "light", "auto"})
_ALLOWED_VISUAL_PRESET_WINDOW_STYLES = frozenset(m.value for m in DesktopWindowStyle)
_ALLOWED_VISUAL_PRESET_ICON_STYLES = frozenset(m.value for m in DesktopIconStyle)

_MAX_CLIPBOARD_SHELL_ITEMS = 25
_MAX_CLIPBOARD_SHELL_STRING = 120_000
_CLIPBOARD_SHELL_KEYS = frozenset({"id", "type", "content", "preview", "timestamp", "pinned", "source"})
_WINDOWS_SNAPSHOT_STRING_KEYS = frozenset({"folderId", "appComponent", "title", "desktopId"})
_WINDOWS_SNAPSHOT_BOOL_KEYS = frozenset({"isMinimized", "isMaximized"})


def _sanitize_windows_snapshot_scalar(value: object) -> object | None:
    if isinstance(value, str):
        return value[:MAX_WINDOWS_SNAPSHOT_STRING]
    if isinstance(value, bool | int | float):
        return value
    if value is None:
        return None
    return None


def _sanitize_windows_snapshot_initial_payload(raw: object) -> dict[str, object] | None:
    if not isinstance(raw, dict):
        return None
    cleaned: dict[str, object] = {}
    for key, value in raw.items():
        if len(cleaned) >= MAX_WINDOWS_SNAPSHOT_PAYLOAD_KEYS:
            break
        if not isinstance(key, str) or not key.strip():
            continue
        sanitized = _sanitize_windows_snapshot_scalar(value)
        if sanitized is not None:
            cleaned[key[:120]] = sanitized
    return cleaned or None


def _sanitize_windows_snapshot_rect(raw: object) -> dict[str, float] | None:
    if not isinstance(raw, dict):
        return None
    x_or_w = raw.get("x", raw.get("width"))
    y_or_h = raw.get("y", raw.get("height"))
    if not isinstance(x_or_w, int | float) or not isinstance(y_or_h, int | float):
        return None
    if "width" in raw or "height" in raw:
        width = max(120.0, min(float(x_or_w), 5_000.0))
        height = max(80.0, min(float(y_or_h), 5_000.0))
        return {"width": width, "height": height}
    x = max(-5_000.0, min(float(x_or_w), 10_000.0))
    y = max(-5_000.0, min(float(y_or_h), 10_000.0))
    return {"x": x, "y": y}


def _sanitize_windows_snapshot(raw: object) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    raw_windows = raw.get("windows")
    if not isinstance(raw_windows, list):
        return None
    windows: list[dict[str, Any]] = []
    for item in raw_windows[:MAX_WINDOWS_SNAPSHOT_WINDOWS]:
        if not isinstance(item, dict):
            continue
        window_type = item.get("type")
        if window_type not in ("app", "folder"):
            continue
        position = _sanitize_windows_snapshot_rect(item.get("position"))
        size = _sanitize_windows_snapshot_rect(item.get("size"))
        if position is None or size is None:
            continue
        cleaned: dict[str, Any] = {
            "type": window_type,
            "position": position,
            "size": size,
        }
        for key in _WINDOWS_SNAPSHOT_STRING_KEYS:
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                cleaned[key] = value.strip()[:MAX_WINDOWS_SNAPSHOT_STRING]
        for key in _WINDOWS_SNAPSHOT_BOOL_KEYS:
            value = item.get(key)
            if isinstance(value, bool):
                cleaned[key] = value
        z_index = item.get("zIndex")
        if isinstance(z_index, int | float):
            cleaned["zIndex"] = int(max(0, min(float(z_index), 1_000_000.0)))
        path = item.get("path")
        if isinstance(path, list):
            cleaned["path"] = [
                entry.strip()[:MAX_WINDOWS_SNAPSHOT_STRING]
                for entry in path[:MAX_WINDOWS_SNAPSHOT_PATH]
                if isinstance(entry, str) and entry.strip()
            ]
        payload = _sanitize_windows_snapshot_initial_payload(item.get("initialPayload"))
        if payload:
            cleaned["initialPayload"] = payload
        windows.append(cleaned)
    active = raw.get("activeDesktopId")
    out: dict[str, Any] = {"windows": windows}
    if isinstance(active, str) and active.strip():
        out["activeDesktopId"] = active.strip()[:120]
    return out


def _sanitize_recent_app_ids_by_desktop(raw: object) -> dict[str, list[str]]:
    """Per-virtual-desktop MRU app ids (shell_state JSON). Caps keys and list sizes."""
    if not isinstance(raw, dict):
        return {}
    out: dict[str, list[str]] = {}
    for k, v in raw.items():
        if len(out) >= MAX_RECENT_APP_DESKTOP_KEYS:
            break
        if not isinstance(k, str):
            continue
        dk = k.strip()
        if not dk or len(dk) > 120:
            continue
        if not isinstance(v, list):
            continue
        ids: list[str] = []
        for x in v:
            if isinstance(x, str) and x.strip():
                s = x.strip()
                if len(s) <= 120 and s not in ids:
                    ids.append(s)
            if len(ids) >= MAX_RECENT_APP_IDS:
                break
        if ids:
            out[dk] = ids
    return out


def _sanitize_clipboard_shell_history(raw: object) -> list[dict[str, Any]]:
    """Strip unknown keys and cap size for JSON stored in shell_state."""
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw[:_MAX_CLIPBOARD_SHELL_ITEMS]:
        if not isinstance(item, dict):
            continue
        cleaned: dict[str, Any] = {}
        for key in _CLIPBOARD_SHELL_KEYS:
            if key not in item:
                continue
            val = item[key]
            if key in ("content", "preview") and isinstance(val, str):
                cleaned[key] = val[:_MAX_CLIPBOARD_SHELL_STRING]
            elif key == "id" and isinstance(val, str):
                cleaned[key] = val[:160]
            elif key == "type" and isinstance(val, str) and val in ("text", "image", "html"):
                cleaned[key] = val
            elif key == "timestamp" and isinstance(val, str):
                cleaned[key] = val[:80]
            elif key == "pinned" and isinstance(val, bool):
                cleaned[key] = val
            elif key == "source" and isinstance(val, str):
                cleaned[key] = val[:500]
        if "id" in cleaned and "type" in cleaned and "content" in cleaned:
            out.append(cleaned)
    return out


_MAX_NOW_PLAYING_TIME_S = float(24 * 3600)
_MUSIC_REPEAT_VALUES = {"none", "all", "one"}
_MAX_MUSIC_QUEUE_ITEMS = 256


def _sanitize_now_playing_shell(raw: object) -> dict[str, Any] | None:
    """Resume queue state for desktop music (content id + position + volume)."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        return None
    if not raw:
        return None
    track_raw = raw.get("track")
    track_out: dict[str, Any] | None = None
    if track_raw is None:
        track_out = None
    elif isinstance(track_raw, dict):
        tid = track_raw.get("id")
        tname = track_raw.get("name")
        if isinstance(tid, str) and tid.strip() and isinstance(tname, str) and tname.strip():
            track_out = {
                "id": tid.strip()[:120],
                "name": tname.strip()[:500],
            }
            tu = track_raw.get("thumbnail_url")
            if tu is None or tu == "":
                track_out["thumbnail_url"] = None
            elif isinstance(tu, str):
                track_out["thumbnail_url"] = tu.strip()[:2048]
            tv = track_raw.get("version")
            if tv is None or tv == "":
                track_out["version"] = None
            elif isinstance(tv, str):
                track_out["version"] = tv.strip()[:256]
    ct_raw = raw.get("current_time")
    if ct_raw is None and "currentTime" in raw:
        ct_raw = raw.get("currentTime")
    try:
        current_time = float(ct_raw) if ct_raw is not None else 0.0
    except (TypeError, ValueError):  # fmt: skip
        current_time = 0.0
    current_time = max(0.0, min(current_time, _MAX_NOW_PLAYING_TIME_S))
    vol_raw = raw.get("volume")
    try:
        volume = float(vol_raw) if vol_raw is not None else 1.0
    except (TypeError, ValueError):  # fmt: skip
        volume = 1.0
    volume = max(0.0, min(1.0, volume))
    return {"track": track_out, "current_time": current_time, "volume": volume}


def _sanitize_music_playback_queue_row(raw: object) -> dict[str, Any] | None:
    """Queue item row for shell_state.music_playback.queue."""
    if isinstance(raw, str):
        tid = raw.strip()[:_MUSIC_CONTENT_ID_MAX_LEN]
        if not tid:
            return None
        return {"id": tid, "name": tid, "thumbnail_url": None, "version": None}
    if not isinstance(raw, dict):
        return None
    tid_raw = raw.get("id")
    if not isinstance(tid_raw, str) or not tid_raw.strip():
        tid_raw = raw.get("track_id")
    if not isinstance(tid_raw, str) or not tid_raw.strip():
        tid_raw = raw.get("content_id")
    if not isinstance(tid_raw, str) or not tid_raw.strip():
        tid_raw = raw.get("unified_content_id")
    if not isinstance(tid_raw, str) or not tid_raw.strip():
        return None
    tid = tid_raw.strip()[:_MUSIC_CONTENT_ID_MAX_LEN]
    name_raw = raw.get("name")
    if not isinstance(name_raw, str) or not name_raw.strip():
        name_raw = raw.get("track_name")
    name = name_raw.strip()[:_MUSIC_PLAYLIST_NAME_MAX_LEN] if isinstance(name_raw, str) and name_raw.strip() else tid
    out: dict[str, Any] = {
        "id": tid,
        "name": name,
        "thumbnail_url": None,
        "version": None,
    }
    thumb_raw = raw.get("thumbnail_url")
    if thumb_raw is None and "thumbnailUrl" in raw:
        thumb_raw = raw.get("thumbnailUrl")
    if thumb_raw is None or thumb_raw == "":
        out["thumbnail_url"] = None
    elif isinstance(thumb_raw, str):
        out["thumbnail_url"] = thumb_raw.strip()[:2048]
    ver_raw = raw.get("version")
    if ver_raw is None or ver_raw == "":
        out["version"] = None
    elif isinstance(ver_raw, str):
        out["version"] = ver_raw.strip()[:256]
    return out


def _sanitize_music_playback_shell(raw: object) -> dict[str, Any] | None:
    """Playback mode + queue persisted for desktop music domain restart."""
    if raw is None or not isinstance(raw, dict) or not raw:
        return None
    out: dict[str, Any] = {}

    rate_raw = raw.get("playback_rate")
    if rate_raw is None and "playbackRate" in raw:
        rate_raw = raw.get("playbackRate")
    if rate_raw is None and "rate" in raw:
        rate_raw = raw.get("rate")
    if rate_raw is not None:
        try:
            rate = float(rate_raw)
        except (TypeError, ValueError):  # fmt: skip
            rate = 1.0
        out["playback_rate"] = max(0.5, min(2.0, rate))

    shuffle_raw = raw.get("shuffle")
    if shuffle_raw is None and "is_shuffle" in raw:
        shuffle_raw = raw.get("is_shuffle")
    if shuffle_raw is None and "isShuffle" in raw:
        shuffle_raw = raw.get("isShuffle")
    if isinstance(shuffle_raw, bool):
        out["shuffle"] = shuffle_raw

    repeat_raw = raw.get("repeat")
    if repeat_raw is None and "repeat_mode" in raw:
        repeat_raw = raw.get("repeat_mode")
    if repeat_raw is None and "repeatMode" in raw:
        repeat_raw = raw.get("repeatMode")
    repeat_val = ""
    if isinstance(repeat_raw, str):
        repeat_val = repeat_raw.strip().lower()
    if repeat_val in _MUSIC_REPEAT_VALUES:
        out["repeat"] = repeat_val
    else:
        repeat_one_raw = raw.get("repeat_one")
        if repeat_one_raw is None and "repeatOne" in raw:
            repeat_one_raw = raw.get("repeatOne")
        repeat_all_raw = raw.get("repeat_all")
        if repeat_all_raw is None and "repeatAll" in raw:
            repeat_all_raw = raw.get("repeatAll")
        if isinstance(repeat_one_raw, bool) and repeat_one_raw:
            out["repeat"] = "one"
        elif isinstance(repeat_all_raw, bool) and repeat_all_raw:
            out["repeat"] = "all"

    queue_raw = raw.get("queue")
    if queue_raw is None:
        queue_raw = raw.get("queue_items")
    if queue_raw is None:
        queue_raw = raw.get("queue_track_ids")
    if queue_raw is None:
        queue_raw = raw.get("queueTrackIds")
    if isinstance(queue_raw, list):
        queue_out: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for row in queue_raw:
            item = _sanitize_music_playback_queue_row(row)
            if not item:
                continue
            tid = item["id"]
            if tid in seen_ids:
                continue
            queue_out.append(item)
            seen_ids.add(tid)
            if len(queue_out) >= _MAX_MUSIC_QUEUE_ITEMS:
                break
        out["queue"] = queue_out

    if not out:
        return None
    return out


_MUSIC_FAVORITES_PLAYLIST_ID = "eliteew-music-favorites"
_MUSIC_PLAYLIST_ID_MAX_LEN = 120
_MUSIC_PLAYLIST_NAME_MAX_LEN = 100
_MUSIC_CONTENT_ID_MAX_LEN = 120
_MAX_MUSIC_PLAYLISTS = 64
_MAX_TRACK_IDS_PER_PLAYLIST = 2000
_MAX_TOTAL_TRACK_ID_ENTRIES = 20000


def _sanitize_music_playlists_shell(raw: object) -> list[dict[str, Any]]:
    """
    Music player playlists in shell_state (JSONB); scoped by desktop_configs.user_id.
    Accepts snake_case track_ids or legacy camelCase trackIds from clients.
    """
    if not isinstance(raw, list):
        raw = []
    buckets: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        pid = item.get("id")
        if not isinstance(pid, str) or not pid.strip():
            continue
        pid = pid.strip()[:_MUSIC_PLAYLIST_ID_MAX_LEN]
        pname = item.get("name")
        if not isinstance(pname, str):
            pname = ""
        pname = pname.strip()[:_MUSIC_PLAYLIST_NAME_MAX_LEN] or "Плейлист"
        tids_raw = item.get("track_ids")
        if tids_raw is None:
            tids_raw = item.get("trackIds")
        tids: list[str] = []
        if isinstance(tids_raw, list):
            for tid in tids_raw:
                if not isinstance(tid, str) or not tid.strip():
                    continue
                s = tid.strip()[:_MUSIC_CONTENT_ID_MAX_LEN]
                if s not in tids:
                    tids.append(s)
                if len(tids) >= _MAX_TRACK_IDS_PER_PLAYLIST:
                    break
        if pid not in buckets:
            if len(buckets) >= _MAX_MUSIC_PLAYLISTS:
                continue
            buckets[pid] = {"id": pid, "name": pname, "track_ids": tids}
            order.append(pid)
        else:
            merged = buckets[pid]
            merged["name"] = pname or merged["name"]
            seen = set(merged["track_ids"])
            for tid in tids:
                if tid in seen:
                    continue
                merged["track_ids"].append(tid)
                seen.add(tid)
                if len(merged["track_ids"]) >= _MAX_TRACK_IDS_PER_PLAYLIST:
                    break
    fav = buckets.pop(_MUSIC_FAVORITES_PLAYLIST_ID, None)
    rest_order = [x for x in order if x != _MUSIC_FAVORITES_PLAYLIST_ID]
    out_list: list[dict[str, Any]] = []
    if fav is None:
        out_list.append(
            {
                "id": _MUSIC_FAVORITES_PLAYLIST_ID,
                "name": "Любимые",
                "track_ids": [],
            }
        )
    else:
        fav["name"] = "Любимые"
        out_list.append(fav)
    for pid in rest_order:
        if pid in buckets:
            out_list.append(buckets[pid])
    if len(out_list) > _MAX_MUSIC_PLAYLISTS:
        out_list = out_list[:_MAX_MUSIC_PLAYLISTS]
    total = 0
    for pl in out_list:
        kept: list[str] = []
        for tid in pl["track_ids"]:
            if total >= _MAX_TOTAL_TRACK_ID_ENTRIES:
                break
            kept.append(tid)
            total += 1
        pl["track_ids"] = kept
    return out_list


def _sanitize_visual_style_presets_shell(raw: Any) -> list[dict[str, Any]]:
    """Named desktop visual bundles (Wave 8); capped list for shell_state JSON."""
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for entry in raw[:MAX_VISUAL_STYLE_PRESETS]:
        if not isinstance(entry, dict):
            continue
        preset_id = str(entry.get("id", "")).strip()[:MAX_VISUAL_STYLE_PRESET_ID_LEN]
        name = str(entry.get("name", "")).strip()[:MAX_VISUAL_STYLE_PRESET_NAME_LEN]
        if not preset_id or not name:
            continue
        theme = str(entry.get("theme", "dark")).strip().lower()
        if theme not in _ALLOWED_VISUAL_PRESET_THEMES:
            theme = "dark"
        accent_follows = bool(entry.get("accentFollows"))

        wi_raw = entry.get("wallpaperIndex")
        wi: int | None
        if isinstance(wi_raw, (int, float)) and not isinstance(wi_raw, bool):  # noqa: SIM108
            wi = int(wi_raw)
        else:
            wi = None
        if wi is None or wi < 1 or wi > 199:
            wi = 1

        wref_raw = entry.get("wallpaperRef")
        wallpaper_ref = ""
        if isinstance(wref_raw, str):
            wallpaper_ref = wref_raw.strip()[:MAX_VISUAL_STYLE_WALLPAPER_REF_LEN]

        accent_raw = entry.get("accent")
        accent_token = ""
        if isinstance(accent_raw, str):
            accent_token = accent_raw.strip()[:80]

        ws = str(entry.get("windowStyle", "glass")).strip().lower()
        if ws not in _ALLOWED_VISUAL_PRESET_WINDOW_STYLES:
            ws = DesktopWindowStyle.GLASS.value

        ts = entry.get("taskbarStyle")
        taskbar_style = ws
        if isinstance(ts, str) and ts.strip().lower() in _ALLOWED_VISUAL_PRESET_WINDOW_STYLES:
            taskbar_style = ts.strip().lower()

        ico = entry.get("iconStyle")
        icon_style = ws
        if isinstance(ico, str) and ico.strip().lower() in _ALLOWED_VISUAL_PRESET_ICON_STYLES:
            icon_style = ico.strip().lower()

        wg = entry.get("widgetsStyle")
        widgets_style = ws
        if isinstance(wg, str) and wg.strip().lower() in _ALLOWED_VISUAL_PRESET_WINDOW_STYLES:
            widgets_style = wg.strip().lower()

        panel_opacity: float | None = None
        pop = entry.get("desktopPanelOpacity")
        if isinstance(pop, (int, float)) and not isinstance(pop, bool):
            panel_opacity = max(0.35, min(1.0, float(pop)))

        ui_scale: float | None = None
        us_raw = entry.get("desktopUiScale")
        if isinstance(us_raw, (int, float)) and not isinstance(us_raw, bool):
            ui_scale = max(0.5, min(1.5, float(us_raw)))

        created_at_raw = entry.get("createdAt")
        created_at = ""
        if isinstance(created_at_raw, str):
            created_at = created_at_raw.strip()[:80]

        blob: dict[str, Any] = {
            "id": preset_id,
            "name": name,
            "theme": theme,
            "accentFollows": accent_follows,
            "wallpaperIndex": wi,
            "windowStyle": ws,
            "taskbarStyle": taskbar_style,
            "iconStyle": icon_style,
            "widgetsStyle": widgets_style,
        }
        if wallpaper_ref:
            blob["wallpaperRef"] = wallpaper_ref
        if accent_token:
            blob["accent"] = accent_token
        if panel_opacity is not None:
            blob["desktopPanelOpacity"] = panel_opacity
        if ui_scale is not None:
            blob["desktopUiScale"] = ui_scale
        if created_at:
            blob["createdAt"] = created_at
        out.append(blob)
    return out


class DesktopWorkspaceProfileWire(BaseModel):
    """Single workspace profile in shell_state.workspace_profiles.profiles."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(default="", max_length=120)
    description: str | None = Field(default=None, max_length=500)
    desktopId: str | None = Field(default=None, max_length=64)
    wallpaper: str | None = Field(default=None, max_length=4096)
    appIds: list[str] = Field(default_factory=list)
    folderItemIds: list[str] = Field(default_factory=list)
    widgetIds: list[str] = Field(default_factory=list)


class DesktopWorkspaceProfilesWire(BaseModel):
    profiles: list[DesktopWorkspaceProfileWire] = Field(default_factory=list)


class DesktopWindowLayoutPresetWire(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(default="", max_length=120)
    description: str | None = Field(default=None, max_length=500)
    windows: list[dict[str, Any]] = Field(default_factory=list)
    createdAt: str | None = Field(default=None, max_length=64)


class DesktopAppCollectionWire(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(default="", max_length=120)
    description: str | None = Field(default=None, max_length=500)
    appIds: list[str] = Field(default_factory=list)
    workspaceProfileId: str | None = Field(default=None, max_length=64)


class DesktopContentShortcutWire(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=64)
    label: str = Field(default="", max_length=120)
    type: str = Field(default="project-folder", max_length=40)
    target: dict[str, str] = Field(default_factory=dict)
    workspaceProfileId: str | None = Field(default=None, max_length=64)


class DesktopAssistantContextActionWire(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=64)
    label: str = Field(default="", max_length=120)
    description: str | None = Field(default=None, max_length=500)
    source: str = Field(default="selection", max_length=40)
    assistantTarget: str = Field(default="assistant", max_length=20)
    enabled: bool = True


class DesktopWidgetLayoutSlotWire(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=64)
    type: str = Field(default="notes", max_length=40)
    enabled: bool = True
    mode: str = Field(default="compact", max_length=20)
    position: dict[str, Any] | None = None
    workspaceProfileId: str | None = Field(default=None, max_length=64)


class DesktopWidgetsLayoutWire(BaseModel):
    model_config = ConfigDict(extra="ignore")

    slots: list[DesktopWidgetLayoutSlotWire] = Field(default_factory=list)
    perWorkspace: bool = False
    panelOffset: dict[str, Any] | None = None
    slotPlacement: str | None = Field(default=None, max_length=20)


def _coerce_workspace_profiles_wire(raw: object) -> DesktopWorkspaceProfilesWire | None:
    if not isinstance(raw, dict):
        return None
    try:
        return DesktopWorkspaceProfilesWire.model_validate(raw)
    except ValidationError:
        return None


def _coerce_window_layout_presets_wire(raw: object) -> list[DesktopWindowLayoutPresetWire]:
    if not isinstance(raw, list):
        return []
    out: list[DesktopWindowLayoutPresetWire] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            out.append(DesktopWindowLayoutPresetWire.model_validate(item))
        except ValidationError:
            continue
    return out


def _coerce_app_collections_wire(raw: object) -> list[DesktopAppCollectionWire]:
    if not isinstance(raw, list):
        return []
    out: list[DesktopAppCollectionWire] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            out.append(DesktopAppCollectionWire.model_validate(item))
        except ValidationError:
            continue
    return out


def _coerce_content_shortcuts_wire(raw: object) -> list[DesktopContentShortcutWire]:
    if not isinstance(raw, list):
        return []
    out: list[DesktopContentShortcutWire] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            out.append(DesktopContentShortcutWire.model_validate(item))
        except ValidationError:
            continue
    return out


def _coerce_assistant_actions_wire(raw: object) -> list[DesktopAssistantContextActionWire]:
    if not isinstance(raw, list):
        return []
    out: list[DesktopAssistantContextActionWire] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            out.append(DesktopAssistantContextActionWire.model_validate(item))
        except ValidationError:
            continue
    return out


def _coerce_widgets_layout_wire(raw: object) -> DesktopWidgetsLayoutWire | None:
    if not isinstance(raw, dict):
        return None
    try:
        return DesktopWidgetsLayoutWire.model_validate(raw)
    except ValidationError:
        return None


class DesktopShellStateOut(BaseModel):
    """Normalized shell state returned by GET /desktop/shell-state."""

    recent_app_ids: list[str] = Field(default_factory=list)
    recent_app_ids_by_desktop: dict[str, list[str]] = Field(default_factory=dict)
    recent_file_ids: list[str] = Field(default_factory=list)
    clipboard_history: list[dict[str, Any]] = Field(default_factory=list)
    virtual_desktops: dict[str, Any] | None = None
    windows_snapshot: dict[str, Any] | None = None
    workspace_profiles: DesktopWorkspaceProfilesWire | None = None
    window_layout_presets: list[DesktopWindowLayoutPresetWire] = Field(default_factory=list)
    widgets_layout: DesktopWidgetsLayoutWire | None = None
    app_collections: list[DesktopAppCollectionWire] = Field(default_factory=list)
    content_shortcuts: list[DesktopContentShortcutWire] = Field(default_factory=list)
    assistant_context_actions: list[DesktopAssistantContextActionWire] = Field(default_factory=list)
    clock_show_seconds: bool | None = None
    timezone: str | None = None
    quiet_mode: bool | None = None
    now_playing: dict[str, Any] | None = None
    music_playback: dict[str, Any] | None = None
    gaf_chat_sound_enabled: bool | None = None
    tray_show_feedback: bool | None = None
    tray_show_assistant: bool | None = None
    music_playlists: list[dict[str, Any]] = Field(default_factory=list)
    visual_style_presets: list[dict[str, Any]] = Field(default_factory=list)
    ewa_hints: dict[str, Any] | None = None


class DesktopShellStatePatch(BaseModel):
    """Partial update; null/absent keys are ignored (no field deletion)."""

    recent_app_ids: list[str] | None = None
    recent_app_ids_by_desktop: dict[str, list[str]] | None = None
    recent_file_ids: list[str] | None = None
    clipboard_history: list[Any] | None = None
    virtual_desktops: dict[str, Any] | None = None
    windows_snapshot: dict[str, Any] | None = None
    workspace_profiles: DesktopWorkspaceProfilesWire | None = None
    window_layout_presets: list[DesktopWindowLayoutPresetWire] | None = None
    widgets_layout: DesktopWidgetsLayoutWire | None = None
    app_collections: list[DesktopAppCollectionWire] | None = None
    content_shortcuts: list[DesktopContentShortcutWire] | None = None
    assistant_context_actions: list[DesktopAssistantContextActionWire] | None = None
    clock_show_seconds: bool | None = None
    timezone: str | None = None
    quiet_mode: bool | None = None
    now_playing: dict[str, Any] | None = None
    music_playback: dict[str, Any] | None = None
    gaf_chat_sound_enabled: bool | None = None
    tray_show_feedback: bool | None = None
    tray_show_assistant: bool | None = None
    music_playlists: list[Any] | None = None
    visual_style_presets: list[Any] | None = None
    ewa_hints: dict[str, Any] | None = None

    @field_validator("now_playing")
    @classmethod
    def sanitize_now_playing_patch(cls, v: Any) -> dict[str, Any] | None:
        if v is None:
            return None
        if not isinstance(v, dict):
            return None
        return _sanitize_now_playing_shell(v)

    @field_validator("music_playback")
    @classmethod
    def sanitize_music_playback_patch(cls, v: Any) -> dict[str, Any] | None:
        if v is None:
            return None
        return _sanitize_music_playback_shell(v)

    @field_validator("clipboard_history")
    @classmethod
    def sanitize_clipboard_history_patch(cls, v: list[Any] | None) -> list[dict[str, Any]] | None:
        if v is None:
            return None
        return _sanitize_clipboard_shell_history(v)

    @field_validator("windows_snapshot", mode="before")
    @classmethod
    def sanitize_windows_snapshot_patch(cls, v: Any) -> dict[str, Any] | None:
        if v is None:
            return None
        return _sanitize_windows_snapshot(v)

    @field_validator("recent_app_ids")
    @classmethod
    def trim_recent_apps(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned: list[str] = []
        for raw in v:
            if not isinstance(raw, str):
                continue
            s = raw.strip()
            if not s or len(s) > 120:
                continue
            if s not in cleaned:
                cleaned.append(s)
            if len(cleaned) >= MAX_RECENT_APP_IDS:
                break
        return cleaned

    @field_validator("recent_app_ids_by_desktop")
    @classmethod
    def sanitize_recent_app_ids_by_desktop_patch(
        cls,
        v: object,
    ) -> dict[str, list[str]] | None:
        if v is None:
            return None
        return _sanitize_recent_app_ids_by_desktop(v)

    @field_validator("recent_file_ids")
    @classmethod
    def trim_recent_files(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned: list[str] = []
        for raw in v:
            if not isinstance(raw, str):
                continue
            s = raw.strip()
            if not s or len(s) > 120:
                continue
            if s not in cleaned:
                cleaned.append(s)
            if len(cleaned) >= MAX_RECENT_FILE_IDS:
                break
        return cleaned

    @field_validator("timezone")
    @classmethod
    def trim_timezone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if not s:
            return None
        return s[:MAX_SHELL_TIMEZONE_LEN]

    @field_validator("music_playlists")
    @classmethod
    def sanitize_music_playlists_patch(cls, v: Any) -> list[dict[str, Any]] | None:
        if v is None:
            return None
        return _sanitize_music_playlists_shell(v)

    @field_validator("visual_style_presets")
    @classmethod
    def sanitize_visual_style_presets_patch(cls, v: Any) -> list[dict[str, Any]] | None:
        if v is None:
            return None
        return _sanitize_visual_style_presets_shell(v)

    @field_validator("ewa_hints", mode="before")
    @classmethod
    def sanitize_ewa_hints_patch(cls, v: Any) -> dict[str, Any] | None:
        if v is None:
            return None
        if not isinstance(v, dict):
            return None
        return dict(v)


def _normalize_shell_state(raw: object) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    return dict(raw)


def _shell_state_to_out(data: dict[str, Any]) -> DesktopShellStateOut:
    recent = data.get("recent_app_ids")
    ids: list[str] = []
    if isinstance(recent, list):
        for x in recent:
            if isinstance(x, str) and x.strip():
                s = x.strip()
                if len(s) <= 120 and s not in ids:
                    ids.append(s)
            if len(ids) >= MAX_RECENT_APP_IDS:
                break
    recent_by_desktop = _sanitize_recent_app_ids_by_desktop(data.get("recent_app_ids_by_desktop"))
    file_ids_raw = data.get("recent_file_ids")
    file_ids: list[str] = []
    if isinstance(file_ids_raw, list):
        for x in file_ids_raw:
            if isinstance(x, str) and x.strip():
                s = x.strip()
                if len(s) <= 120 and s not in file_ids:
                    file_ids.append(s)
            if len(file_ids) >= MAX_RECENT_FILE_IDS:
                break
    vd = data.get("virtual_desktops")
    ws = _sanitize_windows_snapshot(data.get("windows_snapshot"))
    workspace_profiles = data.get("workspace_profiles")
    window_layout_presets = data.get("window_layout_presets")
    widgets_layout = data.get("widgets_layout")
    app_collections = data.get("app_collections")
    content_shortcuts = data.get("content_shortcuts")
    assistant_context_actions = data.get("assistant_context_actions")
    cs_raw = data.get("clock_show_seconds")
    tz_raw = data.get("timezone")
    qm_raw = data.get("quiet_mode")
    gcs_raw = data.get("gaf_chat_sound_enabled")
    tsf_raw = data.get("tray_show_feedback")
    tsa_raw = data.get("tray_show_assistant")
    clip = _sanitize_clipboard_shell_history(data.get("clipboard_history"))
    np_raw = data.get("now_playing")
    now_playing = _sanitize_now_playing_shell(np_raw) if isinstance(np_raw, dict) and np_raw else None
    mpb_raw = data.get("music_playback")
    music_playback = _sanitize_music_playback_shell(mpb_raw) if isinstance(mpb_raw, dict) and mpb_raw else None
    mp_raw = data.get("music_playlists")
    music_playlists = _sanitize_music_playlists_shell(mp_raw if mp_raw is not None else [])
    visual_style_presets = _sanitize_visual_style_presets_shell(data.get("visual_style_presets"))
    aph_raw = data.get("ewa_hints")
    ewa_hints = aph_raw if isinstance(aph_raw, dict) else None
    return DesktopShellStateOut(
        recent_app_ids=ids,
        recent_app_ids_by_desktop=recent_by_desktop,
        recent_file_ids=file_ids,
        clipboard_history=clip,
        virtual_desktops=vd if isinstance(vd, dict) else None,
        windows_snapshot=ws,
        workspace_profiles=_coerce_workspace_profiles_wire(workspace_profiles),
        window_layout_presets=_coerce_window_layout_presets_wire(window_layout_presets),
        widgets_layout=_coerce_widgets_layout_wire(widgets_layout),
        app_collections=_coerce_app_collections_wire(app_collections),
        content_shortcuts=_coerce_content_shortcuts_wire(content_shortcuts),
        assistant_context_actions=_coerce_assistant_actions_wire(assistant_context_actions),
        clock_show_seconds=cs_raw if isinstance(cs_raw, bool) else None,
        timezone=tz_raw if isinstance(tz_raw, str) else None,
        quiet_mode=qm_raw if isinstance(qm_raw, bool) else None,
        now_playing=now_playing,
        music_playback=music_playback,
        gaf_chat_sound_enabled=gcs_raw if isinstance(gcs_raw, bool) else None,
        tray_show_feedback=tsf_raw if isinstance(tsf_raw, bool) else None,
        tray_show_assistant=tsa_raw if isinstance(tsa_raw, bool) else None,
        music_playlists=music_playlists,
        visual_style_presets=visual_style_presets,
        ewa_hints=ewa_hints,
    )


SHELL_STATE_FIELD_ETAGS_HEADER = "X-Shell-State-Field-ETags"
SHELL_STATE_IF_MATCH_FIELDS_HEADER = "X-Shell-State-If-Match-Fields"


def _stable_json_digest(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _weak_etag_for_pydantic_model(payload: BaseModel) -> str:
    digest = hashlib.sha256(payload.model_dump_json().encode("utf-8")).hexdigest()
    return f'"{digest}"'


def _shell_state_field_etags(payload: DesktopShellStateOut) -> dict[str, str]:
    dumped = payload.model_dump(mode="json")
    return {key: f'"{_stable_json_digest(value)}"' for key, value in dumped.items()}


def _set_shell_state_etag_headers(response: Response, payload: DesktopShellStateOut) -> str:
    etag = _weak_etag_for_pydantic_model(payload)
    response.headers["ETag"] = etag
    response.headers[SHELL_STATE_FIELD_ETAGS_HEADER] = json.dumps(
        _shell_state_field_etags(payload),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return etag


def _if_none_match_matches(header_value: str | None, etag_quoted: str) -> bool:
    if not header_value:
        return False
    stripped = header_value.strip()
    if stripped == "*":
        return True
    inner = etag_quoted.strip('"')
    for part in stripped.split(","):
        token = part.strip()
        if token.startswith("W/"):
            token = token[2:].strip()
        if token.startswith('"') and token.endswith('"'):
            token = token[1:-1]
        if token == inner:
            return True
    return False


def _parse_shell_state_field_etags_header(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in parsed.items():
        if isinstance(key, str) and isinstance(value, str) and key:
            out[key] = value
    return out


def _shell_state_patch_keys(patch: dict[str, Any]) -> set[str]:
    return {key for key, value in patch.items() if value is not None}


def _raise_if_shell_state_etag_conflict(
    if_match: str | None,
    current_etag: str,
    *,
    current_field_etags: dict[str, str] | None = None,
    patch_keys: set[str] | None = None,
    if_match_fields: str | None = None,
) -> None:
    if if_match and not _if_none_match_matches(if_match, current_etag):
        field_etags = current_field_etags or {}
        keys = patch_keys or set()
        provided_field_etags = _parse_shell_state_field_etags_header(if_match_fields)
        if keys and provided_field_etags:
            disjoint_from_current_changes = all(provided_field_etags.get(key) == field_etags.get(key) for key in keys)
            if disjoint_from_current_changes:
                return
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail={
                "code": "desktop_shell_state_conflict",
                "message": "Desktop shell state changed in another session",
                "current_etag": current_etag,
                "current_field_etags": field_etags,
            },
        )


# ============= Config Endpoints =============


async def load_desktop_config_response(db: AsyncSession, user_id: UUID) -> DesktopConfigResponse:
    """Create/normalize desktop config + system folders/App Store icon.

    Shared by ``GET /desktop/config`` and ``GET /desktop/shell-bootstrap``.
    """
    result = await db.execute(select(DesktopConfig).where(DesktopConfig.user_id == user_id))
    config = result.scalar_one_or_none()

    if not config:
        default_wallpaper = DEFAULT_DESKTOP_WALLPAPER
        config = DesktopConfig(
            user_id=user_id,
            wallpaper=default_wallpaper,
            icon_size=IconSize.MEDIUM,
            show_widget=False,
            widget_position={"x": 20, "y": 20},
            theme=Theme.DARK,
            widgets_panel_position="top-right",
            compact_widgets=False,
            show_widgets_panel=False,
            wallpapers_history=[default_wallpaper],
        )
        db.add(config)
        try:
            await db.commit()
            await db.refresh(config)
        except IntegrityError:
            await db.rollback()
            result = await db.execute(select(DesktopConfig).where(DesktopConfig.user_id == user_id))
            config = result.scalar_one_or_none()
            if not config:
                raise
    else:
        config_changed = _disable_legacy_floating_widget(config)
        history = _normalize_wallpaper_history(getattr(config, "wallpapers_history", []))
        if not history:
            current = getattr(config, "wallpaper", None)
            if isinstance(current, str) and current:
                history = [current]
        else:
            current = getattr(config, "wallpaper", None)
            if isinstance(current, str) and current and current not in history:
                history.insert(0, current)
        if history != getattr(config, "wallpapers_history", None):
            cfg_hist: Any = config
            cfg_hist.wallpapers_history = history
            config_changed = True
        if config_changed:
            await db.commit()
            await db.refresh(config)

    from api.routers.desktop import ensure_app_store_icon, ensure_system_folders

    await ensure_system_folders(db, config)
    await ensure_app_store_icon(db, config)
    await db.commit()
    await db.refresh(config)
    return DesktopConfigResponse.model_validate(config)


@router.get(
    "/config",
    response_model=DesktopConfigResponse,
    responses={304: {"description": "Not Modified — If-None-Match matched ETag."}},
)
async def get_config(
    request: Request,
    response: Response,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Get user's desktop configuration (creates default if not exists)"""
    payload = await load_desktop_config_response(db, user_id)
    etag = _weak_etag_for_pydantic_model(payload)
    response.headers["ETag"] = etag
    if _if_none_match_matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})
    return payload


@router.post("/config", response_model=DesktopConfigResponse)
async def create_config(
    data: DesktopConfigCreate,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Create user's desktop configuration"""
    # Check if config already exists
    result = await db.execute(select(DesktopConfig).where(DesktopConfig.user_id == user_id))
    existing = result.scalar_one_or_none()

    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Desktop config already exists")

    config = DesktopConfig(
        user_id=user_id,
        wallpaper=data.wallpaper,
        icon_size=data.icon_size,
        show_widget=False,
        widget_position=data.widget_position.model_dump(),
        theme=data.theme,
        accent_color=data.accent_color,
        live_wallpaper=data.live_wallpaper,
        snap_to_grid=data.snap_to_grid,
        grid_step=data.grid_step,
        widgets_panel_position=data.widgets_panel_position,
        compact_widgets=data.compact_widgets,
        show_widgets_panel=data.show_widgets_panel,
    )
    _update_wallpaper_history(config, data.wallpaper)
    db.add(config)
    await db.commit()
    await db.refresh(config)

    return config


@router.patch("/config", response_model=DesktopConfigResponse)
async def update_config(
    data: DesktopConfigUpdate,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Update user's desktop configuration"""
    result = await db.execute(select(DesktopConfig).where(DesktopConfig.user_id == user_id))
    config = result.scalar_one_or_none()

    if not config:
        # Create if not exists
        config = DesktopConfig(user_id=user_id)
        db.add(config)

    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    new_wallpaper = update_data.get("wallpaper")
    has_explicit_history = "wallpapers_history" in update_data
    for field, value in update_data.items():
        if value is not None:
            if field == "wallpapers_history":
                continue
            if field == "widget_position" and isinstance(value, Position):
                setattr(config, field, value.model_dump())
            else:
                setattr(config, field, value)

    _disable_legacy_floating_widget(config)

    if has_explicit_history:
        raw_hist = update_data.get("wallpapers_history")
        hist = _normalize_wallpaper_history(raw_hist if isinstance(raw_hist, list) else [])
        if len(hist) > MAX_WALLPAPER_HISTORY:
            hist = hist[:MAX_WALLPAPER_HISTORY]
        cfg_patch: Any = config
        cfg_patch.wallpapers_history = hist
        flag_modified(config, "wallpapers_history")
    elif isinstance(new_wallpaper, str):
        _update_wallpaper_history(config, new_wallpaper)
        flag_modified(config, "wallpapers_history")

    await db.commit()
    await db.refresh(config)

    return config


@router.put("/config", response_model=DesktopConfigResponse)
async def replace_config(
    data: DesktopConfigCreate,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Replace user's desktop configuration"""
    result = await db.execute(select(DesktopConfig).where(DesktopConfig.user_id == user_id))
    config = result.scalar_one_or_none()

    if not config:
        config = DesktopConfig(user_id=user_id)
        db.add(config)

    cfg_replace: Any = config
    cfg_replace.wallpaper = data.wallpaper
    cfg_replace.icon_size = data.icon_size
    cfg_replace.show_widget = False
    cfg_replace.widget_position = data.widget_position.model_dump()
    cfg_replace.theme = data.theme
    cfg_replace.accent_color = data.accent_color
    cfg_replace.live_wallpaper = data.live_wallpaper
    cfg_replace.snap_to_grid = data.snap_to_grid
    cfg_replace.grid_step = data.grid_step
    cfg_replace.widgets_panel_position = data.widgets_panel_position
    cfg_replace.compact_widgets = data.compact_widgets
    cfg_replace.show_widgets_panel = data.show_widgets_panel
    _update_wallpaper_history(config, data.wallpaper)

    await db.commit()
    await db.refresh(config)

    return config


# ============= Shell state (recents, VDs, windows, clock prefs) =============


async def _get_or_create_desktop_config_row(db: AsyncSession, user_id: UUID) -> DesktopConfig:
    result = await db.execute(select(DesktopConfig).where(DesktopConfig.user_id == user_id))
    config = result.scalar_one_or_none()
    if not config:
        default_wallpaper = DEFAULT_DESKTOP_WALLPAPER
        config = DesktopConfig(
            user_id=user_id,
            wallpaper=default_wallpaper,
            wallpapers_history=[default_wallpaper],
        )
        db.add(config)
        try:
            await db.commit()
            await db.refresh(config)
        except IntegrityError:
            await db.rollback()
            result = await db.execute(select(DesktopConfig).where(DesktopConfig.user_id == user_id))
            config = result.scalar_one_or_none()
            if not config:
                raise
    return config


@router.get(
    "/shell-state",
    response_model=DesktopShellStateOut,
    responses={304: {"description": "Not Modified — If-None-Match matched ETag."}},
)
async def get_shell_state(
    request: Request,
    response: Response,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Ephemeral desktop shell state (MRU apps, virtual desktops, window snapshot, …)."""
    _ = current_user
    config = await _get_or_create_desktop_config_row(db, user_id)
    raw = getattr(config, "shell_state", None)
    out = _shell_state_to_out(_normalize_shell_state(raw))
    etag = _set_shell_state_etag_headers(response, out)
    if _if_none_match_matches(request.headers.get("if-none-match"), etag):
        observe_desktop_shell_state_get_304()
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={
                "ETag": etag,
                SHELL_STATE_FIELD_ETAGS_HEADER: response.headers[SHELL_STATE_FIELD_ETAGS_HEADER],
            },
        )
    return out


@router.patch("/shell-state", response_model=DesktopShellStateOut)
async def patch_shell_state(
    data: DesktopShellStatePatch,
    request: Request,
    response: Response,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Merge partial shell state into stored JSON (top-level keys replaced when present)."""
    _ = current_user
    started = time.perf_counter()
    result_label = "error"
    try:
        config = await _get_or_create_desktop_config_row(db, user_id)
        current = _normalize_shell_state(getattr(config, "shell_state", None))
        current_out = _shell_state_to_out(current)
        current_etag = _weak_etag_for_pydantic_model(current_out)
        patch = data.model_dump(exclude_unset=True)
        _raise_if_shell_state_etag_conflict(
            request.headers.get("if-match"),
            current_etag,
            current_field_etags=_shell_state_field_etags(current_out),
            patch_keys=_shell_state_patch_keys(patch),
            if_match_fields=request.headers.get(SHELL_STATE_IF_MATCH_FIELDS_HEADER),
        )
        for key, value in patch.items():
            if value is None:
                continue
            current[key] = value
        cfg_shell: Any = config
        cfg_shell.shell_state = current
        flag_modified(config, "shell_state")
        await db.commit()
        await db.refresh(config)
        out = _shell_state_to_out(current)
        _set_shell_state_etag_headers(response, out)
        result_label = "ok"
        return out
    except HTTPException as exc:
        if exc.status_code == status.HTTP_412_PRECONDITION_FAILED:
            result_label = "conflict_412"
        raise
    except Exception:
        result_label = "error"
        raise
    finally:
        observe_desktop_shell_state_patch(
            result=result_label,
            duration_seconds=time.perf_counter() - started,
        )
