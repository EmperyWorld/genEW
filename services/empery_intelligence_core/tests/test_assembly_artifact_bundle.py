"""Phase 6 — Assembly artifact bundle inventory."""

from __future__ import annotations

import json
from pathlib import Path

from core.assembly.artifact_bundle import (
    artifact_bundle_rel,
    build_written_inventory,
    classify_written_kind,
    load_artifact_bundle,
    verify_bundle_hashes,
    write_artifact_bundle,
)
from core.assembly.assembler import run_assembler_v1
from core.integration.assembly_contracts import (
    default_ops_dashboard_blueprint,
    manifest_from_blueprint,
)
from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
    _ops_dashboard_mount_tsx,
)

def _seed_ops_workspace(tmp_path: Path, service: str = "bundle_dash") -> tuple[Path, object, object]:
    mounts = tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    (mounts / f"{service}.tsx").write_text(
        _ops_dashboard_mount_tsx(service, "BundleDash", "Bundle Dash", 8099),
        encoding="utf-8",
    )
    designs = tmp_path / ".cursor" / "orchestration" / "designs"
    designs.mkdir(parents=True)
    eic = tmp_path / ".cursor" / "orchestration" / "eic" / "assembly"
    eic.mkdir(parents=True)
    bp = default_ops_dashboard_blueprint(service_name=service)
    mf = manifest_from_blueprint(bp)
    (designs / f"{service}_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    mf_path = eic / f"{service}_manifest.json"
    mf_path.write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    return mf_path, bp, mf


def test_classify_and_inventory(tmp_path: Path) -> None:
    f = tmp_path / "services" / "x" / "assembly_runtime.json"
    f.parent.mkdir(parents=True)
    f.write_text("{}", encoding="utf-8")
    assert classify_written_kind("services/x/assembly_runtime.json") == "stamp"
    assert classify_written_kind("services/x/assembly_freeze.json") == "freeze"
    assert classify_written_kind("apps/foo/mount.tsx") == "tsx"
    inv = build_written_inventory(
        tmp_path, ["services/x/assembly_runtime.json", "missing/nope.json"]
    )
    assert inv[0]["sha256"]
    assert "sha256" not in inv[1]


def test_write_and_verify_bundle(tmp_path: Path) -> None:
    service = "bundle_svc"
    path = tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts" / f"{service}.tsx"
    path.parent.mkdir(parents=True)
    path.write_text("export const M = () => null;\n", encoding="utf-8")
    rel = f"apps/empery_desktop/src/shell/mounts/{service}.tsx"
    out = write_artifact_bundle(
        tmp_path,
        service_name=service,
        written_relpaths=[rel],
        widget_count=1,
    )
    assert out.name == "assembly_artifact_bundle.json"
    bundle = load_artifact_bundle(tmp_path, service)
    assert bundle is not None
    assert bundle["workspace_contract"] == "shared_fs"
    assert bundle["written"][0]["sha256"]
    status, detail = verify_bundle_hashes(tmp_path, bundle)
    assert status == "PASSED", detail
    path.write_text("export const M = () => 1;\n", encoding="utf-8")
    status2, _ = verify_bundle_hashes(tmp_path, bundle)
    assert status2 == "FAILED"


def test_run_assembler_v1_emits_artifact_bundle(tmp_path: Path) -> None:
    import logging

    mf_path, bp, mf = _seed_ops_workspace(tmp_path, "bundle_dash")
    result = run_assembler_v1(
        tmp_path,
        blueprint=bp,
        manifest=mf,
        manifest_path=mf_path,
        logger=logging.getLogger("bundle_test"),
        run_tsc=False,
    )
    assert result.get("ok") is True
    bundle_rel = artifact_bundle_rel("bundle_dash")
    assert bundle_rel in (result.get("written") or [])
    assert (tmp_path / bundle_rel).is_file()
    arts = result.get("written_artifacts") or []
    assert any(a.get("kind") == "freeze" and a.get("sha256") for a in arts)
    assert any(a.get("kind") == "bundle" and a.get("sha256") for a in arts)
    bundle = load_artifact_bundle(tmp_path, "bundle_dash")
    assert bundle is not None
    status, detail = verify_bundle_hashes(tmp_path, bundle)
    assert status == "PASSED", detail


def test_attach_and_materialize_content_transfer(tmp_path: Path) -> None:
    """Content-transfer roundtrip: attach bytes → materialize to empty workspace."""
    from core.assembly.artifact_bundle import (
        attach_artifact_bytes,
        materialize_written_artifacts,
    )

    src = tmp_path / "src_ws"
    dst = tmp_path / "dst_ws"
    service = "xfer_dash"
    mount = (
        src
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service}.tsx"
    )
    mount.parent.mkdir(parents=True)
    body = b"export const M = () => null;\n"
    mount.write_bytes(body)
    rel = f"apps/empery_desktop/src/shell/mounts/{service}.tsx"
    write_artifact_bundle(
        src, service_name=service, written_relpaths=[rel], widget_count=1
    )
    bundle = load_artifact_bundle(src, service)
    assert bundle is not None
    attached = attach_artifact_bytes(src, list(bundle["written"]))
    assert attached[0].get("content") == body
    written = materialize_written_artifacts(dst, attached)
    assert rel in written
    assert (dst / rel).read_bytes() == body
    # Hash mismatch fails closed.
    bad = [dict(attached[0], content=b"tampered")]
    try:
        materialize_written_artifacts(dst, bad)
        raise AssertionError("expected sha256 mismatch")
    except ValueError as exc:
        assert "sha256 mismatch" in str(exc)


def test_fetch_artifacts_inventory_include_bytes(tmp_path: Path) -> None:
    from core.assembly.artifact_bundle import fetch_artifacts_inventory

    service = "fetch_svc"
    path = tmp_path / "services" / service / "assembly_runtime.json"
    path.parent.mkdir(parents=True)
    path.write_text('{"ok":true}\n', encoding="utf-8")
    rel = f"services/{service}/assembly_runtime.json"
    write_artifact_bundle(tmp_path, service_name=service, written_relpaths=[rel])
    inv = fetch_artifacts_inventory(
        tmp_path, service, include_bytes=True, relpaths=[rel]
    )
    assert inv["ok"] is True
    assert inv["written"][0]["content"] == b'{"ok":true}\n'
