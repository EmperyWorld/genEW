"""Memory ingest / retrieve use cases."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event, EventBus
from core.logging import log_event
from services.empery_intelligence_core.src.core.memory.models import (
    Atom,
    AtomKind,
    AtomProvenance,
)
from services.empery_intelligence_core.src.core.memory.settings import MemoryConfig
from services.empery_intelligence_core.src.data.memory.repository import AtomRepository
from services.empery_intelligence_core.src.data.memory.schemas import (
    AtomResponse,
    CreateAtomRequest,
    IngestArchitectRequest,
    IngestVerifierRequest,
    RetrievedAtom,
    RetrieveRequest,
    RetrieveResponse,
)
from services.empery_intelligence_core.src.integration.memory.embeddings_stub import (
    cosine_similarity,
    pack_embedding,
    unpack_embedding,
)


def canonical_content_hash(*, body: str, metadata: dict[str, Any]) -> str:
    payload = json.dumps(
        {"body": body, "metadata": metadata},
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def atom_to_response(atom: Atom) -> AtomResponse:
    return AtomResponse(
        id=atom.id,
        kind=atom.kind,
        title=atom.title,
        body=atom.body,
        metadata=dict(atom.metadata),
        tags=list(atom.tags),
        provenance=atom.provenance,
        created_at=atom.created_at,
        content_hash=atom.content_hash,
        embedding_dims=atom.embedding_dims,
        archived_at=atom.archived_at,
    )


class MemoryUseCases:
    def __init__(
        self,
        *,
        repository: AtomRepository,
        embedding: Any,
        config: MemoryConfig,
        logger: logging.Logger,
        event_bus: EventBus | None = None,
    ) -> None:
        self._repo = repository
        self._embedding = embedding
        self._config = config
        self._logger = logger
        self._event_bus = event_bus

    async def _publish(self, name: str, payload: dict[str, Any]) -> None:
        if self._event_bus is None:
            return
        await self._event_bus.publish(Event(name=name, payload=payload))

    def _embed_bytes(self, text: str) -> tuple[bytes | None, int | None]:
        backend = getattr(self._config, "embedding_backend", "stub")
        if backend == "none":
            return None, None
        try:
            vector = self._embedding.embed(text)
            return pack_embedding(vector), len(vector)
        except Exception as exc:  # noqa: BLE001
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MEMORY_EMBEDDING_FAILED",
                    message="Failed to embed atom text",
                    details={"reason": str(exc)},
                ),
                http_status=500,
            ) from exc

    async def create_atom(self, request: CreateAtomRequest) -> AtomResponse:
        content_hash = canonical_content_hash(
            body=request.body,
            metadata=request.metadata,
        )
        emb_blob, emb_dims = self._embed_bytes(f"{request.title}\n{request.body}")
        atom = Atom(
            id=uuid4(),
            kind=request.kind,
            title=request.title,
            body=request.body,
            metadata=dict(request.metadata),
            tags=list(request.tags),
            provenance=request.provenance,
            created_at=datetime.now(timezone.utc),
            content_hash=content_hash,
            embedding_dims=emb_dims,
        )
        saved = await self._repo.upsert_atom(atom, embedding=emb_blob, dedupe=True)
        await self._publish(
            "eic.memory.atom.created",
            {
                "atom_id": str(saved.id),
                "kind": saved.kind.value,
                "service_name": saved.provenance.service_name,
            },
        )
        return atom_to_response(saved)

    async def ingest_architect(self, request: IngestArchitectRequest) -> AtomResponse:
        metadata = {
            **dict(request.metadata),
            "constraints": list(request.constraints),
            "design_paths": list(request.design_paths),
        }
        body_parts = [
            request.decision_summary,
            "",
            "Constraints:",
            *[f"- {c}" for c in request.constraints],
            "",
            "Design paths:",
            *[f"- {p}" for p in request.design_paths],
        ]
        body = "\n".join(body_parts).strip()
        return await self.create_atom(
            CreateAtomRequest(
                kind=AtomKind.ARCHITECT_DECISION,
                title=request.title,
                body=body,
                metadata=metadata,
                tags=["architect", request.service_name],
                provenance=AtomProvenance(
                    source="architect",
                    artifact_path=request.artifact_path,
                    job_id=request.job_id,
                    service_name=request.service_name,
                ),
            )
        )

    async def ingest_verifier(self, request: IngestVerifierRequest) -> AtomResponse:
        metadata: dict[str, Any] = {
            "verify_status": request.verify_status,
            "violations": list(request.violations),
            "required_fixes": list(request.required_fixes),
        }
        if request.recipe_packs:
            metadata["recipe_packs"] = list(request.recipe_packs)
        if request.scaffold_profile:
            metadata["scaffold_profile"] = request.scaffold_profile
        if request.atom_file_count is not None:
            metadata["eic_atom_file_count"] = int(request.atom_file_count)
        if request.extract_adapt_count is not None:
            metadata["eic_extract_adapt_count"] = int(request.extract_adapt_count)
        body_parts = [
            f"Status: {request.verify_status}",
            "",
            request.summary,
        ]
        if request.scaffold_profile or request.recipe_packs:
            body_parts.extend(
                [
                    "",
                    "Assembly:",
                    f"- scaffold_profile: {request.scaffold_profile or '(none)'}",
                    f"- recipe_packs: {', '.join(request.recipe_packs) or '(none)'}",
                    f"- atom_files: {request.atom_file_count if request.atom_file_count is not None else '(unknown)'}",
                    f"- extract_adapt: {request.extract_adapt_count if request.extract_adapt_count is not None else '(unknown)'}",
                ]
            )
        if request.violations:
            body_parts.extend(["", "Violations:", *[f"- {v}" for v in request.violations]])
        if request.required_fixes:
            body_parts.extend(
                ["", "Required fixes:", *[f"- {f}" for f in request.required_fixes]]
            )
        return await self.create_atom(
            CreateAtomRequest(
                kind=AtomKind.VERIFIER_REPORT,
                title=request.title,
                body="\n".join(body_parts).strip(),
                metadata=metadata,
                tags=["verifier", request.service_name, request.verify_status.lower()],
                provenance=AtomProvenance(
                    source="verifier",
                    artifact_path=request.report_path,
                    job_id=request.job_id,
                    service_name=request.service_name,
                ),
            )
        )

    async def record_plan_decision(self, intention: Any, summary: str) -> AtomResponse:
        """Memory hook: ingest Architect decision from agent loop."""
        service = getattr(intention, "service_name", None) or "unknown"
        job_id = str(getattr(intention, "id", "") or "") or None
        design = None
        checkpoint = getattr(intention, "checkpoint", None)
        if checkpoint is not None:
            design = getattr(checkpoint, "design_path", None)
        return await self.ingest_architect(
            IngestArchitectRequest(
                service_name=str(service),
                title=f"Plan decision · {service}",
                decision_summary=summary[:4000],
                design_paths=[design] if design else [],
                job_id=job_id,
                artifact_path=design,
            )
        )

    async def record_verify_report(
        self, intention: Any, *, status: str, summary: str
    ) -> AtomResponse:
        """Memory hook: ingest Verifier report (PASSED genesis notes preferred)."""
        service = getattr(intention, "service_name", None) or "unknown"
        job_id = str(getattr(intention, "id", "") or "") or None
        report = None
        checkpoint = getattr(intention, "checkpoint", None)
        if checkpoint is not None:
            report = getattr(checkpoint, "report_path", None)
        status_u = (status or "UNKNOWN").upper()
        if status_u not in {"PASSED", "FAILED", "UNKNOWN"}:
            status_u = "UNKNOWN"
        meta = getattr(intention, "metadata", None) or {}
        if not isinstance(meta, dict):
            meta = {}
        packs_raw = meta.get("recipe_packs") or meta.get("assembly_packs") or []
        packs = [str(p) for p in packs_raw] if isinstance(packs_raw, list) else []
        stats = meta.get("eic_action_stats") if isinstance(meta.get("eic_action_stats"), dict) else {}
        extract_n = max(
            int(stats.get("extract_adapt") or 0),
            int(meta.get("eic_extract_adapt_count") or 0),
        )
        atom_n = meta.get("eic_atom_file_count")
        atom_count = int(atom_n) if atom_n is not None else None
        profile = meta.get("scaffold_profile") or meta.get("resolved_scaffold_profile")
        return await self.ingest_verifier(
            IngestVerifierRequest(
                service_name=str(service),
                title=f"Verify {status_u} · {service}",
                verify_status=status_u,  # type: ignore[arg-type]
                summary=summary[:4000],
                report_path=report,
                job_id=job_id,
                recipe_packs=packs,
                scaffold_profile=str(profile) if profile else None,
                atom_file_count=atom_count,
                extract_adapt_count=extract_n if extract_n else None,
            )
        )

    async def get_atom(self, atom_id: UUID) -> AtomResponse:
        atom = await self._repo.get_atom(atom_id)
        if atom is None or atom.archived_at is not None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MEMORY_NOT_FOUND",
                    message="Atom not found",
                    details={"atom_id": str(atom_id)},
                ),
                http_status=404,
            )
        return atom_to_response(atom)

    async def list_atoms(
        self,
        *,
        kind: AtomKind | None = None,
        service_name: str | None = None,
        tag: str | None = None,
        limit: int = 50,
    ) -> list[AtomResponse]:
        atoms = await self._repo.list_atoms(
            kind=kind,
            service_name=service_name,
            tag=tag,
            limit=limit,
        )
        return [atom_to_response(a) for a in atoms]

    async def archive_atom(self, atom_id: UUID) -> None:
        archived = await self._repo.soft_archive(atom_id)
        if archived is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MEMORY_NOT_FOUND",
                    message="Atom not found",
                    details={"atom_id": str(atom_id)},
                ),
                http_status=404,
            )

    async def retrieve(self, request: RetrieveRequest) -> RetrieveResponse:
        limit = min(request.limit, self._config.retrieve_max_limit)
        mode = request.mode
        results: list[RetrievedAtom] = []

        fts_hits: dict[UUID, float] = {}
        if mode in {"hybrid", "fts"}:
            for atom, score in await self._repo.fts_search(
                request.query,
                kinds=request.kinds,
                service_name=request.service_name,
                limit=limit * 3,
            ):
                if request.tags and not set(request.tags).intersection(atom.tags):
                    continue
                fts_hits[atom.id] = score

        emb_hits: dict[UUID, tuple[Atom, float]] = {}
        if mode in {"hybrid", "embedding"} and self._config.embedding_backend != "none":
            query_vec = self._embedding.embed(request.query)
            candidates = await self._repo.candidate_filter(
                kinds=request.kinds,
                service_name=request.service_name,
                tags=request.tags,
                limit=200,
            )
            emb_map = await self._repo.get_embeddings_map([a.id for a in candidates])
            for atom in candidates:
                blob = emb_map.get(atom.id)
                if not blob:
                    continue
                score = cosine_similarity(query_vec, unpack_embedding(blob))
                if score > 0:
                    emb_hits[atom.id] = (atom, score)

        w_emb = self._config.hybrid_embedding_weight
        w_fts = self._config.hybrid_fts_weight
        atom_cache: dict[UUID, Atom] = {}

        if mode == "fts":
            for atom_id, score in sorted(
                fts_hits.items(), key=lambda x: x[1], reverse=True
            )[:limit]:
                atom = await self._repo.get_atom(atom_id)
                if atom is None:
                    continue
                results.append(
                    RetrievedAtom(
                        atom=atom_to_response(atom),
                        score=score,
                        match_reason="fts",
                    )
                )
        elif mode == "embedding":
            ranked = sorted(emb_hits.values(), key=lambda x: x[1], reverse=True)[:limit]
            for atom, score in ranked:
                results.append(
                    RetrievedAtom(
                        atom=atom_to_response(atom),
                        score=score,
                        match_reason="embedding",
                    )
                )
        else:
            all_ids = set(fts_hits) | set(emb_hits)
            scored: list[tuple[UUID, float, str]] = []
            for atom_id in all_ids:
                e = emb_hits.get(atom_id)
                f = fts_hits.get(atom_id, 0.0)
                e_score = e[1] if e else 0.0
                if e:
                    atom_cache[atom_id] = e[0]
                hybrid = (w_emb * e_score) + (w_fts * f)
                reason = "hybrid"
                if e_score > 0 and f <= 0:
                    reason = "embedding"
                elif f > 0 and e_score <= 0:
                    reason = "fts"
                scored.append((atom_id, hybrid, reason))
            scored.sort(key=lambda x: x[1], reverse=True)
            for atom_id, score, reason in scored[:limit]:
                atom = atom_cache.get(atom_id) or await self._repo.get_atom(atom_id)
                if atom is None:
                    continue
                results.append(
                    RetrievedAtom(
                        atom=atom_to_response(atom),
                        score=score,
                        match_reason=reason,
                    )
                )

        log_event(
            self._logger,
            event="eic.memory.retrieve",
            message="Memory retrieve completed",
            mode=mode,
            result_count=len(results),
        )
        return RetrieveResponse(query=request.query, results=results, mode=mode)
