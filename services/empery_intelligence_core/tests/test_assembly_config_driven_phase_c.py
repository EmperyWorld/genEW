"""Phase C — Gate T/C/S, LLM override kill, empty-div FAILED."""

from __future__ import annotations

import json
from pathlib import Path

from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
    authoritative_verify_summary,
)
from core.assembly.assembler import (
    run_assembler_v1,
)
from core.integration.assembly_contracts import (
    AssemblyManifest,
    CompositionItem,
    PropMapping,
    TargetModule,
    WidgetType,
    default_ops_dashboard_blueprint,
)
from core.assembly.gates import (
    apply_authoritative_assembly_gates,
    verify_assembly_gate_c_full,
    verify_assembly_gate_s,
    verify_assembly_gate_t,
    write_assembly_freeze,
)
from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
    _ops_dashboard_mount_tsx,
)


def _manifest(service: str = "sales_dash") -> AssemblyManifest:
    return AssemblyManifest(
        blueprint_id=service,
        blueprint_version="1.0.0",
        target_module=TargetModule.DASHBOARD_STANDARD,
        composition=[
            CompositionItem(
                component_id="metric_card",
                component="Card",
                widget_type=WidgetType.CARD,
                data_source="/api/v1/metrics",
                mapping=[
                    PropMapping(
                        prop_name="title",
                        source_type="static",
                        value="Total Revenue",
                    ),
                    PropMapping(
                        prop_name="value", source_type="static", value="42"
                    ),
                ],
            ),
            CompositionItem(
                component_id="trend_chart",
                component="Chart",
                widget_type=WidgetType.CHART,
                data_source="/api/v1/metrics",
                mapping=[
                    PropMapping(
                        prop_name="title",
                        source_type="static",
                        value="Sales History",
                    ),
                    PropMapping(
                        prop_name="chart_type",
                        source_type="static",
                        value="area_line",
                    ),
                ],
            ),
        ],
    )


def _seed_assembled(tmp_path: Path, service: str = "sales_dash") -> Path:
    import shutil

    if not shutil.which("node"):
        import pytest

        pytest.skip("node required")

    mounts = (
        tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    )
    mounts.mkdir(parents=True)
    (mounts / f"{service}.tsx").write_text(
        _ops_dashboard_mount_tsx(service, "SalesDash", "Sales Dash", 8025),
        encoding="utf-8",
    )
    designs = tmp_path / "orchestration" / "designs"
    designs.mkdir(parents=True)
    eic_asm = tmp_path / "orchestration" / "eic" / "assembly"
    eic_asm.mkdir(parents=True)
    bp = default_ops_dashboard_blueprint(service_name=service)
    mf = _manifest(service)
    (designs / f"{service}_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json")), encoding="utf-8"
    )
    mf_path = eic_asm / f"{service}_manifest.json"
    mf_path.write_text(
        json.dumps(mf.model_dump(mode="json")), encoding="utf-8"
    )
    run_assembler_v1(
        tmp_path,
        blueprint=bp,
        manifest=mf,
        manifest_path=mf_path,
        run_tsc=False,
    )
    return mf_path


def test_gate_t_passes_when_hashes_match(tmp_path: Path) -> None:
    _seed_assembled(tmp_path)
    status, detail = verify_assembly_gate_t(tmp_path, "sales_dash")
    assert status == "PASSED", detail


def test_gate_t_fails_on_drift(tmp_path: Path) -> None:
    _seed_assembled(tmp_path)
    mount = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / "sales_dash.tsx"
    )
    mount.write_text(mount.read_text(encoding="utf-8") + "\n// tampered\n", encoding="utf-8")
    status, detail = verify_assembly_gate_t(tmp_path, "sales_dash")
    assert status == "FAILED"
    assert "CRITICAL_VIOLATION" in detail or "drift" in detail


