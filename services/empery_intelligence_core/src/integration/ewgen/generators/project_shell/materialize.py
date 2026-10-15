# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Materialize N-way project shell: copy SET-base + write module slots.
# Invariants:
# - Overwrite only when overwrite=True; never touches set-runtime/.
# - Stage 11: docs/db hydrate from catalog when catalogId set; else stub.
# Related:
# - generators/set/bootstrap.py
# - generators/set/install.py (_write_files pattern)
# - generators/project_shell/deep_contracts.py
# ---

"""Materialize project shell trees under data/project-shells/."""

from __future__ import annotations

import json
import shutil
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.importer.catalog import get_import_catalog
from generators.scavenger.catalog import get_scavenger_catalog
from generators.set.paths import template_root
from generators.set.router_mount import build_set_module_router
from generators.warsmith.catalog import get_warsmith_catalog
from generators.warsmith.compose import hydrate_warsmith_entry

from .paths import project_shell_path, project_shells_root


def _normalize_path(path: str) -> str:
    return path.replace("\\", "/").lstrip("/")


def _write_files(
    base_dir: Path,
    files: List[Dict[str, str]],
) -> int:
    written = 0
    for file in files:
        rel = _normalize_path(str(file.get("path", "")))
        if not rel:
            continue
        target = base_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(str(file.get("content", "")), encoding="utf-8")
        written += 1
    return written


def _copy_set_base(dest: Path, *, overwrite: bool) -> None:
    template = template_root()
    if not template.exists():
        raise FileNotFoundError(f"SET template not found: {template}")
    if dest.exists():
        if not overwrite:
            raise FileExistsError(f"Project shell already exists: {dest}")
        shutil.rmtree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(template, dest)
    env_example = dest / ".env.example"
    env_file = dest / ".env"
    if env_example.exists() and not env_file.exists():
        shutil.copy(env_example, env_file)


def _load_catalog_entry(
    catalog_source: str,
    catalog_id: str,
) -> Dict[str, Any]:
    if catalog_source == "importer":
        entry = get_import_catalog().get_entry(catalog_id)
    elif catalog_source == "scavenger":
        entry = get_scavenger_catalog().get_entry(catalog_id)
    elif catalog_source == "warsmith":
        raw = get_warsmith_catalog().get_entry(catalog_id)
        entry = hydrate_warsmith_entry(raw) if raw else None
    else:
        raise ValueError(f"Unknown catalogSource: {catalog_source}")
    if not entry:
        raise ValueError(
            f"Catalog entry not found: {catalog_source}/{catalog_id}"
        )
    return entry


def _fe_stub(module_id: str, display_name: str) -> str:
    return textwrap.dedent(
        f"""
        export function ProjectShellModule() {{
          return (
            <div>
              <h1>{display_name}</h1>
              <p>Project shell slot · {module_id}</p>
            </div>
          );
        }}
        """
    ).strip() + "\n"


def _docs_stub(display_name: str) -> str:
    return f"# {display_name}\n\nDocs placeholder (no catalog hydrate).\n"


def _db_stub(module_id: str) -> str:
    return (
        f"-- {module_id} placeholder migration (no catalog hydrate)\n"
        f"-- Stage 11 wires real SQL when catalogId is set.\n"
        f"SELECT 1;\n"
    )


