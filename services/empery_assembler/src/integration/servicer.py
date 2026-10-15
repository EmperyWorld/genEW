"""gRPC servicers wrapping core.assembly.assembler (Phase 2 — no EIC import)."""

from __future__ import annotations

import logging
from typing import Any

import grpc
from google.protobuf.struct_pb2 import Struct

from core.assembly.assembler import invoke_assembler_cli, run_assembler_v1
from core.errors import ServiceError
from core.logging import log_event
from core.protos.empery.assembly.v1 import assembly_pb2, assembly_pb2_grpc
from services.empery_assembler.config import ServiceConfig
from services.empery_assembler.src.integration.codec import (
    assembly_result_to_response,
    error_response,
    now_timestamp,
    resolve_contracts,
    resolve_workspace,
)


def _struct(data: dict[str, Any] | None) -> Struct:
    s = Struct()
    if data:
        s.update({k: v for k, v in data.items() if v is not None})
    return s


class AssemblerServicer(assembly_pb2_grpc.AssemblerServiceServicer):
    """Unary + streaming assemble + granular TransformAtom."""

    def __init__(self, config: ServiceConfig, logger: logging.Logger) -> None:
        self._config = config
        self._logger = logger

    def AssembleService(
        self,
        request: assembly_pb2.DesignRequest,
        context: grpc.ServicerContext,
    ) -> assembly_pb2.AssemblyResponse:
        return self._assemble(request)

    def StreamAssembly(
        self,
        request: assembly_pb2.DesignRequest,
        context: grpc.ServicerContext,
    ):
        req_id = request.workspace.request_id or ""
        intention_id = request.workspace.intention_id or ""

        def _progress(step: int, fraction: float, message: str):
            return assembly_pb2.AssemblyProgress(
                progress=assembly_pb2.ProgressUpdate(
                    request_id=req_id,
                    intention_id=intention_id,
                    step=step,
                    fraction=fraction,
                    message=message,
                    at=now_timestamp(),
                )
            )

        yield _progress(
            assembly_pb2.ASSEMBLY_STEP_VALIDATE, 0.05, "Validating contracts"
        )
        try:
            # Scaffold: fail-closed when requested but capsule missing (no silent announce).
            # Mechanics Scaffold RPC still deferred — Brain must pre-scaffold; we verify.
            if request.run_scaffold:
                try:
                    ws_root = resolve_workspace(
                        request.workspace.workspace_root,
                        self._config.workspace_root,
                    )
                    svc_name = (request.workspace.service_name or "").strip()
                    if not svc_name and request.HasField("blueprint_relpath"):
                        try:
                            from services.empery_assembler.src.integration.codec import (
                                load_json,
                            )

                            bp_data = load_json(ws_root / request.blueprint_relpath)
                            svc_name = str(bp_data.get("service_name") or "").strip()
                        except Exception:  # noqa: BLE001
                            svc_name = ""
                    capsule_mf = (
                        ws_root / "services" / svc_name / "manifest.json"
                        if svc_name
                        else None
                    )
                    if not svc_name or capsule_mf is None or not capsule_mf.is_file():
                        msg = (
                            "run_scaffold=true but capsule manifest missing — "
                            "Brain must scaffold first (Mechanics Scaffold RPC deferred)"
                        )
                        yield _progress(
                            assembly_pb2.ASSEMBLY_STEP_FAILED, 1.0, msg
                        )
                        failed = error_response(
                            error_code="EIC_SCAFFOLD_REQUIRED",
                            error_message=msg,
                        )
                        yield assembly_pb2.AssemblyProgress(completed=failed)
                        return
                    yield _progress(
                        assembly_pb2.ASSEMBLY_STEP_SCAFFOLD,
                        0.12,
                        f"Capsule present (Brain pre-scaffold verified): {svc_name}",
                    )
                except Exception as sc_exc:  # noqa: BLE001
                    msg = f"scaffold preflight failed: {sc_exc}"
                    yield _progress(assembly_pb2.ASSEMBLY_STEP_FAILED, 1.0, msg)
                    failed = error_response(
                        error_code="EIC_SCAFFOLD_REQUIRED",
                        error_message=msg,
                    )
                    yield assembly_pb2.AssemblyProgress(completed=failed)
                    return
            else:
                yield _progress(
                    assembly_pb2.ASSEMBLY_STEP_SCAFFOLD,
                    0.12,
                    "Scaffold skipped (run_scaffold=false; Brain pre-scaffold)",
                )
            if request.run_extract:
                yield _progress(
                    assembly_pb2.ASSEMBLY_STEP_EXTRACT,
                    0.18,
                    "Extract requested — use ExtractAdapt RPC for corpus/genesis copy",
                )
            else:
                yield _progress(
                    assembly_pb2.ASSEMBLY_STEP_EXTRACT,
                    0.18,
                    "Extract skipped (run_extract=false)",
                )
            yield _progress(
                assembly_pb2.ASSEMBLY_STEP_STAMP, 0.28, "Stamping assembly_runtime"
            )
            yield _progress(
                assembly_pb2.ASSEMBLY_STEP_INJECT, 0.5, "AST inject via assemble.mjs"
            )
            response = self._assemble(request)
            if not response.ok:
                yield _progress(
                    assembly_pb2.ASSEMBLY_STEP_FAILED,
                    1.0,
                    response.error_message or "assemble failed",
                )
                yield assembly_pb2.AssemblyProgress(completed=response)
                return
            yield _progress(
                assembly_pb2.ASSEMBLY_STEP_FREEZE, 0.85, "Freeze hashes written"
            )
            if request.run_tsc:
                yield _progress(
                    assembly_pb2.ASSEMBLY_STEP_TSC, 0.92, "Typecheck complete"
                )
            if request.emit_deploy_hint:
                yield _progress(
                    assembly_pb2.ASSEMBLY_STEP_RELOAD_HINT,
                    0.97,
                    "DeployHint emitted",
                )
            yield _progress(assembly_pb2.ASSEMBLY_STEP_DONE, 1.0, "Assemble done")
            yield assembly_pb2.AssemblyProgress(completed=response)
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="empery_assembler.stream_failed",
                message=str(exc),
                level=logging.ERROR,
            )
            failed = error_response(
                error_code="EIC_ASSEMBLY_CLI_FAILED",
                error_message=str(exc),
            )
            yield _progress(assembly_pb2.ASSEMBLY_STEP_FAILED, 1.0, str(exc))
            yield assembly_pb2.AssemblyProgress(completed=failed)

    def TransformAtom(
        self,
        request: assembly_pb2.TransformRequest,
        context: grpc.ServicerContext,
    ) -> assembly_pb2.TransformResponse:
        try:
            ws = resolve_workspace(
                request.workspace.workspace_root,
                self._config.workspace_root,
            )
            manifest_path = ws / request.manifest_relpath
            target_path = ws / request.target_relpath
            out_path = (
                ws / request.out_relpath
                if request.HasField("out_relpath") and request.out_relpath
                else None
            )
            if not manifest_path.is_file():
                return assembly_pb2.TransformResponse(
                    result=assembly_pb2.TransformationResult(
                        ok=False,
                        target_relpath=request.target_relpath,
                        error_code="EIC_MANIFEST_INVALID",
                        error_message=f"manifest not found: {manifest_path}",
                    )
                )
            if not target_path.is_file():
                return assembly_pb2.TransformResponse(
                    result=assembly_pb2.TransformationResult(
                        ok=False,
                        target_relpath=request.target_relpath,
                        error_code="EIC_ASSEMBLY_CLI_FAILED",
                        error_message=f"target not found: {target_path}",
                    )
                )
            payload = invoke_assembler_cli(
                manifest_path=manifest_path,
                target_path=target_path,
                out_path=out_path,
                logger=self._logger,
            )
            result = assembly_pb2.TransformationResult(
                ok=True,
                target_relpath=request.target_relpath,
                widget_count=int(payload.get("widget_count") or 0),
                cli_payload=_struct(payload if isinstance(payload, dict) else {}),
            )
            if out_path is not None:
                result.out_relpath = str(out_path.relative_to(ws)).replace("\\", "/")
            return assembly_pb2.TransformResponse(result=result)
        except ServiceError as exc:
            log_event(
                self._logger,
                event="empery_assembler.transform_failed",
                message=exc.response.message,
                error_code=exc.response.error_code,
                level=logging.ERROR,
            )
            return assembly_pb2.TransformResponse(
                result=assembly_pb2.TransformationResult(
                    ok=False,
                    target_relpath=request.target_relpath,
                    error_code=exc.response.error_code,
                    error_message=exc.response.message,
                    cli_payload=_struct(exc.response.details),
                )
            )
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="empery_assembler.transform_failed",
                message=str(exc),
                level=logging.ERROR,
            )
            return assembly_pb2.TransformResponse(
                result=assembly_pb2.TransformationResult(
                    ok=False,
                    target_relpath=request.target_relpath,
                    error_code="EIC_ASSEMBLY_CLI_FAILED",
                    error_message=str(exc),
                )
            )

    def ExtractAdapt(
        self,
        request: assembly_pb2.ExtractAdaptRequest,
        context: grpc.ServicerContext,
    ) -> assembly_pb2.ExtractAdaptResponse:
        """Optional Mechanics EXTRACT — corpus/genesis file adapt (Assemble step)."""
        try:
            ws = resolve_workspace(
                request.workspace.workspace_root,
                self._config.workspace_root,
            )
            from core.assembly.extract_adapt import extract_adapt

            result = extract_adapt(
                workspace=ws,
                source_glob=request.source_glob,
                dest=request.dest,
                transforms=list(request.transforms or []),
                service_name=(request.service_name or None) or None,
                mode=(request.mode or None) or None,
            )
            from core.assembly.artifact_bundle import attach_artifact_bytes

            inventory = [
                {"relpath": str(rel), "kind": "extract"} for rel in result.written
            ]
            # Always attach bytes under size cap so Brain can materialize
            # without shared FS (parity with Assemble include_artifact_bytes).
            inventory = attach_artifact_bytes(ws, inventory)
            written = []
            for item in inventory:
                art = assembly_pb2.WrittenArtifact(
                    relpath=str(item.get("relpath") or ""),
                    kind=str(item.get("kind") or "extract"),
                )
                sha = item.get("sha256")
                if isinstance(sha, str) and sha:
                    art.sha256 = sha
                content = item.get("content")
                if isinstance(content, (bytes, bytearray)) and content:
                    art.content = bytes(content)
                written.append(art)
            if not result.ok:
                return assembly_pb2.ExtractAdaptResponse(
                    ok=False,
                    mode=result.mode or "",
                    written=written,
                    skipped=list(result.skipped or []),
                    error_code="EIC_EXTRACT_FAILED",
                    error_message=result.error or "extract_adapt failed",
                )
            log_event(
                self._logger,
                event="empery_assembler.extract_adapt_done",
                message="ExtractAdapt completed",
                service_name=request.service_name or "",
                written=len(written),
            )
            return assembly_pb2.ExtractAdaptResponse(
                ok=True,
                mode=result.mode or "",
                written=written,
                skipped=list(result.skipped or []),
            )
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="empery_assembler.extract_adapt_failed",
                message=str(exc),
                level=logging.ERROR,
            )
            return assembly_pb2.ExtractAdaptResponse(
                ok=False,
                error_code="EIC_EXTRACT_FAILED",
                error_message=str(exc),
            )

    def FetchArtifacts(
        self,
        request: assembly_pb2.FetchArtifactsRequest,
        context: grpc.ServicerContext,
    ) -> assembly_pb2.FetchArtifactsResponse:
        service_name = (request.service_name or request.workspace.service_name or "").strip()
        try:
            ws = resolve_workspace(
                request.workspace.workspace_root,
                self._config.workspace_root,
            )
            from core.assembly.artifact_bundle import fetch_artifacts_inventory

            inv = fetch_artifacts_inventory(
                ws,
                service_name,
                include_bytes=bool(request.include_bytes),
                relpaths=list(request.relpaths or []),
            )
            written = []
            for item in inv.get("written") or []:
                if not isinstance(item, dict):
                    continue
                rel = str(item.get("relpath") or "")
                if not rel:
                    continue
                art = assembly_pb2.WrittenArtifact(
                    relpath=rel,
                    kind=str(item.get("kind") or "artifact"),
                )
                sha = item.get("sha256")
                if isinstance(sha, str) and sha:
                    art.sha256 = sha
                content = item.get("content")
                if isinstance(content, (bytes, bytearray)) and content:
                    art.content = bytes(content)
                written.append(art)
            resp = assembly_pb2.FetchArtifactsResponse(
                ok=True,
                service_name=service_name,
                written=written,
            )
            bundle_rel = inv.get("artifact_bundle_relpath")
            if isinstance(bundle_rel, str) and bundle_rel:
                resp.artifact_bundle_relpath = bundle_rel
            return resp
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="empery_assembler.fetch_artifacts_failed",
                message=str(exc),
                service_name=service_name,
                level=logging.ERROR,
            )
            return assembly_pb2.FetchArtifactsResponse(
                ok=False,
                service_name=service_name,
                error_code="EIC_ASSEMBLY_CLI_FAILED",
                error_message=str(exc),
            )

    def _assemble(
        self, request: assembly_pb2.DesignRequest
    ) -> assembly_pb2.AssemblyResponse:
        service_name = request.workspace.service_name or ""
        try:
            workspace, blueprint, manifest, manifest_path = resolve_contracts(
                request,
                default_workspace=self._config.workspace_root,
            )
            service_name = str(blueprint.get("service_name") or service_name)
            log_event(
                self._logger,
                event="empery_assembler.assemble_start",
                message="AssembleService invoked",
                service_name=service_name,
                run_tsc=bool(request.run_tsc),
                workspace=str(workspace),
            )
            result = run_assembler_v1(
                workspace,
                blueprint=blueprint,
                manifest=manifest,
                manifest_path=manifest_path,
                logger=self._logger,
                run_tsc=bool(request.run_tsc),
            )
            response = assembly_result_to_response(
                result,
                emit_deploy_hint=bool(request.emit_deploy_hint),
                workspace=workspace,
                include_artifact_bytes=bool(request.include_artifact_bytes),
            )
            log_event(
                self._logger,
                event="empery_assembler.assemble_done",
                message="AssembleService completed",
                service_name=response.service_name,
                ok=response.ok,
                widget_count=response.widget_count,
            )
            return response
        except ServiceError as exc:
            log_event(
                self._logger,
                event="empery_assembler.assemble_failed",
                message=exc.response.message,
                error_code=exc.response.error_code,
                service_name=service_name,
                level=logging.ERROR,
            )
            return error_response(
                service_name=service_name,
                error_code=exc.response.error_code,
                error_message=exc.response.message,
                details=exc.response.details,
            )
        except ValueError as exc:
            log_event(
                self._logger,
                event="empery_assembler.assemble_failed",
                message=str(exc),
                error_code="EIC_MANIFEST_INVALID",
                service_name=service_name,
                level=logging.ERROR,
            )
            return error_response(
                service_name=service_name,
                error_code="EIC_MANIFEST_INVALID",
                error_message=str(exc),
            )
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="empery_assembler.assemble_failed",
                message=str(exc),
                error_code="EIC_ASSEMBLY_CLI_FAILED",
                service_name=service_name,
                level=logging.ERROR,
            )
            return error_response(
                service_name=service_name,
                error_code="EIC_ASSEMBLY_CLI_FAILED",
                error_message=str(exc),
            )


