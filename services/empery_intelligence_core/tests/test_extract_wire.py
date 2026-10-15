"""Post-extract desktop atom wiring + new/wired metrics."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.src.integration.extract_wire import (
    MAX_DESKTOP_FE_ATOMS_PER_EXTRACT,
    list_desktop_fe_atoms,
    post_extract_wire_desktop_atoms,
    sanitize_mount_atom_imports,
    try_wire_single_presentational_atom,
)


def test_list_desktop_fe_atoms_filters_docs() -> None:
    written = [
        "apps/empery_desktop/atoms/svc/ReportCardBody.tsx",
        "apps/empery_desktop/atoms/svc/SOURCE.md",
        "services/svc/src/integration/atoms/nervas.py",
    ]
    assert list_desktop_fe_atoms(written, "svc") == [
        "apps/empery_desktop/atoms/svc/ReportCardBody.tsx"
    ]


def test_try_wire_marker_only_no_ts_import(tmp_path: Path) -> None:
    service = "mc"
    mount = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service}.tsx"
    )
    mount.parent.mkdir(parents=True)
    mount.write_text(
        'import { peerApiBase } from "@/api/peerBase";\n'
        "export function McMount() {\n"
        "  return <div>hi</div>;\n"
        "}\n",
        encoding="utf-8",
    )
    atom = f"apps/empery_desktop/atoms/{service}/ReportCardBody.tsx"
    (tmp_path / atom).parent.mkdir(parents=True)
    (tmp_path / atom).write_text("export function ReportCardBody(){return null}\n")
    assert try_wire_single_presentational_atom(tmp_path, service, atom)
    text = mount.read_text(encoding="utf-8")
    assert "eic:extract-wire:ReportCardBody" in text
    assert "ReportCardBody" in text
    # Must not TS-import corpus (pulls EliteEW peers into Vite tsc graph).
    assert f'from "../../../atoms/{service}/ReportCardBody"' not in text
    assert "<ReportCardBody" not in text


def test_post_extract_wires_single_body_and_reports_metrics(tmp_path: Path) -> None:
    service = "mc"
    mount = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service}.tsx"
    )
    mount.parent.mkdir(parents=True)
    mount.write_text(
        "export function McMount(){ return <div/> }\n",
        encoding="utf-8",
    )
    atom = f"apps/empery_desktop/atoms/{service}/ReportCardBody.tsx"
    (tmp_path / atom).parent.mkdir(parents=True)
    (tmp_path / atom).write_text("export function ReportCardBody(){return null}\n")
    meta = post_extract_wire_desktop_atoms(
        tmp_path,
        service,
        [atom],
        kind="evolve",
    )
    assert meta["mount_patched"] is True
    assert meta["unwired"] == []
    assert "ReportCardBody.tsx" in meta["wired"]


def test_post_extract_wires_ops_dashboard_pair(tmp_path: Path) -> None:
    """ops_dashboard pack ships two *Body atoms — both must marker-wire."""
    service = "ops"
    mount = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service}.tsx"
    )
    mount.parent.mkdir(parents=True)
    mount.write_text(
        "export function OpsMount(){ return <div/> }\n",
        encoding="utf-8",
    )
    atoms_dir = tmp_path / "apps" / "empery_desktop" / "atoms" / service
    atoms_dir.mkdir(parents=True)
    written: list[str] = []
    for stem in ("DashboardFavoritesSlotBody", "dashboardWidgetBody"):
        (atoms_dir / f"{stem}.tsx").write_text(
            f"export function {stem}(){{return null}}\n",
            encoding="utf-8",
        )
        written.append(f"apps/empery_desktop/atoms/{service}/{stem}.tsx")
    meta = post_extract_wire_desktop_atoms(
        tmp_path, service, written, kind="evolve"
    )
    assert meta["mount_patched"] is True
    assert meta["unwired"] == []
    text = mount.read_text(encoding="utf-8")
    assert "DashboardFavoritesSlotBody" in text
    assert "dashboardWidgetBody" in text
    assert f'atoms/{service}/DashboardFavoritesSlotBody"' not in text


def test_sanitize_strips_legacy_atom_imports(tmp_path: Path) -> None:
    service = "gnome"
    mount = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service}.tsx"
    )
    mount.parent.mkdir(parents=True)
    mount.write_text(
        'import { peerApiBase } from "@/api/peerBase";\n'
        f'import {{ DashboardFavoritesSlotBody }} from "../../../atoms/{service}/DashboardFavoritesSlotBody";\n'
        f'import {{ dashboardWidgetBody }} from "../../../atoms/{service}/dashboardWidgetBody";\n'
        "// eic:extract-wire:DashboardFavoritesSlotBody — import present\n"
        "export function Mount(){ return <div/> }\n",
        encoding="utf-8",
    )
    assert sanitize_mount_atom_imports(tmp_path, service) is True
    text = mount.read_text(encoding="utf-8")
    assert "atoms/" not in text or "eic:extract-wire" in text
    assert 'from "../../../atoms/' not in text
    assert "peerApiBase" in text
    assert "DashboardFavoritesSlotBody" in text


def test_post_extract_leaves_dump_unwired(tmp_path: Path) -> None:
    service = "mc"
    mount = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service}.tsx"
    )
    mount.parent.mkdir(parents=True)
    mount.write_text("export function McMount(){ return <div/> }\n", encoding="utf-8")
    written = []
    atoms = tmp_path / "apps" / "empery_desktop" / "atoms" / service
    atoms.mkdir(parents=True)
    for name in ("AppStore.tsx", "AssistantApp.tsx", "ClipboardManager.tsx"):
        (atoms / name).write_text(f"export function {name[:-4]}(){{}}\n")
        written.append(f"apps/empery_desktop/atoms/{service}/{name}")
    meta = post_extract_wire_desktop_atoms(
        tmp_path, service, written, kind="evolve"
    )
    assert meta["mount_patched"] is False
    assert len(meta["unwired"]) == 3


def test_max_desktop_fe_cap_constant() -> None:
    assert MAX_DESKTOP_FE_ATOMS_PER_EXTRACT == 24
