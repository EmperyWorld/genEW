"""
Warsmith - Composite manifest v1
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from generators.importer.naming import to_kebab

COMPOSITE_SCHEMA_VERSION = 1


def build_composite_manifest(
    module_name: str,
    source_ref: Optional[str],
    frontend_layer: Dict[str, Any],
    backend_layer: Dict[str, Any],
    pairing: Dict[str, Any],
    integration_artifacts: List[str],
    api_base_url: str = "http://localhost:8000",
) -> Dict[str, Any]:
    """
    Build warsmith composite manifest v1.
    """
    kebab = to_kebab(module_name)
    return {
        "schemaVersion": COMPOSITE_SCHEMA_VERSION,
        "moduleName": module_name,
        "moduleType": "fullstack-imported",
        "sourceRef": source_ref,
        "layers": {
            "frontend": frontend_layer,
            "backend": backend_layer,
        },
        "pairing": pairing,
        "integration": {
            "apiBaseUrl": api_base_url,
            "envKeys": ["VITE_API_URL", "EWGEN_API_KEY"],
            "artifacts": integration_artifacts,
        },
        "composedAt": datetime.now(timezone.utc).isoformat(),
        "manifestPath": f"manifests/warsmith-{kebab}.manifest.json",
    }


def build_layer_summary(
    catalog: str,
    catalog_id: str,
    module_name: str,
    file_count: int,
    bundle_quality: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build frontend or backend layer summary for composite manifest.
    """
    quality = bundle_quality or {}
    layer: Dict[str, Any] = {
        "catalog": catalog,
        "catalogId": catalog_id,
        "moduleName": module_name,
        "fileCount": file_count,
    }
    if catalog == "importer":
        import_alias = quality.get("importAlias")
        if import_alias:
            layer["importAlias"] = import_alias
        else:
            layer["importAlias"] = f"@imported/{to_kebab(module_name)}"
    if catalog == "scavenger":
        import_root = quality.get("importRoot")
        if import_root:
            layer["importRoot"] = import_root
        else:
            layer["importRoot"] = f"generators/imported_python/{to_kebab(module_name)}"
    return layer
