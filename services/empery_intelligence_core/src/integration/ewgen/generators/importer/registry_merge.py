"""
Fortune Seaker - Registry Merge Snippet
Paste-ready MODULE_REGISTRY entry for imported modules
"""

import json
from typing import Any, Dict

from .naming import to_kebab


def build_registry_merge_snippet(
    module_name: str,
    module_type: str,
    import_manifest: Dict[str, Any],
) -> Dict[str, str]:
    """
    Build merge-ready registry entry for MODULE_REGISTRY.
    """
    kebab_name = to_kebab(module_name)
    display_name = import_manifest.get("displayName", module_name)

    entry = {
        "moduleType": module_type,
        "displayName": display_name,
        "description": f"Imported via Fortune Seaker ({import_manifest.get('source', 'zip')})",
        "compatVersion": import_manifest.get("compatVersion", "1.0.0"),
        "configSchema": import_manifest.get(
            "configSchema",
            "schemas/import-manifest.json",
        ),
        "generatorEntrypoint": import_manifest.get(
            "generatorEntrypoint",
            "generators/importer/prepare.py",
        ),
        "previewEntrypoint": import_manifest.get(
            "previewEntrypoint",
            "src/components/Generator/LivePreview.tsx",
        ),
        "exportRules": import_manifest.get(
            "exportRules",
            {"includePackageJson": True, "includeReadme": True},
        ),
    }

    payload = {
        "registryKey": kebab_name,
        "entry": entry,
        "target": "src/registry/moduleRegistry.ts → MODULE_REGISTRY",
        "instruction": f"Add registryKey and entry to MODULE_REGISTRY (paste as '{kebab_name}': {{ ... }})",
    }

    return {
        "path": f"src/registry/snippets/imported-{kebab_name}.registry.merge.json",
        "content": json.dumps(payload, indent=2, ensure_ascii=False),
        "language": "json",
        "description": "Merge-ready moduleRegistry entry for imported module",
    }