class VerifierServicer(assembly_pb2_grpc.VerifierServiceServicer):
    """Assembly Auditor — Gate T/C/S via core.assembly.verify_runner."""

    def __init__(self, config: ServiceConfig, logger: logging.Logger) -> None:
        self._config = config
        self._logger = logger

    def VerifyService(
        self,
        request: assembly_pb2.VerificationRequest,
        context: grpc.ServicerContext,
    ) -> assembly_pb2.VerificationReport:
        from core.assembly.verify_runner import run_assembly_gates
        from services.empery_assembler.src.integration.codec import now_timestamp

        service = request.service_name or request.workspace.service_name
        try:
            ws = resolve_workspace(
                request.workspace.workspace_root,
                self._config.workspace_root,
            )
        except ValueError as exc:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details(str(exc))
            return assembly_pb2.VerificationReport(
                service_name=service,
                status=assembly_pb2.VERIFY_STATUS_FAILED,
                violations=[
                    assembly_pb2.Violation(
                        code="EIC_WORKSPACE_INVALID",
                        gate="C",
                        severity=assembly_pb2.SEVERITY_CRITICAL,
                        message=str(exc),
                    )
                ],
                at=now_timestamp(),
            )

        designs_root = None
        eic_root = None
        if request.HasField("blueprint_relpath") and request.blueprint_relpath:
            bp = ws / request.blueprint_relpath
            designs_root = bp.parent
        if request.HasField("manifest_relpath") and request.manifest_relpath:
            mf = ws / request.manifest_relpath
            eic_root = mf.parent.parent  # .../eic/assembly → .../eic

        judge = (
            request.gate_s_judge_json
            if request.HasField("gate_s_judge_json")
            else None
        )
        intent = request.intent if request.HasField("intent") else ""
        report = run_assembly_gates(
            ws,
            service,
            gate_t=bool(request.gate_t),
            gate_c=bool(request.gate_c),
            gate_s=bool(request.gate_s),
            intent=intent,
            judge_raw=judge,
            designs_root=designs_root,
            eic_root=eic_root,
        )
        log_event(
            self._logger,
            event="empery_assembler.verify_done",
            message="VerifyService completed",
            service_name=service,
            status=report.get("status"),
            gate_t=report.get("gate_t"),
            gate_c=report.get("gate_c"),
            gate_s=report.get("gate_s"),
        )
        return _report_to_proto(report)


