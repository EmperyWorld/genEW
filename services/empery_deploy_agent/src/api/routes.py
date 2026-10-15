"""HTTP routes for allowlisted deploy actions."""

from __future__ import annotations

from fastapi import APIRouter, Request

from services.empery_deploy_agent.src.core.contracts import (
    DeployRequest,
    DeployResponse,
    HealthResponse,
)
from services.empery_deploy_agent.src.integration.compose_runner import ComposeRunner

router = APIRouter(prefix="/api/v1")


def _runner(request: Request) -> ComposeRunner:
    return request.app.state.runner


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    runner = _runner(request)
    details = runner.status_details()
    socket_ok = bool(details.get("socket_ok"))
    workspace = str(details.get("workspace") or "")
    workspace_ok = bool(details.get("workspace_ok"))
    status = "ok" if socket_ok and workspace_ok else "degraded"
    return HealthResponse(
        status=status,
        service="empery_deploy_agent",
        workspace=workspace,
        socket_ok=socket_ok,
        container_host=str(details.get("container_host") or ""),
        details={
            "workspace_ok": workspace_ok,
            "workspace_error": details.get("workspace_error"),
        },
    )


@router.post("/deploy", response_model=DeployResponse)
async def deploy(body: DeployRequest, request: Request) -> DeployResponse:
    """Allowlisted compose up/build/ps or HTTP health probe for one service."""
    return _runner(request).run(
        service_name=body.service_name,
        action=body.action,
        health_url=body.health_url,
    )
