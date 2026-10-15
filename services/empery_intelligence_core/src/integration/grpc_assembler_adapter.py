"""gRPC AssemblerPort — StreamAssembly with live EventBus progress."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

import grpc

from core.errors import ServiceError, StandardizedErrorResponse
from core.integration.assembly_contracts import AssemblyManifest, BlueprintContract
from core.logging import log_event
from core.protos.empery.assembly.v1 import assembly_pb2, assembly_pb2_grpc
from services.empery_intelligence_core.src.integration.grpc_workspace_map import (
    map_workspace_for_grpc,
    needs_artifact_content_transfer,
)

ProgressCallback = Callable[[dict[str, Any]], None]


def _step_name(step: int) -> str:
    try:
        return assembly_pb2.AssemblyStep.Name(step)
    except ValueError:
        return str(step)


def _written_artifacts_from_response(
    resp: assembly_pb2.AssemblyResponse,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for w in resp.written:
        entry: dict[str, Any] = {
            "relpath": w.relpath,
            "kind": w.kind or "artifact",
        }
        if w.HasField("sha256") and w.sha256:
            entry["sha256"] = w.sha256
        if w.HasField("content") and w.content:
            entry["content"] = bytes(w.content)
        out.append(entry)
    return out


class GrpcAssemblerAdapter:
    """Client for empery_assembler — prefers StreamAssembly for progress."""

    def __init__(
        self,
        target: str,
        *,
        timeout_s: float = 300.0,
        logger: logging.Logger | None = None,
        use_stream: bool = True,
        on_progress: ProgressCallback | None = None,
    ) -> None:
        self._target = target
        self._timeout_s = timeout_s
        self._logger = logger
        self._use_stream = use_stream
        self._on_progress = on_progress
        self.last_progress: list[dict[str, Any]] = []

    def set_progress_callback(self, on_progress: ProgressCallback | None) -> None:
        """Attach/replace mid-stream EventBus publisher (bound after loop start)."""
        self._on_progress = on_progress

    def assemble_v1(
        self,
        workspace: Path,
        *,
        blueprint: BlueprintContract | dict[str, Any],
        manifest: AssemblyManifest | dict[str, Any],
        manifest_path: Path,
        run_tsc: bool = True,
        logger: logging.Logger | None = None,
    ) -> dict[str, Any]:
        log = logger or self._logger
        self.last_progress = []
        bp = (
            blueprint
            if isinstance(blueprint, BlueprintContract)
            else BlueprintContract.model_validate(blueprint)
        )
        mf = (
            manifest
            if isinstance(manifest, AssemblyManifest)
            else AssemblyManifest.model_validate(manifest)
        )
        grpc_ws = map_workspace_for_grpc(workspace)
        transfer = needs_artifact_content_transfer(workspace)
        try:
            rel_mf = str(manifest_path.relative_to(workspace)).replace("\\", "/")
        except ValueError:
            try:
                rel_mf = str(manifest_path.relative_to(grpc_ws)).replace("\\", "/")
            except ValueError:
                rel_mf = str(manifest_path).replace("\\", "/")
        bp_rel = f".cursor/orchestration/designs/{bp.service_name}_blueprint.json"
        # Only touch host FS when workspace is a real local directory (shared bind).
        if workspace.is_dir():
            bp_path = workspace / bp_rel
            if not bp_path.is_file():
                bp_path.parent.mkdir(parents=True, exist_ok=True)
                bp_path.write_text(
                    json.dumps(
                        bp.model_dump(mode="json"), indent=2, ensure_ascii=False
                    )
                    + "\n",
                    encoding="utf-8",
                )
            if not Path(manifest_path).is_file() and workspace.is_dir():
                # manifest_path may be container-absolute; map via rel under workspace
                host_mf = workspace / rel_mf
                if not host_mf.is_file():
                    host_mf.parent.mkdir(parents=True, exist_ok=True)
                    host_mf.write_text(
                        json.dumps(
                            mf.model_dump(mode="json"), indent=2, ensure_ascii=False
                        )
                        + "\n",
                        encoding="utf-8",
                    )

        req = assembly_pb2.DesignRequest(
            workspace=assembly_pb2.WorkspaceRef(
                workspace_root=str(grpc_ws),
                service_name=bp.service_name,
            ),
            blueprint_relpath=bp_rel,
            manifest_relpath=rel_mf,
            run_tsc=run_tsc,
            emit_deploy_hint=False,
            assembler_version="v1",
            include_artifact_bytes=transfer,
        )
        channel = grpc.insecure_channel(self._target)
        try:
            stub = assembly_pb2_grpc.AssemblerServiceStub(channel)
            if self._use_stream:
                resp = self._stream_assemble(stub, req, log=log, service=bp.service_name)
            else:
                resp = stub.AssembleService(req, timeout=self._timeout_s)
        finally:
            channel.close()

        if not resp.ok:
            if log is not None:
                log_event(
                    log,
                    event="eic.assembler.grpc_failed",
                    message=resp.error_message or "AssembleService failed",
                    error_code=resp.error_code or "EIC_ASSEMBLY_CLI_FAILED",
                    service_name=bp.service_name,
                    level=logging.ERROR,
                )
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code=resp.error_code or "EIC_ASSEMBLY_CLI_FAILED",
                    message=resp.error_message or "AssembleService failed",
                    details={"transport": "grpc", "target": self._target},
                ),
                http_status=422,
            )

        written_artifacts = _written_artifacts_from_response(resp)
        materialized: list[str] = []
        if transfer and workspace.is_dir() and written_artifacts:
            from core.assembly.artifact_bundle import materialize_written_artifacts

            try:
                materialized = materialize_written_artifacts(
                    workspace, written_artifacts
                )
            except ValueError as exc:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_ARTIFACT_TRANSFER_FAILED",
                        message=str(exc),
                        details={"transport": "grpc", "target": self._target},
                    ),
                    http_status=422,
                ) from exc
            if log is not None:
                log_event(
                    log,
                    event="eic.assembler.artifacts_materialized",
                    message="Content-transfer wrote Mechanics artifacts onto Brain workspace",
                    service_name=bp.service_name,
                    count=len(materialized),
                )

        out: dict[str, Any] = {
            "ok": True,
            "written": [w.relpath for w in resp.written],
            "written_artifacts": [
                {k: v for k, v in a.items() if k != "content"}
                for a in written_artifacts
            ],
            "service_name": resp.service_name,
            "widget_count": resp.widget_count,
            "assembler_version": resp.assembler_version or "v1",
            "transport": "grpc",
            "progress": list(self.last_progress),
            "content_transfer": transfer,
            "materialized": materialized,
        }
        if resp.HasField("artifact_bundle_relpath") and resp.artifact_bundle_relpath:
            out["artifact_bundle_relpath"] = resp.artifact_bundle_relpath
        return out

    def _stream_assemble(
        self,
        stub: assembly_pb2_grpc.AssemblerServiceStub,
        req: assembly_pb2.DesignRequest,
        *,
        log: logging.Logger | None,
        service: str,
    ) -> assembly_pb2.AssemblyResponse:
        completed: assembly_pb2.AssemblyResponse | None = None
        for event in stub.StreamAssembly(req, timeout=self._timeout_s):
            which = event.WhichOneof("event")
            if which == "progress":
                p = event.progress
                step = _step_name(p.step)
                entry: dict[str, Any] = {
                    "service_name": service,
                    "step": step,
                    "fraction": float(p.fraction),
                    "message": p.message or step,
                    "request_id": p.request_id or "",
                    "intention_id": p.intention_id or "",
                    "transport": "grpc",
                }
                if log is not None:
                    log_event(
                        log,
                        event="eic.assembler.step",
                        message=entry["message"],
                        service_name=service,
                        step=step,
                        fraction=entry["fraction"],
                    )
                if self._on_progress is not None:
                    try:
                        self._on_progress(entry)
                        entry["live_published"] = True
                    except Exception as exc:  # noqa: BLE001
                        if log is not None:
                            log_event(
                                log,
                                event="eic.assembler.step_publish_failed",
                                message="Live eic.assembler.step publish failed",
                                error=str(exc)[:300],
                                step=step,
                                level=logging.WARNING,
                            )
                self.last_progress.append(entry)
            elif which == "completed":
                completed = event.completed
        if completed is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_ASSEMBLY_CLI_FAILED",
                    message="StreamAssembly ended without completed payload",
                    details={"target": self._target},
                ),
                http_status=502,
            )
        return completed

    def transform_atom(
        self,
        *,
        manifest_path: Path,
        target_path: Path,
        out_path: Path | None = None,
        logger: logging.Logger | None = None,
        workspace: Path | None = None,
    ) -> dict[str, Any]:
        ws = workspace or Path.cwd()
        grpc_ws = map_workspace_for_grpc(ws)
        try:
            mf_rel = str(manifest_path.relative_to(ws)).replace("\\", "/")
            tg_rel = str(target_path.relative_to(ws)).replace("\\", "/")
            out_rel = (
                str(out_path.relative_to(ws)).replace("\\", "/")
                if out_path is not None
                else None
            )
        except ValueError as exc:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_ASSEMBLY_CLI_FAILED",
                    message=f"paths must be under workspace for gRPC transform: {exc}",
                    details={},
                ),
                http_status=422,
            ) from exc

        req = assembly_pb2.TransformRequest(
            workspace=assembly_pb2.WorkspaceRef(workspace_root=str(grpc_ws)),
            manifest_relpath=mf_rel,
            target_relpath=tg_rel,
        )
        if out_rel:
            req.out_relpath = out_rel
        channel = grpc.insecure_channel(self._target)
        try:
            stub = assembly_pb2_grpc.AssemblerServiceStub(channel)
            resp = stub.TransformAtom(req, timeout=self._timeout_s)
        finally:
            channel.close()
        result = resp.result
        if not result.ok:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code=result.error_code or "EIC_ASSEMBLY_CLI_FAILED",
                    message=result.error_message or "TransformAtom failed",
                    details={"transport": "grpc"},
                ),
                http_status=422,
            )
        return {
            "ok": True,
            "widget_count": result.widget_count,
            "target": result.target_relpath,
            "transport": "grpc",
        }

    def extract_adapt(
        self,
        workspace: Path,
        *,
        source_glob: str,
        dest: str,
        transforms: list[str] | None = None,
        service_name: str | None = None,
        mode: str | None = None,
        logger: logging.Logger | None = None,
    ) -> dict[str, Any]:
        log = logger or self._logger
        grpc_ws = map_workspace_for_grpc(workspace)
        transfer = needs_artifact_content_transfer(workspace)
        req = assembly_pb2.ExtractAdaptRequest(
            workspace=assembly_pb2.WorkspaceRef(
                workspace_root=str(grpc_ws),
                service_name=service_name or "",
            ),
            source_glob=source_glob,
            dest=dest,
            transforms=list(transforms or []),
            service_name=service_name or "",
            mode=mode or "",
        )
        channel = grpc.insecure_channel(self._target)
        try:
            stub = assembly_pb2_grpc.AssemblerServiceStub(channel)
            resp = stub.ExtractAdapt(req, timeout=self._timeout_s)
        finally:
            channel.close()
        if not resp.ok:
            if log is not None:
                log_event(
                    log,
                    event="eic.assembler.extract_adapt_failed",
                    message=resp.error_message or "ExtractAdapt failed",
                    error_code=resp.error_code or "EIC_EXTRACT_FAILED",
                    level=logging.WARNING,
                )
            return {
                "ok": False,
                "error": resp.error_message or "ExtractAdapt failed",
                "written": [w.relpath for w in resp.written],
                "skipped": list(resp.skipped),
                "mode": resp.mode or "",
                "transport": "grpc",
            }
        written_artifacts: list[dict[str, Any]] = []
        for w in resp.written:
            entry: dict[str, Any] = {
                "relpath": w.relpath,
                "kind": w.kind or "extract",
            }
            if w.HasField("sha256") and w.sha256:
                entry["sha256"] = w.sha256
            if w.HasField("content") and w.content:
                entry["content"] = bytes(w.content)
            written_artifacts.append(entry)

        materialized: list[str] = []
        if transfer and workspace.is_dir() and written_artifacts:
            from core.assembly.artifact_bundle import materialize_written_artifacts

            try:
                materialized = materialize_written_artifacts(
                    workspace, written_artifacts
                )
            except ValueError as exc:
                return {
                    "ok": False,
                    "error": str(exc),
                    "written": [a["relpath"] for a in written_artifacts],
                    "skipped": list(resp.skipped),
                    "mode": resp.mode or "",
                    "transport": "grpc",
                    "content_transfer": True,
                }
            if log is not None:
                log_event(
                    log,
                    event="eic.assembler.extract_artifacts_materialized",
                    message="Content-transfer wrote ExtractAdapt artifacts onto Brain workspace",
                    count=len(materialized),
                    service_name=service_name or "",
                )
        return {
            "ok": True,
            "error": None,
            "written": [w.relpath for w in resp.written],
            "skipped": list(resp.skipped),
            "mode": resp.mode or "",
            "transport": "grpc",
            "content_transfer": transfer,
            "materialized": materialized,
        }
