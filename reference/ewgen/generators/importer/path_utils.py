"""
Fortune Seaker - Path utilities for monorepo import normalization
"""

from collections import Counter
from typing import List, Optional


def detect_common_root_prefix(paths: List[str]) -> str:
    """
    Detect a single top-level folder shared by most archive paths (e.g. EWPower/).
  """
    if not paths:
        return ""

    segments: List[str] = []
    for path in paths:
        normalized = path.lstrip("./")
        if "/" not in normalized:
            continue
        segments.append(normalized.split("/")[0])

    if not segments:
        return ""

    root, count = Counter(segments).most_common(1)[0]
    threshold = max(1, int(len(paths) * 0.75))
    if count >= threshold:
        return f"{root}/"
    return ""


def strip_path_prefix(path: str, prefix: str) -> str:
    """Remove leading archive root prefix from a relative path."""
    if not prefix:
        return path.lstrip("./")

    normalized = path.lstrip("./")
    if normalized.startswith(prefix):
        return normalized[len(prefix) :]
    return normalized
