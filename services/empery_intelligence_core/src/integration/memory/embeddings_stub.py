"""Deterministic hash→vector embedding stub (no network / no model download)."""

from __future__ import annotations

import hashlib
import logging
import math
import struct

from core.logging import log_event


def pack_embedding(vector: list[float]) -> bytes:
    return struct.pack(f"<{len(vector)}f", *vector)


def unpack_embedding(blob: bytes) -> list[float]:
    if not blob:
        return []
    n = len(blob) // 4
    return list(struct.unpack(f"<{n}f", blob))


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b, strict=True):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


class EmbeddingStub:
    """Bag-of-words style deterministic embedding padded/truncated to ``dims``."""

    def __init__(
        self,
        dims: int = 384,
        logger: logging.Logger | None = None,
    ) -> None:
        if dims < 8:
            raise ValueError("embedding dims must be >= 8")
        self._dims = dims
        self._logger = logger

    @property
    def dims(self) -> int:
        return self._dims

    def embed(self, text: str) -> list[float]:
        tokens = [t for t in "".join(ch.lower() if ch.isalnum() else " " for ch in text).split() if t]
        vec = [0.0] * self._dims
        if not tokens:
            # Stable non-zero unit-ish vector for empty input
            seed = hashlib.sha256(b"").digest()
            for i in range(self._dims):
                vec[i] = ((seed[i % len(seed)] / 255.0) * 2.0) - 1.0
            return self._l2_normalize(vec)

        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            # Multiple hash projections per token for denser vectors
            for offset in range(0, min(16, len(digest) - 3), 4):
                idx = int.from_bytes(digest[offset : offset + 2], "little") % self._dims
                sign = 1.0 if digest[offset + 2] % 2 == 0 else -1.0
                mag = (digest[offset + 3] + 1) / 256.0
                vec[idx] += sign * mag
        normalized = self._l2_normalize(vec)
        if self._logger is not None:
            log_event(
                self._logger,
                event="eic.memory.embed",
                message="Embedded text via stub",
                dims=self._dims,
                token_count=len(tokens),
            )
        return normalized

    @staticmethod
    def _l2_normalize(vec: list[float]) -> list[float]:
        norm = math.sqrt(sum(x * x for x in vec))
        if norm <= 0.0:
            return vec
        return [x / norm for x in vec]
