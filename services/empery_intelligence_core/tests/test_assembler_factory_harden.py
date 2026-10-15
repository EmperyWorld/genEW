"""LIVE harden: factory default grpc + fail-closed extract (real Mechanics)."""

from __future__ import annotations

import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any

import grpc
import pytest

from core.integration.assembly_contracts import (
    default_ops_dashboard_blueprint,
    manifest_from_blueprint,
)
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.assembler_factory import (
    build_assembler_port,
)
from services.empery_intelligence_core.src.integration.grpc_assembler_adapter import (
    GrpcAssemblerAdapter,
)
from services.empery_intelligence_core.src.integration.local_assembler_adapter import (
    LocalAssemblerAdapter,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
    _ops_dashboard_mount_tsx,
)
from services.empery_intelligence_core.src.integration.verifier_factory import (
    build_verifier_port,
)
from services.empery_intelligence_core.src.integration.grpc_verifier_adapter import (
    GrpcVerifierAdapter,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)

REPO = Path(__file__).resolve().parents[3]
TARGET = os.environ.get("ASSEMBLER_GRPC_TARGET", "127.0.0.1:50051").strip()
SERVICE = "asm_factory_harden"


def _assembler_ready(target: str = TARGET, timeout_s: float = 3.0) -> bool:
    try:
        ch = grpc.insecure_channel(target)
        grpc.channel_ready_future(ch).result(timeout=timeout_s)
        ch.close()
        return True
    except Exception:  # noqa: BLE001
        return False


requires_live_assembler = pytest.mark.skipif(
    not _assembler_ready(),
    reason=f"empery_assembler not reachable at {TARGET}",
)


@pytest.fixture
def clear_transport_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "EIC_ASSEMBLER_TRANSPORT",
        "EIC_VERIFIER_TRANSPORT",
        "EIC_ASSEMBLER_GRPC_TARGET",
        "EIC_VERIFIER_GRPC_TARGET",
    ):
        monkeypatch.delenv(key, raising=False)


def test_build_assembler_port_defaults_to_grpc(clear_transport_env: None) -> None:
    port = build_assembler_port()
    assert isinstance(port, GrpcAssemblerAdapter)
    assert port._target == "127.0.0.1:50051"


def test_build_verifier_port_defaults_to_grpc(clear_transport_env: None) -> None:
    port = build_verifier_port()
    assert isinstance(port, GrpcVerifierAdapter)


def test_build_assembler_port_empty_target_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EIC_ASSEMBLER_TRANSPORT", "grpc")
    monkeypatch.setenv("EIC_ASSEMBLER_GRPC_TARGET", "")
    with pytest.raises(RuntimeError, match="EIC_ASSEMBLER_GRPC_TARGET"):
        build_assembler_port()


