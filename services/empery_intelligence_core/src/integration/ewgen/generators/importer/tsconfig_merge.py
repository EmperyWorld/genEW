"""
Fortune Seaker - TSConfig Paths Merge Snippet
Paste-ready paths block for tsconfig.json
"""

import json
from typing import Dict

from .naming import to_kebab


def build_tsconfig_merge_snippet(module_name: str) -> Dict[str, str]:
    """
    Build merge-ready paths snippet for tsconfig.json compilerOptions.paths.
    """
    kebab_name = to_kebab(module_name)
    alias = f"@imported/{kebab_name}"
    paths = {
        f"{alias}/*": [f"./src/imported/{kebab_name}/*"],
    }

    payload = {
        "paths": paths,
        "target": "tsconfig.json → compilerOptions.paths",
        "instruction": "Merge paths into existing compilerOptions.paths without removing other aliases",
    }

    return {
        "path": f"tsconfig.merge-imported-{kebab_name}.json",
        "content": json.dumps(payload, indent=2, ensure_ascii=False),
        "language": "json",
        "description": "Merge-ready tsconfig paths for imported module",
    }
