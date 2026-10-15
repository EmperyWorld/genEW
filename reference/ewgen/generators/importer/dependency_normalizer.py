"""
Fortune Seaker - Dependency Normalizer
Aligns imported package.json dependencies with EWGen pinned versions
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from .naming import to_kebab


EWGEN_PINNED: Dict[str, str] = {
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "react-is": "19.2.0",
    "zustand": "^5.0.0",
    "immer": "^10.0.0",
    "lucide-react": "^0.500.0",
    "framer-motion": "^12.0.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^3.0.0",
}

VERSION_RE = re.compile(r"^\d+\.\d+\.\d+")


def _parse_package_json(package_json: str) -> Dict[str, Any]:
    return json.loads(package_json)


def normalize_dependencies(
    package_json: Optional[str],
    module_name: str,
) -> Tuple[Optional[Dict[str, str]], Dict[str, Any]]:
    """
    Build normalized package.imported.json and normalization report.
    """
    if not package_json:
        return None, {
            "adjusted": [],
            "removed": [],
            "warnings": ["No package.json to normalize"],
            "pinnedCount": 0,
        }

    try:
        data = _parse_package_json(package_json)
    except json.JSONDecodeError:
        return None, {
            "adjusted": [],
            "removed": [],
            "warnings": ["Invalid package.json"],
            "pinnedCount": 0,
        }

    dependencies = data.get("dependencies", {})
    if not isinstance(dependencies, dict):
        dependencies = {}

    normalized_deps: Dict[str, str] = {}
    adjusted: List[str] = []
    removed: List[str] = []
    warnings: List[str] = []

    for name, version in dependencies.items():
        dep_name = str(name)
        dep_version = str(version)

        if dep_name in EWGEN_PINNED:
            pinned = EWGEN_PINNED[dep_name]
            normalized_deps[dep_name] = pinned
            if dep_version != pinned:
                adjusted.append(f"{dep_name}: {dep_version} → {pinned}")
            continue

        if dep_name.startswith("@types/"):
            normalized_deps[dep_name] = dep_version
            continue

        if not VERSION_RE.search(dep_version) and dep_version not in ("*", "latest"):
            normalized_deps[dep_name] = dep_version
            continue

        if dep_version in ("*", "latest"):
            warnings.append(f"{dep_name}@{dep_version}: pin version before production")
            normalized_deps[dep_name] = dep_version
            continue

        normalized_deps[dep_name] = dep_version

    kebab_name = to_kebab(module_name)
    normalized_package = {
        "name": f"@ewgen/imported-{kebab_name}",
        "private": True,
        "version": "0.1.0",
        "description": f"Normalized dependencies for imported module {module_name}",
        "dependencies": dict(sorted(normalized_deps.items())),
        "ewgenNormalization": {
            "source": data.get("name", "unknown"),
            "adjustedCount": len(adjusted),
            "pinnedCount": sum(
                1 for name in normalized_deps if name in EWGEN_PINNED
            ),
        },
    }

    file_entry: Dict[str, str] = {
        "path": "package.imported.json",
        "content": json.dumps(normalized_package, indent=2, ensure_ascii=False),
        "language": "json",
        "description": "EWGen-normalized dependency manifest for imported module",
    }

    report = {
        "adjusted": adjusted,
        "removed": removed,
        "warnings": warnings,
        "pinnedCount": normalized_package["ewgenNormalization"]["pinnedCount"],
    }

    return file_entry, report
