"""Structured JSON logging helpers."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any


class JsonFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "service": getattr(record, "service", None),
            "event": getattr(record, "event", None),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        extra = getattr(record, "extra_fields", None)
        if isinstance(extra, dict):
            payload.update(extra)
        return json.dumps(
            {k: v for k, v in payload.items() if v is not None},
            default=str,
        )


def configure_logging(service_name: str, level: int = logging.INFO) -> logging.Logger:
    """Configure and return a JSON logger for a service."""
    logger = logging.getLogger(service_name)
    if logger.handlers:
        return logger

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False

    # Bind service name onto all records from this logger.
    old_factory = logging.getLogRecordFactory()

    def record_factory(*args: Any, **kwargs: Any) -> logging.LogRecord:
        record = old_factory(*args, **kwargs)
        if record.name == service_name or record.name.startswith(f"{service_name}."):
            record.service = service_name  # type: ignore[attr-defined]
        return record

    logging.setLogRecordFactory(record_factory)
    return logger


def log_event(
    logger: logging.Logger,
    event: str,
    message: str,
    level: int = logging.INFO,
    **fields: Any,
) -> None:
    """Emit a structured service event."""
    logger.log(
        level,
        message,
        extra={"event": event, "extra_fields": fields},
    )
