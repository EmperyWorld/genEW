"""P1 extract_adapt + atom catalog + forbid_scratch + D1 quality."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.src.integration.extract_adapt import (
    extract_adapt,
    extract_from_catalog_entry,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    atom_catalog_entry,
    load_atom_catalog,
)
from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
    ServiceDesktopScaffoldAction,
    verify_service_desktop,
)
from services.empery_intelligence_core.config import ServiceConfig
from core.logging import configure_logging


def _paths(tmp: Path) -> EicOrchestrationPaths:
    orch = tmp / ".cursor" / "orchestration"
    orch.mkdir(parents=True)
    (orch / "recipes").mkdir(parents=True)
    cfg = ServiceConfig(workspace_root=str(tmp))
    return EicOrchestrationPaths.from_config(cfg, cwd=tmp)


def test_atom_catalog_loads_ewa_companion(tmp_path: Path) -> None:
    # Use real repo catalog by pointing workspace at repo root
    root = Path(__file__).resolve().parents[3]
    cfg = ServiceConfig(workspace_root=str(root))
    paths = EicOrchestrationPaths.from_config(cfg, cwd=root)
    data = load_atom_catalog(paths)
    assert data.get("packs")
    entry = atom_catalog_entry(paths, "ewa_companion")
    assert entry is not None
    assert entry.get("scaffold_profile") == "companion_chat"
    assert any("upstream_fe" in g for g in (entry.get("extract_globs") or []))


def test_extract_adapt_genesis_copies_reference(tmp_path: Path) -> None:
    src_dir = tmp_path / "reference" / "eliteew" / "packs" / "demo"
    src_dir.mkdir(parents=True)
    (src_dir / "note.md").write_text("hello {service_name}", encoding="utf-8")
    dest = "services/demo_svc/reference_extract/"
    (tmp_path / "services" / "demo_svc").mkdir(parents=True)
    result = extract_adapt(
        workspace=tmp_path,
        source_glob="reference/eliteew/packs/demo/**",
        dest=dest,
        transforms=["rewrite_service_token"],
        service_name="demo_svc",
        mode="genesis",
    )
    assert result.ok, result.error
    out = tmp_path / "services" / "demo_svc" / "reference_extract" / "note.md"
    assert out.is_file()
    assert "demo_svc" in out.read_text(encoding="utf-8")


def test_extract_adapt_refuses_eliteew_write(tmp_path: Path) -> None:
    elite = tmp_path / "elite"
    (elite / "api").mkdir(parents=True)
    (elite / "api" / "x.py").write_text("x=1", encoding="utf-8")
    result = extract_adapt(
        workspace=tmp_path,
        source_glob="api/x.py",
        dest=str(elite / "hack"),
        mode="corpus",
        eliteew_root=elite,
    )
    assert result.ok is False


def test_forbid_scratch_stats(tmp_path: Path) -> None:
    from services.empery_intelligence_core.src.integration.workspace_tools import (
        WorkspaceToolAdapter,
    )

    root = Path(__file__).resolve().parents[3]
    # Copy minimal recipes into tmp so selection can match companion
    recipes = tmp_path / ".cursor" / "orchestration" / "recipes"
    recipes.mkdir(parents=True)
    (recipes / "atom_catalog.yaml").write_text(
        (root / ".cursor/orchestration/recipes/atom_catalog.yaml").read_text(
            encoding="utf-8"
        ),
        encoding="utf-8",
    )
    for name in ("ewa_companion.md", "INDEX.md", "service_anatomy.md"):
        src = root / ".cursor/orchestration/recipes" / name
        if src.is_file():
            (recipes / name).write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    # minimal eliteew pack so extract_roots non-empty
    pack = tmp_path / "reference" / "eliteew" / "packs" / "ewa_companion"
    pack.mkdir(parents=True)
    (pack / "SOURCE.md").write_text("# x", encoding="utf-8")
    (pack / "a.tsx").write_text("export {}", encoding="utf-8")

    cfg = ServiceConfig(workspace_root=str(tmp_path))
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    adapter = WorkspaceToolAdapter(paths, cfg, configure_logging("t"))
    violation = adapter.forbid_scratch_violation(
        intent="create companion chat service",
        service_name="p1_demo",
        action_stats={"extract_adapt": 0, "scaffold": 0, "write_file": 3},
    )
    assert violation is not None
    assert "forbid_scratch" in violation
    # Scaffold alone must NOT clear the gate (audit DEBT).
    still = adapter.forbid_scratch_violation(
        intent="create companion chat service",
        service_name="p1_demo",
        action_stats={"extract_adapt": 0, "scaffold": 1, "write_file": 10},
    )
    assert still is not None
    ok = adapter.forbid_scratch_violation(
        intent="create companion chat service",
        service_name="p1_demo",
        action_stats={"extract_adapt": 1, "scaffold": 0},
    )
    assert ok is None


def test_forbid_scratch_empty_extract_roots(tmp_path: Path) -> None:
    """P15: product pack match with empty extract_roots must hard-refuse."""
    from services.empery_intelligence_core.src.integration.workspace_tools import (
        WorkspaceToolAdapter,
    )

    root = Path(__file__).resolve().parents[3]
    recipes = tmp_path / ".cursor" / "orchestration" / "recipes"
    recipes.mkdir(parents=True)
    for name in ("ewa_companion.md", "INDEX.md", "service_anatomy.md"):
        src = root / ".cursor/orchestration/recipes" / name
        if src.is_file():
            (recipes / name).write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    # No atom_catalog.yaml and no EliteEW pack → extract_roots empty

    cfg = ServiceConfig(workspace_root=str(tmp_path))
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    adapter = WorkspaceToolAdapter(paths, cfg, configure_logging("t"))
    violation = adapter.forbid_scratch_violation(
        intent="create companion chat service",
        service_name="p15_empty_roots",
        action_stats={"extract_adapt": 0, "scaffold": 1},
    )
    assert violation is not None
    assert "extract_roots are empty" in violation


def test_intent_looks_productish() -> None:
    from services.empery_intelligence_core.src.integration.assembly_profiles import (
        intent_looks_productish,
        should_refuse_assembly_generic,
    )

    assert intent_looks_productish("create companion chat", "x")
    assert intent_looks_productish("build music forge", None)
    assert not intent_looks_productish(
        "create_service widget_probe health only", "widget_probe"
    )
    assert should_refuse_assembly_generic(
        scaffold_profile="generic",
        intent="create companion chat service",
        service_name="x",
        allow_generic=False,
    )
    assert not should_refuse_assembly_generic(
        scaffold_profile="generic",
        intent="create companion chat service",
        service_name="x",
        allow_generic=True,
    )
    assert not should_refuse_assembly_generic(
        scaffold_profile="companion_chat",
        intent="create companion chat service",
        service_name="x",
        allow_generic=False,
    )
    assert not should_refuse_assembly_generic(
        scaffold_profile="generic",
        intent="create_service widget_probe health only",
        service_name="widget_probe",
        allow_generic=False,
    )


def test_d1_companion_quality_pass_and_fail(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceDesktopScaffoldAction(
        tmp_path, configure_logging("scaffold_desktop")
    )
    action.scaffold_desktop(
        "rich_chat",
        register_live=False,
        ui_profile="companion_chat",
        peer_port=8099,
    )
    status, detail = verify_service_desktop(
        tmp_path, "rich_chat", ui_profile="companion_chat"
    )
    assert status == "PASSED", detail

    # Health-only mount must fail companion profile
    mount = tmp_path / "apps/empery_desktop/src/shell/mounts/thin.tsx"
    mount.parent.mkdir(parents=True, exist_ok=True)
    mount.write_text(
        'import { peerApiBase } from "@/api/peerBase";\n'
        "const PEER = peerApiBase(1);\n"
        "export function ThinMount(){ return null }\n"
        "// only /api/v1/health\n"
        "fetch(`${PEER}/api/v1/health`);\n",
        encoding="utf-8",
    )
    # minimal registry + catalog for thin
    registry = tmp_path / "apps/empery_desktop/src/shell/mounts/registry.ts"
    registry.write_text(
        'import { ThinMount } from "./thin";\n'
        "export const APP_MOUNTS = { thin: ThinMount };\n"
        "// eic:desktop-mount-registry\n",
        encoding="utf-8",
    )
    cat = tmp_path / ".cursor/orchestration/eic/desktop_catalog/thin.json"
    cat.write_text(
        '{"app_id":"thin","app_component":"thin","title":"Thin"}',
        encoding="utf-8",
    )
    status2, detail2 = verify_service_desktop(
        tmp_path, "thin", ui_profile="companion_chat"
    )
    assert status2 == "FAILED", detail2
    assert "messages" in detail2.lower() or "quality" in detail2.lower()


def test_catalog_extract_into_empery_targets(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[3]
    entry = {
        "pack": "ewa_companion",
        "extract_globs": [
            "reference/eliteew/packs/ewa_companion/upstream_fe/EwaCompanionChatPanel.tsx",
            "reference/eliteew/packs/ewa_companion/upstream_api/gateways/companion_chat.py",
        ],
        "empery_targets": [
            "apps/empery_desktop/atoms/",
            "services/{service_name}/",
        ],
        "transforms": [],
    }
    src_fe = (
        root
        / "reference/eliteew/packs/ewa_companion/upstream_fe/EwaCompanionChatPanel.tsx"
    )
    src_api = (
        root
        / "reference/eliteew/packs/ewa_companion/upstream_api/gateways/companion_chat.py"
    )
    if not src_fe.is_file():
        return
    fe_dir = tmp_path / "reference/eliteew/packs/ewa_companion/upstream_fe"
    api_dir = tmp_path / "reference/eliteew/packs/ewa_companion/upstream_api/gateways"
    fe_dir.mkdir(parents=True)
    api_dir.mkdir(parents=True)
    (fe_dir / "EwaCompanionChatPanel.tsx").write_text(
        src_fe.read_text(encoding="utf-8")[:400], encoding="utf-8"
    )
    if src_api.is_file():
        (api_dir / "companion_chat.py").write_text(
            src_api.read_text(encoding="utf-8")[:400], encoding="utf-8"
        )
    (tmp_path / "services" / "x" / "src" / "integration").mkdir(parents=True)
    (tmp_path / "apps/empery_desktop/atoms").mkdir(parents=True)

    result = extract_from_catalog_entry(
        workspace=tmp_path, entry=entry, service_name="x"
    )
    assert result.ok, result.error
    assert result.written
    desktop_atom = (
        tmp_path / "apps/empery_desktop/atoms/x/EwaCompanionChatPanel.tsx"
    )
    assert desktop_atom.is_file(), result.written
    svc_atoms = tmp_path / "services/x/src/integration/atoms"
    assert svc_atoms.is_dir()
    assert (svc_atoms / "ATOMS_PROVENANCE.md").is_file()
