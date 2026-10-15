"""
Fortune Seaker - TSConfig Paths Snippet
Generates path aliases for imported modules
"""

import json
from typing import Dict

from .naming import to_kebab


def build_tsconfig_snippet(module_name: str) -> Dict[str, str]:
    """
    Build tsconfig paths snippet for imported module aliases.
    """
    kebab_name = to_kebab(module_name)
    alias = f"@imported/{kebab_name}"

    snippet = {
        "compilerOptions": {
            "paths": {
                f"{alias}/*": [f"./src/imported/{kebab_name}/*"],
            },
        },
        "_fortuneSeaker": {
            "moduleName": module_name,
            "mergeHint": "Merge compilerOptions.paths into tsconfig.json",
        },
    }

    return {
        "path": f"tsconfig.imported-{kebab_name}.json",
        "content": json.dumps(snippet, indent=2, ensure_ascii=False),
        "language": "json",
        "description": "TSConfig path alias snippet for imported module",
    }
