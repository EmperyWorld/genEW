#!/usr/bin/env python3
"""EIC Brain → Mechanics gRPC soak (same factories as wire_reflexes).

Proves ``build_assembler_port`` + ``build_verifier_port`` with
``EIC_ASSEMBLER_TRANSPORT=grpc`` against a live empery_assembler, including
Gate T∧C preflight semantics used before deploy, and the
``WorkspaceToolAdapter.run_config_driven_assembler`` path (IMPLEMENT assemble).

Does not require EIC HTTP to be up — exercises the in-process Brain adapters.

Usage:
  python3 scripts/assembly_eic_grpc_soak.py
  ASSEMBLER_GRPC_TARGET=127.0.0.1:50051 python3 scripts/assembly_eic_grpc_soak.py

Exit: 0 PASS, 1 FAIL, 2 unreachable.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
REPORT = REPO / ".cursor" / "orchestration" / "reports" / "assembly_eic_grpc_soak.md"
SERVICE = "asm_eic_grpc_soak"


def main() -> int:
    sys.path.insert(0, str(REPO))
    target = os.environ.get("ASSEMBLER_GRPC_TARGET", "127.0.0.1:50051").strip()
    os.environ["EIC_ASSEMBLER_TRANSPORT"] = "grpc"
    os.environ["EIC_ASSEMBLER_GRPC_TARGET"] = target
    os.environ["EIC_VERIFIER_TRANSPORT"] = "grpc"
    os.environ["EIC_VERIFIER_GRPC_TARGET"] = target
    os.environ["EIC_ASSEMBLY_SKIP_TSC"] = "1"
    os.environ["EIC_ASSEMBLY_SKIP_ECC_RELOAD"] = "1"
    # Host Brain → container Mechanics (shared orchestration bind).
    os.environ.setdefault(
        "EIC_ASSEMBLER_WORKSPACE_MAP", f"{REPO}:/app"
    )
    # Preflight uses verifier port — keep it on for soak.
    os.environ.pop("EIC_ASSEMBLY_SKIP_PREFLIGHT", None)

    try:
        import grpc

        ch = grpc.insecure_channel(target)
        grpc.channel_ready_future(ch).result(timeout=5)
        ch.close()
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: assembler unreachable at {target}: {exc}", file=sys.stderr)
        return 2

    from core.integration.assembly_contracts import (
        default_ops_dashboard_blueprint,
        manifest_from_blueprint,
    )
    from services.empery_intelligence_core.config import ServiceConfig
    from services.empery_intelligence_core.src.core.reflexes.models import AgentRole
    from services.empery_intelligence_core.src.integration.assembler_factory import (
        build_assembler_port,
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
    from services.empery_intelligence_core.src.integration.workspace_tools import (
        WorkspaceToolAdapter,
    )

    logger = logging.getLogger("soak.eic_grpc")
    logging.basicConfig(level=logging.INFO)

    asm = build_assembler_port(logger=logger)
    ver = build_verifier_port(logger=logger)
    assert type(asm).__name__ == "GrpcAssemblerAdapter", type(asm)
    assert type(ver).__name__ == "GrpcVerifierAdapter", type(ver)

    # Fixture under mounted orchestration tree (container sees /app/.cursor/...).
    parity = REPO / ".cursor" / "orchestration" / "eic" / "assembly_parity" / SERVICE
    if parity.exists():
        shutil.rmtree(parity)
    mounts = parity / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    (mounts / f"{SERVICE}.tsx").write_text(
        _ops_dashboard_mount_tsx(SERVICE, "EicGrpcSoak", "EIC gRPC Soak", 8099),
        encoding="utf-8",
    )
    designs = parity / ".cursor" / "orchestration" / "designs"
    designs.mkdir(parents=True)
    eic_asm = parity / ".cursor" / "orchestration" / "eic" / "assembly"
    eic_asm.mkdir(parents=True)
    bp = default_ops_dashboard_blueprint(service_name=SERVICE)
    mf = manifest_from_blueprint(bp)
    (designs / f"{SERVICE}_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    mf_host = eic_asm / f"{SERVICE}_manifest.json"
    mf_host.write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )

    # 1) Direct AssemblerPort / VerifierPort (container workspace path)
    grpc_ws = Path("/app/.cursor/orchestration/eic/assembly_parity") / SERVICE
    grpc_mf = (
        grpc_ws
        / ".cursor"
        / "orchestration"
        / "eic"
        / "assembly"
        / f"{SERVICE}_manifest.json"
    )

    ares = asm.assemble_v1(
        grpc_ws,
        blueprint=bp,
        manifest=mf,
        manifest_path=grpc_mf,
        run_tsc=False,
        logger=logger,
    )
    if not ares.get("ok", True):
        print("FAIL: assemble via GrpcAssemblerAdapter", file=sys.stderr)
        return 1
    progress_n = len(getattr(asm, "last_progress", []) or ares.get("progress") or [])
    if progress_n < 1:
        print("FAIL: expected StreamAssembly progress events", file=sys.stderr)
        return 1

    pre = ver.verify_assembly(
        grpc_ws,
        SERVICE,
        gate_t=True,
        gate_c=True,
        gate_s=False,
        intent="ops dashboard metrics",
    )
    if pre.get("gate_t") != "PASSED" or pre.get("gate_c") != "PASSED":
        print(f"FAIL: preflight T∧C {pre}", file=sys.stderr)
        return 1

    full = ver.verify_assembly(
        grpc_ws,
        SERVICE,
        gate_t=True,
        gate_c=True,
        gate_s=True,
        intent="ops dashboard metrics revenue chart",
    )
    if full.get("status") != "PASSED":
        print(
            f"FAIL: VerifyService status={full.get('status')} {full.get('details')}",
            file=sys.stderr,
        )
        return 1

    # 2) WorkspaceToolAdapter path (IMPLEMENT assemble + embedded preflight)
    #    Host workspace + EIC_ASSEMBLER_WORKSPACE_MAP → container /app.
    service2 = f"{SERVICE}_tools"
    parity2 = (
        REPO / ".cursor" / "orchestration" / "eic" / "assembly_parity" / service2
    )
    if parity2.exists():
        shutil.rmtree(parity2)
    mounts2 = parity2 / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts2.mkdir(parents=True)
    (mounts2 / f"{service2}.tsx").write_text(
        _ops_dashboard_mount_tsx(service2, "EicGrpcTools", "EIC gRPC Tools", 8098),
        encoding="utf-8",
    )
    orch2 = parity2 / ".cursor" / "orchestration"
    designs2 = orch2 / "designs"
    eic2 = orch2 / "eic" / "assembly"
    designs2.mkdir(parents=True)
    eic2.mkdir(parents=True)
    bp2 = default_ops_dashboard_blueprint(service_name=service2)
    mf2 = manifest_from_blueprint(bp2)
    (designs2 / f"{service2}_blueprint.json").write_text(
        json.dumps(bp2.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    (eic2 / f"{service2}_manifest.json").write_text(
        json.dumps(mf2.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )

    cfg = ServiceConfig(
        workspace_root=str(parity2),
        orchestration_root=str(orch2),
        deploy_agent_url="",
        auto_deploy_on_implement=False,
        engine_allow_service_writes=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=parity2)
    tools = WorkspaceToolAdapter(
        paths,
        cfg,
        logger,
        assembler=asm,
        verifier=ver,
    )
    tools.maybe_scaffold_for_intention = lambda **_k: []  # type: ignore[method-assign]
    try:
        tools.run_config_driven_assembler(
            service2,
            intent="ops dashboard metrics",
            role=AgentRole.IMPLEMENTER,
            written_paths=[],
            scaffold_profile="ops_dashboard",
            skip_mechanical_extract=True,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: WorkspaceToolAdapter assemble/preflight: {exc}", file=sys.stderr)
        return 1
    meta = tools.last_assembly_meta or {}
    pf = meta.get("preflight") or {}
    if pf.get("gate_t") != "PASSED" or pf.get("gate_c") != "PASSED":
        print(f"FAIL: tools preflight {pf}", file=sys.stderr)
        return 1
    if meta.get("transport") != "grpc":
        print(f"FAIL: expected tools transport=grpc got {meta.get('transport')}", file=sys.stderr)
        return 1

    verify_tools = tools.verify_assembly_gates(
        service2,
        intent="ops dashboard metrics revenue chart",
        gate_t=True,
        gate_c=True,
        gate_s=True,
    )
    if verify_tools.get("status") != "PASSED":
        print(f"FAIL: tools verify_assembly_gates {verify_tools}", file=sys.stderr)
        return 1

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    report = f"""# EIC gRPC Mechanics Soak

