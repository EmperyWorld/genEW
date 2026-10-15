"""
Warsmith - Materialize composed fullstack modules to the EWGen workspace
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.importer.naming import to_kebab, validate_module_name
from generators.importer.manifest_only import (
    assert_manifest_only_materialize_allowed,
    filter_manifest_only_materialize_files,
    is_workspace_artifact_path,
)
from generators.scavenger.materialize import materialize_scavenger_bundle

from .compose import hydrate_warsmith_entry
from .manifest_index import register_warsmith_import_index


def _project_root() -> Path:
    return Path(__file__).parent.parent.parent


def _normalize_path(path: str) -> str:
    return path.replace("\\", "/").lstrip("/")


def _normalize_frontend_files(
    files: List[Dict[str, str]],
    module_name: str,
) -> List[Dict[str, str]]:
    kebab = to_kebab(module_name)
    bundle_prefix = f"src/imported/{kebab}/"
    normalized: List[Dict[str, str]] = []

    for file in files:
        path = _normalize_path(str(file.get("path", "")))
        if not path:
            continue
        if path.startswith("src/imported/"):
            normalized.append(
                {
                    "path": path,
                    "content": str(file.get("content", "")),
                }
            )
            continue
        if is_workspace_artifact_path(path):
            normalized.append(
                {
                    "path": path,
                    "content": str(file.get("content", "")),
                }
            )
            continue
        if path.startswith("manifests/imported-") or path.startswith(
            "snippets/imported-"
        ):
            normalized.append(
                {
                    "path": path,
                    "content": str(file.get("content", "")),
                }
            )
            continue
        stripped = path.removeprefix("src/").lstrip("/")
        normalized.append(
            {
                "path": f"{bundle_prefix}{stripped}",
                "content": str(file.get("content", "")),
            }
        )

    return normalized


def _is_allowed_frontend_path(path: str, kebab: str) -> bool:
    normalized = _normalize_path(path)
    parts = normalized.split("/")
    if ".." in parts or not normalized:
        return False

    if is_workspace_artifact_path(normalized):
        return True

    bundle_root = f"src/imported/{kebab}/"
    if normalized.startswith(bundle_root):
        return True
    if normalized == f"manifests/imported-{kebab}.manifest.json":
        return True
    if normalized.startswith(f"snippets/imported-{kebab}."):
        return True
    return False


def _normalize_backend_files(
    files: List[Dict[str, str]],
    module_name: str,
) -> List[Dict[str, str]]:
    kebab = to_kebab(module_name)
    bundle_root = f"generators/imported_python/{kebab}/"
    normalized: List[Dict[str, str]] = []

    for file in files:
        path = _normalize_path(str(file.get("path", "")))
        if not path:
            continue
        if path.startswith("generators/imported_python/"):
            normalized.append(
                {
                    "path": path,
                    "content": str(file.get("content", "")),
                }
            )
            continue
        if path.startswith("manifests/imported-python-") or path.startswith(
            "snippets/imported-python-"
        ):
            normalized.append(
                {
                    "path": path,
                    "content": str(file.get("content", "")),
                }
            )
            continue
        normalized.append(
            {
                "path": f"{bundle_root}{path}",
                "content": str(file.get("content", "")),
            }
        )

    return normalized


def _write_files(
    files: List[Dict[str, str]],
    root: Path,
    overwrite: bool,
) -> List[str]:
    written: List[str] = []
    for file in files:
        path = _normalize_path(str(file.get("path", "")))
        if not path:
            continue
        target = root / path
        if target.exists() and not overwrite and target.is_file():
            raise ValueError(f"File already exists: {path} (use overwrite=true)")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(str(file.get("content", "")), encoding="utf-8")
        written.append(path)
    return written


def materialize_frontend_bundle(
    module_name: str,
    files: List[Dict[str, str]],
    overwrite: bool = False,
    project_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Write frontend layer files under src/imported/<kebab>/.
    """
    name_error = validate_module_name(module_name)
    if name_error:
        raise ValueError(name_error)

    if not files:
        raise ValueError("No frontend files to materialize")

    # Runtime FE gate lives in validate_compose / compose_warsmith_module
    # (FE_MANIFEST_ONLY_NO_RUNTIME). This path still strips shadow trees
    # to manifest snapshots (EG-02) and must accept metadata-only writes.

    root = project_root or _project_root()
    kebab = to_kebab(module_name)
    normalized_files = _normalize_frontend_files(files, module_name)
    normalized_files = filter_manifest_only_materialize_files(
        normalized_files,
        module_name,
    )
    assert_manifest_only_materialize_allowed(normalized_files)

    allowed_files: List[Dict[str, str]] = []
    rejected_paths: List[str] = []
    for file in normalized_files:
        path = file["path"]
        if _is_allowed_frontend_path(path, kebab):
            allowed_files.append(file)
        else:
            rejected_paths.append(path)

    if rejected_paths:
        preview = ", ".join(rejected_paths[:5])
        suffix = "..." if len(rejected_paths) > 5 else ""
        raise ValueError(
            f"Rejected frontend paths outside bundle scope: {preview}{suffix}"
        )

    if not allowed_files:
        raise ValueError("No materializable frontend paths in bundle files")

    bundle_dir = root / "src" / "imported" / kebab
    if bundle_dir.exists() and not overwrite:
        raise ValueError(
            f"Frontend bundle directory already exists: src/imported/{kebab} "
            "(use overwrite=true to replace)"
        )

    written = _write_files(allowed_files, root, overwrite)
    return {
        "moduleName": module_name.strip(),
        "kebabName": kebab,
        "importRoot": f"src/imported/{kebab}",
        "writtenCount": len(written),
        "writtenPaths": written,
        "overwrite": overwrite,
    }