def _status_enum(status: str | None) -> int:
    if status == "PASSED":
        return assembly_pb2.VERIFY_STATUS_PASSED
    if status == "FAILED":
        return assembly_pb2.VERIFY_STATUS_FAILED
    return assembly_pb2.VERIFY_STATUS_UNSPECIFIED


def _severity_enum(name: str) -> int:
    return {
        "INFO": assembly_pb2.SEVERITY_INFO,
        "WARNING": assembly_pb2.SEVERITY_WARNING,
        "ERROR": assembly_pb2.SEVERITY_ERROR,
        "CRITICAL": assembly_pb2.SEVERITY_CRITICAL,
    }.get(name.upper(), assembly_pb2.SEVERITY_ERROR)


def _report_to_proto(report: dict[str, Any]) -> assembly_pb2.VerificationReport:
    from services.empery_assembler.src.integration.codec import now_timestamp

    gates = []
    for g in report.get("gates") or []:
        viols = [
            assembly_pb2.Violation(
                code=str(v.get("code") or ""),
                gate=str(v.get("gate") or g.get("gate") or ""),
                severity=_severity_enum(str(v.get("severity") or "ERROR")),
                message=str(v.get("message") or ""),
            )
            for v in (g.get("violations") or [])
        ]
        gates.append(
            assembly_pb2.GateResult(
                gate=str(g.get("gate") or ""),
                status=_status_enum(str(g.get("status") or "")),
                violations=viols,
            )
        )
    all_viols = [
        assembly_pb2.Violation(
            code=str(v.get("code") or ""),
            gate=str(v.get("gate") or ""),
            severity=_severity_enum(str(v.get("severity") or "ERROR")),
            message=str(v.get("message") or ""),
        )
        for v in (report.get("violations") or [])
    ]
    return assembly_pb2.VerificationReport(
        service_name=str(report.get("service_name") or ""),
        status=_status_enum(str(report.get("status") or "")),
        gates=gates,
        violations=all_viols,
        at=now_timestamp(),
    )
