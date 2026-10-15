"""Resolve EIC Autonomous facade from the shared container (no hard imports)."""

from __future__ import annotations

import logging
import os
from typing import Any, Protocol
from uuid import UUID

import httpx

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse


class EicAutonomousPort(Protocol):
    """Typing-only Protocol mirroring EicAutonomousUseCases / HTTP gateway."""

    async def submit_intention(self, req: Any) -> Any: ...

    async def list_jobs(
        self, *, status: Any = None, limit: int = 50
    ) -> Any: ...

    async def get_job(self, job_id: UUID) -> Any: ...

    async def pause_job(self, job_id: UUID) -> Any: ...

    async def resume_job(self, job_id: UUID) -> Any: ...

    async def cancel_job(self, job_id: UUID) -> Any: ...

    async def get_mode(self) -> Any: ...

    async def set_mode(self, enabled: bool) -> Any: ...

    async def get_providers(self) -> Any: ...

    async def set_provider(
        self, provider_id: Any, *, llm_base_url: str | None = None
    ) -> Any: ...

    async def search_memory(
        self, query: str, *, limit: int = 10, service_name: str | None = None
    ) -> Any: ...

    async def llm_health(self) -> Any: ...


def _unavailable(message: str = "Empery Intelligence Core is unavailable") -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="ECC_EIC_UNAVAILABLE",
            message=message,
        ),
        http_status=503,
    )


class HttpEicGateway:
    """HTTP proxy fallback when in-process EIC providers are missing."""

    def __init__(self, base_url: str, logger: logging.Logger | None = None) -> None:
        self._base = base_url.rstrip("/")
        self._logger = logger

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict | None = None,
        params: dict | None = None,
    ) -> Any:
        url = f"{self._base}{path}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.request(
                    method, url, json=json_body, params=params
                )
        except httpx.HTTPError as exc:
            raise _unavailable(f"EIC HTTP proxy failed: {exc}") from exc

        if response.status_code >= 400:
            try:
                body = response.json()
            except Exception:
                body = None
            if isinstance(body, dict) and "error_code" in body:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code=str(body.get("error_code", "EIC_INTERNAL_ERROR")),
                        message=str(body.get("message", "EIC error")),
                        details=body.get("details") or {},
                    ),
                    http_status=response.status_code,
                )
            raise _unavailable(f"EIC returned HTTP {response.status_code}")
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    async def submit_intention(self, req: Any) -> Any:
        payload = req.model_dump() if hasattr(req, "model_dump") else req
        return await self._request(
            "POST", "/api/v1/autonomous/intentions", json_body=payload
        )

    async def list_jobs(self, *, status: Any = None, limit: int = 50) -> Any:
        params: dict[str, Any] = {"limit": limit}
        if status is not None:
            params["status"] = getattr(status, "value", status)
        return await self._request(
            "GET", "/api/v1/autonomous/jobs", params=params
        )

    async def get_job(self, job_id: UUID) -> Any:
        return await self._request("GET", f"/api/v1/autonomous/jobs/{job_id}")

    async def pause_job(self, job_id: UUID) -> Any:
        return await self._request(
            "POST", f"/api/v1/autonomous/jobs/{job_id}/pause"
        )

    async def resume_job(self, job_id: UUID) -> Any:
        return await self._request(
            "POST", f"/api/v1/autonomous/jobs/{job_id}/resume"
        )

    async def cancel_job(self, job_id: UUID) -> Any:
        return await self._request(
            "POST", f"/api/v1/autonomous/jobs/{job_id}/cancel"
        )

    async def get_mode(self) -> Any:
        return await self._request("GET", "/api/v1/autonomous/mode")

    async def set_mode(self, enabled: bool) -> Any:
        return await self._request(
            "PUT", "/api/v1/autonomous/mode", json_body={"enabled": enabled}
        )

    async def get_providers(self) -> Any:
        return await self._request("GET", "/api/v1/autonomous/providers")

    async def set_provider(
        self, provider_id: Any, *, llm_base_url: str | None = None
    ) -> Any:
        body: dict[str, Any] = {
            "provider_id": getattr(provider_id, "value", provider_id),
        }
        if llm_base_url is not None:
            body["llm_base_url"] = llm_base_url
        return await self._request(
            "PUT", "/api/v1/autonomous/providers", json_body=body
        )

    async def search_memory(
        self, query: str, *, limit: int = 10, service_name: str | None = None
    ) -> Any:
        params: dict[str, Any] = {"q": query, "limit": limit}
        if service_name:
            params["service_name"] = service_name
        return await self._request(
            "GET",
            "/api/v1/autonomous/memory/search",
            params=params,
        )

    async def llm_health(self) -> Any:
        return await self._request("GET", "/api/v1/autonomous/llm/health")


def _eic_api_base(container: ServiceContainer) -> str:
    """Resolve HTTP proxy base from ecc_config (preferred) or EIC_API_BASE env.

    When ``ecc_config`` is present, its ``eic_api_base`` wins even if empty so
    tests / standalone ECC do not accidentally pick up a host ``EIC_API_BASE``.
    """
    if container.has("ecc_config"):
        return str(
            getattr(container.resolve("ecc_config"), "eic_api_base", "") or ""
        ).strip()
    return os.environ.get("EIC_API_BASE", "").strip()


def resolve_eic_gateway(container: ServiceContainer) -> EicAutonomousPort:
    """Prefer in-process use cases; fall back to EIC_API_BASE HTTP proxy."""
    if container.has("eic_gateway"):
        return container.resolve("eic_gateway")
    if container.has("eic_autonomous_use_cases"):
        return container.resolve("eic_autonomous_use_cases")
    base = _eic_api_base(container)
    if base:
        logger = container.resolve("logger") if container.has("logger") else None
        return HttpEicGateway(base, logger)
    raise _unavailable()


def wire_eic_gateway(container: ServiceContainer) -> None:
    """Register `eic_gateway` alias when EIC use cases (or HTTP base) exist."""
    if container.has("eic_gateway"):
        return
    if container.has("eic_autonomous_use_cases"):
        container.register(
            "eic_gateway",
            lambda c: c.resolve("eic_autonomous_use_cases"),
        )
        return
    base = _eic_api_base(container)
    if base:
        container.register(
            "eic_gateway",
            lambda c, b=base: HttpEicGateway(
                b, c.resolve("logger") if c.has("logger") else None
            ),
        )
