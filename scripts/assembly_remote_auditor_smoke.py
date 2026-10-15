#!/usr/bin/env python3
"""Live remote Auditor smoke — gRPC Assemble + VerifyService T∧C∧S PASSED.

Requires empery_assembler on ASSEMBLER_GRPC_TARGET (default 127.0.0.1:50051)
with orchestration volume mounted (compose path).

Usage:
  python3 scripts/assembly_remote_auditor_smoke.py

Exit: 0 PASS, 1 FAIL, 2 unreachable.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SERVICE = "asm_auditor_smoke"


def main() -> int:
    sys.path.insert(0, str(REPO))
    os.environ["EIC_ASSEMBLY_SKIP_TSC"] = "1"
    target = os.environ.get("ASSEMBLER_GRPC_TARGET", "127.0.0.1:50051").strip()

    try:
        import grpc

        ch = grpc.insecure_channel(target)
        grpc.channel_ready_future(ch).result(timeout=5)
        ch.close()
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: gRPC unreachable at {target}: {exc}", file=sys.stderr)
        return 2

    from core.integration.assembly_contracts import (
        default_ops_dashboard_blueprint,
        manifest_from_blueprint,
    )
    from core.protos.empery.assembly.v1 import assembly_pb2, assembly_pb2_grpc
    from services.empery_intelligence_core.src.integration.grpc_assembler_adapter import (
        GrpcAssemblerAdapter,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        _ops_dashboard_mount_tsx,
    )

    parity = REPO / ".cursor" / "orchestration" / "eic" / "assembly_parity" / SERVICE
    if parity.exists():
        shutil.rmtree(parity)

    mounts = parity / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    (mounts / f"{SERVICE}.tsx").write_text(
        _ops_dashboard_mount_tsx(SERVICE, "AuditorSmoke", "Auditor Smoke", 8099),
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
    mf_host = eic / f"{SERVICE}_manifest.json"
    mf_host.write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )

    host_mode = os.environ.get("ASSEMBLER_PARITY_HOST_MODE", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    if host_mode:
        grpc_ws: Path = parity
        grpc_mf = mf_host
    else:
        grpc_ws = Path("/app/.cursor/orchestration/eic/assembly_parity") / SERVICE
        grpc_mf = (
            grpc_ws
            / ".cursor"
            / "orchestration"
            / "eic"
            / "assembly"
            / f"{SERVICE}_manifest.json"
        )

    remote = GrpcAssemblerAdapter(target, use_stream=True)
    try:
        ares = remote.assemble_v1(
            grpc_ws,
            blueprint=bp,
            manifest=mf,
            manifest_path=grpc_mf,
            run_tsc=False,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: AssembleService: {exc}", file=sys.stderr)
        return 1
    if not ares.get("ok", True):
        print("FAIL: assemble not ok", file=sys.stderr)
        return 1

    ch = grpc.insecure_channel(target)
    stub = assembly_pb2_grpc.VerifierServiceStub(ch)
    req = assembly_pb2.VerificationRequest(
        service_name=SERVICE,
        gate_t=True,
        gate_c=True,
        gate_s=True,
        intent="ops dashboard metrics revenue chart",
    )
    req.workspace.workspace_root = str(grpc_ws)
    req.blueprint_relpath = f".cursor/orchestration/designs/{SERVICE}_blueprint.json"
    req.manifest_relpath = (
        f".cursor/orchestration/eic/assembly/{SERVICE}_manifest.json"
    )
    try:
        report = stub.VerifyService(req, timeout=60)
    except grpc.RpcError as exc:
        print(f"FAIL: VerifyService {exc.code()} {exc.details()}", file=sys.stderr)
        ch.close()
        return 1
    ch.close()

    status = assembly_pb2.VerifyStatus.Name(report.status)
    gates = {
        g.gate: assembly_pb2.VerifyStatus.Name(g.status) for g in report.gates
    }
    print(f"VerifyService {status} gates={gates}")
    if report.status != assembly_pb2.VERIFY_STATUS_PASSED:
        for g in report.gates:
            for v in g.violations:
                print(f"  violation {g.gate}: {v.message}", file=sys.stderr)
        return 1
    if gates.get("T") != "VERIFY_STATUS_PASSED" or gates.get("C") != "VERIFY_STATUS_PASSED":
        print("FAIL: T∧C not both PASSED", file=sys.stderr)
        return 1
    print("PASS remote Auditor T∧C∧S")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
