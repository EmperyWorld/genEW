"""Safe filesystem helpers under repo / orchestration roots."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

from core.errors import ServiceError, StandardizedErrorResponse
from core.logging import log_event
from services.empery_intelligence_core.src.core.memory.doc_safety import (
    assert_propose_allowed,
    is_rules_path,
    normalize_relative_path,
)
from services.empery_intelligence_core.src.core.memory.settings import MemoryConfig


class OrchestrationFs:
    """Path-safe IO for proposals and allowlisted doc targets."""

    def __init__(self, config: MemoryConfig, logger: logging.Logger) -> None:
        self._config = config
        self._logger = logger
        self._repo_root = self._resolve_repo_root()
        self._orch_root = self._resolve_orchestration_root()

    def resolve_repo_root(self) -> Path:
        return self._repo_root

    def _resolve_repo_root(self) -> Path:
        if self._config.repo_root:
            return Path(self._config.repo_root).resolve()
        return Path.cwd().resolve()

    def _resolve_orchestration_root(self) -> Path:
        base = Path(self._config.orchestration_root)
        if not base.is_absolute():
            root = (self._repo_root / base).resolve()
        else:
            root = base.resolve()
        try:
            root.relative_to(self._repo_root)
        except ValueError:
            # Absolute orchestration root outside repo is allowed if configured;
            # still reject symlink escapes on write via resolve checks.
            pass
        return root

    def proposals_dir(self) -> Path:
        path = self._orch_root / "proposals"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def validate_propose_path(self, target_relative_path: str) -> str:
        return assert_propose_allowed(target_relative_path)

    def is_rules_path(self, target_relative_path: str) -> bool:
        return is_rules_path(normalize_relative_path(target_relative_path))

    def _abs_under_repo(self, relative_path: str) -> Path:
        normalized = normalize_relative_path(relative_path)
        abs_path = (self._repo_root / normalized).resolve()
        try:
            abs_path.relative_to(self._repo_root)
        except ValueError as exc:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MEMORY_INVALID_PATH",
                    message="Resolved path escapes repository root",
                    details={"path": relative_path},
                ),
                http_status=400,
            ) from exc
        if abs_path.is_symlink():
            real = abs_path.resolve()
            try:
                real.relative_to(self._repo_root)
            except ValueError as exc:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_MEMORY_INVALID_PATH",
                        message="Symlink target escapes repository root",
                        details={"path": relative_path},
                    ),
                    http_status=400,
                ) from exc
        return abs_path

    def read_text(self, relative_path: str) -> str | None:
        path = self._abs_under_repo(relative_path)
        if not path.is_file():
            return None
        return path.read_text(encoding="utf-8")

    def file_sha256(self, relative_path: str) -> str | None:
        content = self.read_text(relative_path)
        if content is None:
            return None
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    def atomic_write(self, relative_path: str, content: str) -> None:
        path = self._abs_under_repo(relative_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(
            prefix=f".{path.name}.",
            suffix=".tmp",
            dir=str(path.parent),
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, path)
        except Exception:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise
        log_event(
            self._logger,
            event="eic.memory.fs.write",
            message="Atomic write completed",
            path=relative_path,
        )

    def write_proposal_files(
        self,
        proposal_id: str,
        *,
        meta: dict[str, Any],
        markdown: str,
        content: str,
    ) -> str:
        proposals = self.proposals_dir()
        base = proposals / proposal_id
        json_path = base.with_suffix(".json")
        md_path = base.with_suffix(".md")
        content_path = Path(str(base) + ".content")
        json_path.write_text(json.dumps(meta, indent=2, default=str) + "\n", encoding="utf-8")
        md_path.write_text(markdown, encoding="utf-8")
        content_path.write_text(content, encoding="utf-8")
        # Return path relative to repo when possible
        try:
            rel = json_path.resolve().relative_to(self._repo_root)
            return str(rel)
        except ValueError:
            return str(json_path)
