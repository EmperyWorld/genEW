"""
Fortune Seaker - Import Manifest Writer
"""

import json
from typing import Any, Dict

from .naming import to_kebab


def build_manifest_file(
    import_manifest: Dict[str, Any],
    module_name: str,
) -> Dict[str, str]:
    """
    Build manifest GeneratedFile entry for prepared import bundle.
    """
    kebab_name = to_kebab(module_name)
    path = f"manifests/imported-{kebab_name}.manifest.json"
    content = json.dumps(import_manifest, indent=2, ensure_ascii=False)

    return {
        "path": path,
        "content": content,
        "language": "json",
        "description": "Fortune Seaker import manifest",
    }
