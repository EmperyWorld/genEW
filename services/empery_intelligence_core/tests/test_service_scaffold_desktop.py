"""Desktop host scaffold — catalog JSON + window mount registry."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

from core.logging import configure_logging
from services.empery_intelligence_core.src.integration.service_scaffold import (
    ServiceScaffoldAction,
)
from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
    ServiceDesktopScaffoldAction,
    is_smoke_lab_service,
    refresh_desktop_ui,
    refresh_ecc_api,
    refresh_ecc_ui,
    verify_service_desktop,
)
from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
    authoritative_verify_summary,
)
from services.desktop_shell.src.data.repository import InMemoryDesktopShellStore


def test_desktop_scaffold_writes_mount_and_catalog(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceDesktopScaffoldAction(
        tmp_path, configure_logging("scaffold_desktop")
    )
    result = action.scaffold_desktop(
        "notes_lite",
        domain_hint="notes",
        register_live=False,
    )
    assert result["skipped"] is False
    mount = tmp_path / "apps/empery_desktop/src/shell/mounts/notes_lite.tsx"
    assert mount.is_file()
    registry = (
        tmp_path / "apps/empery_desktop/src/shell/mounts/registry.ts"
    ).read_text(encoding="utf-8")
    assert "notes_lite: NotesLiteMount" in registry
    assert 'from "./notes_lite"' in registry
    catalog = (
        tmp_path
        / ".cursor/orchestration/eic/desktop_catalog/notes_lite.json"
    )
    assert catalog.is_file()
    assert "notes_lite" in catalog.read_text(encoding="utf-8")


def test_full_scaffold_includes_desktop(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("scaffold_full"))
    out = action.scaffold(
        "demo_notebook",
        features=["health"],
        domain_hint="notebook",
    )
    assert out["desktop"]["skipped"] is False
    assert (
        tmp_path
        / "apps/empery_desktop/src/shell/mounts/demo_notebook.tsx"
    ).is_file()
    assert (
        tmp_path
        / ".cursor/orchestration/eic/desktop_catalog/demo_notebook.json"
    ).is_file()


def test_verify_service_desktop_passes_after_companion_scaffold(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceDesktopScaffoldAction(
        tmp_path, configure_logging("verify_desktop_companion")
    )
    action.scaffold_desktop(
        "demo_notebook",
        domain_hint="notebook",
        ui_profile="companion_chat",
        register_live=False,
    )
    status, detail = verify_service_desktop(tmp_path, "demo_notebook")
    assert status == "PASSED", detail


def test_generic_scaffold_desktop_passes_verify(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceDesktopScaffoldAction(
        tmp_path, configure_logging("verify_desktop_generic")
    )
    action.scaffold_desktop(
        "demo_notebook",
        domain_hint="notebook",
        ui_profile="generic",
        register_live=False,
    )
    mount = (
        tmp_path / "apps/empery_desktop/src/shell/mounts/demo_notebook.tsx"
    )
    assert "Scaffolded desktop mount" not in mount.read_text(encoding="utf-8")
    status, detail = verify_service_desktop(tmp_path, "demo_notebook")
    assert status == "PASSED", detail


def test_verify_service_desktop_fails_on_stub_mount(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("verify_desktop_stub"))
    action.scaffold("demo_notebook", features=["health"], domain_hint="notebook")
    mount = tmp_path / "apps/empery_desktop/src/shell/mounts/demo_notebook.tsx"
    mount.write_text(
        mount.read_text(encoding="utf-8")
        + "\n// Scaffolded desktop mount placeholder\n",
        encoding="utf-8",
    )
    status, detail = verify_service_desktop(tmp_path, "demo_notebook")
    assert status == "FAILED"
    assert "scaffold stub" in detail.lower()


def test_verify_service_desktop_fails_without_mount(tmp_path: Path) -> None:
    (tmp_path / "services" / "orphan_svc").mkdir(parents=True)
    status, detail = verify_service_desktop(tmp_path, "orphan_svc")
    assert status == "FAILED"
    assert "Desktop gate missing" in detail


def test_desktop_fail_blocks_force_passed() -> None:
    body, summary = authoritative_verify_summary(
        "FAILED",
        anatomy_detail="Anatomy OK under services/x/",
        ui_detail="UI OK",
        desktop_detail="Desktop gate missing:\n- D1 mount",
        live_detail="deploy_agent health: ok",
        llm_narrative="PASSED",
    )
    assert summary == "verify_status=FAILED"
    assert "## Deterministic desktop" in body
    assert "Desktop gate missing" in body


def test_store_loads_catalog_overlay(tmp_path: Path) -> None:
    catalog_dir = tmp_path / "catalog"
    catalog_dir.mkdir()
    (catalog_dir / "notes_lite.json").write_text(
        '{"app_id":"notes_lite","title":"Notes","app_component":"notes_lite",'
        '"category":"apps","description":"x","icon":null}\n',
        encoding="utf-8",
    )
    store = InMemoryDesktopShellStore(catalog_dir)
    ids = [c.app_id for c in store.list_catalog()]
    assert "notes_lite" in ids
    assert "control_center" in ids
    boot = store.bootstrap()
    assert any(i.app_component == "notes_lite" for i in boot.items)


def test_refresh_desktop_ui_uses_action_rebuild() -> None:
    logger = configure_logging("refresh_desktop_ui")
    mock_client = MagicMock()
    mock_client.configured = True
    mock_client.deploy.return_value = {"ok": True}

    with patch(
        "services.empery_intelligence_core.src.integration.deploy_agent_client.DeployAgentClient",
        return_value=mock_client,
    ):
        result = refresh_desktop_ui(
            deploy_agent_url="http://deploy:8010",
            logger=logger,
            required=True,
        )

    assert result["ok"] is True
    mock_client.deploy.assert_called_once_with(
        "empery_desktop_ui", action="rebuild"
    )


def test_refresh_desktop_ui_skipped_when_url_unset() -> None:
    logger = configure_logging("refresh_skipped")
    result = refresh_desktop_ui(
        deploy_agent_url="",
        logger=logger,
        required=False,
    )
    assert result["ok"] is False
    assert result["skipped"] is True


def test_refresh_ecc_ui_uses_action_rebuild() -> None:
    logger = configure_logging("refresh_ecc_ui")
    mock_client = MagicMock()
    mock_client.configured = True
    mock_client.deploy.return_value = {"ok": True}

    with patch(
        "services.empery_intelligence_core.src.integration.deploy_agent_client.DeployAgentClient",
        return_value=mock_client,
    ):
        result = refresh_ecc_ui(
            deploy_agent_url="http://deploy:8010",
            logger=logger,
            required=True,
        )

    assert result["ok"] is True
    mock_client.deploy.assert_called_once_with(
        "empery_control_center_ui", action="rebuild"
    )


def test_refresh_ecc_api_prefers_hot_reload(monkeypatch) -> None:
    logger = configure_logging("refresh_ecc_api_hot")
    calls: list[str] = []

    class _Resp:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b'{"ok": true, "mounted": ["demo"], "errors": []}'

    def fake_urlopen(req, timeout=0):  # noqa: ANN001
        calls.append(str(getattr(req, "full_url", None) or req.get_full_url()))
        return _Resp()

    monkeypatch.setattr(
        "urllib.request.urlopen",
        fake_urlopen,
    )
    mock_client = MagicMock()
    mock_client.configured = True
    with patch(
        "services.empery_intelligence_core.src.integration.deploy_agent_client.DeployAgentClient",
        return_value=mock_client,
    ):
        result = refresh_ecc_api(
            deploy_agent_url="http://deploy:8010",
            logger=logger,
            required=True,
            ecc_api_base="http://ecc:8006",
        )
    assert result["ok"] is True
    assert result["reload_mode"] == "hot"
    assert any("reload-bff-routes" in u for u in calls)
    mock_client.deploy.assert_not_called()


def test_refresh_ecc_api_falls_back_to_restart(monkeypatch) -> None:
    logger = configure_logging("refresh_ecc_api_restart")

    def boom(*_a, **_k):  # noqa: ANN001
        raise OSError("connection refused")

    monkeypatch.setattr("urllib.request.urlopen", boom)
    mock_client = MagicMock()
    mock_client.configured = True
    mock_client.deploy.return_value = {"ok": True}
    with patch(
        "services.empery_intelligence_core.src.integration.deploy_agent_client.DeployAgentClient",
        return_value=mock_client,
    ):
        result = refresh_ecc_api(
            deploy_agent_url="http://deploy:8010",
            logger=logger,
            required=True,
            ecc_api_base="http://ecc:8006",
        )
    assert result["ok"] is True
    assert result["reload_mode"] == "restart"
    mock_client.deploy.assert_called_once_with(
        "empery_control_center_api", action="restart"
    )


def test_is_smoke_lab_service_patterns() -> None:
    assert is_smoke_lab_service("p4_golden_20260725014206")
    assert is_smoke_lab_service("p8_notes_20260725015514")
    assert is_smoke_lab_service("p15_refuse_20260725112332")
    assert not is_smoke_lab_service("p3_comp_live")
    assert not is_smoke_lab_service("ewa_companion")
    assert not is_smoke_lab_service("p12_taskboard_20260725071317")


def test_smoke_golden_catalog_goes_to_lab(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceDesktopScaffoldAction(
        tmp_path, configure_logging("smoke_lab_catalog")
    )
    result = action.scaffold_desktop(
        "p4_golden_20990101010101",
        domain_hint="companion",
        ui_profile="companion_chat",
        register_live=False,
    )
    assert result["skipped"] is False
    launch = (
        tmp_path
        / ".cursor/orchestration/eic/desktop_catalog/p4_golden_20990101010101.json"
    )
    lab = (
        tmp_path
        / ".cursor/orchestration/eic/desktop_catalog/lab/p4_golden_20990101010101.json"
    )
    assert not launch.is_file()
    assert lab.is_file()
    assert '"enabled": false' in lab.read_text(encoding="utf-8")
    assert '"category": "lab"' in lab.read_text(encoding="utf-8")


def test_verify_service_desktop_accepts_lab_catalog(tmp_path: Path) -> None:
    """P10 lab overlays satisfy D3 for smoke lab capsules."""
    import json

    (tmp_path / ".cursor/orchestration/eic/desktop_catalog/lab").mkdir(parents=True)
    mounts = tmp_path / "apps/empery_desktop/src/shell/mounts"
    mounts.mkdir(parents=True)
    name = "p8_notes_20990101010101"
    pascal = "".join(p.capitalize() for p in name.split("_") if p)
    (mounts / f"{name}.tsx").write_text(
        'import { peerApiBase } from "@/api/peerBase";\n'
        "const PEER = peerApiBase(1);\n"
        f"export function {pascal}Mount() {{\n"
        "  return null;\n"
        "}\n"
        "fetch(`${PEER}/api/v1/notes`);\n"
        "fetch(`${PEER}/api/v1/documents`);\n",
        encoding="utf-8",
    )
    (mounts / "registry.ts").write_text(
        f'import {{ {pascal}Mount }} from "./{name}";\n'
        f"export const APP_MOUNTS = {{ {name}: {pascal}Mount }};\n"
        "// eic:desktop-mount-registry\n",
        encoding="utf-8",
    )
    lab = (
        tmp_path
        / ".cursor/orchestration/eic/desktop_catalog/lab"
        / f"{name}.json"
    )
    lab.write_text(
        json.dumps(
            {
                "app_id": name,
                "app_component": name,
                "title": "Notes",
                "enabled": False,
                "category": "lab",
            }
        ),
        encoding="utf-8",
    )
    status, detail = verify_service_desktop(
        tmp_path, name, ui_profile="editor_local"
    )
    assert status == "PASSED", detail