def _hydrate_docs_or_db_from_catalog(
    module_root: Path,
    module: Dict[str, Any],
    *,
    role: str,
    warnings: List[str],
) -> int:
    """Hydrate docs/db slots from scavenger/importer catalog when catalogId set."""
    catalog_id = module.get("catalogId")
    if not catalog_id:
        return 0
    source = str(module.get("catalogSource") or "scavenger").strip().lower()
    if source not in {"scavenger", "importer", "warsmith"}:
        source = "scavenger"
    entry = _load_catalog_entry(source, str(catalog_id))
    files = list(entry.get("files") or [])
    if role == "docs":
        docs_dir = module_root / "docs"
        docs_dir.mkdir(parents=True, exist_ok=True)
        written = 0
        for file in files:
            path = str(file.get("path") or "")
            content = str(file.get("content") or "")
            if not path:
                continue
            lower = path.lower()
            if not (
                lower.endswith(".md")
                or "doc" in lower
                or lower.endswith(".rst")
                or lower.endswith(".txt")
            ):
                continue
            name = Path(path).name
            (docs_dir / name).write_text(content, encoding="utf-8")
            written += 1
        if written == 0:
            # Fall back: write first few text files as docs artifacts
            for file in files[:5]:
                path = str(file.get("path") or "")
                if not path:
                    continue
                name = Path(path).name
                (docs_dir / name).write_text(
                    str(file.get("content") or ""),
                    encoding="utf-8",
                )
                written += 1
        if written == 0:
            warnings.append(
                f"{module['moduleId']}: docs catalog empty — stub README"
            )
            (docs_dir / "README.md").write_text(
                _docs_stub(module["displayName"]),
                encoding="utf-8",
            )
        return written

    db_dir = module_root / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for file in files:
        path = str(file.get("path") or "")
        content = str(file.get("content") or "")
        if not path:
            continue
        lower = path.lower()
        if not (
            lower.endswith(".sql")
            or "migration" in lower
            or "alembic" in lower
            or (
                lower.endswith(".py")
                and ("model" in lower or "schema" in lower)
            )
        ):
            continue
        name = Path(path).name
        (db_dir / name).write_text(content, encoding="utf-8")
        written += 1
    if written == 0:
        warnings.append(
            f"{module['moduleId']}: db catalog had no SQL/migration — stub"
        )
        (db_dir / "001_placeholder.sql").write_text(
            _db_stub(module["moduleId"]),
            encoding="utf-8",
        )
    return written


def _install_module_slot(
    shell_root: Path,
    module: Dict[str, Any],
    *,
    warnings: List[str],
) -> Dict[str, Any]:
    module_id = module["moduleId"]
    role = module["role"]
    display_name = module["displayName"]
    module_root = shell_root / "modules" / module_id
    module_root.mkdir(parents=True, exist_ok=True)

    fe_written = 0
    be_written = 0
    mount_mode = "stub"
    source = f"project-shell:{role}"

    if role in {"docs", "db"}:
        if module.get("catalogId"):
            written = _hydrate_docs_or_db_from_catalog(
                module_root,
                module,
                role=role,
                warnings=warnings,
            )
            source = str(module.get("catalogSource") or "scavenger")
            if role == "docs":
                fe_written = written
            else:
                be_written = written
        elif role == "docs":
            docs_dir = module_root / "docs"
            docs_dir.mkdir(parents=True, exist_ok=True)
            (docs_dir / "README.md").write_text(
                _docs_stub(display_name),
                encoding="utf-8",
            )
            warnings.append(
                f"{module_id}: {role} placeholder only (no catalog hydrate)"
            )
        else:
            db_dir = module_root / "db"
            db_dir.mkdir(parents=True, exist_ok=True)
            (db_dir / "001_placeholder.sql").write_text(
                _db_stub(module_id),
                encoding="utf-8",
            )
            warnings.append(
                f"{module_id}: {role} placeholder only (no catalog hydrate)"
            )
    elif role == "ui":
        entry = _load_catalog_entry("importer", module["catalogId"])
        files = list(entry.get("files") or [])
        fe_root = module_root / "frontend"
        fe_written = _write_files(fe_root, files)
        (fe_root / "ProjectShellStub.tsx").write_text(
            _fe_stub(module_id, display_name),
            encoding="utf-8",
        )
        source = "importer"
    elif role == "api":
        entry = _load_catalog_entry("scavenger", module["catalogId"])
        files = list(entry.get("files") or [])
        be_root = module_root / "backend"
        be_written = _write_files(be_root, files)
        router_build = build_set_module_router(
            module_id,
            display_name,
            files,
            [],
        )
        (be_root / "router.py").write_text(
            router_build["content"],
            encoding="utf-8",
        )
        mount_mode = str(router_build.get("mountMode", "stub"))
        source = "scavenger"
        if mount_mode == "stub":
            warnings.append(
                f"{module_id}: backend mountMode=stub "
                "(resolver may upgrade mount)"
            )
    elif role == "fullstack":
        entry = _load_catalog_entry("warsmith", module["catalogId"])
        layers = entry.get("layers") or {}
        fe_files = list((layers.get("frontend") or {}).get("files") or [])
        be_files = list((layers.get("backend") or {}).get("files") or [])
        fe_root = module_root / "frontend"
        be_root = module_root / "backend"
        fe_written = _write_files(fe_root, fe_files)
        be_written = _write_files(be_root, be_files)
        router_build = build_set_module_router(
            module_id,
            display_name,
            be_files,
            [],
        )
        (be_root / "router.py").write_text(
            router_build["content"],
            encoding="utf-8",
        )
        mount_mode = str(router_build.get("mountMode", "stub"))
        source = "warsmith"
        if not fe_files:
            warnings.append(
                f"{module_id}: fullstack FE layer empty "
                "(rematerialize / Stage 2 gate)"
            )
    else:
        raise ValueError(f"Unhandled role: {role}")

    manifest = {
        "schemaVersion": "project-shell-1.0.0",
        "moduleId": module_id,
        "displayName": display_name,
        "role": role,
        "source": source,
        "sourceCatalogId": module.get("catalogId"),
        "catalogSource": module.get("catalogSource"),
        "stats": {
            "frontendFiles": fe_written,
            "backendFiles": be_written,
        },
        "runtime": {
            "fe": {"mount": f"/app/{module_id}"},
            "be": {
                "prefix": f"/api/modules/{module_id}",
                "mountMode": mount_mode,
            },
        },
        "installedAt": datetime.now(timezone.utc).isoformat(),
    }
    (module_root / "set.module.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return {
        "moduleId": module_id,
        "displayName": display_name,
        "role": role,
        "source": source,
        "sourceCatalogId": module.get("catalogId"),
        "status": "enabled",
        "fe": {"mount": f"/app/{module_id}"},
        "be": {
            "prefix": f"/api/modules/{module_id}",
            "mountMode": mount_mode,
        },
        "stats": manifest["stats"],
        "runtime": manifest["runtime"],
    }


