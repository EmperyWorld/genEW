"""
Scavenger - Write prepared Python bundles to the EWGen workspace
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.importer.naming import to_kebab, validate_module_name

from .integration_validate import validate_scavenger_integration
from .manifest_index import register_scavenger_import_index


def _project_root() -> Path:
    return Path(__file__).parent.parent.parent


def _normalize_path(path: str) -> str:
    return path.replace("\\", "/").lstrip("/")


def _is_allowed_materialize_path(path: str, kebab: str) -> bool:
    normalized = _normalize_path(path)
    parts = normalized.split("/")
    if ".." in parts or not normalized:
        return False

    bundle_root = f"generators/imported_python/{kebab}/"
    if normalized.startswith(bundle_root):
        return True
    if normalized == f"manifests/imported-python-{kebab}.manifest.json":
        return True
    if normalized.startswith(f"snippets/imported-python-{kebab}."):
        return True
    return False


def materialize_scavenger_bundle(
    module_name: str,
    files: List[Dict[str, str]],
    overwrite: bool = False,
    register_manifest: bool = False,
    project_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Write scavenger bundle files under generators/imported_python/, manifests/, snippets/.
    """
    name_error = validate_module_name(module_name)
    if name_error:
        raise ValueError(name_error)

    if not files:
        raise ValueError("No files to materialize")

    root = project_root or _project_root()
    kebab = to_kebab(module_name)
    bundle_dir = root / "generators" / "imported_python" / kebab

    allowed_files: List[Dict[str, str]] = []
    rejected_paths: List[str] = []

    for file in files:
        path = _normalize_path(str(file.get("path", "")))
        if not path:
            continue
        if _is_allowed_materialize_path(path, kebab):
            allowed_files.append({
                "path": path,
                "content": str(file.get("content", "")),
            })
        else:
            rejected_paths.append(path)

    if rejected_paths:
        preview = ", ".join(rejected_paths[:5])
        suffix = "..." if len(rejected_paths) > 5 else ""
        raise ValueError(f"Rejected paths outside scavenger bundle scope: {preview}{suffix}")

    if not allowed_files:
        raise ValueError("No materializable paths in bundle files")

    if bundle_dir.exists() and not overwrite:
        raise ValueError(
            f"Bundle directory already exists: generators/imported_python/{kebab} "
            "(use overwrite=true to replace)"
        )

    written: List[str] = []
    for file in allowed_files:
        target = root / file["path"]
        if target.exists() and not overwrite and target.is_file():
            raise ValueError(f"File already exists: {file['path']} (use overwrite=true)")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(file["content"], encoding="utf-8")
        written.append(file["path"])

    index_registration: Optional[Dict[str, Any]] = None
    if register_manifest:
        index_registration = register_scavenger_import_index(
            module_name=module_name,
            files=allowed_files,
            overwrite=overwrite,
            project_root=root,
        )
        index_path = index_registration.get("indexPath")
        if index_path and index_path not in written:
            written.append(index_path)

    validation = validate_scavenger_integration(module_name.strip(), project_root=root)

    return {
        "moduleName": module_name.strip(),
        "kebabName": kebab,
        "importRoot": f"generators/imported_python/{kebab}",
        "writtenCount": len(written),
        "writtenPaths": written,
        "overwrite": overwrite,
        "registerManifest": register_manifest,
        "indexRegistration": index_registration,
        "integrationValidation": validation,
    }