def materialize_warsmith_module(
    entry: Dict[str, Any],
    overwrite: bool = False,
    register_manifest: bool = False,
    project_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Materialize a composed Warsmith module: FE, BE, integration pack, composite manifest.
    """
    hydrated = hydrate_warsmith_entry(entry)
    module_name = str(hydrated.get("moduleName", "")).strip()
    name_error = validate_module_name(module_name)
    if name_error:
        raise ValueError(name_error)

    root = project_root or _project_root()
    kebab = to_kebab(module_name)
    layers = hydrated.get("layers") or {}
    fe_layer = layers.get("frontend") or {}
    be_layer = layers.get("backend") or {}
    fe_name = str(fe_layer.get("moduleName", module_name))
    be_name = str(be_layer.get("moduleName", module_name))
    fe_files = fe_layer.get("files") or []
    be_files = be_layer.get("files") or []
    integration_pack = hydrated.get("integrationPack") or {}
    manifest = hydrated.get("manifest") or {}

    if not fe_files:
        raise ValueError("Frontend layer has no files to materialize")
    if not be_files:
        raise ValueError("Backend layer has no files to materialize")

    stack_root = f"fullstack/{kebab}"
    stack_dir = root / stack_root
    if stack_dir.exists() and not overwrite:
        raise ValueError(
            f"Fullstack directory already exists: {stack_root} "
            "(use overwrite=true to replace)"
        )

    frontend_result = materialize_frontend_bundle(
        module_name=fe_name,
        files=fe_files,
        overwrite=overwrite,
        project_root=root,
    )

    backend_normalized = _normalize_backend_files(be_files, be_name)
    backend_result = materialize_scavenger_bundle(
        module_name=be_name,
        files=backend_normalized,
        overwrite=overwrite,
        register_manifest=False,
        project_root=root,
    )

    integration_files: List[Dict[str, str]] = [
        {
            "path": f"{stack_root}/.env.example",
            "content": str(integration_pack.get("envExample", "")),
        },
        {
            "path": f"{stack_root}/docker-compose.yml",
            "content": str(integration_pack.get("dockerCompose", "")),
        },
        {
            "path": f"{stack_root}/INTEGRATION.md",
            "content": str(integration_pack.get("readmeSection", "")),
        },
        {
            "path": f"manifests/warsmith-{kebab}.manifest.json",
            "content": json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        },
    ]

    matched_routes = integration_pack.get("matchedRoutes")
    if matched_routes:
        integration_files.append(
            {
                "path": f"manifests/warsmith-{kebab}.matched-routes.json",
                "content": json.dumps(matched_routes, indent=2, ensure_ascii=False)
                + "\n",
            }
        )

    for snippet in integration_pack.get("aggregatedSnippets") or []:
        path = _normalize_path(str(snippet.get("path", "")))
        if not path:
            continue
        integration_files.append(
            {
                "path": path,
                "content": str(snippet.get("content", "")),
            }
        )

    integration_written = _write_files(integration_files, root, overwrite)

    index_registration: Optional[Dict[str, Any]] = None
    if register_manifest:
        fe_catalog_id = str(fe_layer.get("catalogId", "")) or None
        be_catalog_id = str(be_layer.get("catalogId", "")) or None
        index_registration = register_warsmith_import_index(
            module_name=module_name,
            manifest=manifest,
            frontend_catalog_id=fe_catalog_id,
            backend_catalog_id=be_catalog_id,
            overwrite=overwrite,
            project_root=root,
        )
        index_path = index_registration.get("indexPath")
        if index_path and index_path not in integration_written:
            integration_written.append(index_path)

    all_written = [
        *frontend_result.get("writtenPaths", []),
        *backend_result.get("writtenPaths", []),
        *integration_written,
    ]

    return {
        "moduleName": module_name,
        "kebabName": kebab,
        "stackRoot": stack_root,
        "writtenCount": len(all_written),
        "writtenPaths": all_written,
        "overwrite": overwrite,
        "registerManifest": register_manifest,
        "frontend": frontend_result,
        "backend": backend_result,
        "integrationWritten": integration_written,
        "indexRegistration": index_registration,
    }
