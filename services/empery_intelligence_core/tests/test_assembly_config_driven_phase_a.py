"""Phase A — Configuration-Driven Assembly contracts, deny-write, Gate C."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from core.errors import ServiceError
from core.logging import configure_logging

from services.empery_intelligence_core.src.core.reflexes.models import AgentRole
from core.assembly.assembler import (
    run_assembler_v0,
    stamp_assembly_runtime,
    verify_assembly_contract_gate,
)
from core.integration.assembly_contracts import (
    AssemblyManifest,
    BlueprintContract,
    CompositionItem,
    ComponentType,
    DataRequirement,
    PropMapping,
    TargetModule,
    TreeNode,
    WidgetType,
    default_ops_dashboard_blueprint,
    is_config_driven_profile,
    parse_manifest_from_text,
    validate_blueprint,
    validate_manifest,
    validate_manifest_against_blueprint,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)
from services.empery_intelligence_core.tests.conftest import make_config


def _tools(tmp_path: Path) -> WorkspaceToolAdapter:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    cfg = make_config(tmp_path, engine_allow_service_writes=True)
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    return WorkspaceToolAdapter(paths, cfg, configure_logging("assembly_a"))


def _sample_blueprint(service: str = "sales_dash") -> BlueprintContract:
    return default_ops_dashboard_blueprint(service_name=service)


def _sample_manifest(service: str = "sales_dash") -> AssemblyManifest:
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
                        prop_name="title", source_type="static", value="Metrics"
                    ),
                    PropMapping(
                        prop_name="value",
                        source_type="dynamic",
                        data_path="value",
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
                        prop_name="chart_type",
                        source_type="static",
                        value="area_line",
                    ),
                ],
            ),
        ],
    )


def test_is_config_driven_profile() -> None:
    assert is_config_driven_profile("ops_dashboard")
    assert is_config_driven_profile("companion_chat")
    assert is_config_driven_profile("studio_job")
    assert not is_config_driven_profile("task_board")
    assert not is_config_driven_profile(None)


def test_validate_blueprint_and_manifest_roundtrip() -> None:
    bp = _sample_blueprint()
    mf = _sample_manifest()
    validate_manifest_against_blueprint(mf, bp)
    dumped = validate_blueprint(bp.model_dump(mode="json"))
    assert dumped.service_name == "sales_dash"
    assert validate_manifest(mf.model_dump(mode="json")).composition


def test_blueprint_requires_data_requirements() -> None:
    with pytest.raises(Exception):
        BlueprintContract(
            version="1",
            service_name="x",
            scaffold_profile="ops_dashboard",
            assembly_mode="config_driven",
            target_module=TargetModule.DASHBOARD_STANDARD,
            target_component_tree=[
                TreeNode(id="a", type=ComponentType.WIDGET, widget_type=WidgetType.CARD)
            ],
            data_requirements=[],
        )


def test_parse_manifest_from_text_shorthand() -> None:
    text = """
