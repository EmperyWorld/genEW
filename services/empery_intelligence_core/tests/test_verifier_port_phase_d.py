"""Phase 4 — VerifierPort / verify_runner unit smoke."""

from __future__ import annotations

import json
from pathlib import Path

from core.assembly.verify_runner import run_assembly_gates
from core.integration.assembly_contracts import (
    default_ops_dashboard_blueprint,
    manifest_from_blueprint,
)
from services.empery_intelligence_core.src.integration.local_verifier_adapter import (
    LocalVerifierAdapter,
)
from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
    _ops_dashboard_mount_tsx,
)
from services.empery_intelligence_core.src.integration.local_assembler_adapter import (
    LocalAssemblerAdapter,
)


def test_verify_runner_passed_after_assemble(tmp_path: Path) -> None:
    service = "asm_verify_unit"
    mounts = tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    (mounts / f"{service}.tsx").write_text(
        _ops_dashboard_mount_tsx(service, "AsmVerify", "Asm Verify", 8099),
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
    mf_path = eic / f"{service}_manifest.json"
    mf_path.write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )

    LocalAssemblerAdapter().assemble_v1(
        tmp_path,
        blueprint=bp,
        manifest=mf,
        manifest_path=mf_path,
        run_tsc=False,
    )
    report = LocalVerifierAdapter().verify_assembly(
        tmp_path,
        service,
        intent="ops dashboard metrics revenue",
        designs_root=designs,
        eic_root=eic.parent,
    )
    assert report["gate_t"] == "PASSED", report
    assert report["gate_c"] == "PASSED", report
    assert report["status"] == "PASSED", report
    assert report["transport"] == "local"


def test_verify_runner_skip_legacy(tmp_path: Path) -> None:
    report = run_assembly_gates(tmp_path, "missing_svc", gate_s=False)
    assert report["gate_t"] == "SKIPPED"
    assert report["gate_c"] in {"SKIPPED", "FAILED"}
