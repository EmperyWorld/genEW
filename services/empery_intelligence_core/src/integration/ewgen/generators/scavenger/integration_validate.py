"""
Scavenger - Python bundle integration validation
"""

import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.importer.naming import to_kebab, validate_module_name

from .manifest_index import load_scavenger_imports_index


def _project_root() -> Path:
    return Path(__file__).parent.parent.parent


def _bundle_root(kebab_name: str) -> str:
    return f"generators/imported_python/{kebab_name}"


def _extract_router_prefixes(api_server_content: str) -> List[str]:
    return re.findall(
        r"""prefix\s*=\s*["']([^"']+)["']""",
        api_server_content,
    )


def _suggest_router_prefix(kebab_name: str, api_server_content: str) -> str:
    existing = set(_extract_router_prefixes(api_server_content))
    candidate = f"/api/imported/{kebab_name}"
    suffix = 2
    while candidate in existing:
        candidate = f"/api/imported/{kebab_name}-{suffix}"
        suffix += 1
    return candidate


def _api_server_references_bundle(api_server_content: str, kebab_name: str) -> bool:
    patterns = [
        rf"imported_python/{re.escape(kebab_name)}",
        rf"imported-python-{re.escape(kebab_name)}",
        rf'scavenger-{re.escape(kebab_name)}',
    ]
    return any(re.search(pattern, api_server_content) for pattern in patterns)


def validate_scavenger_integration(
    module_name: str,
    project_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Validate whether a Python scavenger bundle can be integrated without conflicts.
    """
    name_error = validate_module_name(module_name)
    if name_error:
        raise ValueError(name_error)

    root = project_root or _project_root()
    kebab_name = to_kebab(module_name)
    bundle_path = root / _bundle_root(kebab_name)
    api_server_path = root / "api_server.py"

    conflicts: List[str] = []
    warnings: List[str] = []

    bundle_path_exists = bundle_path.exists()
    if bundle_path_exists:
        conflicts.append(
            f"Bundle directory already exists: {_bundle_root(kebab_name)}"
        )

    api_server_referenced = False
    suggested_router_prefix: Optional[str] = None
    if api_server_path.exists():
        api_server_content = api_server_path.read_text(encoding="utf-8")
        api_server_referenced = _api_server_references_bundle(
            api_server_content,
            kebab_name,
        )
        suggested_router_prefix = _suggest_router_prefix(kebab_name, api_server_content)
        if api_server_referenced:
            warnings.append(
                "api_server.py may already reference this scavenger bundle — review includes"
            )
    else:
        warnings.append("api_server.py not found — router mount validation skipped")
        suggested_router_prefix = f"/api/imported/{kebab_name}"

    manifests_dir = root / "manifests"
    manifest_name = f"imported-python-{kebab_name}.manifest.json"
    manifest_path = manifests_dir / manifest_name
    manifest_exists = manifest_path.exists()
    if manifest_exists:
        warnings.append(f"Manifest already exists: manifests/{manifest_name}")

    index_imports = load_scavenger_imports_index(root)
    index_registered = kebab_name in index_imports
    if index_registered:
        warnings.append(
            f"Already registered in manifests/scavenger-imports.json: {kebab_name}"
        )

    passed = len(conflicts) == 0

    return {
        "moduleName": module_name.strip(),
        "importRoot": _bundle_root(kebab_name),
        "kebabName": kebab_name,
        "bundlePathExists": bundle_path_exists,
        "manifestExists": manifest_exists,
        "indexRegistered": index_registered,
        "apiServerReferenced": api_server_referenced,
        "suggestedRouterPrefix": suggested_router_prefix,
        "conflicts": conflicts,
        "warnings": warnings,
        "passed": passed,
    }
