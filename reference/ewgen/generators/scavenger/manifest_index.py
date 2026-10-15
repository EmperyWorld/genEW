"""
Scavenger - manifests/scavenger-imports.json read/write and registration
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.importer.naming import to_kebab, validate_module_name


def _project_root() -> Path:
    return Path(__file__).parent.parent.parent


def scavenger_imports_path(project_root: Optional[Path] = None) -> Path:
    root = project_root or _project_root()
    return root / "manifests" / "scavenger-imports.json"


def load_scavenger_imports_index(project_root: Optional[Path] = None) -> Dict[str, Any]:
    """
    Load the imports map from manifests/scavenger-imports.json.
    """
    index_path = scavenger_imports_path(project_root)
    if not index_path.exists():
        return {}
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    imports = data.get("imports")
    return dict(imports) if isinstance(imports, dict) else {}


def save_scavenger_imports_index(
    imports: Dict[str, Any],
    project_root: Optional[Path] = None,
) -> Path:
    """
    Persist manifests/scavenger-imports.json with sorted import entries.
    """
    index_path = scavenger_imports_path(project_root)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "imports": dict(sorted(imports.items())),
    }
    index_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return index_path


def build_index_entry(
    module_name: str,
    import_manifest: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Build a single scavenger-imports index entry from an import manifest.
    """
    kebab = to_kebab(module_name)
    return {
        "moduleName": import_manifest.get("moduleName", module_name),
        "moduleType": import_manifest.get("moduleType", "imported"),
        "importRoot": import_manifest.get(
            "importRoot",
            f"generators/imported_python/{kebab}",
        ),
        "manifestPath": f"manifests/imported-python-{kebab}.manifest.json",
        "track": import_manifest.get("track", "scavenger"),
        "source": import_manifest.get("source", "zip"),
        "registeredAt": datetime.now(timezone.utc).isoformat(),
    }


def _normalize_path(path: str) -> str:
    return path.replace("\\", "/").lstrip("/")


def manifest_from_files(
    files: List[Dict[str, str]],
    kebab: str,
) -> Optional[Dict[str, Any]]:
    """
    Extract import manifest JSON from prepared bundle files.
    """
    manifest_path = f"manifests/imported-python-{kebab}.manifest.json"
    for file in files:
        path = _normalize_path(str(file.get("path", "")))
        if path != manifest_path:
            continue
        content = str(file.get("content", "")).strip()
        if not content:
            return None
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def register_scavenger_import_index(
    module_name: str,
    import_manifest: Optional[Dict[str, Any]] = None,
    files: Optional[List[Dict[str, str]]] = None,
    overwrite: bool = False,
    project_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Register or update a Python scavenger bundle in manifests/scavenger-imports.json.
    """
    name_error = validate_module_name(module_name)
    if name_error:
        raise ValueError(name_error)

    kebab = to_kebab(module_name)
    manifest = import_manifest
    if manifest is None and files:
        manifest = manifest_from_files(files, kebab)

    root = project_root or _project_root()
    if manifest is None:
        manifest_path = root / "manifests" / f"imported-python-{kebab}.manifest.json"
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid manifest JSON: {manifest_path}") from error

    if not manifest or not isinstance(manifest, dict):
        raise ValueError(
            f"Import manifest not found for {module_name} — materialize manifest first"
        )

    imports = load_scavenger_imports_index(root)
    already_registered = kebab in imports
    if already_registered and not overwrite:
        raise ValueError(
            f"Already registered in manifests/scavenger-imports.json: {kebab} "
            "(use overwrite=true to update)"
        )

    entry = build_index_entry(module_name, manifest)
    imports[kebab] = entry
    index_path = save_scavenger_imports_index(imports, root)

    return {
        "kebabName": kebab,
        "indexPath": str(index_path.relative_to(root)).replace("\\", "/"),
        "registered": True,
        "updated": already_registered,
        "entry": entry,
    }
