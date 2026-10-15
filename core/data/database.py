"""SQLAlchemy 2.x database engine and session lifecycle manager."""

from __future__ import annotations

from collections.abc import Generator, Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


class DatabaseManager:
    """
    Manages SQLAlchemy engine/session lifecycle for service modules.

    Designed for FastAPI lifespan: construct once, resolve via ServiceContainer,
    call ``dispose()`` on shutdown.
    """

    def __init__(
        self,
        database_url: str,
        *,
        echo: bool = False,
        engine_kwargs: dict[str, Any] | None = None,
    ) -> None:
        self._database_url = database_url
        kwargs: dict[str, Any] = {"echo": echo, "future": True}
        if engine_kwargs:
            kwargs.update(engine_kwargs)
        if database_url.startswith("sqlite"):
            kwargs.setdefault("connect_args", {"check_same_thread": False})
            if ":memory:" in database_url:
                kwargs.setdefault("poolclass", StaticPool)
        self._engine: Engine = create_engine(database_url, **kwargs)
        self._session_factory = sessionmaker(
            bind=self._engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            class_=Session,
        )

    @classmethod
    def from_url(
        cls,
        database_url: str,
        *,
        echo: bool = False,
        engine_kwargs: dict[str, Any] | None = None,
    ) -> DatabaseManager:
        """Create a manager from a SQLAlchemy database URL."""
        return cls(database_url, echo=echo, engine_kwargs=engine_kwargs)

    @property
    def database_url(self) -> str:
        return self._database_url

    @property
    def engine(self) -> Engine:
        return self._engine

    def create_all(self, metadata: Any) -> None:
        """Create all tables for the given SQLAlchemy MetaData (useful for tests)."""
        metadata.create_all(bind=self._engine)

    def drop_all(self, metadata: Any) -> None:
        """Drop all tables for the given SQLAlchemy MetaData."""
        metadata.drop_all(bind=self._engine)

    @contextmanager
    def session_scope(self) -> Generator[Session, None, None]:
        """Provide a transactional session scope (commit/rollback/close)."""
        session = self._session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def sessions(self) -> Iterator[Session]:
        """Iterator alias for session_scope (generator protocol)."""
        with self.session_scope() as session:
            yield session

    def ping(self) -> bool:
        """Return True when the database accepts a simple connection."""
        with self._engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True

    def dispose(self) -> None:
        """Dispose the engine connection pool (call on application shutdown)."""
        self._engine.dispose()


def register_sqlite_fk_pragma(engine: Engine) -> None:
    """Enable SQLite foreign-key enforcement for the given engine."""

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:  # noqa: ANN401
        if engine.dialect.name != "sqlite":
            return
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
