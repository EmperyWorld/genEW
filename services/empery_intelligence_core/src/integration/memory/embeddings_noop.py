"""No-op embedding backend (always empty / zero vector)."""

from __future__ import annotations


class NoopEmbedding:
    def __init__(self, dims: int = 384) -> None:
        self._dims = dims

    @property
    def dims(self) -> int:
        return self._dims

    def embed(self, text: str) -> list[float]:
        _ = text
        return [0.0] * self._dims
