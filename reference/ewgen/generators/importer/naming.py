"""
Fortune Seaker - Shared naming helpers
"""

import json
import re
from typing import List, Optional


MODULE_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9]{2,49}$")


def to_kebab(name: str) -> str:
    """
    Convert module name to kebab-case path segment.
    """
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", name)
    cleaned = spaced.lower().replace(" ", "-").replace("_", "-")
    return re.sub(r"[^a-z0-9-]", "-", cleaned)


def to_registry_const(name: str) -> str:
    """
    Build safe TS const name for registry snippet export.
    """
    kebab = to_kebab(name).replace("-", "_")
    return f"IMPORTED_{kebab.upper()}_REGISTRY"


def validate_module_name(name: str) -> Optional[str]:
    """
    Validate imported module name. Returns error message or None if valid.
    """
    trimmed = name.strip()
    if not MODULE_NAME_RE.match(trimmed):
        return "Module name must start with a letter and use 3-50 alphanumeric characters"
    return None


def _parts_to_pascal(parts: List[str]) -> str:
    return "".join(part.capitalize() for part in parts if part)


def normalize_module_name(name: str, package_json: Optional[str] = None) -> str:
    """
    Ensure inferred module name satisfies validate_module_name rules.
    Expands scoped short names like @acme/ui → AcmeUi.
    """
    trimmed = name.strip()
    if validate_module_name(trimmed) is None:
        return trimmed

    if package_json:
        try:
            data = json.loads(package_json)
            pkg = str(data.get("name", "")).strip()
            if pkg.startswith("@"):
                scope, _, rest = pkg.partition("/")
                scope_parts = re.split(r"[-_.]", scope.lstrip("@"))
                rest_parts = re.split(r"[-_/]", rest)
                combined = _parts_to_pascal(scope_parts) + _parts_to_pascal(rest_parts)
                if validate_module_name(combined) is None:
                    return combined
        except json.JSONDecodeError:
            pass

    if trimmed:
        suffix = trimmed[0].upper() + trimmed[1:]
        padded = f"Imported{suffix}"
        if validate_module_name(padded) is None:
            return padded

    return "ImportedModule"
