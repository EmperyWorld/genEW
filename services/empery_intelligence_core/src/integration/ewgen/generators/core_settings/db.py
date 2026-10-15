# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Stable Core SQLite connection for EWGen settings (fortress-owned path).
# Invariants:
# - Never targets EliteEW / stack Postgres; local ewgen-core only.
# Related:
# - generators/instances/core_db_guard.py
# ---

"""Stable Core settings database (SQLite)."""

from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path
from typing import Iterator

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def core_db_path() -> Path:
    configured = (os.getenv("EWGEN_CORE_DB_PATH") or "").strip()
    if configured:
        return Path(configured)
    data = Path(
        os.getenv("EWGEN_DATA_DIR")
        or Path(__file__).resolve().parents[2] / "data"
    )
    return data / "ewgen-core" / "settings.db"


def connect() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is not None:
            return _conn
        path = core_db_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(path), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript(SCHEMA)
        _conn.commit()
        return _conn


def reset_connection_for_tests() -> None:
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
            _conn = None


def cursor() -> Iterator[sqlite3.Cursor]:
    conn = connect()
    cur = conn.cursor()
    try:
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
