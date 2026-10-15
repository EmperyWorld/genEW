"""Bearer validation middleware for ECC /api/v1 routes when ECC_REQUIRE_AUTH=true."""

from __future__ import annotations

import logging
import secrets

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from core.errors import ServiceError
from services.empery_control_center_api.config import ServiceConfig
from services.empery_control_center_api.src.api.autonomous_rbac import (
    can_autonomous_write,
    is_autonomous_mutating_path,
)
from services.empery_control_center_api.src.integration.identity_client import (
    IdentityClient,
    log_identity_rejection,
    strip_bearer_token,
)

_MUTATING = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_MESH_HEADER = "X-Empery-Mesh-Token"

_AUTH_EXEMPT_PATHS = frozenset(
    {
        "/api/v1/auth/login",
        "/api/v1/auth/logout",
        "/api/v1/auth/register",
        "/api/v1/auth/password-reset/request",
        "/api/v1/auth/password-reset/confirm",
    }
)


def _mesh_token_ok(request: Request, config: ServiceConfig) -> bool:
    expected = (getattr(config, "mesh_token", None) or "").strip()
    if not expected:
        return False
    presented = request.headers.get(_MESH_HEADER, "")
    if not presented:
        return False
    return secrets.compare_digest(presented, expected)


def _is_auth_exempt(path: str, request: Request, config: ServiceConfig) -> bool:
    if path in _AUTH_EXEMPT_PATHS:
        return True
    # Liveness only — mesh inventory requires auth when require_auth is on.
    if path == "/api/v1/health":
        return True
    # EIC→ECC hot-reload: mesh token when configured; empty token = lab open refresh.
    if path == "/api/v1/registry/refresh":
        expected = (getattr(config, "mesh_token", None) or "").strip()
        if not expected:
            return True
        return _mesh_token_ok(request, config)
    if path == "/api/v1/ops/reload-bff-routes":
        expected = (getattr(config, "mesh_token", None) or "").strip()
        if not expected:
            return True
        return _mesh_token_ok(request, config)
    return False


def _is_sensitive_read_path(method: str, path: str) -> bool:
    """Return True when a GET must carry a valid Bearer token."""
    if method != "GET":
        return False
    if path == "/api/v1/jobs":
        return True
    if path.startswith("/api/v1/jobs/"):
        rest = path[len("/api/v1/jobs/") :]
        if rest and "/" not in rest:
            return True
        return False
    if path == "/api/v1/audit":
        return True
    if path == "/api/v1/autonomous" or path.startswith("/api/v1/autonomous/"):
        return True
    if path.startswith("/api/v1/orchestration/"):
        return True
    if path == "/api/v1/registry":
        return True
    if path.startswith("/api/v1/identity/"):
        return True
    if path == "/api/v1/ai-chat" or path.startswith("/api/v1/ai-chat/"):
        return True
    # Market trust: service mesh inventory is not anonymous.
    if path == "/api/v1/health/services" or path.startswith("/api/v1/health/"):
        return True
    return False


def _requires_auth(method: str, path: str, request: Request, config: ServiceConfig) -> bool:
    """Whether the request must present a valid Bearer token."""
    if _is_auth_exempt(path, request, config):
        return False
    if method in _MUTATING:
        # Mesh-authenticated refresh already exempted above when token matches.
        return True
    return _is_sensitive_read_path(method, path)


class EccAuthMiddleware(BaseHTTPMiddleware):
    """Require valid Bearer on protected ECC routes when ``require_auth`` is enabled."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        config: ServiceConfig = request.app.state.config
        if not config.require_auth:
            return await call_next(request)

        path = request.url.path
        if not _requires_auth(request.method, path, request, config):
            return await call_next(request)

        logger: logging.Logger = request.app.state.container.resolve("logger")
        identity: IdentityClient = request.app.state.container.resolve(
            "identity_client"
        )

        try:
            token = strip_bearer_token(request.headers.get("Authorization"))
            principal = await identity.introspect_token(token)
            request.state.auth_principal = principal
        except ServiceError as exc:
            log_identity_rejection(logger, exc.response.message)
            return JSONResponse(
                status_code=exc.http_status,
                content=exc.response.model_dump(mode="json"),
            )
        except Exception as exc:  # noqa: BLE001 — boundary guard
            log_identity_rejection(logger, str(exc))
            body = {
                "error_code": "ECC_UNAUTHORIZED",
                "message": "Identity verification failed",
            }
            return JSONResponse(status_code=401, content=body)

        if is_autonomous_mutating_path(request.method, path) and not can_autonomous_write(
            principal.roles
        ):
            return JSONResponse(
                status_code=403,
                content={
                    "error_code": "ECC_FORBIDDEN",
                    "message": "Autonomous write access requires admin or operator role",
                },
            )

        return await call_next(request)
