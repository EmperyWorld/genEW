"""Phase B — Assembler CLI inject + golden lib slot wiring."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.assembly.assembler import (
    _assemble_js,
    invoke_assembler_cli,
    run_assembler_v1,
    stamp_assembly_runtime,
)
from core.integration.assembly_contracts import (
    AssemblyManifest,
    CompositionItem,
    PropMapping,
    TargetModule,
    WidgetType,
    default_companion_chat_blueprint,
    default_ops_dashboard_blueprint,
    default_studio_job_blueprint,
    manifest_from_blueprint,
)
from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
    _companion_mount_tsx,
    _ops_dashboard_mount_tsx,
    _studio_mount_tsx,
)


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
                        prop_name="title",
                        source_type="static",
                        value="Total Revenue",
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


def test_assembler_cli_file_exists() -> None:
    assert _assemble_js().is_file()


def test_ops_dashboard_mount_has_assembler_slot() -> None:
    src = _ops_dashboard_mount_tsx("sales_dash", "SalesDash", "Sales Dash", 8025)
    assert 'data-assembler-slot="widgets"' in src
    assert "@/assembly_lib" in src
    assert "BaseCard" in src


def test_companion_and_studio_mounts_have_assembler_slot() -> None:
    companion = _companion_mount_tsx("chat_buddy", "ChatBuddy", "Chat Buddy", 8091)
    assert 'data-assembler-slot="widgets"' in companion
    assert "BaseChatPanel" in companion
    assert "BaseComposer" in companion
    assert "chatMessages" in companion
    assert "/api/v1/messages" in companion

    studio = _studio_mount_tsx("job_studio", "JobStudio", "Job Studio", 8092)
    assert 'data-assembler-slot="widgets"' in studio
    assert "BaseJobForm" in studio
    assert "BaseJobList" in studio
    assert "studioJobs" in studio
    assert "/api/v1/jobs" in studio


def test_cli_injects_companion_manifest(tmp_path: Path) -> None:
    if not __import__("shutil").which("node"):
        pytest.skip("node required for Assembler CLI")
    mount = tmp_path / "chat_buddy.tsx"
    mount.write_text(
        _companion_mount_tsx("chat_buddy", "ChatBuddy", "Chat Buddy", 8091),
        encoding="utf-8",
    )
    bp = default_companion_chat_blueprint(service_name="chat_buddy")
    mf = manifest_from_blueprint(bp)
    # Override static chrome labels so inject is observable.
    mf = mf.model_copy(
        update={
            "composition": [
                CompositionItem(
                    component_id="message_panel",
                    component="ChatPanel",
                    widget_type=WidgetType.MESSAGE_LIST,
                    data_source="/api/v1/messages",
                    mapping=[
                        PropMapping(
                            prop_name="title",
                            source_type="static",
                            value="Live Transcript",
                        ),
                        PropMapping(
                            prop_name="empty_hint",
                            source_type="static",
                            value="Start chatting",
                        ),
                        PropMapping(
                            prop_name="messages",
                            source_type="dynamic",
                            data_path="messages",
                        ),
                    ],
                ),
                CompositionItem(
                    component_id="composer_box",
                    component="Composer",
                    widget_type=WidgetType.COMPOSER,
                    data_source="/api/v1/messages",
                    mapping=[
                        PropMapping(
                            prop_name="title",
                            source_type="static",
                            value="Message Box",
                        ),
                        PropMapping(
                            prop_name="placeholder",
                            source_type="static",
                            value="Type here…",
                        ),
                        PropMapping(
                            prop_name="send_label",
                            source_type="static",
                            value="Go",
                        ),
                    ],
                ),
            ]
        }
    )
    mf_path = tmp_path / "manifest.json"
    mf_path.write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2), encoding="utf-8"
    )
    out = tmp_path / "out.tsx"
    result = invoke_assembler_cli(
        manifest_path=mf_path, target_path=mount, out_path=out
    )
    assert result["ok"] is True, result
    assert result["widget_count"] == 2
    body = out.read_text(encoding="utf-8")
    assert "Live Transcript" in body
    assert "Start chatting" in body
    assert "Type here…" in body
    assert "BaseChatPanel" in body
    assert "BaseComposer" in body
    assert "chatMessages()" in body
    assert 'key="message_panel"' in body


def test_cli_injects_studio_manifest(tmp_path: Path) -> None:
    if not __import__("shutil").which("node"):
        pytest.skip("node required for Assembler CLI")
    mount = tmp_path / "job_studio.tsx"
    mount.write_text(
        _studio_mount_tsx("job_studio", "JobStudio", "Job Studio", 8092),
        encoding="utf-8",
    )
    bp = default_studio_job_blueprint(service_name="job_studio")
    mf = manifest_from_blueprint(bp)
    mf = mf.model_copy(
        update={
            "composition": [
                CompositionItem(
                    component_id="prompt_form",
                    component="JobForm",
                    widget_type=WidgetType.JOB_FORM,
                    data_source="/api/v1/jobs",
                    mapping=[
                        PropMapping(
                            prop_name="title",
                            source_type="static",
                            value="Prompt Pad",
                        ),
                        PropMapping(
                            prop_name="placeholder",
                            source_type="static",
                            value="Make art…",
                        ),
                        PropMapping(
                            prop_name="button_label",
                            source_type="static",
                            value="Run",
                        ),
                    ],
                ),
                CompositionItem(
                    component_id="jobs_panel",
                    component="JobList",
                    widget_type=WidgetType.JOB_LIST,
                    data_source="/api/v1/jobs",
                    mapping=[
                        PropMapping(
                            prop_name="title",
                            source_type="static",
                            value="Queue",
                        ),
                        PropMapping(
                            prop_name="empty_hint",
                            source_type="static",
                            value="Queue empty",
                        ),
                        PropMapping(
                            prop_name="jobs",
                            source_type="dynamic",
                            data_path="jobs",
                        ),
                    ],
                ),
            ]
        }
    )
    mf_path = tmp_path / "manifest.json"
    mf_path.write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2), encoding="utf-8"
    )
    out = tmp_path / "out.tsx"
    result = invoke_assembler_cli(
        manifest_path=mf_path, target_path=mount, out_path=out
    )
    assert result["ok"] is True, result
    body = out.read_text(encoding="utf-8")
    assert "Prompt Pad" in body
    assert "Make art…" in body
    assert "Queue empty" in body
    assert "BaseJobForm" in body
    assert "BaseJobList" in body
    assert "studioJobs()" in body
    assert 'key="jobs_panel"' in body


def test_cli_injects_manifest_titles(tmp_path: Path) -> None:
    if not __import__("shutil").which("node"):
        pytest.skip("node required for Assembler CLI")
    mount = tmp_path / "sales_dash.tsx"
    mount.write_text(
        _ops_dashboard_mount_tsx("sales_dash", "SalesDash", "Sales Dash", 8025),
        encoding="utf-8",
    )
    mf = _sample_manifest()
    mf_path = tmp_path / "manifest.json"
    mf_path.write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2), encoding="utf-8"
    )
    out = tmp_path / "out.tsx"
    result = invoke_assembler_cli(
        manifest_path=mf_path, target_path=mount, out_path=out
    )
    assert result["ok"] is True
    assert result["widget_count"] == 2
    body = out.read_text(encoding="utf-8")
    assert "Total Revenue" in body
    assert "Sales History" in body
    assert "BaseCard" in body
    assert "BaseChart" in body
    assert "metricField(" in body
    assert "metricSeries(" in body
    assert 'data-assembly-data-source="/api/v1/metrics"' in body


def test_cli_prunes_unused_chart_when_cards_only(tmp_path: Path) -> None:
    """Card-only Manifest must not leave BaseChart/metricSeries (TS6133)."""
    if not __import__("shutil").which("node"):
        pytest.skip("node required for Assembler CLI")
    mount = tmp_path / "cards_only.tsx"
    mount.write_text(
        _ops_dashboard_mount_tsx("cards_only", "CardsOnly", "Cards Only", 8025),
        encoding="utf-8",
    )
    mf = AssemblyManifest(
        blueprint_id="cards_only",
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
                        value="Only Card",
                    ),
                    PropMapping(
                        prop_name="value",
                        source_type="dynamic",
                        data_path="value",
                    ),
                ],
            ),
        ],
    )
    mf_path = tmp_path / "manifest.json"
    mf_path.write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2), encoding="utf-8"
    )
    out = tmp_path / "out.tsx"
    result = invoke_assembler_cli(
        manifest_path=mf_path, target_path=mount, out_path=out
    )
    assert result["ok"] is True, result
    body = out.read_text(encoding="utf-8")
    assert "BaseCard" in body
    assert "Only Card" in body
    assert "BaseChart" not in body
    assert "metricSeries" not in body
    assert "metricField(" in body


def test_run_assembler_v1_stamp_and_inject(tmp_path: Path) -> None:
    if not __import__("shutil").which("node"):
        pytest.skip("node required for Assembler CLI")
    service = "sales_dash"
    mounts = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
    )
    mounts.mkdir(parents=True)
    (mounts / f"{service}.tsx").write_text(
        _ops_dashboard_mount_tsx(service, "SalesDash", "Sales Dash", 8025),
        encoding="utf-8",
    )
    # Minimal assembly_lib so imports would resolve if tsc ran (tsc skipped).
    lib = tmp_path / "apps" / "empery_desktop" / "src" / "assembly_lib"
    lib.mkdir(parents=True)
    (lib / "index.ts").write_text(
        "export const BaseCard = () => null;\n"
        "export const BaseChart = () => null;\n"
        "export const BaseLayout = () => null;\n",
        encoding="utf-8",
    )
    mf = _sample_manifest(service)
    mf_path = tmp_path / "manifest.json"
    mf_path.write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2), encoding="utf-8"
    )
    bp = default_ops_dashboard_blueprint(service_name=service)
    result = run_assembler_v1(
        tmp_path,
        blueprint=bp,
        manifest=mf,
        manifest_path=mf_path,
        run_tsc=False,
    )
    assert result["assembler_version"] == "v1"
    assert result["widget_count"] == 2
    stamp = tmp_path / "services" / service / "assembly_runtime.json"
    assert stamp.is_file()
    body = (mounts / f"{service}.tsx").read_text(encoding="utf-8")
    assert "Total Revenue" in body
    assert "metricField(" in body
    assert "metricSeries(" in body


def test_freeze_list_deny_llm_writes_loaded(tmp_path: Path) -> None:
    from services.empery_intelligence_core.src.integration.workspace_tools import (
        _load_config_driven_deny_prefixes,
    )

    cursor = tmp_path / ".cursor" / "orchestration" / "assembly"
    cursor.mkdir(parents=True)
    (cursor / "freeze_list.yaml").write_text(
        "deny_llm_writes:\n  - custom_deny_prefix/\n"
        "scaffold_owned_immutable:\n  - apps/custom_lib/\n",
        encoding="utf-8",
    )
    prefixes = _load_config_driven_deny_prefixes(tmp_path)
    assert "custom_deny_prefix/" in prefixes
    assert "apps/custom_lib/" in prefixes
    # Repo freeze_list also loaded when present under parents[4]
    assert any(p.startswith("services/") for p in prefixes)


def test_golden_lib_files_exist() -> None:
    root = Path(__file__).resolve().parents[3]
    for app in ("empery_desktop", "empery_control_center"):
        lib = root / "apps" / app / "src" / "assembly_lib"
        assert (lib / "BaseCard.tsx").is_file()
        assert (lib / "BaseChart.tsx").is_file()
        assert (lib / "BaseLayout.tsx").is_file()
        assert (lib / "BaseMetricTile.tsx").is_file()
        assert (lib / "BaseChatPanel.tsx").is_file()
        assert (lib / "BaseComposer.tsx").is_file()
        assert (lib / "BaseJobForm.tsx").is_file()
        assert (lib / "BaseJobList.tsx").is_file()
        index = (lib / "index.ts").read_text(encoding="utf-8")
        assert "BaseChatPanel" in index
        assert "BaseJobList" in index
    assert (
        root / ".cursor" / "orchestration" / "assembly" / "freeze_list.yaml"
    ).is_file()
