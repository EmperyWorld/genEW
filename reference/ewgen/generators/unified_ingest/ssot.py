# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# SSOT path allowlist + rematerialize file loader for Stage 9 prepare.
# Invariants:
# - Paths must resolve under ssot_root and match allowlist prefixes.
# - Missing root or file → hard fail (no silent empty rematerialize).
# Related:
# - generators/unified_ingest/prepare_orchestrate.py
# - documentation/platform/EWGEN-COMPONENT-FACTORY-VISION.md
# ---

"""SSOT allowlist helpers for rematerialize."""

from __future__ import annotations

import os
from pathlib import Path, PurePosixPath
from typing import Iterable, List, Optional, Sequence

from generators.importer.text_sanitize import sanitize_unicode_text

DEFAULT_SSOT_ALLOWLIST_PREFIXES: tuple[str, ...] = (
    "EliteEW/web/frontend",
    "EliteEW/api",
    "DEWA/frontend",
    "DEWA/backend",
    "EWGen",
    "EWPower",
    "EWC",
)


class SsotError(ValueError):
    """Hard-fail rematerialize / SSOT resolution."""

    def __init__(self, message: str, *, code: str = "SSOT_ERROR") -> None:
        super().__init__(message)
        self.code = code


def default_allowlist() -> List[str]:
    raw = os.getenv("EWGEN_SSOT_ALLOWLIST", "").strip()
    if not raw:
        return list(DEFAULT_SSOT_ALLOWLIST_PREFIXES)
    return [part.strip().strip("/") for part in raw.split(",") if part.strip()]


def resolve_ssot_root(ssot_root: Optional[str]) -> Path:
    """
    Resolve SSOT root directory.

    Env EWGEN_SSOT_ROOT used when ssot_root is empty.
    """
    raw = (ssot_root or os.getenv("EWGEN_SSOT_ROOT") or "").strip()
    if not raw:
        raise SsotError(
            "SSOT root required for rematerialize from disk "
            "(pass ssotRoot or set EWGEN_SSOT_ROOT)",
            code="SSOT_ROOT_REQUIRED",
        )
    root = Path(raw).expanduser().resolve()
    if not root.is_dir():
        raise SsotError(
            f"SSOT root offline or missing: {root}",
            code="SSOT_OFFLINE",
        )
    return root


def _normalize_rel(path: str) -> str:
    return str(PurePosixPath(path.replace("\\", "/").lstrip("./")))


def path_allowed(rel_path: str, allowlist: Sequence[str]) -> bool:
    normalized = _normalize_rel(rel_path)
    for prefix in allowlist:
        clean = prefix.strip().strip("/")
        if not clean:
            continue
        if normalized == clean or normalized.startswith(f"{clean}/"):
            return True
    return False


def load_files_from_ssot(
    relative_paths: Iterable[str],
    *,
    ssot_root: Path,
    allowlist: Optional[Sequence[str]] = None,
) -> List[dict[str, str]]:
    """
    Load UTF-8 text files from SSOT. Hard-fails on escape / missing / deny.
    """
    prefixes = list(allowlist) if allowlist is not None else default_allowlist()
    root = ssot_root.resolve()
    files: List[dict[str, str]] = []
    missing: List[str] = []

    for raw_path in relative_paths:
        rel = _normalize_rel(str(raw_path))
        if not rel or rel.endswith("/"):
            continue
        if not path_allowed(rel, prefixes):
            raise SsotError(
                f"Path outside SSOT allowlist: {rel}",
                code="SSOT_PATH_DENIED",
            )
        target = (root / rel).resolve()
        try:
            target.relative_to(root)
        except ValueError as exc:
            raise SsotError(
                f"Path escapes SSOT root: {rel}",
                code="SSOT_PATH_ESCAPE",
            ) from exc
        if not target.is_file():
            missing.append(rel)
            continue
        content = sanitize_unicode_text(
            target.read_text(encoding="utf-8", errors="ignore")
        )
        files.append({"path": rel, "content": content})

    if missing:
        preview = ", ".join(missing[:5])
        suffix = f" (+{len(missing) - 5} more)" if len(missing) > 5 else ""
        raise SsotError(
            f"SSOT files missing under {root}: {preview}{suffix}",
            code="SSOT_FILES_MISSING",
        )
    if not files:
        raise SsotError(
            "No files loaded from SSOT for rematerialize",
            code="SSOT_EMPTY",
        )
    return files
