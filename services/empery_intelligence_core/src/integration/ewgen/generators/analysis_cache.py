"""
EWGen - TTL caches for import graph analysis.

Caches parsed import specs per file content hash and full validation results
so repeated selection / coverage requests avoid redundant regex work.
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

DEFAULT_TTL_SECONDS = int(os.getenv("EWGEN_ANALYSIS_CACHE_TTL", "600"))
MAX_FILE_SPECS = int(os.getenv("EWGEN_ANALYSIS_CACHE_MAX_FILE_SPECS", "5000"))
MAX_RESULTS = int(os.getenv("EWGEN_ANALYSIS_CACHE_MAX_RESULTS", "500"))


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


@dataclass
class AnalysisCacheStats:
    file_spec_hits: int = 0
    file_spec_misses: int = 0
    result_hits: int = 0
    result_misses: int = 0


_stats = AnalysisCacheStats()
_lock = threading.RLock()


class _TTLCache:
    """Thread-safe TTL cache with LRU eviction."""

    def __init__(self, max_size: int, ttl_seconds: int) -> None:
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self._data: OrderedDict[str, Tuple[Any, float]] = OrderedDict()

    def get(self, key: str) -> Optional[Any]:
        with _lock:
            item = self._data.get(key)
            if item is None:
                return None
            value, expires_at = item
            if time.time() > expires_at:
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key: str, value: Any) -> None:
        with _lock:
            expires_at = time.time() + self.ttl_seconds
            self._data[key] = (value, expires_at)
            self._data.move_to_end(key)
            while len(self._data) > self.max_size:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with _lock:
            self._data.clear()

    def size(self) -> int:
        with _lock:
            return len(self._data)


_file_specs_cache = _TTLCache(MAX_FILE_SPECS, DEFAULT_TTL_SECONDS)
_result_cache = _TTLCache(MAX_RESULTS, DEFAULT_TTL_SECONDS)


def get_or_compute_file_specs(
    *,
    language: str,
    content: str,
    parse_fn: Callable[[str], List[str]],
) -> Tuple[str, ...]:
    """Return cached import specs for file content, parsing on miss."""
    content_hash = _sha256_text(content)
    key = f"{language}:{content_hash}"
    cached = _file_specs_cache.get(key)
    if cached is not None:
        _stats.file_spec_hits += 1
        return cached

    _stats.file_spec_misses += 1
    specs = tuple(parse_fn(content))
    _file_specs_cache.set(key, specs)
    return specs


def fingerprint_entries(entries: List[Dict[str, Any]]) -> str:
    parts: List[str] = []
    for entry in sorted(entries, key=lambda item: str(item.get("path", ""))):
        path = str(entry.get("path", "")).replace("\\", "/")
        content = str(entry.get("content", ""))
        parts.append(f"{path}:{_sha256_text(content)[:16]}")
    return _sha256_text("|".join(parts))


def fingerprint_path_set(paths: Optional[Set[str]]) -> str:
    if not paths:
        return "none"
    normalized = sorted(path.replace("\\", "/") for path in paths if path)
    return _sha256_text(",".join(normalized))[:16]


def fingerprint_labels(labels: Optional[Set[str]]) -> str:
    if not labels:
        return "none"
    return _sha256_text(",".join(sorted(labels)))[:16]


def graph_result_cache_key(
    *,
    language: str,
    entries_fp: str,
    scope_fp: str,
    archive_fp: str,
    partial: bool,
    mode: str,
    available_labels_fp: str = "none",
    selected_labels_fp: str = "none",
    session_id: Optional[str] = None,
) -> str:
    session_part = session_id or "inline"
    return (
        f"gr:{language}:{session_part}:{entries_fp}:{scope_fp}:"
        f"{archive_fp}:{int(partial)}:{mode}:{available_labels_fp}:{selected_labels_fp}"
    )


def get_cached_graph_result(key: str) -> Optional[Dict[str, Any]]:
    cached = _result_cache.get(key)
    if cached is not None:
        _stats.result_hits += 1
        return dict(cached)
    _stats.result_misses += 1
    return None


def set_cached_graph_result(key: str, result: Dict[str, Any]) -> None:
    _result_cache.set(key, dict(result))


def get_analysis_cache_stats() -> Dict[str, Any]:
    return {
        "fileSpecHits": _stats.file_spec_hits,
        "fileSpecMisses": _stats.file_spec_misses,
        "resultHits": _stats.result_hits,
        "resultMisses": _stats.result_misses,
        "fileSpecEntries": _file_specs_cache.size(),
        "resultEntries": _result_cache.size(),
        "ttlSeconds": DEFAULT_TTL_SECONDS,
    }


def clear_analysis_cache() -> None:
    """Reset caches and counters (tests / operator maintenance)."""
    _file_specs_cache.clear()
    _result_cache.clear()
    _stats.file_spec_hits = 0
    _stats.file_spec_misses = 0
    _stats.result_hits = 0
    _stats.result_misses = 0
