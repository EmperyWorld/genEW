"""ECC UI scaffold + verify_service_ui gates."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from core.logging import configure_logging
from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
    HeadlessAgentLoop,
    authoritative_verify_summary,
)
from services.empery_intelligence_core.src.core.reflexes.models import (
    AgentRole,
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopCheckpoint,
    LoopStage,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.service_scaffold import (
    ServiceScaffoldAction,
)
from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
    ServiceUiScaffoldAction,
    read_ui_required,
    verify_service_ui,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)
from services.empery_intelligence_core.tests.conftest import (
    make_config,
    make_container,
)
from tests.fakes.fake_nervas_stub import FakeNervasStub


def test_allowlist_accepts_ecc_feature_write(tmp_path: Path) -> None:
    cfg = make_config(tmp_path, engine_allow_service_writes=True)
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("ui_allow"))
    written = tools.apply_actions(
        [
            {
                "op": "write_file",
                "path": (
                    "apps/empery_control_center/src/features/demo_ui/DemoPage.tsx"
                ),
                "content": "export function DemoPage() { return null; }\n",
            }
        ],
        role=AgentRole.IMPLEMENTER,
        service_name="demo_ui",
    )
    assert written
    assert (
        tmp_path
        / "apps/empery_control_center/src/features/demo_ui/DemoPage.tsx"
    ).is_file()


def test_scaffold_writes_ui_and_bff(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("scaffold_ui"))
    action.scaffold("demo_notebook", features=["health"], domain_hint="notebook")
    assert (
        tmp_path
        / "apps/empery_control_center/src/features/demo-notebook/DemoNotebookPage.tsx"
    ).is_file()
    assert (
        tmp_path / "apps/empery_control_center/src/api/demoNotebookClient.ts"
    ).is_file()
    assert (
        tmp_path
        / "services/empery_control_center_api/src/api/routes_demo_notebook.py"
    ).is_file()
    paths_ts = (
        tmp_path / "apps/empery_control_center/src/routes/paths.ts"
    ).read_text(encoding="utf-8")
    assert "opsDemoNotebook" in paths_ts
    nav = (
        tmp_path
        / "apps/empery_control_center/src/features/shell/NavPrimary.tsx"
    ).read_text(encoding="utf-8")
    assert "eic:ui:demo_notebook" in nav
    assert "PATHS.opsDemoNotebook" in nav
    design = json.loads(
        (
            tmp_path
            / ".cursor/orchestration/designs/demo_notebook_design.json"
        ).read_text(encoding="utf-8")
    )
    assert design["ui"]["required"] is True
    status, detail = verify_service_ui(tmp_path, "demo_notebook")
    assert status == "PASSED", detail


def test_verify_service_ui_fails_without_feature(tmp_path: Path) -> None:
    (tmp_path / "services" / "orphan_svc").mkdir(parents=True)
    status, detail = verify_service_ui(tmp_path, "orphan_svc")
    assert status == "FAILED"
    assert "UI gate missing" in detail


def test_verify_service_ui_skip_when_opted_out(tmp_path: Path) -> None:
    designs = tmp_path / ".cursor" / "orchestration" / "designs"
    designs.mkdir(parents=True)
    (designs / "probe_svc_design.json").write_text(
        json.dumps(
            {
                "service_name": "probe_svc",
                "ui": {
                    "required": False,
                    "skip_reason": "reflex probe — no operator workflow",
                },
            }
        )
        + "\n",
        encoding="utf-8",
    )
    status, detail = verify_service_ui(tmp_path, "probe_svc")
    assert status == "SKIPPED"
    assert "no operator workflow" in detail


def test_read_ui_required_prefers_manifest_over_design(tmp_path: Path) -> None:
    designs = tmp_path / ".cursor" / "orchestration" / "designs"
    designs.mkdir(parents=True)
    (designs / "pref_svc_design.json").write_text(
        json.dumps(
            {
                "service_name": "pref_svc",
                "ui": {"required": True, "route": "/ops/pref-svc"},
            }
        )
        + "\n",
        encoding="utf-8",
    )
    svc = tmp_path / "services" / "pref_svc"
    svc.mkdir(parents=True)
    (svc / "manifest.json").write_text(
        json.dumps(
            {
                "name": "pref_svc",
                "version": "0.1.0",
                "entry_point": "src/api/main.py",
                "features": [],
                "ui": {
                    "required": False,
                    "skip_reason": "manifest wins — platform peer",
                },
            }
        )
        + "\n",
        encoding="utf-8",
    )
    required, reason = read_ui_required(tmp_path, "pref_svc")
    assert required is False
    assert "manifest wins" in (reason or "")
    status, detail = verify_service_ui(tmp_path, "pref_svc")
    assert status == "SKIPPED"
    assert "manifest wins" in detail


def test_scaffold_writes_ui_into_manifest(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("scaffold_manifest_ui"))
    action.scaffold("manifest_ui_buddy", features=["health"], domain_hint="companion chat")
    man = json.loads(
        (tmp_path / "services/manifest_ui_buddy/manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert man["ui"]["required"] is True
    assert man["ui"]["route"] == "/ops/manifest-ui-buddy"
    assert man["ui"]["feature_key"] == "manifest_ui_buddy"


def test_ui_fail_blocks_anatomy_force_passed() -> None:
    """Regression: anatomy/live must not override UI FAILED."""
    body, summary = authoritative_verify_summary(
        "FAILED",
        anatomy_detail="Anatomy OK under services/x/",
        ui_detail="UI gate missing:\n- U1 feature page",
        live_detail="deploy_agent health: ok",
        llm_narrative="PASSED",
    )
    assert summary == "verify_status=FAILED"
    assert "## Deterministic UI" in body
    assert "UI gate missing" in body


def test_agent_loop_ui_fail_authoritative(tmp_path: Path) -> None:
    """Verifier: anatomy OK + UI missing → FAILED (not force PASSED)."""
    container, _bus, cfg = make_container(
        tmp_path,
        engine_allow_service_writes=True,
        auto_scaffold_on_implement=False,
        auto_deploy_on_implement=False,
        require_deploy_agent=False,
        max_fix_loops=0,
    )
    svc = tmp_path / "services" / "ui_missing_svc"
    for part in ("src/api", "src/core", "src/data", "src/integration", "tests"):
        (svc / part).mkdir(parents=True)
    (svc / "manifest.json").write_text(
        '{"name":"ui_missing_svc","version":"0.1.0","features":[],'
        '"entry_point":"src/api/main.py","dependencies":[],'
        '"publishes":[],"subscribes":[]}\n',
        encoding="utf-8",
    )
    (svc / "config.py").write_text("# cfg\n", encoding="utf-8")
    (svc / "src/api/main.py").write_text("# main\n", encoding="utf-8")

    container.register(
        "nervas_provider",
        lambda _c: FakeNervasStub(
            scripted=[
                '{"eic_actions":[],"verify_status":"PASSED"}',
            ]
        ),
    )
    loop = HeadlessAgentLoop(
        container.resolve("intention_store"),
        container.resolve("prompt_templates"),
        container.resolve("nervas_provider"),
        container.resolve("workspace_tools"),
        container.resolve("eic_memory_hooks"),
        container.resolve("eic_ecc_bridge"),
        container.resolve("event_bus"),
        container.resolve("config"),
        container.resolve("logger"),
    )
    store = container.resolve("intention_store")

    async def _run() -> None:
        now = datetime.now(timezone.utc)
        intention = Intention(
            id=uuid4(),
            kind=IntentionKind.VERIFY,
            status=IntentionStatus.PENDING,
            intent="create_service ui_missing_svc verify",
            service_name="ui_missing_svc",
            checkpoint=LoopCheckpoint(stage=LoopStage.QUEUED, updated_at=now),
            created_at=now,
            updated_at=now,
        )
        await store.create(intention)
        claimed = await store.claim_next("test")
        assert claimed is not None
        result = await loop.run(claimed)
        assert result.checkpoint.verify_status == "FAILED"
        assert result.status == IntentionStatus.FAILED

    asyncio.run(_run())


def test_ui_scaffold_idempotent(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    ui = ServiceUiScaffoldAction(tmp_path)
    ui.scaffold_ui("note_svc", port=8099, domain_hint="note")
    action = ServiceScaffoldAction(tmp_path, configure_logging("idem"))
    again = action.scaffold_ecc_ui("note_svc", port=8099)
    assert again.get("already") is True
    nav = (
        tmp_path
        / "apps/empery_control_center/src/features/shell/NavPrimary.tsx"
    ).read_text(encoding="utf-8")
    assert nav.count("eic:ui:note_svc") == 1


def test_design_ui_block_peer_opt_out_has_no_crud_screens() -> None:
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        design_ui_block,
    )

    for profile, screens in (
        ("music_forge", ["generate", "job_poll", "audio"]),
        ("image_studio", ["generate", "job_poll"]),
        ("video_studio", ["generate", "job_poll", "videos"]),
        ("site_studio", ["preview"]),
    ):
        block = design_ui_block(
            f"peer_{profile}",
            required=False,
            skip_reason="Backend peer API only",
            ui_profile=profile,
        )
        ui = block["ui"]
        assert ui["required"] is False
        assert ui["screens"] == screens
        assert "item_list" not in ui["screens"]
        assert "item_create" not in ui["screens"]
        assert ui["route"] is None
        assert ui["nav_label_key"] is None
        assert ui["bff_prefix"] is None
        assert ui["skip_reason"]
        assert ui["profile"] == profile
