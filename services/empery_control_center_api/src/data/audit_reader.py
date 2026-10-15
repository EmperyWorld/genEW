"""JSONL audit log reader for orchestration/audit/events.jsonl."""

from __future__ import annotations

import json
import logging
from typing import Any

from core.logging import log_event

from services.empery_control_center_api.src.core.models import (
    AuditLogEntry,
    classify_audit_category,
)
from services.empery_control_center_api.src.integration.orchestration_paths import (
    OrchestrationPaths,
)


class AuditReader:
    """Read-only tail of audit JSONL; empty when file is missing."""

    def __init__(
        self,
        paths: OrchestrationPaths,
        logger: logging.Logger,
        *,
        max_lines: int = 500,
    ) -> None:
        self._paths = paths
        self._logger = logger
        self._max_lines = max_lines

    async def read(
        self,
        *,
        limit: int,
        offset: int,
        categories: set[str] | None = None,
        exclude_categories: set[str] | None = None,
    ) -> tuple[list[AuditLogEntry], bool, str]:
        source = str(self._paths.audit_path)
        if not self._paths.audit_path.is_file():
            return [], False, source

        try:
            lines = self._paths.audit_path.read_text(encoding="utf-8").splitlines()
        except OSError as exc:
            log_event(
                self._logger,
                event="ecc.audit.read_error",
                message="Failed to read audit file",
                level=logging.WARNING,
                path=source,
                reason=str(exc),
            )
            return [], False, source

        entries: list[AuditLogEntry] = []
        for line in lines:
            text = line.strip()
            if not text:
                continue
            try:
                raw: dict[str, Any] = json.loads(text)
            except json.JSONDecodeError:
                continue
            if not isinstance(raw, dict):
                continue
            event_name = raw.get("event") or raw.get("name")
            event_str = event_name if isinstance(event_name, str) else None
            category = raw.get("category")
            if not isinstance(category, str) or not category:
                category = classify_audit_category(event_str)
            # Always re-classify known Cursor hooks so stale/missing category
            # cannot leak IDE noise into the default Insight Feed.
            if classify_audit_category(event_str) == "audit_hook":
                category = "audit_hook"
            if categories is not None and category not in categories:
                continue
            if exclude_categories is not None and category in exclude_categories:
                continue
            summary = raw.get("summary") or raw.get("message") or raw.get("context")
            if not isinstance(summary, str):
                summary = None
            entries.append(
                AuditLogEntry(
                    raw=raw,
                    timestamp=raw.get("timestamp") or raw.get("ts"),
                    event=event_str,
                    summary=summary,
                    category=category,
                )
            )

        # Newest-last semantics: offset/limit from the end.
        capped = entries[-self._max_lines :] if self._max_lines > 0 else entries
        if offset < 0:
            offset = 0
        if limit < 0:
            limit = 0
        # Treat offset as skip from the end window start (oldest of window).
        window = capped[offset : offset + limit] if limit else capped[offset:]
        return window, True, source
