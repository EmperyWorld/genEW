"""
Fortune Seaker - Shared path filter rules for analyze and asset discovery
"""

from __future__ import annotations

import re
from typing import Iterable, List

BLOCKED_PATTERNS = [
    r"\.env",
    r"(?:^|/)node_modules(?:/|$)",
    r"(?:^|/)\.git(?:/|$)",
    r"\.pem$",
    r"id_rsa",
    r"(?:^|/)dist/",
    r"(?:^|/)build/",
    r"(?:^|/)coverage/",
    r"(?:^|/)\.next/",
    r"__pycache__/",
    r"(?:^|/)venv/",
    r"(?:^|/)\.venv/",
    r"(?:^|/)vendor/",
    r"(?:^|/)target/",
    r"(?:^|/)\.turbo/",
    r"(?:^|/)\.nx/",
    r"(?:^|/)storybook-static/",
    r"(?:^|/)\.idea/",
    r"(?:^|/)\.vscode/",
    r"(?:^|/)\.pytest_cache/",
    r"(?:^|/)htmlcov/",
    r"(?:^|/)\.mypy_cache/",
    r"(?:^|/)\.tox/",
    r"(?:^|/)site-packages/",
    r"(?:^|/)\.cache/",
    r"(?:^|/)tmp/",
    r"(?:^|/)temp/",
    r"(?:^|/)\.yarn/",
    r"(?:^|/)pnpm-store/",
    # EWGen / generator runtime noise (safe no-op for other trees)
    r"(?:^|/)data/catalogs/",
    r"(?:^|/)data/project-shells/",
    r"(?:^|/)data/factory-runs/",
    r"(?:^|/)data/genesis-runs/",
    r"(?:^|/)set-runtime/",
]

BUILD_ARTIFACT_RE = re.compile(
    r"(?:^|/)(?:dist|build|coverage|\.next)/",
    re.IGNORECASE,
)


def _normalize_archive_path(path: str) -> str:
    # Do not use str.lstrip("./") — that strips any leading '.' and breaks ".git/…".
    normalized = path.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.lstrip("/")


def is_blocked_path(path: str) -> bool:
    normalized = _normalize_archive_path(path)
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, normalized, re.IGNORECASE):
            return True
    return False


def is_build_artifact_path(path: str) -> bool:
    return bool(BUILD_ARTIFACT_RE.search(_normalize_archive_path(path)))


def is_archive_file_entry(path: str) -> bool:
    return bool(path) and not path.endswith("/") and not path.endswith("\\")


def iter_budget_archive_paths(paths: Iterable[str]) -> List[str]:
    """
    File entries that count toward MAX_ARCHIVE_ENTRIES / ingest budget.

    Noise (node_modules, .git, build artifacts, …) is excluded so fat
    self-zips of monorepos do not hard-fail before analyze.
    """
    budget: List[str] = []
    for raw in paths:
        if not is_archive_file_entry(raw):
            continue
        if is_blocked_path(raw):
            continue
        budget.append(raw)
    return budget


def count_noise_archive_entries(paths: Iterable[str]) -> int:
    """Count file entries skipped as blocked noise."""
    noise = 0
    for raw in paths:
        if not is_archive_file_entry(raw):
            continue
        if is_blocked_path(raw):
            noise += 1
    return noise
