# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# CRUD for Stable Core settings table.
# Related:
# - routers/config.py GET/PUT /api/config
# ---

"""Settings persistence layer."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Iterable

from .db import connect, core_db_path
from .defaults import DEFAULT_SETTINGS, ENV_ALIASES, PUBLIC_META, SETTING_KEYS


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value).strip().lower()
    return text not in {"0", "false", "off", "no", ""}


def _coerce_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_value(key: str, value: Any) -> Any:
    meta = PUBLIC_META.get(key, {})
    kind = meta.get("type", "string")
    if kind == "bool":
        return _coerce_bool(value)
    if kind == "int":
        return _coerce_int(value, int(DEFAULT_SETTINGS.get(key, 0)))
    return str(value).strip() if value is not None else ""


def persisted_keys() -> set[str]:
    conn = connect()
    rows = conn.execute("SELECT key FROM settings").fetchall()
    return {str(row["key"]) for row in rows}


def load_all() -> Dict[str, Any]:
    conn = connect()
    rows = conn.execute("SELECT key, value_json FROM settings").fetchall()
    out = dict(DEFAULT_SETTINGS)
    for row in rows:
        key = str(row["key"])
        try:
            out[key] = json.loads(str(row["value_json"]))
        except json.JSONDecodeError:
            continue
    return out


def get(key: str, default: Any = None) -> Any:
    conn = connect()
    row = conn.execute(
        "SELECT value_json FROM settings WHERE key = ?",
        (key,),
    ).fetchone()
    if row is None:
        if default is not None:
            return default
        return DEFAULT_SETTINGS.get(key)
    try:
        return json.loads(str(row["value_json"]))
    except json.JSONDecodeError:
        return DEFAULT_SETTINGS.get(key)


def put_many(updates: Dict[str, Any]) -> Dict[str, Any]:
    conn = connect()
    now = datetime.now(timezone.utc).isoformat()
    for key, raw in updates.items():
        if key not in SETTING_KEYS:
            continue
        value = _normalize_value(key, raw)
        conn.execute(
            """
            INSERT INTO settings (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = excluded.updated_at
            """,
            (key, json.dumps(value), now),
        )
    conn.commit()
    return load_all()


def seed_from_env_if_empty() -> bool:
    """One-time bootstrap from env / legacy llm-endpoint.json."""
    conn = connect()
    count = conn.execute("SELECT COUNT(*) AS c FROM settings").fetchone()
    if count and int(count["c"]) > 0:
        return False
    seed: Dict[str, Any] = dict(DEFAULT_SETTINGS)
    for env_key, setting_key in ENV_ALIASES.items():
        raw = os.getenv(env_key)
        if raw is None or raw == "":
            continue
        if setting_key.startswith("EWGEN_") or setting_key.endswith("_LLM"):
            seed[setting_key] = _coerce_bool(raw)
        elif setting_key == "llm_base_url":
            seed[setting_key] = raw.strip()
        else:
            seed[setting_key] = raw
    # Legacy llm-endpoint.json
    try:
        from generators.factory.llm_runtime import get_current

        current = get_current()
        seed["llm_endpoint_id"] = current.get("id", seed["llm_endpoint_id"])
        seed["llm_base_url"] = current.get("baseUrl", seed["llm_base_url"])
    except Exception:  # noqa: BLE001
        pass
    put_many(seed)
    return True


def public_view(settings: Dict[str, Any] | None = None) -> Dict[str, Any]:
    data = settings or load_all()
    fields = []
    for key in SETTING_KEYS:
        meta = PUBLIC_META.get(key, {})
        fields.append(
            {
                "key": key,
                "value": data.get(key, DEFAULT_SETTINGS.get(key)),
                "type": meta.get("type", "string"),
                "label": meta.get("label", key),
            }
        )
    return {
        "ok": True,
        "schemaVersion": "ewgen_control_tower_v1",
        "settings": data,
        "fields": fields,
        "dbPath": str(core_db_path()),
    }
