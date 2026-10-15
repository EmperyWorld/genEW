"""gRPC VerifierPort — calls empery_assembler VerifyService."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import grpc

from core.errors import ServiceError, StandardizedErrorResponse
from core.logging import log_event
from core.protos.empery.assembly.v1 import assembly_pb2, assembly_pb2_grpc
from services.empery_intelligence_core.src.integration.grpc_workspace_map import (
    map_workspace_for_grpc,
)


def _status_name(value: int) -> str:
    try:
        name = assembly_pb2.VerifyStatus.Name(value)
    except ValueError:
        return "UNKNOWN"
    return {
        "VERIFY_STATUS_PASSED": "PASSED",
        "VERIFY_STATUS_FAILED": "FAILED",
        "VERIFY_STATUS_UNSPECIFIED": "UNKNOWN",
    }.get(name, "UNKNOWN")


class GrpcVerifierAdapter:
    """Unary client for Assembler VerifyService (assembly gates only)."""

    def __init__(
        self,
        target: str,
        *,
        timeout_s: float = 120.0,
        logger: logging.Logger | None = None,
    ) -> None:
        self._target = target
        self._timeout_s = timeout_s
        self._logger = logger

    def verify_assembly(
        self,
        workspace: Path,
        service_name: str,
        *,
        gate_t: bool = True,
        gate_c: bool = True,
        gate_s: bool = True,
        intent: str = "",
        judge_raw: str | None = None,
        designs_root: Path | None = None,
        eic_root: Path | None = None,
    ) -> dict[str, Any]:
        grpc_ws = map_workspace_for_grpc(workspace)
        req = assembly_pb2.VerificationRequest(
            workspace=assembly_pb2.WorkspaceRef(
                workspace_root=str(grpc_ws),
                service_name=service_name,
            ),
            service_name=service_name,
            gate_t=gate_t,
            gate_c=gate_c,
            gate_s=gate_s,
        )
        if intent:
            req.intent = intent
        if judge_raw:
            req.gate_s_judge_json = judge_raw
        bp = f".cursor/orchestration/designs/{service_name}_blueprint.json"
        mf = f".cursor/orchestration/eic/assembly/{service_name}_manifest.json"
        # Always send standard relpaths — server resolves under workspace_root
        # (host may not see container paths like /app/...).
        req.blueprint_relpath = bp
        req.manifest_relpath = mf
        if designs_root is not None:
            candidate = designs_root / f"{service_name}_blueprint.json"
            if candidate.is_file():
                try:
                    req.blueprint_relpath = str(
                        candidate.relative_to(workspace)
                    ).replace("\\", "/")
                except ValueError:
                    pass
        if eic_root is not None:
            candidate = eic_root / "assembly" / f"{service_name}_manifest.json"
            if candidate.is_file():
                try:
                    req.manifest_relpath = str(
                        candidate.relative_to(workspace)
                    ).replace("\\", "/")
                except ValueError:
                    pass

        channel = grpc.insecure_channel(self._target)
        try:
            stub = assembly_pb2_grpc.VerifierServiceStub(channel)
            report = stub.VerifyService(req, timeout=self._timeout_s)
        except grpc.RpcError as exc:
            if self._logger is not None:
                log_event(
                    self._logger,
                    event="eic.verifier.grpc_failed",
                    message=str(exc.details() or exc),
                    code=str(exc.code()),
                    level=logging.ERROR,
                )
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_VERIFIER_GRPC_FAILED",
                    message=f"VerifyService RPC failed: {exc.code()}",
                    details={"target": self._target, "details": str(exc.details())},
                ),
                http_status=502,
            ) from exc
        finally:
            channel.close()

        gates: list[dict[str, Any]] = []
        violations: list[dict[str, Any]] = []
        gate_t_s = gate_c_s = gate_s_s = None
        for g in report.gates:
            st = _status_name(g.status)
            if g.gate == "T":
                gate_t_s = st
            elif g.gate == "C":
                gate_c_s = st
            elif g.gate == "S":
                gate_s_s = st
            viols = [
                {
                    "code": v.code,
                    "gate": v.gate or g.gate,
                    "severity": assembly_pb2.Severity.Name(v.severity),
                    "message": v.message,
                    "path": v.path if v.HasField("path") else None,
                }
                for v in g.violations
            ]
            gates.append(
                {
                    "gate": g.gate,
                    "status": st,
                    "detail": "; ".join(x["message"] for x in viols) if viols else st,
                    "violations": viols,
                }
            )
            violations.extend(viols)

        return {
            "service_name": report.service_name or service_name,
            "status": _status_name(report.status),
            "gate_t": gate_t_s,
            "gate_c": gate_c_s,
            "gate_s": gate_s_s,
            "gates": gates,
            "violations": violations,
            "gate_s_payload": None,
            "details": {g["gate"]: g.get("detail") for g in gates},
            "transport": "grpc",
            "report_relpath": (
                report.report_relpath if report.HasField("report_relpath") else None
            ),
        }
