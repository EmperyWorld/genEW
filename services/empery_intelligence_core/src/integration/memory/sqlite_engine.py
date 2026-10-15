"""SQLite bootstrap helpers for the Atom store."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import text

from core.data.database import DatabaseManager, register_sqlite_fk_pragma
from services.empery_intelligence_core.src.data.memory.orm import Base


def ensure_sqlite_parent_dir(database_url: str) -> None:
    """Create parent directory for file-backed sqlite URLs."""
    if not database_url.startswith("sqlite"):
        return
    # sqlite+pysqlite:///relative or ////absolute
    prefix = "sqlite+pysqlite:///"
    if database_url.startswith(prefix):
        path_part = database_url[len(prefix) :]
    elif database_url.startswith("sqlite:///"):
        path_part = database_url[len("sqlite:///") :]
    else:
        return
    if path_part in {":memory:", ""} or path_part.startswith(":memory:"):
        return
    path = Path(path_part)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)


def bootstrap_memory_db(
    db: DatabaseManager,
    *,
    auto_create_tables: bool = True,
) -> bool:
    """
    Ensure FK pragma + tables. Returns True when FTS5 virtual table is available.
    """
    if db.database_url.startswith("sqlite"):
        register_sqlite_fk_pragma(db.engine)
        ensure_sqlite_parent_dir(db.database_url)

    if auto_create_tables or db.database_url.startswith("sqlite"):
        db.create_all(Base.metadata)

    return ensure_fts5(db)


def ensure_fts5(db: DatabaseManager) -> bool:
    """Create FTS5 virtual table when dialect supports it; else return False."""
    if db.engine.dialect.name != "sqlite":
        return False
    try:
        with db.engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE VIRTUAL TABLE IF NOT EXISTS eic_atoms_fts
                    USING fts5(
                        atom_id UNINDEXED,
                        title,
                        body,
                        tokenize = 'porter'
                    )
                    """
                )
            )
        return True
    except Exception:  # noqa: BLE001 — fall back to LIKE search
        return False
