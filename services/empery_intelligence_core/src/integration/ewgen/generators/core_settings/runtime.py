# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Hot-reloadable in-memory settings cache (60s poll from Stable Core DB).
# Invariants:
# - All ASE modules read operational flags via this module, not os.getenv.
# Related:
# - generators/atomizer/meta_overlay.py
# - generators/synthesis/architect_overlay.py
# ---

"""Runtime settings cache with periodic refresh."""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Dict, Optional

from .defaults import DEFAULT_SETTINGS, ENV_ALIASES
from . import store

logger = logging.getLogger("ewgen.core_settings.runtime")

REFRESH_SECONDS = 60
_cache: Dict[str, Any] = dict(DEFAULT_SETTINGS)
_cache_lock = threading.Lock()
_last_refresh = 0.0
_poller: threading.Thread | None = None
_poller_stop = threading.Event()


def _env_key_for_setting(key: str) -> str:
    for env_key, setting_key in ENV_ALIASES.items():
        if setting_key == key:
            return env_key
    return key


def _env_bool(key: str) -> bool | None:
    if key in store.persisted_keys():
        return None
    raw = os.getenv(_env_key_for_setting(key))
    if raw is None or raw == "":
        return None
    text = str(raw).strip().lower()
    return text not in {"0", "false", "off", "no", ""}


def _env_int(key: str) -> int | None:
    if key in store.persisted_keys():
        return None
    raw = os.getenv(_env_key_for_setting(key))
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _env_str(key: str) -> str | None:
    if key in store.persisted_keys():
        return None
    raw = os.getenv(_env_key_for_setting(key))
    if raw is None:
        return None
    text = str(raw).strip()
    return text if text else None


def refresh(force: bool = False) -> Dict[str, Any]:
    global _cache, _last_refresh
    now = time.monotonic()
    if not force and now - _last_refresh < 1.0:
        return dict(_cache)
    with _cache_lock:
        _cache = store.load_all()
        _last_refresh = time.monotonic()
        logger.debug("[STEP] core_settings_refresh keys=%s", len(_cache))
        return dict(_cache)


def maybe_refresh() -> None:
    if time.monotonic() - _last_refresh >= REFRESH_SECONDS:
        refresh(force=True)


def snapshot() -> Dict[str, Any]:
    maybe_refresh()
    with _cache_lock:
        return dict(_cache)


def get_bool(key: str, *, default: Optional[bool] = None) -> bool:
    maybe_refresh()
    env_val = _env_bool(key)
    if env_val is not None:
        return env_val
    with _cache_lock:
        val = _cache.get(key, default if default is not None else DEFAULT_SETTINGS.get(key))
    if isinstance(val, bool):
        return val
    text = str(val).strip().lower()
    return text not in {"0", "false", "off", "no", ""}


def get_int(key: str, *, default: Optional[int] = None) -> int:
    maybe_refresh()
    env_val = _env_int(key)
    if env_val is not None:
        return env_val
    with _cache_lock:
        val = _cache.get(key, default if default is not None else DEFAULT_SETTINGS.get(key, 0))
    try:
        return int(val)
    except (TypeError, ValueError):
        return int(default or 0)


def get_str(key: str, *, default: Optional[str] = None) -> str:
    maybe_refresh()
    env_val = _env_str(key)
    if env_val is not None:
        return env_val
    with _cache_lock:
        val = _cache.get(key, default if default is not None else DEFAULT_SETTINGS.get(key, ""))
    return str(val or "")


def apply_side_effects(updated: Dict[str, Any]) -> None:
    """Sync dependent runtime modules after PUT (no process restart)."""
    if not updated:
        return
    llm_keys = {"llm_endpoint_id", "llm_base_url"}
    if llm_keys.intersection(updated.keys()):
        try:
            from generators.factory import llm_runtime
            from generators.factory.llama_client import reset_llama_client

            eid = get_str("llm_endpoint_id")
            url = get_str("llm_base_url")
            llm_runtime.set_endpoint(endpoint_id=eid, base_url=url)
            reset_llama_client()
            logger.info("[STEP] core_settings_llm_hot_reload id=%s", eid)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[STEP] core_settings_llm_reload_skip err=%s", exc)


def start_poller(interval_seconds: int = REFRESH_SECONDS) -> None:
    global _poller
    if _poller is not None and _poller.is_alive():
        return

    def _loop() -> None:
        while not _poller_stop.wait(timeout=interval_seconds):
            try:
                refresh(force=True)
            except Exception as exc:  # noqa: BLE001
                logger.debug("[STEP] core_settings_poll_err=%s", exc)

    _poller = threading.Thread(
        target=_loop,
        name="ewgen-core-settings-poller",
        daemon=True,
    )
    _poller.start()


def stop_poller() -> None:
    _poller_stop.set()


def bootstrap() -> None:
    store.seed_from_env_if_empty()
    refresh(force=True)
    apply_side_effects({"llm_endpoint_id": get_str("llm_endpoint_id"), "llm_base_url": get_str("llm_base_url")})
    start_poller()


def reset_for_tests() -> None:
    """Close SQLite handle and reset in-memory cache (pytest isolation)."""
    from .db import reset_connection_for_tests

    global _last_refresh
    stop_poller()
    _poller_stop.clear()
    reset_connection_for_tests()
    with _cache_lock:
        _cache = dict(DEFAULT_SETTINGS)
        _last_refresh = 0.0