def test_gate_c_full_passes_after_inject(tmp_path: Path) -> None:
    _seed_assembled(tmp_path)
    designs = tmp_path / "orchestration" / "designs"
    eic = tmp_path / "orchestration" / "eic"
    status, detail = verify_assembly_gate_c_full(
        tmp_path,
        "sales_dash",
        designs_root=designs,
        eic_root=eic,
    )
    assert status == "PASSED", detail


def test_gate_c_fails_empty_div_slot(tmp_path: Path) -> None:
    """Placeholder slot without injected composition ids → FAILED."""
    service = "sales_dash"
    mounts = (
        tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    )
    mounts.mkdir(parents=True)
    # Slot present but no composition keys (empty-div case).
    (mounts / f"{service}.tsx").write_text(
        'export function X(){ return <div data-assembler-slot="widgets" /> }\n',
        encoding="utf-8",
    )
    designs = tmp_path / "orchestration" / "designs"
    designs.mkdir(parents=True)
    eic = tmp_path / "orchestration" / "eic" / "assembly"
    eic.mkdir(parents=True)
    bp = default_ops_dashboard_blueprint(service_name=service)
    mf = _manifest(service)
    (designs / f"{service}_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json")), encoding="utf-8"
    )
    (eic / f"{service}_manifest.json").write_text(
        json.dumps(mf.model_dump(mode="json")), encoding="utf-8"
    )
    (tmp_path / "services" / service).mkdir(parents=True)
    (tmp_path / "services" / service / "assembly_runtime.json").write_text(
        json.dumps(
            {
                "service_name": service,
                "blueprint_id": service,
                "blueprint_version": "1.0.0",
                "target_module": "Dashboard_Standard",
                "scaffold_profile": "ops_dashboard",
                "composition_ids": ["metric_card", "trend_chart"],
                "data_sources": ["/api/v1/metrics"],
                "widget_count": 2,
            }
        ),
        encoding="utf-8",
    )
    status, detail = verify_assembly_gate_c_full(
        tmp_path,
        service,
        designs_root=designs,
        eic_root=tmp_path / "orchestration" / "eic",
    )
    assert status == "FAILED"
    assert "empty-div" in detail or "covering" in detail or "slot" in detail.lower()


def test_gate_s_heuristic_dashboard_intent(tmp_path: Path) -> None:
    _seed_assembled(tmp_path)
    status, detail, payload = verify_assembly_gate_s(
        intent="Build an ops dashboard with metrics cards",
        workspace=tmp_path,
        service_name="sales_dash",
        designs_root=tmp_path / "orchestration" / "designs",
        eic_root=tmp_path / "orchestration" / "eic",
    )
    assert status == "PASSED", detail
    assert payload.get("match") is True


def test_gate_s_judge_raw_nervas_override(tmp_path: Path) -> None:
    _seed_assembled(tmp_path)
    status, detail, payload = verify_assembly_gate_s(
        intent="Build an ops dashboard with metrics cards",
        workspace=tmp_path,
        service_name="sales_dash",
        designs_root=tmp_path / "orchestration" / "designs",
        eic_root=tmp_path / "orchestration" / "eic",
        judge_raw='{"match": false, "reason": "forced mismatch", "confidence": 0.9}',
    )
    assert status == "FAILED", detail
    assert payload.get("source") == "nervas"
    assert payload.get("match") is False


def test_gate_s_low_confidence_nervas_defers_to_heuristic(tmp_path: Path) -> None:
    _seed_assembled(tmp_path)
    status, detail, payload = verify_assembly_gate_s(
        intent="Build an ops dashboard with metrics cards",
        workspace=tmp_path,
        service_name="sales_dash",
        designs_root=tmp_path / "orchestration" / "designs",
        eic_root=tmp_path / "orchestration" / "eic",
        judge_raw='{"match": false, "reason": "unsure", "confidence": 0.2}',
    )
    assert status == "PASSED", detail
    assert "nervas_low_conf" in str(payload.get("source") or "")


