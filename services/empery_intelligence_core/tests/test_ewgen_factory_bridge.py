"""Vendored EWGen factory bridge — analyze + cluster extract."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.ewgen import bridge as ewgen
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    match_recipe_pack_names,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)
import logging


def _mini_fe_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("demo/package.json", '{"name":"demo","version":"0.0.1"}')
        zf.writestr(
            "demo/src/components/Hello/Hello.tsx",
            "export function Hello() { return null }\n",
        )
        zf.writestr(
            "demo/src/components/Hello/index.ts",
            'export * from "./Hello"\n',
        )
    return buf.getvalue()


def test_ewgen_analyze_frontend_groups() -> None:
    ws = Path.cwd()
    ewgen.configure_ewgen_data(ws)
    groups = ewgen.cluster_component_groups_from_zip(_mini_fe_zip())
    assert isinstance(groups, list)
    assert len(groups) >= 1


def test_ewgen_cluster_extract_writes_under_reference(tmp_path: Path, monkeypatch) -> None:
    # Use real workspace so reference/ exists; write under reference/ewgen/extracted_test
    ws = Path.cwd()
    dest_rel = "reference/ewgen/extracted_test_hello"
    dest = ws / dest_rel
    if dest.exists():
        import shutil

        shutil.rmtree(dest)
    out = ewgen.materialize_group_files_to_dest(
        workspace=ws,
        zip_bytes=_mini_fe_zip(),
        group={"id": "g1", "candidatePaths": ["demo/src/components/Hello/Hello.tsx"]},
        dest_rel=dest_rel,
        transforms=["strip_reference_imports"],
    )
    assert out["ok"] is True
    assert out["written"]
    assert any("Hello.tsx" in p for p in out["written"])
    # cleanup
    import shutil

    shutil.rmtree(dest, ignore_errors=True)


def test_ewgen_factory_recipe_on_create() -> None:
    packs = match_recipe_pack_names(
        service_name="probe_svc",
        intent="create_service probe with scavenger component factory",
    )
    assert any(p.endswith("ewgen_factory.md") for p in packs), packs


def test_workspace_ewgen_analyze_action() -> None:
    root = Path.cwd()
    cfg = ServiceConfig(
        orchestration_root=str(root / ".cursor" / "orchestration"),
        workspace_root=str(root),
        agents_root=str(root / ".cursor" / "agents"),
        skills_root=str(root / ".cursor" / "skills"),
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=root)
    tools = WorkspaceToolAdapter(paths, cfg, logging.getLogger("test.ewgen"))
    zip_rel = ".cursor/orchestration/ewgen_data/_test_mini.zip"
    zip_path = root / zip_rel
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    zip_path.write_bytes(_mini_fe_zip())
    result = tools.ewgen_factory_action(
        {"zip_path": zip_rel, "track": "fe"},
        kind="ewgen_analyze",
        service_name="probe",
    )
    assert result.get("ok") is True
    assert tools.last_action_stats["ewgen_analyze"] >= 1
    zip_path.unlink(missing_ok=True)
