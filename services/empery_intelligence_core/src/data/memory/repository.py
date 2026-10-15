"""Atom repository backed by DatabaseManager (SQLite / Postgres)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from core.data.database import DatabaseManager
from core.logging import log_event
from services.empery_intelligence_core.src.core.memory.models import (
    Atom,
    AtomKind,
    AtomProvenance,
)
from services.empery_intelligence_core.src.data.memory.orm import AtomRow
from services.empery_intelligence_core.src.integration.memory.sqlite_engine import (
    ensure_fts5,
)


class AtomRepository:
    """Persistence boundary for immutable Atoms + FTS/LIKE search."""

    def __init__(self, database: DatabaseManager, logger: logging.Logger) -> None:
        self._db = database
        self._logger = logger
        self._fts_ready: bool | None = None

    def ensure_schema(self) -> None:
        self._fts_ready = ensure_fts5(self._db)

    @property
    def fts_ready(self) -> bool:
        if self._fts_ready is None:
            self.ensure_schema()
        return bool(self._fts_ready)

    def _to_atom(self, row: AtomRow) -> Atom:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        archived = row.archived_at
        if archived is not None and archived.tzinfo is None:
            archived = archived.replace(tzinfo=timezone.utc)
        provenance = AtomProvenance.model_validate(dict(row.provenance_json or {}))
        return Atom(
            id=row.id,  # type: ignore[arg-type]
            kind=AtomKind(row.kind),
            title=row.title,
            body=row.body,
            metadata=dict(row.metadata_json or {}),
            tags=list(row.tags_json or []),
            provenance=provenance,
            created_at=created,
            content_hash=row.content_hash,
            embedding_dims=row.embedding_dims,
            archived_at=archived,
        )

    def _service_key(self, atom: Atom) -> str:
        return atom.provenance.service_name or ""

    async def upsert_atom(
        self,
        atom: Atom,
        *,
        embedding: bytes | None = None,
        dedupe: bool = True,
    ) -> Atom:
        service_key = self._service_key(atom)
        if dedupe:
            existing = await self._find_by_hash(
                kind=atom.kind,
                service_name=service_key,
                content_hash=atom.content_hash,
            )
            if existing is not None:
                return existing

        try:
            with self._db.session_scope() as session:
                row = AtomRow(
                    id=atom.id,
                    kind=atom.kind.value,
                    title=atom.title,
                    body=atom.body,
                    metadata_json=dict(atom.metadata),
                    tags_json=list(atom.tags),
                    provenance_json=atom.provenance.model_dump(),
                    service_name=service_key,
                    content_hash=atom.content_hash,
                    embedding=embedding,
                    embedding_dims=atom.embedding_dims,
                    created_at=atom.created_at,
                    archived_at=atom.archived_at,
                )
                session.add(row)
                session.flush()
                saved = self._to_atom(row)
        except IntegrityError:
            existing = await self._find_by_hash(
                kind=atom.kind,
                service_name=service_key,
                content_hash=atom.content_hash,
                include_archived=True,
            )
            if existing is None:
                raise
            log_event(
                self._logger,
                event="eic.memory.atom.deduped",
                message="Atom insert skipped due to content_hash",
                atom_id=str(existing.id),
                kind=existing.kind.value,
            )
            return existing

        if self.fts_ready:
            self._fts_upsert(str(saved.id), saved.title, saved.body)

        log_event(
            self._logger,
            event="eic.memory.atom.created",
            message="Atom persisted",
            atom_id=str(saved.id),
            kind=saved.kind.value,
            service_name=service_key or None,
        )
        return saved

    async def _find_by_hash(
        self,
        *,
        kind: AtomKind,
        service_name: str,
        content_hash: str,
        include_archived: bool = False,
    ) -> Atom | None:
        with self._db.session_scope() as session:
            stmt = select(AtomRow).where(
                AtomRow.kind == kind.value,
                AtomRow.service_name == service_name,
                AtomRow.content_hash == content_hash,
            )
            if not include_archived:
                stmt = stmt.where(AtomRow.archived_at.is_(None))
            row = session.scalar(stmt)
            if row is None:
                return None
            return self._to_atom(row)

    def _fts_upsert(self, atom_id: str, title: str, body: str) -> None:
        try:
            with self._db.engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM eic_atoms_fts WHERE atom_id = :id"),
                    {"id": atom_id},
                )
                conn.execute(
                    text(
                        "INSERT INTO eic_atoms_fts(atom_id, title, body) "
                        "VALUES (:id, :title, :body)"
                    ),
                    {"id": atom_id, "title": title, "body": body},
                )
        except Exception:  # noqa: BLE001
            self._fts_ready = False
            log_event(
                self._logger,
                event="eic.memory.fts.error",
                message="FTS upsert failed; falling back to LIKE",
                level=logging.WARNING,
                atom_id=atom_id,
            )

    def _fts_delete(self, atom_id: str) -> None:
        if not self.fts_ready:
            return
        try:
            with self._db.engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM eic_atoms_fts WHERE atom_id = :id"),
                    {"id": atom_id},
                )
        except Exception:  # noqa: BLE001
            self._fts_ready = False

    async def get_atom(self, atom_id: UUID) -> Atom | None:
        with self._db.session_scope() as session:
            row = session.get(AtomRow, atom_id)
            if row is None:
                return None
            return self._to_atom(row)

    async def list_atoms(
        self,
        *,
        kind: AtomKind | None = None,
        service_name: str | None = None,
        tag: str | None = None,
        limit: int = 50,
        include_archived: bool = False,
    ) -> list[Atom]:
        with self._db.session_scope() as session:
            stmt = select(AtomRow).order_by(AtomRow.created_at.desc()).limit(limit)
            if not include_archived:
                stmt = stmt.where(AtomRow.archived_at.is_(None))
            if kind is not None:
                stmt = stmt.where(AtomRow.kind == kind.value)
            if service_name is not None:
                stmt = stmt.where(AtomRow.service_name == service_name)
            rows = list(session.scalars(stmt))
            atoms = [self._to_atom(r) for r in rows]
        if tag is not None:
            atoms = [a for a in atoms if tag in a.tags]
        return atoms

    async def soft_archive(self, atom_id: UUID) -> Atom | None:
        now = datetime.now(timezone.utc)
        with self._db.session_scope() as session:
            row = session.get(AtomRow, atom_id)
            if row is None:
                return None
            row.archived_at = now
            session.flush()
            archived = self._to_atom(row)
        self._fts_delete(str(atom_id))
        log_event(
            self._logger,
            event="eic.memory.atom.archived",
            message="Atom soft-archived",
            atom_id=str(atom_id),
        )
        return archived

    async def candidate_filter(
        self,
        *,
        kinds: list[AtomKind] | None = None,
        service_name: str | None = None,
        tags: list[str] | None = None,
        limit: int = 200,
    ) -> list[Atom]:
        with self._db.session_scope() as session:
            stmt = (
                select(AtomRow)
                .where(AtomRow.archived_at.is_(None))
                .order_by(AtomRow.created_at.desc())
                .limit(limit)
            )
            if kinds:
                stmt = stmt.where(AtomRow.kind.in_([k.value for k in kinds]))
            if service_name is not None:
                stmt = stmt.where(AtomRow.service_name == service_name)
            rows = list(session.scalars(stmt))
            atoms = [self._to_atom(r) for r in rows]
            # Keep embeddings accessible via get_embedding; attach nothing here
        if tags:
            tag_set = set(tags)
            atoms = [a for a in atoms if tag_set.intersection(a.tags)]
        return atoms

    async def get_embedding(self, atom_id: UUID) -> bytes | None:
        with self._db.session_scope() as session:
            row = session.get(AtomRow, atom_id)
            if row is None:
                return None
            return row.embedding

    async def get_embeddings_map(
        self,
        atom_ids: list[UUID],
    ) -> dict[UUID, bytes | None]:
        if not atom_ids:
            return {}
        with self._db.session_scope() as session:
            rows = session.scalars(
                select(AtomRow).where(AtomRow.id.in_(atom_ids))
            ).all()
            return {row.id: row.embedding for row in rows}  # type: ignore[misc]

    async def fts_search(
        self,
        query: str,
        *,
        kinds: list[AtomKind] | None = None,
        service_name: str | None = None,
        limit: int = 32,
    ) -> list[tuple[Atom, float]]:
        if self.fts_ready:
            return await self._fts5_search(
                query, kinds=kinds, service_name=service_name, limit=limit
            )
        return await self._like_search(
            query, kinds=kinds, service_name=service_name, limit=limit
        )

    async def _fts5_search(
        self,
        query: str,
        *,
        kinds: list[AtomKind] | None,
        service_name: str | None,
        limit: int,
    ) -> list[tuple[Atom, float]]:
        # Escape FTS5 special chars loosely: quote tokens
        tokens = [t for t in query.replace('"', " ").split() if t]
        if not tokens:
            return []
        match = " ".join(f'"{t}"' for t in tokens[:12])
        try:
            with self._db.engine.connect() as conn:
                result = conn.execute(
                    text(
                        """
                        SELECT atom_id, bm25(eic_atoms_fts) AS rank
                        FROM eic_atoms_fts
                        WHERE eic_atoms_fts MATCH :match
                        ORDER BY rank
                        LIMIT :limit
                        """
                    ),
                    {"match": match, "limit": limit * 3},
                )
                ranked = [(UUID(str(r[0])), float(r[1])) for r in result.fetchall()]
        except Exception:  # noqa: BLE001
            self._fts_ready = False
            return await self._like_search(
                query, kinds=kinds, service_name=service_name, limit=limit
            )

        # bm25: lower is better → convert to [0,1] score
        scores: list[tuple[Atom, float]] = []
        with self._db.session_scope() as session:
            for atom_id, bm25_rank in ranked:
                row = session.get(AtomRow, atom_id)
                if row is None or row.archived_at is not None:
                    continue
                if kinds and row.kind not in {k.value for k in kinds}:
                    continue
                if service_name is not None and row.service_name != service_name:
                    continue
                # Map negative bm25 to positive score; clamp
                score = 1.0 / (1.0 + max(bm25_rank, 0.0) + abs(min(bm25_rank, 0.0)))
                if bm25_rank < 0:
                    score = min(1.0, abs(bm25_rank) / (abs(bm25_rank) + 1.0))
                scores.append((self._to_atom(row), float(score)))
                if len(scores) >= limit:
                    break
        return scores

    async def _like_search(
        self,
        query: str,
        *,
        kinds: list[AtomKind] | None,
        service_name: str | None,
        limit: int,
    ) -> list[tuple[Atom, float]]:
        needles = [t.lower() for t in query.split() if len(t) >= 2][:8]
        if not needles:
            needles = [query.lower()[:64]]
        candidates = await self.candidate_filter(
            kinds=kinds,
            service_name=service_name,
            limit=max(limit * 10, 50),
        )
        scored: list[tuple[Atom, float]] = []
        for atom in candidates:
            hay = f"{atom.title}\n{atom.body}".lower()
            hits = sum(1 for n in needles if n in hay)
            if hits <= 0:
                continue
            score = hits / len(needles)
            scored.append((atom, score))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:limit]
