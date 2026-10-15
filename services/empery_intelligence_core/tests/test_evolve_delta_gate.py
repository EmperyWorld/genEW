"""Evolve delta gate — intent delivery evidence for UI-surface evolves."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.src.integration.evolve_delta_gate import (
    accumulate_evolve_written_paths,
    snapshot_evolve_baseline,
    verify_evolve_delta,
)


def _seed_mount(tmp_path: Path, service: str, body: str = "// mount\n") -> Path:
    mount = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service}.tsx"
    )
    mount.parent.mkdir(parents=True, exist_ok=True)
    mount.write_text(body, encoding="utf-8")
    return mount


def test_delta_skipped_without_ui_surface() -> None:
    status, detail = verify_evolve_delta(
        Path("/tmp"),
        "svc",
        intent="harden EventBus redis only",
        metadata={},
        touch_gates={"factory": True, "ui": False, "desktop": False},
    )
    assert status == "SKIPPED"


def test_delta_fails_when_ui_intent_but_no_surface_writes(tmp_path: Path) -> None:
    service = "marketing_cabinet"
    _seed_mount(tmp_path, service)
    meta = snapshot_evolve_baseline(tmp_path, service, {})
    # No product writes — only an atom dump (the failure mode).
    meta = accumulate_evolve_written_paths(
        meta,
        [
            f"apps/empery_desktop/atoms/{service}/ReportCardBody.tsx",
            f"apps/empery_desktop/atoms/{service}/dashboardWidgetBody.tsx",
        ],
    )
    # Atom files exist but mount does not import them
    atoms = tmp_path / "apps" / "empery_desktop" / "atoms" / service
    atoms.mkdir(parents=True)
    (atoms / "ReportCardBody.tsx").write_text("export function ReportCardBody(){}\n")
    (atoms / "dashboardWidgetBody.tsx").write_text("export function W(){}\n")

    status, detail = verify_evolve_delta(
        tmp_path,
        service,
        intent="Добавить JTBD вкладку и улучшить UI",
        metadata=meta,
        touch_gates={"factory": True, "ui": True, "desktop": True},
    )
    assert status == "FAILED"
    assert "no Desktop mount write" in detail or "imports none" in detail


def test_delta_passes_when_mount_written_and_atom_wired(tmp_path: Path) -> None:
    service = "marketing_cabinet"
    mount = _seed_mount(
        tmp_path,
        service,
        'import { ReportCardBody } from "../../../atoms/marketing_cabinet/ReportCardBody";\n',
    )
    meta = snapshot_evolve_baseline(tmp_path, service, {})
    # Change mount after baseline
    mount.write_text(
        'import { ReportCardBody } from "../../../atoms/marketing_cabinet/ReportCardBody";\n'
        "export function MarketingCabinetMount(){ return <ReportCardBody topic=\"x\" />; }\n",
        encoding="utf-8",
    )
    atoms = tmp_path / "apps" / "empery_desktop" / "atoms" / service
    atoms.mkdir(parents=True)
    (atoms / "ReportCardBody.tsx").write_text(
        "export function ReportCardBody(){ return null; }\n"
    )
    meta = accumulate_evolve_written_paths(
        meta,
        [
            f"apps/empery_desktop/src/shell/mounts/{service}.tsx",
            f"apps/empery_desktop/atoms/{service}/ReportCardBody.tsx",
        ],
    )
    status, detail = verify_evolve_delta(
        tmp_path,
        service,
        intent="Добавить JTBD вкладку",
        metadata=meta,
        touch_gates={"ui": True, "desktop": True, "factory": False},
    )
    assert status == "PASSED", detail
    assert "mount" in detail.lower() or "wired" in detail.lower()


def test_delta_passes_on_ecc_feature_write_alone(tmp_path: Path) -> None:
    service = "ops_board"
    _seed_mount(tmp_path, service)
    meta = snapshot_evolve_baseline(tmp_path, service, {})
    meta = accumulate_evolve_written_paths(
        meta,
        ["apps/empery_control_center/src/features/ops-board/OpsBoardPage.tsx"],
    )
    status, detail = verify_evolve_delta(
        tmp_path,
        service,
        intent="improve UI dashboard layout",
        metadata=meta,
        # ui without desktop — ECC feature write is enough
        touch_gates={"ui": True, "desktop": False, "factory": False},
    )
    assert status == "PASSED", detail


def test_delta_fails_identical_mount_rewrite_with_desktop_touch(tmp_path: Path) -> None:
    """Fake-green: path listed as written but mount bytes unchanged."""
    service = "asm_c7_ops"
    mount = _seed_mount(tmp_path, service, "// baseline mount\n")
    meta = snapshot_evolve_baseline(tmp_path, service, {})
    # Re-write identical content (Assembler no-op rewrite).
    mount.write_text("// baseline mount\n", encoding="utf-8")
    meta = accumulate_evolve_written_paths(
        meta,
        [
            f"apps/empery_desktop/src/shell/mounts/{service}.tsx",
            f"apps/empery_control_center/src/features/{service.replace('_', '-')}/Page.tsx",
        ],
    )
    status, detail = verify_evolve_delta(
        tmp_path,
        service,
        intent="evolve: JTBD вкладка Desktop UI",
        metadata=meta,
        touch_gates={"ui": True, "desktop": True, "factory": True},
    )
    assert status == "FAILED", detail
    assert "hash unchanged" in detail or "mount content delta" in detail


def test_stamp_evolve_mount_delivery_unlocks_desktop_delta(tmp_path: Path) -> None:
    """Mechanics stamp after idempotent inject → honest mount hash delta."""
    from services.empery_intelligence_core.src.integration.evolve_delta_gate import (
        stamp_evolve_mount_delivery,
    )

    service = "asm_c7_ops"
    _seed_mount(tmp_path, service, "import x from 'y';\nexport const M = () => null;\n")
    meta = snapshot_evolve_baseline(tmp_path, service, {})
    assert stamp_evolve_mount_delivery(
        tmp_path,
        service,
        intention_id="job-abc",
        attempt=1,
        blueprint_version="1.0.0",
    )
    mount = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service}.tsx"
    )
    text = mount.read_text(encoding="utf-8")
    assert text.startswith("/* eic-evolve:job-abc:a1:bp1.0.0 */")
    assert "import x from 'y'" in text
    meta = accumulate_evolve_written_paths(
        meta,
        [f"apps/empery_desktop/src/shell/mounts/{service}.tsx"],
    )
    status, detail = verify_evolve_delta(
        tmp_path,
        service,
        intent="evolve: refresh JTBD labels Desktop",
        metadata=meta,
        touch_gates={"ui": True, "desktop": True, "factory": False},
    )
    assert status == "PASSED", detail
    # Second stamp with new attempt replaces marker (still a delta vs baseline).
    assert stamp_evolve_mount_delivery(
        tmp_path,
        service,
        intention_id="job-abc",
        attempt=2,
        blueprint_version="1.0.0",
    )
    assert "a2:" in mount.read_text(encoding="utf-8")
