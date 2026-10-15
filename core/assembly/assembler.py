"""Assembler — stamp runtime + AST inject Manifest into UI slots (v1).

LLM never writes domain code. Mechanics own assembly_runtime.json and slot inject.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from core.errors import ServiceError, StandardizedErrorResponse
from core.integration.assembly_contracts import (
    AssemblyManifest,
    AssemblyRuntimeStamp,
    BlueprintContract,
    validate_blueprint,
    validate_manifest,
    validate_manifest_against_blueprint,
)
from core.logging import log_event

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _assembler_cli_dir() -> Path:
    """SoT: ``services/empery_assembler/tools/assembler`` (no legacy EIC fallback)."""
    preferred = (
        _REPO_ROOT / "services" / "empery_assembler" / "tools" / "assembler"
    )
    if (preferred / "assemble.mjs").is_file():
        return preferred
    raise ServiceError(
        StandardizedErrorResponse(
            error_code="EIC_ASSEMBLY_CLI_MISSING",
            message=(
                "assemble.mjs missing under services/empery_assembler/tools/assembler "
                "(canonical Assembler CLI SoT)"
            ),
            details={"cli_dir": str(preferred)},
        ),
        http_status=500,
    )


def _assemble_js() -> Path:
    return _assembler_cli_dir() / "assemble.mjs"


def _pascal(service_name: str) -> str:
    return "".join(part.capitalize() for part in service_name.split("_"))


def _kebab(service_name: str) -> str:
    return service_name.replace("_", "-")


def stamp_assembly_runtime(
    workspace: Path,
    *,
    blueprint: BlueprintContract,
    manifest: AssemblyManifest,
    logger: logging.Logger | None = None,
    assembler_version: str = "v1",
) -> str:
    """Write services/{name}/assembly_runtime.json from validated Manifest."""
    service = blueprint.service_name
    capsule = workspace / "services" / service
    capsule.mkdir(parents=True, exist_ok=True)
    composition_ids = [c.component_id for c in manifest.composition]
    data_sources = sorted(
        {
            str(c.data_source)
            for c in manifest.composition
            if c.data_source
        }
        | {
            m.data_path
            for c in manifest.composition
            for m in c.mapping
            if m.source_type == "dynamic" and m.data_path
        }
    )
    stamp = AssemblyRuntimeStamp(
        service_name=service,
        blueprint_id=manifest.blueprint_id,
        blueprint_version=manifest.blueprint_version,
        target_module=manifest.target_module.value,
        scaffold_profile=blueprint.scaffold_profile,
        composition_ids=composition_ids,
        data_sources=[s for s in data_sources if s],
        assembler_version=assembler_version,
        widget_count=len(manifest.composition),
    )
    path = capsule / "assembly_runtime.json"
    path.write_text(
        json.dumps(stamp.model_dump(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    if logger is not None:
        log_event(
            logger,
            event="eic.assembler.runtime_stamped",
            message="assembly_runtime.json written",
            service_name=service,
            widget_count=stamp.widget_count,
            assembler_version=assembler_version,
        )
    return str(path.relative_to(workspace)).replace("\\", "/")


def ensure_assembler_cli_deps(*, logger: logging.Logger | None = None) -> None:
    """npm install once under tools/assembler if node_modules missing."""
    node_modules = _assembler_cli_dir() / "node_modules"
    if node_modules.is_dir():
        return
    npm = shutil.which("npm")
    if not npm:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_ASSEMBLY_CLI_FAILED",
                message="npm not found — cannot install Assembler CLI deps",
                details={"cli_dir": str(_assembler_cli_dir())},
            ),
            http_status=500,
        )
    proc = subprocess.run(
        [npm, "install", "--no-fund", "--no-audit"],
        cwd=str(_assembler_cli_dir()),
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if proc.returncode != 0:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_ASSEMBLY_CLI_FAILED",
                message="npm install failed for Assembler CLI",
                details={"stderr": (proc.stderr or "")[:500]},
            ),
            http_status=500,
        )
    if logger is not None:
        log_event(
            logger,
            event="eic.assembler.cli_deps_installed",
            message="Assembler CLI npm deps installed",
        )


def invoke_assembler_cli(
    *,
    manifest_path: Path,
    target_path: Path,
    out_path: Path | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    """Run Node assemble.mjs against one TSX target."""
    if not _assemble_js().is_file():
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_ASSEMBLY_CLI_FAILED",
                message=f"Assembler CLI missing: {_assemble_js()}",
                details={},
            ),
            http_status=500,
        )
    ensure_assembler_cli_deps(logger=logger)
    node = shutil.which("node")
    if not node:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_ASSEMBLY_CLI_FAILED",
                message="node not found for Assembler CLI",
                details={},
            ),
            http_status=500,
        )
    out = out_path or target_path
    cmd = [
        node,
        str(_assemble_js()),
        "--manifest",
        str(manifest_path),
        "--target",
        str(target_path),
        "--out",
        str(out),
    ]
    proc = subprocess.run(
        cmd,
        cwd=str(_assembler_cli_dir()),
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
        env={**os.environ},
    )
    raw = (proc.stdout or "").strip() or (proc.stderr or "").strip()
    try:
        payload = json.loads(raw.splitlines()[-1] if raw else "{}")
    except json.JSONDecodeError:
        payload = {"ok": False, "error": raw[:500]}
    if proc.returncode != 0 or not payload.get("ok"):
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_ASSEMBLY_CLI_FAILED",
                message=str(payload.get("error") or "Assembler CLI failed"),
                details={
                    "target": str(target_path),
                    "stderr": (proc.stderr or "")[:400],
                },
            ),
            http_status=422,
        )
    if logger is not None:
        log_event(
            logger,
            event="eic.assembler.slot_injected",
            message="Manifest injected into UI slot",
            target=str(target_path),
            widget_count=payload.get("widget_count"),
        )
    return payload


def run_tsc_check(
    app_root: Path,
    *,
    logger: logging.Logger | None = None,
) -> None:
    """Fail-closed TypeScript check after inject → EIC_ASSEMBLY_TSC_FAILED."""
    npm = shutil.which("npm")
    if not npm:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_ASSEMBLY_TSC_FAILED",
                message="npm not found for tsc gate",
                details={"app_root": str(app_root)},
            ),
            http_status=500,
        )
    if not (app_root / "package.json").is_file():
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_ASSEMBLY_TSC_FAILED",
                message=f"No package.json under {app_root}",
                details={},
            ),
            http_status=422,
        )
    if (app_root / "node_modules").is_dir():
        cmd = [npm, "run", "typecheck", "--silent"]
    else:
        npx = shutil.which("npx")
        if not npx:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_ASSEMBLY_TSC_FAILED",
                    message="npx not found and node_modules missing",
                    details={"app_root": str(app_root)},
                ),
                http_status=500,
            )
        cmd = [npx, "--yes", "typescript@5", "tsc", "--noEmit", "-p", str(app_root)]
    proc = subprocess.run(
        cmd,
        cwd=str(app_root),
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if proc.returncode != 0:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_ASSEMBLY_TSC_FAILED",
                message="Post-inject TypeScript check failed",
                details={
                    "app_root": str(app_root),
                    "stderr": (proc.stderr or proc.stdout or "")[:800],
                },
            ),
            http_status=422,
        )
    if logger is not None:
        log_event(
            logger,
            event="eic.assembler.tsc_ok",
            message="Post-inject tsc passed",
            app_root=str(app_root),
        )


def resolve_assembly_ui_targets(
    workspace: Path, service_name: str
) -> list[Path]:
    """Desktop mount + ECC page paths for Dashboard_Standard inject."""
    pascal = _pascal(service_name)
    kebab = _kebab(service_name)
    targets = [
        workspace
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service_name}.tsx",
        workspace
        / "apps"
        / "empery_control_center"
        / "src"
        / "features"
        / kebab
        / f"{pascal}Page.tsx",
    ]
    return [p for p in targets if p.is_file()]


def run_assembler_v0(
    workspace: Path,
    *,
    blueprint: BlueprintContract | dict[str, Any],
    manifest: AssemblyManifest | dict[str, Any],
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    """Validate contracts and stamp runtime only."""
    bp = validate_blueprint(blueprint)
    mf = validate_manifest(manifest)
    try:
        validate_manifest_against_blueprint(mf, bp)
    except ValueError as exc:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_MANIFEST_INVALID",
                message=str(exc),
                details={
                    "service_name": bp.service_name,
                    "blueprint_version": bp.version,
                },
            ),
            http_status=422,
        ) from exc
    rel = stamp_assembly_runtime(
        workspace,
        blueprint=bp,
        manifest=mf,
        logger=logger,
        assembler_version="v0",
    )
    return {
        "ok": True,
        "written": [rel],
        "service_name": bp.service_name,
        "widget_count": len(mf.composition),
        "assembler_version": "v0",
    }


def run_assembler_v1(
    workspace: Path,
    *,
    blueprint: BlueprintContract | dict[str, Any],
    manifest: AssemblyManifest | dict[str, Any],
    manifest_path: Path,
    logger: logging.Logger | None = None,
    run_tsc: bool = True,
) -> dict[str, Any]:
    """Stamp + AST inject into mount/ECC page + optional tsc gate."""
    bp = validate_blueprint(blueprint)
    mf = validate_manifest(manifest)
    try:
        validate_manifest_against_blueprint(mf, bp)
    except ValueError as exc:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_MANIFEST_INVALID",
                message=str(exc),
                details={
                    "service_name": bp.service_name,
                    "blueprint_version": bp.version,
                },
            ),
            http_status=422,
        ) from exc

    written: list[str] = []
    stamp_rel = stamp_assembly_runtime(
        workspace,
        blueprint=bp,
        manifest=mf,
        logger=logger,
        assembler_version="v1",
    )
    written.append(stamp_rel)

    targets = resolve_assembly_ui_targets(workspace, bp.service_name)
    if not targets and logger is not None:
        log_event(
            logger,
            event="eic.assembler.no_ui_targets",
            message="No mount/page yet for AST inject (scaffold may still run)",
            service_name=bp.service_name,
            level=logging.WARNING,
        )
    for target in targets:
        invoke_assembler_cli(
            manifest_path=manifest_path,
            target_path=target,
            logger=logger,
        )
        rel = str(target.relative_to(workspace)).replace("\\", "/")
        if rel not in written:
            written.append(rel)

    # Gate T baseline — hash freeze Assembler output (+ golden lib).
    from core.assembly.gates import (
        write_assembly_freeze,
    )

    freeze_path = write_assembly_freeze(workspace, bp.service_name)
    freeze_rel = str(freeze_path.relative_to(workspace)).replace("\\", "/")
    if freeze_rel not in written:
        written.append(freeze_rel)

    # Phase 6: inventory SoT (paths + sha256) — shared FS until content-transfer.
    from core.assembly.artifact_bundle import (
        artifact_bundle_rel,
        build_written_inventory,
        write_artifact_bundle,
    )

    write_artifact_bundle(
        workspace,
        service_name=bp.service_name,
        written_relpaths=written,
        assembler_version="v1",
        widget_count=len(mf.composition),
    )
    bundle_rel = artifact_bundle_rel(bp.service_name)
    if bundle_rel not in written:
        written.append(bundle_rel)
    written_artifacts = build_written_inventory(workspace, written)

    if run_tsc and targets:
        apps_touched: set[Path] = set()
        for target in targets:
            if "empery_desktop" in str(target):
                apps_touched.add(workspace / "apps" / "empery_desktop")
            if "empery_control_center" in str(target):
                apps_touched.add(workspace / "apps" / "empery_control_center")
        for app in apps_touched:
            run_tsc_check(app, logger=logger)

    return {
        "ok": True,
        "written": written,
        "written_artifacts": written_artifacts,
        "artifact_bundle_relpath": bundle_rel,
        "service_name": bp.service_name,
        "widget_count": len(mf.composition),
        "assembler_version": "v1",
        "targets": [str(t) for t in targets],
    }


def verify_assembly_contract_gate(
    workspace: Path,
    service_name: str,
    *,
    designs_root: Path | None = None,
    eic_root: Path | None = None,
) -> tuple[str, str]:
    """Gate C: Blueprint ↔ Manifest ↔ assembly_runtime coverage."""
    from core.integration.assembly_contracts import (
        is_config_driven_profile,
    )

    bp_path = None
    mf_path = None
    if designs_root is not None:
        bp_path = designs_root / f"{service_name}_blueprint.json"
    else:
        for candidate in (
            workspace
            / ".cursor"
            / "orchestration"
            / "designs"
            / f"{service_name}_blueprint.json",
            workspace / "orchestration" / "designs" / f"{service_name}_blueprint.json",
        ):
            if candidate.is_file():
                bp_path = candidate
                break
    if eic_root is not None:
        mf_path = eic_root / "assembly" / f"{service_name}_manifest.json"
    else:
        for candidate in (
            workspace
            / ".cursor"
            / "orchestration"
            / "eic"
            / "assembly"
            / f"{service_name}_manifest.json",
            workspace
            / "orchestration"
            / "eic"
            / "assembly"
            / f"{service_name}_manifest.json",
        ):
            if candidate.is_file():
                mf_path = candidate
                break

    runtime_path = workspace / "services" / service_name / "assembly_runtime.json"

    if bp_path is None or not bp_path.is_file():
        design_json = None
        for candidate in (
            workspace
            / ".cursor"
            / "orchestration"
            / "designs"
            / f"{service_name}_design.json",
            workspace / "orchestration" / "designs" / f"{service_name}_design.json",
        ):
            if candidate.is_file():
                design_json = candidate
                break
        if design_json is not None:
            try:
                data = json.loads(design_json.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                data = {}
            asm = data.get("assembly") if isinstance(data, dict) else None
            profile = ""
            mode = ""
            if isinstance(asm, dict):
                profile = str(asm.get("scaffold_profile") or "")
                mode = str(asm.get("assembly_mode") or "")
            if mode == "config_driven" or is_config_driven_profile(profile):
                return (
                    "FAILED",
                    "Gate C: config_driven profile but missing "
                    f"{service_name}_blueprint.json",
                )
        return "SKIPPED", "Gate C: no blueprint (legacy assembly)"

    try:
        blueprint = validate_blueprint(
            json.loads(bp_path.read_text(encoding="utf-8"))
        )
    except Exception as exc:
        return "FAILED", f"Gate C: invalid Blueprint: {exc}"

    if blueprint.assembly_mode != "config_driven" and not is_config_driven_profile(
        blueprint.scaffold_profile
    ):
        return "SKIPPED", "Gate C: Blueprint not config_driven"

    if mf_path is None or not mf_path.is_file():
        return (
            "FAILED",
            f"Gate C: missing Manifest at eic/assembly/{service_name}_manifest.json",
        )
    try:
        manifest = validate_manifest(
            json.loads(mf_path.read_text(encoding="utf-8"))
        )
        validate_manifest_against_blueprint(manifest, blueprint)
    except Exception as exc:
        return "FAILED", f"Gate C: Manifest invalid vs Blueprint: {exc}"

    if not runtime_path.is_file():
        return (
            "FAILED",
            "Gate C: missing assembly_runtime.json (Assembler did not stamp)",
        )
    try:
        runtime = json.loads(runtime_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return "FAILED", f"Gate C: unreadable assembly_runtime.json: {exc}"

    if not isinstance(runtime, dict):
        return "FAILED", "Gate C: assembly_runtime.json is not an object"

    ids = runtime.get("composition_ids") or []
    widget_count = int(runtime.get("widget_count") or 0)
    if not ids or widget_count < 1:
        return (
            "FAILED",
            "Gate C: empty assembly_runtime composition (empty config / empty div case)",
        )
    expected = {c.component_id for c in manifest.composition}
    actual = set(ids) if isinstance(ids, list) else set()
    missing = expected - actual
    if missing:
        return (
            "FAILED",
            f"Gate C: runtime missing composition ids {sorted(missing)}",
        )
    if widget_count != len(manifest.composition):
        return (
            "FAILED",
            f"Gate C: widget_count={widget_count} != "
            f"manifest composition len={len(manifest.composition)}",
        )
    mount = (
        workspace
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service_name}.tsx"
    )
    if mount.is_file() and 'data-assembler-slot="widgets"' not in mount.read_text(
        encoding="utf-8"
    ):
        return "FAILED", "Gate C: mount missing assembler widgets slot"
    return (
        "PASSED",
        f"Gate C OK: {widget_count} widgets; Blueprint {blueprint.version} ↔ Manifest ↔ runtime",
    )