- **When:** {ts}
- **Target:** `{target}`
- **Service fixture:** `{SERVICE}` / `{service2}`
- **Assembler adapter:** `{type(asm).__name__}`
- **Verifier adapter:** `{type(ver).__name__}`
- **Factories:** `build_assembler_port` + `build_verifier_port` (same as wire_reflexes)
- **Workspace map:** `{os.environ.get("EIC_ASSEMBLER_WORKSPACE_MAP", "")}`

## Results

| Step | Status |
|------|--------|
| StreamAssembly via AssemblerPort | PASS (progress_events={progress_n}, widgets={ares.get("widget_count")}) |
| Preflight Gate T∧C via VerifierPort | PASS (T={pre.get("gate_t")}, C={pre.get("gate_c")}, transport={pre.get("transport")}) |
| VerifyService T∧C∧S | PASS (status={full.get("status")}, T={full.get("gate_t")}, C={full.get("gate_c")}, S={full.get("gate_s")}) |
| WorkspaceToolAdapter assemble+preflight | PASS (T={pf.get("gate_t")}, C={pf.get("gate_c")}, transport={meta.get("transport")}) |
| WorkspaceToolAdapter verify_assembly_gates | PASS (status={verify_tools.get("status")}) |

## Compose defaults

`compose.yml` / `docker-compose.yml` set `EIC_ASSEMBLER_TRANSPORT=grpc`
(verifier inherits), and EIC `depends_on: empery_assembler`.

## Note

Full Autonomous evolve (p19 live against EIC HTTP) requires EIC container up.
This soak proves the Brain DI factories + WorkspaceToolAdapter + remote Mechanics/Auditor.
"""
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(report, encoding="utf-8")
    print("PASS EIC gRPC soak")
    print(f"report={REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
