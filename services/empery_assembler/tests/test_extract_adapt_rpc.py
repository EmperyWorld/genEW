"""Mechanics ExtractAdapt RPC + Assemble step progress fidelity."""

from __future__ import annotations

import logging
from pathlib import Path

from core.assembly.extract_adapt import extract_adapt
from core.protos.empery.assembly.v1 import assembly_pb2
from services.empery_assembler.config import ServiceConfig
from services.empery_assembler.src.integration.servicer import AssemblerServicer


def test_extract_adapt_core_genesis(tmp_path: Path) -> None:
    src = tmp_path / "reference" / "eliteew" / "packs" / "demo"
    src.mkdir(parents=True)
    (src / "widget.tsx").write_text("export const W = 1;\n", encoding="utf-8")
    dest_root = tmp_path / "services" / "demo_svc" / "src" / "integration" / "atoms"
    result = extract_adapt(
        workspace=tmp_path,
        source_glob="reference/eliteew/packs/demo/*.tsx",
        dest="services/demo_svc/src/integration/atoms/",
        service_name="demo_svc",
        mode="genesis",
    )
    assert result.ok, result.error
    assert result.written
    assert any((tmp_path / p).is_file() for p in result.written)
    assert dest_root.is_dir() or any("atoms" in p for p in result.written)


def test_extract_adapt_rpc(tmp_path: Path) -> None:
    src = tmp_path / "reference" / "eliteew" / "packs" / "rpc_pack"
    src.mkdir(parents=True)
    (src / "a.tsx").write_text("export {}\n", encoding="utf-8")
    cfg = ServiceConfig(workspace_root=str(tmp_path))
    svc = AssemblerServicer(cfg, logging.getLogger("extract_rpc"))
    req = assembly_pb2.ExtractAdaptRequest(
        workspace=assembly_pb2.WorkspaceRef(workspace_root=str(tmp_path)),
        source_glob="reference/eliteew/packs/rpc_pack/*.tsx",
        dest="services/rpc_svc/src/integration/atoms/",
        service_name="rpc_svc",
        mode="genesis",
    )
    resp = svc.ExtractAdapt(req, context=None)  # type: ignore[arg-type]
    assert resp.ok, resp.error_message
    assert resp.written
    assert resp.written[0].kind == "extract"
    assert resp.written[0].sha256
    assert resp.written[0].content  # content-transfer ready


def test_stream_assembly_emits_scaffold_extract_steps(tmp_path: Path) -> None:
    """StreamAssembly reports SCAFFOLD/EXTRACT before STAMP (honest enum)."""
    from core.integration.assembly_contracts import (
        default_ops_dashboard_blueprint,
        manifest_from_blueprint,
    )
    import json

    service = "step_dash"
    mounts = tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        _ops_dashboard_mount_tsx,
    )

    (mounts / f"{service}.tsx").write_text(
        _ops_dashboard_mount_tsx(service, "Step", "Step", 8099),
        encoding="utf-8",
    )
    designs = tmp_path / ".cursor" / "orchestration" / "designs"
    designs.mkdir(parents=True)
    eic = tmp_path / ".cursor" / "orchestration" / "eic" / "assembly"
    eic.mkdir(parents=True)
    bp = default_ops_dashboard_blueprint(service_name=service)
    mf = manifest_from_blueprint(bp)
    (designs / f"{service}_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    (eic / f"{service}_manifest.json").write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )

    cfg = ServiceConfig(workspace_root=str(tmp_path))
    svc = AssemblerServicer(cfg, logging.getLogger("stream_steps"))
    req = assembly_pb2.DesignRequest(
        workspace=assembly_pb2.WorkspaceRef(
            workspace_root=str(tmp_path),
            service_name=service,
        ),
        blueprint_relpath=f".cursor/orchestration/designs/{service}_blueprint.json",
        manifest_relpath=f".cursor/orchestration/eic/assembly/{service}_manifest.json",
        run_tsc=False,
        run_scaffold=False,
        run_extract=False,
    )
    steps: list[int] = []
    for ev in svc.StreamAssembly(req, context=None):  # type: ignore[arg-type]
        which = ev.WhichOneof("event")
        if which == "progress":
            steps.append(int(ev.progress.step))
        elif which == "completed":
            assert ev.completed.ok, ev.completed.error_message
    # VALIDATE → SCAFFOLD → EXTRACT → STAMP → INJECT → …
    assert assembly_pb2.ASSEMBLY_STEP_VALIDATE in steps
    assert assembly_pb2.ASSEMBLY_STEP_SCAFFOLD in steps
    assert assembly_pb2.ASSEMBLY_STEP_EXTRACT in steps
    i_sc = steps.index(assembly_pb2.ASSEMBLY_STEP_SCAFFOLD)
    i_ex = steps.index(assembly_pb2.ASSEMBLY_STEP_EXTRACT)
    i_st = steps.index(assembly_pb2.ASSEMBLY_STEP_STAMP)
    assert i_sc < i_ex < i_st


def test_stream_assembly_run_scaffold_fails_without_capsule(tmp_path: Path) -> None:
    """run_scaffold=true without services/{name}/manifest.json → fail-closed."""
    from core.integration.assembly_contracts import (
        default_ops_dashboard_blueprint,
        manifest_from_blueprint,
    )
    import json

    service = "no_capsule"
    designs = tmp_path / ".cursor" / "orchestration" / "designs"
    designs.mkdir(parents=True)
    eic = tmp_path / ".cursor" / "orchestration" / "eic" / "assembly"
    eic.mkdir(parents=True)
    bp = default_ops_dashboard_blueprint(service_name=service)
    mf = manifest_from_blueprint(bp)
    (designs / f"{service}_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    (eic / f"{service}_manifest.json").write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    cfg = ServiceConfig(workspace_root=str(tmp_path))
    svc = AssemblerServicer(cfg, logging.getLogger("scaffold_fail"))
    req = assembly_pb2.DesignRequest(
        workspace=assembly_pb2.WorkspaceRef(
            workspace_root=str(tmp_path),
            service_name=service,
        ),
        blueprint_relpath=f".cursor/orchestration/designs/{service}_blueprint.json",
        manifest_relpath=f".cursor/orchestration/eic/assembly/{service}_manifest.json",
        run_tsc=False,
        run_scaffold=True,
        run_extract=False,
    )
    completed = None
    failed_step = False
    for ev in svc.StreamAssembly(req, context=None):  # type: ignore[arg-type]
        which = ev.WhichOneof("event")
        if which == "progress" and ev.progress.step == assembly_pb2.ASSEMBLY_STEP_FAILED:
            failed_step = True
        elif which == "completed":
            completed = ev.completed
    assert failed_step
    assert completed is not None
    assert completed.ok is False
    assert completed.error_code == "EIC_SCAFFOLD_REQUIRED"