@requires_live_assembler
def test_factory_default_grpc_assembles_against_live_mechanics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Env transport unset → grpc adapter → real StreamAssembly → freeze on disk."""
    for key in ("EIC_ASSEMBLER_TRANSPORT", "EIC_VERIFIER_TRANSPORT"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("EIC_ASSEMBLER_GRPC_TARGET", TARGET)
    monkeypatch.setenv("EIC_VERIFIER_GRPC_TARGET", TARGET)
    monkeypatch.setenv("EIC_ASSEMBLY_SKIP_TSC", "1")
    monkeypatch.setenv("EIC_ASSEMBLER_WORKSPACE_MAP", f"{REPO}:/app")

    port = build_assembler_port(logger=logging.getLogger("harden.factory"))
    assert isinstance(port, GrpcAssemblerAdapter), type(port)

    parity = (
        REPO / ".cursor" / "orchestration" / "eic" / "assembly_parity" / SERVICE
    )
    if parity.exists():
        shutil.rmtree(parity)
    mounts = parity / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    (mounts / f"{SERVICE}.tsx").write_text(
        _ops_dashboard_mount_tsx(SERVICE, "FactoryHarden", "Factory Harden", 8096),
        encoding="utf-8",
    )
    designs = parity / ".cursor" / "orchestration" / "designs"
    designs.mkdir(parents=True)
    eic = parity / ".cursor" / "orchestration" / "eic" / "assembly"
    eic.mkdir(parents=True)
    bp = default_ops_dashboard_blueprint(service_name=SERVICE)
    mf = manifest_from_blueprint(bp)
    (designs / f"{SERVICE}_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    mf_path = eic / f"{SERVICE}_manifest.json"
    mf_path.write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )

    grpc_ws = Path("/app/.cursor/orchestration/eic/assembly_parity") / SERVICE
    grpc_mf = (
        grpc_ws
        / ".cursor"
        / "orchestration"
        / "eic"
        / "assembly"
        / f"{SERVICE}_manifest.json"
    )
    result = port.assemble_v1(
        grpc_ws,
        blueprint=bp,
        manifest=mf,
        manifest_path=grpc_mf,
        run_tsc=False,
        logger=logging.getLogger("harden.factory"),
    )
    assert result.get("ok", True), result
    assert result.get("transport") == "grpc"
    progress = result.get("progress") or getattr(port, "last_progress", [])
    assert len(progress) >= 3, progress
    freeze = parity / "services" / SERVICE / "assembly_freeze.json"
    assert freeze.is_file(), "live Mechanics must write assembly_freeze.json"

    ver = build_verifier_port(logger=logging.getLogger("harden.factory"))
    assert isinstance(ver, GrpcVerifierAdapter)
    report = ver.verify_assembly(
        grpc_ws,
        SERVICE,
        gate_t=True,
        gate_c=True,
        gate_s=False,
        intent="ops dashboard metrics",
    )
    assert report.get("gate_t") == "PASSED", report
    assert report.get("gate_c") == "PASSED", report
    assert report.get("transport") == "grpc"


@requires_live_assembler
def test_extract_adapt_via_live_grpc_port(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Brain extract_adapt goes through GrpcAssemblerAdapter.ExtractAdapt RPC."""
    monkeypatch.setenv("EIC_ASSEMBLER_TRANSPORT", "grpc")
    monkeypatch.setenv("EIC_ASSEMBLER_GRPC_TARGET", TARGET)
    monkeypatch.setenv("EIC_ASSEMBLER_WORKSPACE_MAP", f"{REPO}:/app")

    # Seed under mounted orchestration tree so Mechanics can see it.
    pack = (
        REPO
        / ".cursor"
        / "orchestration"
        / "eic"
        / "assembly_parity"
        / "asm_extract_live"
    )
    if pack.exists():
        shutil.rmtree(pack)
    src = pack / "reference" / "eliteew" / "packs" / "live_pack"
    src.mkdir(parents=True)
    (src / "widget.tsx").write_text("export const LiveW = 1;\n", encoding="utf-8")

    cfg = ServiceConfig(
        workspace_root=str(pack),
        orchestration_root=str(pack / ".cursor" / "orchestration"),
        deploy_agent_url="",
        auto_deploy_on_implement=False,
        engine_allow_service_writes=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=pack)
    paths.designs_root.mkdir(parents=True, exist_ok=True)
    paths.eic_root.mkdir(parents=True, exist_ok=True)
    assembler = build_assembler_port(logger=logging.getLogger("harden.extract"))
    assert isinstance(assembler, GrpcAssemblerAdapter)
    tools = WorkspaceToolAdapter(
        paths,
        cfg,
        logging.getLogger("harden.extract"),
        assembler=assembler,
    )
    result = tools.extract_adapt_action(
        {
            "source_glob": "reference/eliteew/packs/live_pack/*.tsx",
            "dest": "services/live_svc/src/integration/atoms/",
            "mode": "genesis",
        },
        service_name="live_svc",
    )
    assert result["ok"] is True, result
    assert result.get("transport") == "grpc"
    assert result.get("written"), result
    written = pack / "services" / "live_svc" / "src" / "integration" / "atoms"
    assert any(written.rglob("*.tsx")), f"no atoms under {written}"


def test_extract_adapt_fail_closed_without_port_method(tmp_path: Path) -> None:
    """No silent direct shim when AssemblerPort lacks extract_adapt."""
    cfg = ServiceConfig(
        workspace_root=str(tmp_path),
        orchestration_root=str(tmp_path / ".cursor" / "orchestration"),
        deploy_agent_url="",
        auto_deploy_on_implement=False,
        engine_allow_service_writes=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    paths.designs_root.mkdir(parents=True, exist_ok=True)
    paths.eic_root.mkdir(parents=True, exist_ok=True)
    tools = WorkspaceToolAdapter(
        paths,
        cfg,
        logging.getLogger("harden.failclosed"),
        assembler=object(),  # no extract_adapt
    )
    result = tools.extract_adapt_action(
        {
            "source_glob": "reference/eliteew/packs/x/*.tsx",
            "dest": "services/x/src/integration/atoms/",
        },
        service_name="x",
    )
    assert result["ok"] is False
    assert "extract_adapt" in str(result.get("error") or "").lower()
    # Must not invent files via direct shim
    assert not list((tmp_path / "services").rglob("*")) if (tmp_path / "services").exists() else True


def test_local_opt_in_still_works(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EIC_ASSEMBLER_TRANSPORT", "local")
    assert isinstance(build_assembler_port(), LocalAssemblerAdapter)