```json
{
  "blueprint_id": "sales_dash",
  "blueprint_version": "1.0.0",
  "target_module": "Dashboard_Standard",
  "configuration": {
    "theme": "dark",
    "layout": [
      {
        "component_id": "metric_card",
        "widget_type": "card",
        "props": {
          "title": "Revenue",
          "value_source": "/api/v1/metrics"
        }
      }
    ]
  }
}
```
"""
    mf = parse_manifest_from_text(text)
    assert mf is not None
    assert len(mf.composition) >= 1
    assert mf.composition[0].component_id == "metric_card"


def test_assembler_v0_stamps_runtime(tmp_path: Path) -> None:
    bp = _sample_blueprint()
    mf = _sample_manifest()
    result = run_assembler_v0(tmp_path, blueprint=bp, manifest=mf)
    assert result["ok"] is True
    stamp = tmp_path / "services" / "sales_dash" / "assembly_runtime.json"
    assert stamp.is_file()
    data = json.loads(stamp.read_text(encoding="utf-8"))
    assert data["widget_count"] == 2
    assert "metric_card" in data["composition_ids"]


def test_gate_c_passes_when_aligned(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    designs = tools._paths.designs_root
    designs.mkdir(parents=True)
    eic_asm = tools._paths.eic_root / "assembly"
    eic_asm.mkdir(parents=True)
    bp = _sample_blueprint()
    mf = _sample_manifest()
    (designs / "sales_dash_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json")), encoding="utf-8"
    )
    (eic_asm / "sales_dash_manifest.json").write_text(
        json.dumps(mf.model_dump(mode="json")), encoding="utf-8"
    )
    stamp_assembly_runtime(tmp_path, blueprint=bp, manifest=mf)
    status, detail = verify_assembly_contract_gate(
        tmp_path,
        "sales_dash",
        designs_root=designs,
        eic_root=tools._paths.eic_root,
    )
    assert status == "PASSED", detail


def test_gate_c_fails_empty_runtime(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    designs = tools._paths.designs_root
    designs.mkdir(parents=True)
    eic_asm = tools._paths.eic_root / "assembly"
    eic_asm.mkdir(parents=True)
    bp = _sample_blueprint()
    mf = _sample_manifest()
    (designs / "sales_dash_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json")), encoding="utf-8"
    )
    (eic_asm / "sales_dash_manifest.json").write_text(
        json.dumps(mf.model_dump(mode="json")), encoding="utf-8"
    )
    capsule = tmp_path / "services" / "sales_dash"
    capsule.mkdir(parents=True)
    (capsule / "assembly_runtime.json").write_text(
        json.dumps(
            {
                "service_name": "sales_dash",
                "blueprint_id": "sales_dash",
                "blueprint_version": "1.0.0",
                "target_module": "Dashboard_Standard",
                "scaffold_profile": "ops_dashboard",
                "composition_ids": [],
                "data_sources": [],
                "widget_count": 0,
            }
        ),
        encoding="utf-8",
    )
    status, detail = verify_assembly_contract_gate(
        tmp_path,
        "sales_dash",
        designs_root=designs,
        eic_root=tools._paths.eic_root,
    )
    assert status == "FAILED"
    assert "empty" in detail.lower() or "widget" in detail.lower()


def test_gate_c_fails_missing_manifest_when_config_driven(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    designs = tools._paths.designs_root
    designs.mkdir(parents=True)
    bp = _sample_blueprint()
    (designs / "sales_dash_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json")), encoding="utf-8"
    )
    status, detail = verify_assembly_contract_gate(
        tmp_path,
        "sales_dash",
        designs_root=designs,
        eic_root=tools._paths.eic_root,
    )
    assert status == "FAILED"
    assert "Manifest" in detail or "manifest" in detail.lower()


def test_deny_domain_write_file_config_driven(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    tools.config_driven_active = True
    with pytest.raises(ServiceError) as exc:
        tools.apply_actions(
            [
                {
                    "op": "write_file",
                    "path": "services/sales_dash/src/api/main.py",
                    "content": "print('nope')\n",
                }
            ],
            role=AgentRole.IMPLEMENTER,
            service_name="sales_dash",
        )
    assert exc.value.response.error_code == "EIC_CRITICAL_VIOLATION"


def test_deny_app_prefixed_domain_write_config_driven(tmp_path: Path) -> None:
    """LLM sometimes emits app/services/... (container cwd) — still deny."""
    tools = _tools(tmp_path)
    tools.config_driven_active = True
    with pytest.raises(ServiceError) as exc:
        tools.apply_actions(
            [
                {
                    "op": "write_file",
                    "path": "app/services/sales_dash/src/api/main.py",
                    "content": "print('nope')\n",
                }
            ],
            role=AgentRole.IMPLEMENTER,
            service_name="sales_dash",
        )
    assert exc.value.response.error_code == "EIC_CRITICAL_VIOLATION"


def test_deny_scaffold_eic_action_config_driven(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    tools.config_driven_active = True
    with pytest.raises(ServiceError) as exc:
        tools.apply_actions(
            [{"op": "scaffold", "service_name": "sales_dash"}],
            role=AgentRole.IMPLEMENTER,
            service_name="sales_dash",
        )
    assert exc.value.response.error_code == "EIC_CRITICAL_VIOLATION"


def test_allow_manifest_write_under_config_driven(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    tools.config_driven_active = True
    path = tools.apply_actions(
        [
            {
                "op": "write_file",
                "path": ".cursor/orchestration/eic/assembly/sales_dash_manifest.json",
                "content": json.dumps(_sample_manifest().model_dump(mode="json")),
            }
        ],
        role=AgentRole.IMPLEMENTER,
        service_name="sales_dash",
    )
    assert path
    assert "manifest" in path[0]


def test_ensure_blueprint_heals_ops_dashboard(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    tools._paths.designs_root.mkdir(parents=True)
    (tools._paths.designs_root / "sales_dash_design.json").write_text(
        json.dumps(
            {
                "service_name": "sales_dash",
                "assembly": {
                    "scaffold_profile": "ops_dashboard",
                    "recipe_packs": ["ops_dashboard"],
                },
            }
        ),
        encoding="utf-8",
    )
    from unittest.mock import patch

    from services.empery_intelligence_core.src.integration.assembly_profiles import (
        AssemblySelection,
    )

    fake = AssemblySelection(
        packs=("ops_dashboard",),
        scaffold_profile="ops_dashboard",
        extract_roots=(),
        must_read_paths=(),
        forbid_generic_crud=True,
    )
    with patch(
        "services.empery_intelligence_core.src.integration.recipe_catalog.resolve_assembly_selection",
        return_value=fake,
    ):
        out = tools.ensure_blueprint_json(
            "sales_dash",
            intent="ops dashboard metrics",
            require_config_driven=True,
        )
    assert out.endswith("sales_dash_blueprint.json")
    bp = json.loads(
        (tools._paths.designs_root / "sales_dash_blueprint.json").read_text(
            encoding="utf-8"
        )
    )
    assert bp["assembly_mode"] == "config_driven"
    design = json.loads(
        (tools._paths.designs_root / "sales_dash_design.json").read_text(
            encoding="utf-8"
        )
    )
    assert design["assembly"]["assembly_mode"] == "config_driven"


def test_persist_manifest_heals_from_blueprint(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    tools._paths.designs_root.mkdir(parents=True)
    bp = _sample_blueprint()
    (tools._paths.designs_root / "sales_dash_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json")), encoding="utf-8"
    )
    # No Manifest in Implementer prose — Mechanics derives from Blueprint.
    mf_path = tools.persist_assembly_manifest(
        "sales_dash", implementer_content="scaffold the dashboard please"
    )
    assert "manifest" in mf_path
    assert tools.last_assembly_meta.get("manifest_healed_from_blueprint") is True
    data = json.loads(
        (tools._paths.eic_root / "assembly" / "sales_dash_manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert data["composition"]
    assert any(c.get("component_id") == "metric_card" for c in data["composition"])


def test_canonicalize_ops_dashboard_metrics_summary() -> None:
    from core.integration.assembly_contracts import (
        canonicalize_blueprint_endpoints,
    )

    bp = default_ops_dashboard_blueprint(service_name="drift_dash")
    bp = bp.model_copy(
        update={
            "data_requirements": [
                DataRequirement(endpoint="/api/v1/metrics/summary", method="GET"),
                DataRequirement(
                    endpoint="/api/v1/metrics/series/{metric_id}", method="GET"
                ),
            ]
        }
    )
    out = canonicalize_blueprint_endpoints(bp)
    eps = [d.endpoint for d in out.data_requirements]
    assert eps == ["/api/v1/metrics"]


def test_persist_manifest_heals_metrics_summary_data_source(tmp_path: Path) -> None:
    """C7 failure mode: Blueprint allowlist /metrics, Manifest uses /metrics/summary."""
    tools = _tools(tmp_path)
    tools._paths.designs_root.mkdir(parents=True)
    bp = _sample_blueprint()
    (tools._paths.designs_root / "sales_dash_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json")), encoding="utf-8"
    )
    drifted = _sample_manifest().model_copy(
        update={
            "composition": [
                c.model_copy(update={"data_source": "/api/v1/metrics/summary"})
                for c in _sample_manifest().composition
            ]
        }
    )
    with pytest.raises(ValueError, match="metrics/summary"):
        validate_manifest_against_blueprint(drifted, bp)

    text = "```json\n" + json.dumps(drifted.model_dump(mode="json"), indent=2) + "\n```"
    mf_path = tools.persist_assembly_manifest(
        "sales_dash", implementer_content=text
    )
    assert "manifest" in mf_path
    assert tools.last_assembly_meta.get("manifest_data_source_healed") is True
    data = json.loads(
        (tools._paths.eic_root / "assembly" / "sales_dash_manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert all(c.get("data_source") == "/api/v1/metrics" for c in data["composition"])


def test_assembly_tool_names_from_result() -> None:
    from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
        _assembly_tool_names_from_result,
    )

    class _R:
        def __init__(self, raw: dict) -> None:
            self.raw = raw

    empty = _assembly_tool_names_from_result(_R({}))
    assert empty == []
    names = _assembly_tool_names_from_result(
        _R(
            {
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "function": {
                                        "name": "emit_blueprint",
                                        "arguments": "{}",
                                    }
                                },
                                {
                                    "function": {
                                        "name": "write_file",
                                        "arguments": "{}",
                                    }
                                },
                            ]
                        }
                    }
                ]
            }
        )
    )
    assert names == ["emit_blueprint"]


def test_openai_assembly_tools_and_materialize() -> None:
    from core.integration.assembly_contracts import (
        EMIT_BLUEPRINT_TOOL,
        EMIT_MANIFEST_TOOL,
        materialize_assembly_tool_calls,
        openai_assembly_tools,
        parse_blueprint_from_text,
        parse_manifest_from_text,
    )

    arch = openai_assembly_tools(role="architect")
    assert arch and arch[0]["function"]["name"] == EMIT_BLUEPRINT_TOOL
    impl = openai_assembly_tools(role="implementer")
    assert impl and impl[0]["function"]["name"] == EMIT_MANIFEST_TOOL
    assert openai_assembly_tools(role="verifier") == []

    bp = default_ops_dashboard_blueprint(service_name="tool_dash")
    text = materialize_assembly_tool_calls(
        [
            {
                "id": "1",
                "type": "function",
                "function": {
                    "name": EMIT_BLUEPRINT_TOOL,
                    "arguments": json.dumps({"blueprint": bp.model_dump(mode="json")}),
                },
            }
        ]
    )
    assert text and "blueprint" in text
    parsed = parse_blueprint_from_text(text, service_name="tool_dash")
    assert parsed is not None
    assert parsed.service_name == "tool_dash"

    mf = _sample_manifest("tool_dash")
    text_mf = materialize_assembly_tool_calls(
        [
            {
                "function": {
                    "name": EMIT_MANIFEST_TOOL,
                    "arguments": json.dumps({"manifest": mf.model_dump(mode="json")}),
                }
            }
        ]
    )
    assert text_mf
    parsed_mf = parse_manifest_from_text(text_mf)
    assert parsed_mf is not None
    assert parsed_mf.composition[0].component_id == "metric_card"


def test_persist_manifest_rebinds_foreign_composition_ids(tmp_path: Path) -> None:
    """p19 failure mode: Blueprint jtbd_* tree, Manifest still cites trend_chart_area."""
    tools = _tools(tmp_path)
    tools._paths.designs_root.mkdir(parents=True)
    bp = BlueprintContract(
        version="1.0.0",
        service_name="asm_c7",
        scaffold_profile="ops_dashboard",
        assembly_mode="config_driven",
        target_module=TargetModule.DASHBOARD_STANDARD,
        target_component_tree=[
            TreeNode(
                id="jtbd_tab_root",
                type=ComponentType.LAYOUT,
                children=["jtbd_metrics_grid", "jtbd_job_list"],
            ),
            TreeNode(
                id="jtbd_metrics_grid",
                type=ComponentType.WIDGET,
                widget_type=WidgetType.CARD,
                props={"title": "JTBD Performance"},
            ),
            TreeNode(
                id="jtbd_job_list",
                type=ComponentType.WIDGET,
                widget_type=WidgetType.TABLE,
                props={"title": "Active Jobs"},
            ),
        ],
        data_requirements=[
            DataRequirement(endpoint="/api/v1/metrics", method="GET"),
        ],
    )
    (tools._paths.designs_root / "asm_c7_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json")), encoding="utf-8"
    )
    drifted = AssemblyManifest(
        blueprint_id="asm_c7",
        blueprint_version="1.0.0",
        target_module=TargetModule.DASHBOARD_STANDARD,
        composition=[
            CompositionItem(
                component_id="trend_chart_area",
                component="Chart",
                widget_type=WidgetType.CHART,
                data_source="/api/v1/metrics",
                mapping=[
                    PropMapping(
                        prop_name="chart_type",
                        source_type="static",
                        value="area_line",
                    ),
                ],
            ),
        ],
    )
    with pytest.raises(ValueError, match="trend_chart_area"):
        validate_manifest_against_blueprint(drifted, bp)

    text = "```json\n" + json.dumps(drifted.model_dump(mode="json"), indent=2) + "\n```"
    mf_path = tools.persist_assembly_manifest("asm_c7", implementer_content=text)
    assert "manifest" in mf_path
    assert tools.last_assembly_meta.get("manifest_composition_rebound") is True
    data = json.loads(
        (tools._paths.eic_root / "assembly" / "asm_c7_manifest.json").read_text(
            encoding="utf-8"
        )
    )
    ids = {c["component_id"] for c in data["composition"]}
    assert "trend_chart_area" not in ids
    assert ids == {"jtbd_metrics_grid", "jtbd_job_list"}


def test_persist_manifest_and_gate_via_workspace(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    tools._paths.designs_root.mkdir(parents=True)
    bp = _sample_blueprint()
    (tools._paths.designs_root / "sales_dash_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json")), encoding="utf-8"
    )
    text = (
        "```json\n"
        + json.dumps(_sample_manifest().model_dump(mode="json"), indent=2)
        + "\n```"
    )
    mf_path = tools.persist_assembly_manifest(
        "sales_dash", implementer_content=text
    )
    assert "manifest" in mf_path
    stamp_assembly_runtime(tmp_path, blueprint=bp, manifest=_sample_manifest())
    from core.assembly.assembler import (
        verify_assembly_contract_gate,
    )

    status, detail = verify_assembly_contract_gate(
        tmp_path,
        "sales_dash",
        designs_root=tools._paths.designs_root,
        eic_root=tools._paths.eic_root,
    )
    assert status == "PASSED", detail


def test_schema_registry_files_exist() -> None:
    root = (
        Path(__file__).resolve().parents[3]
        / ".cursor"
        / "orchestration"
        / "assembly"
    )
    # workspace root from services/empery_intelligence_core/tests → parents[2] is services?
    # __file__ = .../services/empery_intelligence_core/tests/test_*.py
    # parents[0]=tests, [1]=empery_intelligence_core, [2]=services, [3]=repo root
    assert (root / "registry.yaml").is_file()
    assert (root / "schemas" / "blueprint.schema.json").is_file()
    assert (root / "schemas" / "manifest.schema.json").is_file()
    assert (root / "schemas" / "modules" / "dashboard.json").is_file()
    assert (root / "schemas" / "modules" / "card.json").is_file()
    assert (root / "schemas" / "modules" / "chart.json").is_file()
    assert (root / "schemas" / "modules" / "companion.json").is_file()
    assert (root / "schemas" / "modules" / "chat_panel.json").is_file()
    assert (root / "schemas" / "modules" / "composer.json").is_file()
    assert (root / "schemas" / "modules" / "studio.json").is_file()
    assert (root / "schemas" / "modules" / "job_form.json").is_file()
    assert (root / "schemas" / "modules" / "job_list.json").is_file()
    reg = (root / "registry.yaml").read_text(encoding="utf-8")
    assert "companion_chat:" in reg
    assert "studio_job:" in reg
    assert "assembly_mode: config_driven" in reg


def test_companion_and_studio_heal_blueprints() -> None:
    from core.integration.assembly_contracts import (
        default_companion_chat_blueprint,
        default_studio_job_blueprint,
        manifest_from_blueprint,
        validate_manifest_against_blueprint,
    )

    bp = default_companion_chat_blueprint(service_name="chat_buddy")
    mf = manifest_from_blueprint(bp)
    validate_manifest_against_blueprint(mf, bp)
    assert {c.component for c in mf.composition} == {"ChatPanel", "Composer"}

    bp2 = default_studio_job_blueprint(service_name="job_studio")
    mf2 = manifest_from_blueprint(bp2)
    validate_manifest_against_blueprint(mf2, bp2)
    assert {c.component for c in mf2.composition} == {"JobForm", "JobList"}
