"""Optional local embedding adapter — honest about stub delegation."""

from __future__ import annotations

import logging
import os

from services.empery_intelligence_core.src.integration.memory.embeddings_stub import (
    EmbeddingStub,
)


class LocalEmbedding:
    """
    Declared stub path for CI/lab when no HTTP embedding URL is set.

    Does **not** pretend to run a local model. Prefer ``http`` backend with
    ``EIC_EMBEDDING_BASE_URL`` for semantic retrieve. Keyword/hybrid FTS remains
    available when embeddings are stub.
    """

    def __init__(
        self,
        dims: int = 384,
        logger: logging.Logger | None = None,
    ) -> None:
        if os.environ.get("EIC_EMBEDDING_REQUIRE_REAL", "").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }:
            raise RuntimeError(
                "EIC_EMBEDDING_REQUIRE_REAL=true but embedding_backend=local "
                "(stub). Set EIC_EMBEDDING_BACKEND=http and EIC_EMBEDDING_BASE_URL."
            )
        self._delegate = EmbeddingStub(dims=dims, logger=logger)
        if logger:
            logger.info(
                "embedding_backend=local delegates to stub (honest non-semantic)"
            )

    @property
    def dims(self) -> int:
        return self._delegate.dims

    def embed(self, text: str) -> list[float]:
        return self._delegate.embed(text)