def _write_registry(
    shell_root: Path,
    registry_entries: List[Dict[str, Any]],
) -> Path:
    registry_path = shell_root / "modules" / "registry.json"
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_path.write_text(
        json.dumps(registry_entries, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return registry_path


def _write_project_readme(
    shell_root: Path,
    manifest: Dict[str, Any],
) -> None:
    lines = [
        f"# {manifest['projectName']}",
        "",
        "EWGen Component Factory Stage 5 — N-way project shell.",
        "",
        "Boot (from this directory):",
        "",
        "```bash",
        "podman compose up -d --build",
        "curl -sf http://127.0.0.1:8100/health",
        "curl -sf http://127.0.0.1:8100/api/modules",
        "```",
        "",
        "Modules:",
        "",
    ]
    for module in manifest["modules"]:
        lines.append(
            f"- `{module['moduleId']}` · role=`{module['role']}` · "
            f"source=`{module.get('catalogSource') or 'placeholder'}`"
        )
    lines.extend(
        [
            "",
            "Notes:",
            "- Export lives under `data/project-shells/` "
            "(does not replace `set-runtime/`).",
            "- Stage 6 integration resolver is not applied; "
            "weak mounts may be stub.",
            "",
        ]
    )
    (shell_root / "PROJECT_SHELL.md").write_text(
        "\n".join(lines),
        encoding="utf-8",
    )


def materialize_project_shell(
    manifest: Dict[str, Any],
    *,
    overwrite: bool = False,
    project_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Copy SET-base and install module slots from a validated manifest.
    """
    project_id = manifest["projectId"]
    shell_root = project_root or project_shell_path(project_id)
    warnings = list(manifest.get("warnings") or [])

    project_shells_root().mkdir(parents=True, exist_ok=True)
    _copy_set_base(shell_root, overwrite=overwrite)

    registry_entries: List[Dict[str, Any]] = []
    written_modules: List[Dict[str, Any]] = []
    for module in manifest["modules"]:
        entry = _install_module_slot(
            shell_root,
            module,
            warnings=warnings,
        )
        registry_entries.append(entry)
        written_modules.append(entry)

    registry_path = _write_registry(shell_root, registry_entries)
    _write_project_readme(shell_root, manifest)

    project_manifest_path = shell_root / "project.manifest.json"
    project_manifest_path.write_text(
        json.dumps(
            {
                **manifest,
                "materializedAt": datetime.now(timezone.utc).isoformat(),
                "projectPath": str(shell_root),
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    boot_ok = (
        (shell_root / "compose.yaml").exists()
        and (shell_root / "backend" / "main.py").exists()
        and (shell_root / "frontend" / "package.json").exists()
        and registry_path.exists()
    )

    return {
        "projectName": manifest["projectName"],
        "projectId": project_id,
        "projectPath": str(shell_root),
        "registryPath": str(registry_path),
        "modules": written_modules,
        "warnings": warnings,
        "bootReady": boot_ok,
        "bootHints": {
            "compose": "podman compose up -d --build",
            "health": "http://127.0.0.1:8100/health",
            "modules": "http://127.0.0.1:8100/api/modules",
        },
    }