def test_gate_s_nervas_abstained_fails(tmp_path: Path) -> None:
    _seed_assembled(tmp_path)
    status, detail, payload = verify_assembly_gate_s(
        intent="Build an ops dashboard with metrics cards",
        workspace=tmp_path,
        service_name="sales_dash",
        designs_root=tmp_path / "orchestration" / "designs",
        eic_root=tmp_path / "orchestration" / "eic",
        nervas_abstained=True,
    )
    assert status == "FAILED", detail
    assert payload.get("source") == "abstention"


def test_gate_s_abstained_sentinel_fails(tmp_path: Path) -> None:
    _seed_assembled(tmp_path)
    status, detail, payload = verify_assembly_gate_s(
        intent="Build an ops dashboard with metrics cards",
        workspace=tmp_path,
        service_name="sales_dash",
        designs_root=tmp_path / "orchestration" / "designs",
        eic_root=tmp_path / "orchestration" / "eic",
        judge_raw="__NERVAS_ABSTAINED__",
    )
    assert status == "FAILED", detail
    assert payload.get("source") == "abstention"


def test_gate_s_unparseable_judge_raw_fails(tmp_path: Path) -> None:
    _seed_assembled(tmp_path)
    status, detail, payload = verify_assembly_gate_s(
        intent="Build an ops dashboard with metrics cards",
        workspace=tmp_path,
        service_name="sales_dash",
        designs_root=tmp_path / "orchestration" / "designs",
        eic_root=tmp_path / "orchestration" / "eic",
        judge_raw="not json at all",
    )
    assert status == "FAILED", detail
    assert payload.get("source") == "abstention"


def test_apply_authoritative_tc_override_llm_passed() -> None:
    # LLM said PASSED but Gate C failed → FAILED
    assert (
        apply_authoritative_assembly_gates(
            "PASSED", gate_t="PASSED", gate_c="FAILED", gate_s="PASSED"
        )
        == "FAILED"
    )
    assert (
        apply_authoritative_assembly_gates(
            "PASSED", gate_t="FAILED", gate_c="PASSED", gate_s="PASSED"
        )
        == "FAILED"
    )
    # T∧C pass, S fail → FAILED
    assert (
        apply_authoritative_assembly_gates(
            "PASSED", gate_t="PASSED", gate_c="PASSED", gate_s="FAILED"
        )
        == "FAILED"
    )
    # T∧C pass → keep PASSED
    assert (
        apply_authoritative_assembly_gates(
            "PASSED", gate_t="PASSED", gate_c="PASSED", gate_s="PASSED"
        )
        == "PASSED"
    )
    # C6: T∧C pass clears LLM FAILED stickiness
    assert (
        apply_authoritative_assembly_gates(
            "FAILED", gate_t="PASSED", gate_c="PASSED", gate_s="PASSED"
        )
        == "PASSED"
    )
    assert (
        apply_authoritative_assembly_gates(
            "FAILED", gate_t="PASSED", gate_c="PASSED", gate_s=None
        )
        == "PASSED"
    )
    # S fail still wins when T∧C pass
    assert (
        apply_authoritative_assembly_gates(
            "FAILED", gate_t="PASSED", gate_c="PASSED", gate_s="FAILED"
        )
        == "FAILED"
    )


def test_authoritative_summary_includes_gates() -> None:
    body, short = authoritative_verify_summary(
        "FAILED",
        gate_t_detail="Gate T: drift",
        contract_detail="Gate C: empty",
        gate_s_detail="Gate S OK",
        llm_narrative="I think it PASSED honestly",
    )
    assert "Gate T" in body
    assert "Gate C" in body
    assert "non-authoritative" in body
    assert short == "verify_status=FAILED"


def test_freeze_written_by_assembler_v1(tmp_path: Path) -> None:
    _seed_assembled(tmp_path)
    freeze = tmp_path / "services" / "sales_dash" / "assembly_freeze.json"
    assert freeze.is_file()
    data = json.loads(freeze.read_text(encoding="utf-8"))
    assert data["files"]
