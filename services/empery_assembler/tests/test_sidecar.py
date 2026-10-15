"""Phase 1 sidecar — error mapping and registry smoke."""

from __future__ import annotations

import logging

from core.errors import ServiceError, StandardizedErrorResponse
from core.protos.empery.assembly.v1 import assembly_pb2
from core.registry import GlobalServiceRegistry
from fastapi.testclient import TestClient

from services.empery_assembler.config import ServiceConfig
from services.empery_assembler.src.api.main import create_app, register
from services.empery_assembler.src.integration.codec import error_response
from services.empery_assembler.src.integration.servicer import AssemblerServicer


def test_error_response_fields() -> None:
    resp = error_response(
        service_name="ops_dashboard",
        error_code="EIC_MANIFEST_INVALID",
        error_message="boom",
        details={"k": "v"},
    )
    assert resp.ok is False
    assert resp.error_code == "EIC_MANIFEST_INVALID"
    assert resp.error_message == "boom"
    assert resp.service_name == "ops_dashboard"
    assert resp.details.fields["k"].string_value == "v"


def test_assemble_maps_service_error(monkeypatch) -> None:
    cfg = ServiceConfig(workspace_root="/tmp", enable_health_http=False)
    logger = logging.getLogger("test.assembler")
    svc = AssemblerServicer(cfg, logger)

    def _raise_resolve(*_a, **_k):
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_ASSEMBLY_CLI_FAILED",
                message="node missing",
                details={"target": "x.tsx"},
            ),
            http_status=500,
        )

    monkeypatch.setattr(
        "services.empery_assembler.src.integration.servicer.resolve_contracts",
        _raise_resolve,
    )
    req = assembly_pb2.DesignRequest()
    req.workspace.service_name = "ops_dashboard"
    out = svc.AssembleService(req, None)  # type: ignore[arg-type]
    assert out.ok is False
    assert out.error_code == "EIC_ASSEMBLY_CLI_FAILED"
    assert "node missing" in out.error_message


def test_register_and_health() -> None:
    reg = GlobalServiceRegistry()
    register(reg)
    assert reg.has_service("empery_assembler")
    app = create_app()
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "empery_assembler"
    assert body["transport"] == "grpc"
