# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Lifecycle for assembled project shells: inventory, registration,
# bank add/update/rework/replace, and repair (Stages 7 + 19).
# Invariants:
# - Updates/rework/replace rotate the previous slot into .history; no delete.
# - Repair delegates contract work to the Stage 6 resolver.
# - Stage 8 Genesis/GKG ingestion is out of scope.
# Related:
# - generators/project_shell/materialize.py
# - generators/project_shell/resolver.py
# - generators/factory/boot_smoke.py
# - generators/project_shell/registry.py
# ---

"""Operator lifecycle for assembled project shells."""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.factory.boot_smoke import run_boot_smoke
from generators.factory.validate_shell import validate_factory_shell

from .manifest import validate_project_manifest
from .materialize import _install_module_slot
from .paths import project_shell_path, project_shells_root
from .registry import get_registration, list_registrations, register_project
from .resolver import resolve_project_shell

PROTOCOL_LIFECYCLE_V1 = "ewgen_project_lifecycle_v1"


def _read_json(path: Path) -> Dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"Required project file missing: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Project file must be an object: {path}")
    return data


def _shell_summary(shell_root: Path) -> Dict[str, Any]:
    manifest = _read_json(shell_root / "project.manifest.json")
    registry_path = shell_root / "modules" / "registry.json"
    modules: List[Dict[str, Any]] = []
    if registry_path.is_file():
        raw = json.loads(registry_path.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            modules = [item for item in raw if isinstance(item, dict)]
    project_id = str(manifest.get("projectId") or shell_root.name)
    registration = get_registration(project_id)
    boot_ready = all(
        path.is_file()
        for path in (
            shell_root / "compose.yaml",
            shell_root / "backend" / "main.py",
            shell_root / "frontend" / "package.json",
            registry_path,
        )
    )
    # ASE Born-Ready shells may omit factory frontend package — accept sidecar
    ase_sidecar = (shell_root / ".ewgen" / "project.json").is_file()
    if ase_sidecar and (shell_root / "compose.yaml").is_file():
        boot_ready = True
    smoke = run_boot_smoke(shell_root)
    lifecycle_status = "healthy"
    if not boot_ready or not smoke.get("ok"):
        lifecycle_status = "needs_repair"
    hint_path = shell_root / ".ewgen" / "upgrade_hint.json"
    upgrade_hint = None
    if hint_path.is_file():
        try:
            upgrade_hint = json.loads(hint_path.read_text(encoding="utf-8"))
            if (
                isinstance(upgrade_hint, dict)
                and upgrade_hint.get("lifecycleStatus") == "upgrade_available"
            ):
                lifecycle_status = "upgrade_available"
        except json.JSONDecodeError:
            upgrade_hint = None
    return {
        "projectId": project_id,
        "projectName": manifest.get("projectName") or project_id,
        "projectPath": str(shell_root),
        "roles": list(manifest.get("roles") or []),
        "moduleCount": len(modules),
        "modules": modules,
        "materializedAt": manifest.get("materializedAt"),
        "registered": registration is not None,
        "registration": registration,
        "bootReady": boot_ready,
        "bootSmoke": smoke,
        "lifecycleStatus": lifecycle_status,
        "needsRepair": lifecycle_status == "needs_repair",
        "upgradeHint": upgrade_hint,
        "upgradeAvailable": lifecycle_status == "upgrade_available",
    }


def list_projects() -> Dict[str, Any]:
    root = project_shells_root()
    projects: List[Dict[str, Any]] = []
    if root.is_dir():
        for shell_root in sorted(root.iterdir()):
            if not shell_root.is_dir():
                continue
            try:
                projects.append(_shell_summary(shell_root))
            except (FileNotFoundError, ValueError, json.JSONDecodeError):
                projects.append(
                    {
                        "projectId": shell_root.name,
                        "projectPath": str(shell_root),
                        "status": "invalid",
                        "bootReady": False,
                    }
                )
    return {
        "protocol": PROTOCOL_LIFECYCLE_V1,
        "success": True,
        "projects": projects,
        "count": len(projects),
        "registrations": list_registrations(),
    }


def get_project(project_id: str) -> Dict[str, Any]:
    shell_root = project_shell_path(project_id.strip())
    if not shell_root.is_dir():
        raise FileNotFoundError(f"Project shell not found: {project_id}")
    return {
        "protocol": PROTOCOL_LIFECYCLE_V1,
        "success": True,
        "project": _shell_summary(shell_root),
        "manifest": _read_json(shell_root / "project.manifest.json"),
    }


def register_shell(
    project_id: str,
    *,
    health_url: Optional[str] = None,
    division_slug: Optional[str] = None,
) -> Dict[str, Any]:
    detail = get_project(project_id)
    project = detail["project"]
    registration = register_project(
        project_id=project_id,
        display_name=str(project.get("projectName") or project_id),
        health_url=health_url,
        division_slug=division_slug,
    )
    return {
        "protocol": PROTOCOL_LIFECYCLE_V1,
        "success": True,
        "projectId": project_id,
        "registration": registration,
    }


def unregister_shell(project_id: str) -> Dict[str, Any]:
    from generators.project_shell.registry import unregister_project

    result = unregister_project(project_id)
    return {
        "protocol": PROTOCOL_LIFECYCLE_V1,
        "success": True,
        **result,
    }


def _write_manifest(shell_root: Path, manifest: Dict[str, Any]) -> None:
    manifest["updatedAt"] = datetime.now(timezone.utc).isoformat()
    (shell_root / "project.manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _upsert_registry_entry(
    shell_root: Path,
    entry: Dict[str, Any],
) -> None:
    path = shell_root / "modules" / "registry.json"
    raw = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else []
    entries = raw if isinstance(raw, list) else []
    entries = [
        item
        for item in entries
        if not (
            isinstance(item, dict)
            and item.get("moduleId") == entry.get("moduleId")
        )
    ]
    entries.append(entry)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(entries, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _rotate_slot(shell_root: Path, module_id: str) -> Optional[str]:
    slot = shell_root / "modules" / module_id
    if not slot.exists():
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = shell_root / ".history" / module_id / stamp
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(slot), str(target))
    return str(target)


def install_bank_module(
    project_id: str,
    module_spec: Dict[str, Any],
    *,
    update: bool = False,
    resolve: bool = True,
    allow_weak_contracts: bool = False,
) -> Dict[str, Any]:
    shell_root = project_shell_path(project_id.strip())
    manifest = _read_json(shell_root / "project.manifest.json")
    existing_modules = [
        item
        for item in manifest.get("modules") or []
        if isinstance(item, dict)
    ]
    module_id = str(module_spec.get("moduleId") or "").strip()
    existing = next(
        (
            item
            for item in existing_modules
            if str(item.get("moduleId") or "") == module_id
        ),
        None,
    )
    if update and existing is None:
        raise ValueError(f"Module not installed: {module_id}")
    if not update and existing is not None:
        raise FileExistsError(f"Module already installed: {module_id}")

    next_modules = [
        item
        for item in existing_modules
        if str(item.get("moduleId") or "") != module_id
    ]
    next_modules.append(module_spec)
    validated = validate_project_manifest(
        {
            "projectName": manifest.get("projectName") or project_id,
            "modules": next_modules,
        }
    )
    normalized = next(
        item
        for item in validated["modules"]
        if item["moduleId"] == module_id
    )

    rotated_path = _rotate_slot(shell_root, module_id) if update else None
    warnings: List[str] = []
    registry_entry = _install_module_slot(
        shell_root,
        normalized,
        warnings=warnings,
    )
    _upsert_registry_entry(shell_root, registry_entry)
    manifest.update(
        {
            "modules": validated["modules"],
            "roles": validated["roles"],
            "warnings": validated["warnings"],
        }
    )
    _write_manifest(shell_root, manifest)

    resolution: Optional[Dict[str, Any]] = None
    if resolve:
        resolution = resolve_project_shell(
            project_path=shell_root,
            allow_weak_contracts=allow_weak_contracts,
        )
    return {
        "protocol": PROTOCOL_LIFECYCLE_V1,
        "success": True,
        "operation": "update" if update else "add",
        "projectId": project_id,
        "module": registry_entry,
        "rotatedPath": rotated_path,
        "warnings": warnings,
        "resolution": resolution,
    }


def _mutation_status(
    shell_root: Path,
    *,
    project_id: str,
    allow_weak_contracts: bool,
    deep: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Stage 19 honest post-mutation status (boot smoke + validate)."""
    summary = _shell_summary(shell_root)
    validation = validate_factory_shell(
        project_path=str(shell_root),
        project_id=project_id,
        boot_ready=bool(summary.get("bootReady")),
        deep=deep or {},
        allow_weak_contracts=allow_weak_contracts,
    )
    status = str(summary.get("lifecycleStatus") or "needs_repair")
    if not validation.get("ok"):
        status = "needs_repair"
    elif allow_weak_contracts and any(
        "weak_deep" in str(w) for w in (validation.get("warnings") or [])
    ):
        status = "weak_contracts"
    return {
        "lifecycleStatus": status,
        "needsRepair": status == "needs_repair",
        "bootSmoke": summary.get("bootSmoke"),
        "validation": {
            "ok": bool(validation.get("ok")),
            "blockers": validation.get("blockers") or [],
            "warnings": validation.get("warnings") or [],
        },
    }


def rework_bank_module(
    project_id: str,
    module_spec: Dict[str, Any],
    *,
    resolve: bool = True,
    allow_weak_contracts: bool = False,
) -> Dict[str, Any]:
    """
    Stage 19: refresh an installed module from bank (update + status).
    """
    result = install_bank_module(
        project_id,
        module_spec,
        update=True,
        resolve=resolve,
        allow_weak_contracts=allow_weak_contracts,
    )
    shell_root = project_shell_path(project_id.strip())
    deep = (result.get("resolution") or {}).get("deep")
    status = _mutation_status(
        shell_root,
        project_id=project_id,
        allow_weak_contracts=allow_weak_contracts,
        deep=deep if isinstance(deep, dict) else {},
    )
    result["operation"] = "rework"
    result.update(status)
    return result


def replace_bank_module(
    project_id: str,
    *,
    target_module_id: str,
    module_spec: Dict[str, Any],
    resolve: bool = True,
    allow_weak_contracts: bool = False,
) -> Dict[str, Any]:
    """
    Stage 19: remove ``target_module_id`` and install a different bank module.
    """
    target = str(target_module_id or "").strip()
    if not target:
        raise ValueError("targetModuleId is required")
    shell_root = project_shell_path(project_id.strip())
    manifest = _read_json(shell_root / "project.manifest.json")
    existing_modules = [
        item
        for item in manifest.get("modules") or []
        if isinstance(item, dict)
    ]
    if not any(
        str(item.get("moduleId") or "") == target for item in existing_modules
    ):
        raise ValueError(f"Module not installed: {target}")

    new_id = str(module_spec.get("moduleId") or "").strip()
    if not new_id:
        raise ValueError("replacement moduleId is required")
    if new_id != target and any(
        str(item.get("moduleId") or "") == new_id for item in existing_modules
    ):
        raise FileExistsError(f"Module already installed: {new_id}")

    rotated_path = _rotate_slot(shell_root, target)
    # Drop target from registry.json
    reg_path = shell_root / "modules" / "registry.json"
    if reg_path.is_file():
        raw = json.loads(reg_path.read_text(encoding="utf-8"))
        entries = raw if isinstance(raw, list) else []
        entries = [
            item
            for item in entries
            if not (
                isinstance(item, dict)
                and str(item.get("moduleId") or "") == target
            )
        ]
        reg_path.write_text(
            json.dumps(entries, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    remaining = [
        item
        for item in existing_modules
        if str(item.get("moduleId") or "") != target
    ]
    manifest["modules"] = remaining
    _write_manifest(shell_root, manifest)

    installed = install_bank_module(
        project_id,
        module_spec,
        update=False,
        resolve=resolve,
        allow_weak_contracts=allow_weak_contracts,
    )
    deep = (installed.get("resolution") or {}).get("deep")
    status = _mutation_status(
        shell_root,
        project_id=project_id,
        allow_weak_contracts=allow_weak_contracts,
        deep=deep if isinstance(deep, dict) else {},
    )
    return {
        "protocol": PROTOCOL_LIFECYCLE_V1,
        "success": True,
        "operation": "replace",
        "projectId": project_id,
        "replacedModuleId": target,
        "module": installed.get("module"),
        "rotatedPath": rotated_path,
        "warnings": list(installed.get("warnings") or []),
        "resolution": installed.get("resolution"),
        **status,
    }


def repair_project(
    project_id: str,
    *,
    allow_weak_contracts: bool = False,
    dry_run: bool = False,
) -> Dict[str, Any]:
    resolution = resolve_project_shell(
        project_id=project_id,
        allow_weak_contracts=allow_weak_contracts,
        dry_run=dry_run,
    )
    shell_root = project_shell_path(project_id.strip())
    deep = (
        resolution.get("deep")
        if isinstance(resolution.get("deep"), dict)
        else {}
    )
    status = _mutation_status(
        shell_root,
        project_id=project_id,
        allow_weak_contracts=allow_weak_contracts,
        deep=deep,
    )
    return {
        "protocol": PROTOCOL_LIFECYCLE_V1,
        "success": True,
        "operation": "repair",
        "projectId": project_id,
        "resolution": resolution,
        **status,
    }
