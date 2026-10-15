"""Shared FastAPI response helpers for Empery services."""

from core.api.responses import (
    empery_metadata,
    new_error_response,
    register_standard_error_handlers,
)

__all__ = [
    "empery_metadata",
    "new_error_response",
    "register_standard_error_handlers",
]
