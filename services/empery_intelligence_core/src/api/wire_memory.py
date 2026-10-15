"""DI wiring for the EIC Memory (Atoms) slice.

Sibling implementers call ``wire_memory(container, config)`` from main.py.
When ``# --- MEMORY WIRING ---`` exists in main.py, register calls land there;
otherwise this module is the integration point (no full main.py invented here).
"""

from __future__ import annotations

import logging
from typing import Any

from core.container import ServiceContainer
from core.event_bus import create_event_bus
from core.logging import configure_logging, log_event
from core.registry import (
    database_manager_key,
    register_service_database_manager,
    resolve_service_database_manager,
)
from services.empery_intelligence_core.src.core.memory.context_pack import (
    ContextPackService,
)
from services.empery_intelligence_core.src.core.memory.doc_use_cases import DocUseCases
from services.empery_intelligence_core.src.core.memory.memory_port import (
    MemorySearchFacade,
)
from services.empery_intelligence_core.src.core.memory.settings import (
    MemoryConfig,
    get_memory_config,
)
from services.empery_intelligence_core.src.core.memory.use_cases import MemoryUseCases
from services.empery_intelligence_core.src.data.memory.doc_proposal_store import (
    DocProposalStore,
)
from services.empery_intelligence_core.src.data.memory.repository import AtomRepository
from services.empery_intelligence_core.src.integration.memory.embeddings_local import (
    LocalEmbedding,
)
from services.empery_intelligence_core.src.integration.memory.embeddings_noop import (
    NoopEmbedding,
)
from services.empery_intelligence_core.src.integration.memory.embeddings_stub import (
    EmbeddingStub,
)
from services.empery_intelligence_core.src.integration.memory.orchestration_fs import (
    OrchestrationFs,
)
from services.empery_intelligence_core.src.integration.memory.sqlite_engine import (
    bootstrap_memory_db,
)


def _as_memory_config(config: Any) -> MemoryConfig:
    if isinstance(config, MemoryConfig):
        return config
    # Duck-type parent ServiceConfig; fall back to EIC_* env via get_memory_config()
    env = get_memory_config()
    data = {
        "service_name": getattr(config, "service_name", env.service_name),
        "database_url": getattr(config, "database_url", env.database_url),
        "auto_create_tables": getattr(
            config, "auto_create_tables", env.auto_create_tables
        ),
        "embedding_backend": getattr(
            config, "embedding_backend", env.embedding_backend
        ),
        "embedding_dims": getattr(config, "embedding_dims", env.embedding_dims),
        "embedding_base_url": getattr(
            config, "embedding_base_url", env.embedding_base_url
        ),
        "retrieve_default_limit": getattr(
            config, "retrieve_default_limit", env.retrieve_default_limit
        ),
        "retrieve_max_limit": getattr(
            config, "retrieve_max_limit", env.retrieve_max_limit
        ),
        "orchestration_root": getattr(
            config, "orchestration_root", env.orchestration_root
        ),
        "repo_root": getattr(config, "repo_root", env.repo_root),
        "allow_doc_apply": getattr(config, "allow_doc_apply", env.allow_doc_apply),
        "allow_rules_apply": getattr(
            config, "allow_rules_apply", env.allow_rules_apply
        ),
        "context_token_budget": getattr(
            config, "context_token_budget", env.context_token_budget
        ),
        "log_level": getattr(config, "log_level", env.log_level),
    }
    return MemoryConfig(**data)


