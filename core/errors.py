"""Standardized error contracts for service boundaries."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class StandardizedErrorResponse(BaseModel):
    """Boundary error response returned by all EWorld services."""

    model_config = ConfigDict(frozen=True)

    error_code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    # Wave 2 additions — optional for callers; boundary helper always fills them.
    timestamp: str | None = None
    request_id: str | None = None
    service: str | None = None


class ServiceError(Exception):
    """Internal exception carrying a StandardizedErrorResponse payload."""

    def __init__(
        self,
        response: StandardizedErrorResponse,
        *,
        http_status: int = 400,
    ) -> None:
        self.response = response
        self.http_status = http_status
        super().__init__(response.message)
