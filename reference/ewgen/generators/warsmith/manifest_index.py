"""
Warsmith - manifests/warsmith-imports.json read/write and registration
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from generators.importer.naming import to_kebab, validate_module_name


def _project_root() -> Path:
    return Path(__file__).parent.parent.parent


def warsmith_imports_path(project_root: Optional[Path] = None) -> Path:
    root = project_root or _project_root()
    return root / "manifests" / "warsmith-imports.json"


def load_warsmith_imports_index(project_root: Optional[Path] = None) -> Dict[str, Any]:
    """
    Load the imports map from manifests/warsmith-imports.json.
    """
    index_path = warsmith_imports_path(project_root)
    if not index_path.exists():
        return {}
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    imports = data.get("imports")
    return dict(imports) if isinstance(imports, dict) else {}


def save_warsmith_imports_index(
    imports: Dict[str, Any],
    project_root: Optional[Path] = None,
) -> Path:
    """
    Persist manifests/warsmith-imports.json with sorted import entries.
    """
    index_path = warsmith_imports_path(project_root)
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


def build_warsmith_index_entry(
    module_name: str,
    manifest: Dict[str, Any],
    frontend_catalog_id: Optional[str] = None,
    backend_catalog_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build a single warsmith-imports index entry from a composite manifest.
    """
    kebab = to_kebab(module_name)
    layers = manifest.get("layers") or {}
    fe_layer = layers.get("frontend") or {}
    be_layer = layers.get("backend") or {}
    fe_name = str(fe_layer.get("moduleName", "Frontend"))
    be_name = str(be_layer.get("moduleName", "Backend"))
    fe_kebab = to_kebab(fe_name)
    be_kebab = to_kebab(be_name)

    return {
        "moduleName": manifest.get("moduleName", module_name),
        "moduleType": manifest.get("moduleType", "fullstack-imported"),
        "sourceRef": manifest.get("sourceRef"),
        "frontendModuleName": fe_name,
        "backendModuleName": be_name,
        "frontendImportRoot": f"src/imported/{fe_kebab}",
        "backendImportRoot": f"generators/imported_python/{be_kebab}",
        "stackRoot": f"fullstack/{kebab}",
        "manifestPath": f"manifests/warsmith-{kebab}.manifest.json",
        "frontendCatalogId": frontend_catalog_id or fe_layer.get("catalogId"),
        "backendCatalogId": backend_catalog_id or be_layer.get("catalogId"),
        "track": "warsmith",
        "registeredAt": datetime.now(timezone.utc).isoformat(),
    }


def register_warsmith_import_index(
    module_name: str,
    manifest: Dict[str, Any],
    frontend_catalog_id: Optional[str] = None,
    backend_catalog_id: Optional[str] = None,
    overwrite: bool = False,
    project_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Register or update a composed fullstack module in manifests/warsmith-imports.json.
    """
    name_error = validate_module_name(module_name)
    if name_error:
        raise ValueError(name_error)

    if not manifest or not isinstance(manifest, dict):
        raise ValueError(f"Composite manifest not found for {module_name}")

    kebab = to_kebab(module_name)
    root = project_root or _project_root()
    imports = load_warsmith_imports_index(root)
    already_registered = kebab in imports
    if already_registered and not overwrite:
        raise ValueError(
            f"Already registered in manifests/warsmith-imports.json: {kebab} "
            "(use overwrite=true to update)"
        )

    entry = build_warsmith_index_entry(
        module_name,
        manifest,
        frontend_catalog_id=frontend_catalog_id,
        backend_catalog_id=backend_catalog_id,
    )
    imports[kebab] = entry
    index_path = save_warsmith_imports_index(imports, root)

    return {
        "kebabName": kebab,
        "indexPath": str(index_path.relative_to(root)).replace("\\", "/"),
        "registered": True,
        "updated": already_registered,
        "entry": entry,
    }