def _build_embedding(config: MemoryConfig, logger: logging.Logger) -> Any:
    backend = (config.embedding_backend or "stub").lower()
    if backend == "none":
        log_event(
            logger,
            event="eic.embeddings.backend",
            message="embedding_backend=none",
        )
        return NoopEmbedding(dims=config.embedding_dims)
    if backend == "http":
        from services.empery_intelligence_core.src.integration.memory.embeddings_http import (
            HttpEmbedding,
        )
        import os

        base = (
            getattr(config, "embedding_base_url", None)
            or os.environ.get("EIC_EMBEDDING_BASE_URL", "")
        ).strip()
        if not base:
            raise RuntimeError(
                "EIC_EMBEDDING_BACKEND=http requires EIC_EMBEDDING_BASE_URL"
            )
        log_event(
            logger,
            event="eic.embeddings.backend",
            message="embedding_backend=http",
            base_url=base,
        )
        return HttpEmbedding(
            base_url=base,
            dims=config.embedding_dims,
            model=os.environ.get("EIC_EMBEDDING_MODEL") or None,
            api_key=os.environ.get("EIC_EMBEDDING_API_KEY") or None,
            logger=logger,
        )
    if backend == "local":
        log_event(
            logger,
            event="eic.embeddings.backend",
            message="embedding_backend=local (honest stub delegate)",
        )
        return LocalEmbedding(dims=config.embedding_dims, logger=logger)
    log_event(
        logger,
        event="eic.embeddings.backend",
        message="embedding_backend=stub (keyword/hybrid FTS without semantic vectors)",
    )
    return EmbeddingStub(dims=config.embedding_dims, logger=logger)


def wire_memory(container: ServiceContainer, config: Any) -> None:
    """Register Memory providers on the shared ServiceContainer."""
    mem_config = _as_memory_config(config)

    if not container.has("config"):
        container.register("config", lambda _c: config)

    if not container.has("logger"):
        level = getattr(logging, str(mem_config.log_level).upper(), logging.INFO)
        logger = configure_logging(mem_config.service_name, level=level)
        container.register("logger", lambda _c: logger)

    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: create_event_bus())

    db_key = database_manager_key(mem_config.service_name)
    if not container.has(db_key):
        register_service_database_manager(
            container,
            mem_config.service_name,
            mem_config.database_url,
        )

    container.register(
        "eic_atom_repository",
        lambda c, svc=mem_config.service_name: AtomRepository(
            resolve_service_database_manager(c, svc),
            c.resolve("logger"),
        ),
    )
    container.register(
        "eic_embedding",
        lambda c: _build_embedding(mem_config, c.resolve("logger")),
    )
    container.register(
        "eic_memory_use_cases",
        lambda c: MemoryUseCases(
            repository=c.resolve("eic_atom_repository"),
            embedding=c.resolve("eic_embedding"),
            config=mem_config,
            logger=c.resolve("logger"),
            event_bus=c.resolve("event_bus") if c.has("event_bus") else None,
        ),
    )
    container.register(
        "eic_context_pack",
        lambda c: ContextPackService(
            memory_use_cases=c.resolve("eic_memory_use_cases"),
            config=mem_config,
            logger=c.resolve("logger"),
        ),
    )
    container.register(
        "eic_orchestration_fs",
        lambda c: OrchestrationFs(mem_config, c.resolve("logger")),
    )
    container.register(
        "eic_doc_proposal_store",
        lambda c, svc=mem_config.service_name: DocProposalStore(
            resolve_service_database_manager(c, svc),
            c.resolve("logger"),
        ),
    )
    container.register(
        "eic_doc_use_cases",
        lambda c: DocUseCases(
            store=c.resolve("eic_doc_proposal_store"),
            atom_repository=c.resolve("eic_atom_repository"),
            orchestration_fs=c.resolve("eic_orchestration_fs"),
            memory_use_cases=c.resolve("eic_memory_use_cases"),
            config=mem_config,
            logger=c.resolve("logger"),
            event_bus=c.resolve("event_bus") if c.has("event_bus") else None,
        ),
    )
    container.register(
        "eic_memory_port",
        lambda c: MemorySearchFacade(c.resolve("eic_memory_use_cases")),
    )


def bootstrap_memory(container: ServiceContainer, config: Any | None = None) -> None:
    """Create schema / FTS after providers are wired."""
    mem_config = _as_memory_config(config or container.resolve("config"))
    db = resolve_service_database_manager(container, mem_config.service_name)
    fts = bootstrap_memory_db(db, auto_create_tables=mem_config.auto_create_tables)
    repo: AtomRepository = container.resolve("eic_atom_repository")
    repo.ensure_schema()
    logger = container.resolve("logger")
    log_event(
        logger,
        event="eic.memory.db.ready",
        message="Memory schema ready",
        fts5=fts,
        database_url=mem_config.database_url.split("?")[0],
    )
