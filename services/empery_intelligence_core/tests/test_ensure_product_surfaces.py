"""ensure_product_surfaces repairs desktop on re-scaffold."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

from core.logging import configure_logging
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.service_scaffold import (
    ServiceScaffoldAction,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)
from services.empery_intelligence_core.tests.conftest import make_config


def _tools(tmp_path: Path) -> WorkspaceToolAdapter:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    cfg = make_config(tmp_path, engine_allow_service_writes=True)
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    return WorkspaceToolAdapter(paths, cfg, configure_logging("ensure_surfaces"))


def test_already_scaffolded_calls_desktop_ensure(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    scaffold = ServiceScaffoldAction(tmp_path, configure_logging("pre"))
    # Anatomy only — strip desktop so ensure must repair.
    scaffold.scaffold("partial_svc", features=["health"])
    mount = tmp_path / "apps/empery_desktop/src/shell/mounts/partial_svc.tsx"
    catalog = (
        tmp_path
        / ".cursor/orchestration/eic/desktop_catalog/partial_svc.json"
    )
    if mount.is_file():
        mount.unlink()
    if catalog.is_file():
        catalog.unlink()

    assert tools._scaffold.already_scaffolded("partial_svc")
    out = tools.scaffold_service("partial_svc")
    assert out.get("already_present") is True
    assert mount.is_file(), "re-scaffold must restore D1 mount"
    assert catalog.is_file(), "re-scaffold must restore D3 catalog"
    verify = out.get("desktop_verify", {})
    assert verify.get("status") == "PASSED"


def test_ensure_product_surfaces_invokes_ui_and_desktop(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    tools._scaffold.scaffold_ecc_ui = MagicMock(
        return_value={"written": ["ui.tsx"], "skipped": False}
    )
    tools._scaffold.scaffold_desktop_host = MagicMock(
        return_value={"written": ["mount.tsx"], "skipped": False}
    )
    tools.verify_service_desktop = MagicMock(return_value=("PASSED", "ok"))

    mock_desk = MagicMock(return_value={"ok": True})
    mock_ecc = MagicMock(return_value={"ok": True})
    with (
        patch(
            "services.empery_intelligence_core.src.integration.service_scaffold_desktop.refresh_desktop_ui",
            mock_desk,
        ),
        patch(
            "services.empery_intelligence_core.src.integration.service_scaffold_desktop.refresh_ecc_ui",
            mock_ecc,
        ),
    ):
        result = tools.ensure_product_surfaces("mock_svc")
    tools._scaffold.scaffold_ecc_ui.assert_called_once()
    ui_call = tools._scaffold.scaffold_ecc_ui.call_args
    assert ui_call.args[0] == "mock_svc"
    assert "ui_profile" in ui_call.kwargs
    assert "force" in ui_call.kwargs
    tools._scaffold.scaffold_desktop_host.assert_called_once()
    desk_call = tools._scaffold.scaffold_desktop_host.call_args
    assert desk_call.args[0] == "mock_svc"
    assert "ui_profile" in desk_call.kwargs
    assert "force" in desk_call.kwargs
    tools.verify_service_desktop.assert_called_once_with("mock_svc")
    assert result["desktop_verify"]["status"] == "PASSED"
    assert "ui.tsx" in result["written"]
    assert "mount.tsx" in result["written"]


def test_ensure_product_surfaces_companion_refresh_action_up(
    tmp_path: Path,
) -> None:
    """Companion scaffold → ensure_product_surfaces → verify PASSED + refresh up."""
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "services" / "companion_demo").mkdir(parents=True)
    cfg = make_config(
        tmp_path,
        engine_allow_service_writes=True,
        deploy_agent_url="http://deploy:8010",
        require_deploy_agent=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("companion_refresh"))

    selection = MagicMock()
    selection.scaffold_profile = "companion_chat"

    mock_refresh = MagicMock(return_value={"ok": True})
    mock_ecc_refresh = MagicMock(return_value={"ok": True})
    with (
        patch(
            "services.empery_intelligence_core.src.integration.recipe_catalog.resolve_assembly_selection",
            return_value=selection,
        ),
        patch(
            "services.empery_intelligence_core.src.integration.service_scaffold_desktop.refresh_desktop_ui",
            mock_refresh,
        ),
        patch(
            "services.empery_intelligence_core.src.integration.service_scaffold_desktop.refresh_ecc_ui",
            mock_ecc_refresh,
        ),
    ):
        result = tools.ensure_product_surfaces("companion_demo")

    verify = result.get("desktop_verify", {})
    assert verify.get("status") == "PASSED", verify.get("detail")
    assert result.get("desktop_refresh", {}).get("ok") is True
    assert result.get("ecc_ui_refresh", {}).get("ok") is True
    mock_refresh.assert_called_once()
    mock_ecc_refresh.assert_called_once()
    assert mock_refresh.call_args.kwargs.get("required") is True
    assert mock_refresh.call_args.kwargs.get("deploy_agent_url") == "http://deploy:8010"
    assert result.get("ok") is True


def test_ensure_product_surfaces_force_refresh_when_already(
    tmp_path: Path,
) -> None:
    """Genesis already wrote mounts → force_ui_refresh still bakes Desktop UI."""
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "services" / "already_svc").mkdir(parents=True)
    cfg = make_config(
        tmp_path,
        engine_allow_service_writes=True,
        deploy_agent_url="http://deploy:8010",
        require_deploy_agent=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("force_refresh"))

    tools._scaffold.scaffold_ecc_ui = MagicMock(
        return_value={"written": [], "skipped": False, "already": True}
    )
    tools._scaffold.scaffold_desktop_host = MagicMock(
        return_value={"written": [], "skipped": False, "already": True}
    )
    tools.verify_service_desktop = MagicMock(return_value=("PASSED", "ok"))
    mock_desk = MagicMock(return_value={"ok": True})
    mock_ecc = MagicMock(return_value={"ok": True})
    with (
        patch(
            "services.empery_intelligence_core.src.integration.service_scaffold_desktop.refresh_desktop_ui",
            mock_desk,
        ),
        patch(
            "services.empery_intelligence_core.src.integration.service_scaffold_desktop.refresh_ecc_ui",
            mock_ecc,
        ),
    ):
        result = tools.ensure_product_surfaces(
            "already_svc",
            force_ui_refresh=True,
        )
    assert result.get("ok") is True
    mock_desk.assert_called_once()
    mock_ecc.assert_called_once()


def test_ensure_product_surfaces_bake_ui_false_skips_refresh(
    tmp_path: Path,
) -> None:
    """bake_ui=False writes surfaces but does not call deploy-agent rebuild."""
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "services" / "defer_bake_svc").mkdir(parents=True)
    cfg = make_config(
        tmp_path,
        engine_allow_service_writes=True,
        deploy_agent_url="http://deploy:8010",
        require_deploy_agent=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("defer_bake"))
    tools._scaffold.scaffold_ecc_ui = MagicMock(
        return_value={"written": ["ui.tsx"], "skipped": False}
    )
    tools._scaffold.scaffold_desktop_host = MagicMock(
        return_value={"written": ["mount.tsx"], "skipped": False}
    )
    tools.verify_service_desktop = MagicMock(return_value=("PASSED", "ok"))
    mock_desk = MagicMock(return_value={"ok": True})
    mock_ecc = MagicMock(return_value={"ok": True})
    with (
        patch(
            "services.empery_intelligence_core.src.integration.service_scaffold_desktop.refresh_desktop_ui",
            mock_desk,
        ),
        patch(
            "services.empery_intelligence_core.src.integration.service_scaffold_desktop.refresh_ecc_ui",
            mock_ecc,
        ),
    ):
        result = tools.ensure_product_surfaces(
            "defer_bake_svc",
            force_ui_refresh=True,
            bake_ui=False,
        )
    assert result.get("ok") is True
    mock_desk.assert_not_called()
    mock_ecc.assert_not_called()


def test_evolve_scaffold_forces_refresh_after_mount_write(tmp_path: Path) -> None:
    """Evolve that writes a mount must bake Desktop UI once at end of turn."""
    from services.empery_intelligence_core.src.core.reflexes.models import AgentRole
    from services.empery_intelligence_core.src.integration.service_scaffold import (
        ServiceScaffoldAction,
    )

    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    cfg = make_config(
        tmp_path,
        engine_allow_service_writes=True,
        deploy_agent_url="http://deploy:8010",
        require_deploy_agent=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("evolve_refresh"))
    ServiceScaffoldAction(tmp_path, configure_logging("pre")).scaffold(
        "evolve_ui_svc", features=["health"]
    )
    mount = tmp_path / "apps/empery_desktop/src/shell/mounts/evolve_ui_svc.tsx"
    assert mount.is_file()

    force_calls: list[bool] = []
    bake_calls: list[bool] = []

    def _track_ensure(  # noqa: ANN002
        *_a, force_ui_refresh: bool = False, bake_ui: bool = True, **_k
    ):
        force_calls.append(bool(force_ui_refresh))
        bake_calls.append(bool(bake_ui))
        return {
            "ok": True,
            "written": [],
            "ui": {},
            "desktop": {},
            "desktop_verify": {"status": "PASSED", "detail": "ok"},
        }

    tools.ensure_product_surfaces = MagicMock(side_effect=_track_ensure)  # type: ignore[method-assign]
    tools.extract_atoms_for_intention = MagicMock(  # type: ignore[method-assign]
        return_value=[
            "apps/empery_desktop/src/shell/mounts/evolve_ui_svc.tsx",
        ]
    )
    tools._scaffold.already_scaffolded = MagicMock(return_value=True)

    written = tools.maybe_scaffold_for_intention(
        intent="Добавить JTBD вкладку и улучшить UI",
        service_name="evolve_ui_svc",
        role=AgentRole.IMPLEMENTER,
        written_paths=[],
        kind="evolve",
        skip_mechanical_extract=False,
    )
    assert "apps/empery_desktop/src/shell/mounts/evolve_ui_svc.tsx" in written
    assert any(force_calls), "expected at least one force_ui_refresh=True"
    assert force_calls[-1] is True
    assert bake_calls[-1] is True, "end-of-turn must bake UI"
    assert bake_calls.count(True) == 1, "exactly one Vite bake per implement turn"
    assert False in bake_calls, "mid-turn ensure must defer bake"


def test_resolve_ui_profile_prefers_manifest_over_generic_name(
    tmp_path: Path,
) -> None:
    tools = _tools(tmp_path)
    svc = tmp_path / "services" / "p4_golden_named"
    svc.mkdir(parents=True)
    (svc / "manifest.json").write_text(
        '{"name":"p4_golden_named","features":["companion_chat","health"]}',
        encoding="utf-8",
    )
    assert tools._resolve_ui_profile("p4_golden_named") == "companion_chat"


def test_ensure_product_surfaces_fail_closed_on_refresh(
    tmp_path: Path,
) -> None:
    """Required Desktop refresh failure marks ok=False and verify FAILED."""
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "services" / "refresh_fail_svc").mkdir(parents=True)
    cfg = make_config(
        tmp_path,
        engine_allow_service_writes=True,
        deploy_agent_url="http://deploy:8010",
        require_deploy_agent=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("refresh_fail"))

    selection = MagicMock()
    selection.scaffold_profile = "companion_chat"
    mock_refresh = MagicMock(
        return_value={"ok": False, "error": "compose_up_failed"}
    )
    mock_ecc_refresh = MagicMock(return_value={"ok": True})
    with (
        patch(
            "services.empery_intelligence_core.src.integration.recipe_catalog.resolve_assembly_selection",
            return_value=selection,
        ),
        patch(
            "services.empery_intelligence_core.src.integration.service_scaffold_desktop.refresh_desktop_ui",
            mock_refresh,
        ),
        patch(
            "services.empery_intelligence_core.src.integration.service_scaffold_desktop.refresh_ecc_ui",
            mock_ecc_refresh,
        ),
    ):
        result = tools.ensure_product_surfaces("refresh_fail_svc")

    assert result.get("ok") is False
    assert result["desktop_verify"]["status"] == "FAILED"
    assert "refresh required" in result["desktop_verify"]["detail"].lower()
    assert tools.last_product_surfaces is result
