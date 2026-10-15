#!/usr/bin/env python3
"""In-container Brain→Mechanics gRPC soak (run inside EIC image)."""

from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

SERVICE = "asm_eic_incontainer"


def main() -> int:
    os.environ.setdefault("EIC_ASSEMBLER_TRANSPORT", "grpc")
    os.environ.setdefault("EIC_ASSEMBLER_GRPC_TARGET", "empery_assembler:50051")
    os.environ.setdefault("EIC_VERIFIER_TRANSPORT", "grpc")
    os.environ.setdefault("EIC_ASSEMBLY_SKIP_TSC", "1")

    from core.integration.assembly_contracts import (
        default_ops_dashboard_blueprint,
        manifest_from_blueprint,
    )
    from services.empery_intelligence_core.src.integration.assembler_factory import (
        build_assembler_port,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        _ops_dashboard_mount_tsx,
    )
    from services.empery_intelligence_core.src.integration.verifier_factory import (
        build_verifier_port,
    )

    parity = Path("/app/.cursor/orchestration/eic/assembly_parity") / SERVICE
    if parity.exists():
        shutil.rmtree(parity)
    mounts = parity / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    (mounts / f"{SERVICE}.tsx").write_text(
        _ops_dashboard_mount_tsx(SERVICE, "InC", "InC", 8097),
        encoding="utf-8",
    )
    designs = parity / ".cursor" / "orchestration" / "designs"
    eic = parity / ".cursor" / "orchestration" / "eic" / "assembly"
    designs.mkdir(parents=True)
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

    asm = build_assembler_port()
    ver = build_verifier_port()
    assert type(asm).__name__ == "GrpcAssemblerAdapter", type(asm)
    assert type(ver).__name__ == "GrpcVerifierAdapter", type(ver)

    ares = asm.assemble_v1(
        parity,
        blueprint=bp,
        manifest=mf,
        manifest_path=mf_path,
        run_tsc=False,
    )
    pre = ver.verify_assembly(
        parity,
        SERVICE,
        gate_t=True,
        gate_c=True,
        gate_s=False,
        intent="ops dashboard metrics",
    )
    full = ver.verify_assembly(
        parity,
        SERVICE,
        gate_t=True,
        gate_c=True,
        gate_s=True,
        intent="ops dashboard metrics revenue chart",
    )
    ok = (
        ares.get("ok", True)
        and pre.get("gate_t") == "PASSED"
        and pre.get("gate_c") == "PASSED"
        and full.get("status") == "PASSED"
    )
    print(
        json.dumps(
            {
                "ok": ok,
                "adapter": type(asm).__name__,
                "progress": len(getattr(asm, "last_progress", []) or []),
                "pre_t": pre.get("gate_t"),
                "pre_c": pre.get("gate_c"),
                "full": full.get("status"),
                "transport": full.get("transport"),
            }
        )
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
