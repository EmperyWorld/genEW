# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Validate N-way project shell manifests (roles ui/api/docs/db/fullstack).
# Invariants:
# - ≥2 modules and ≥2 distinct roles required.
# - Dual-flag role vs catalogSource mismatch → error (not silent override).
# Related:
# - generators/project_shell/compose.py
# ---

"""N-way project shell manifest validation."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from generators.importer.naming import to_kebab, validate_module_name

PROTOCOL_MANIFEST = "ewgen_project_shell_manifest_v1"

VISION_ROLES = frozenset({"ui", "api", "docs", "db", "fullstack"})

ROLE_TO_SOURCE = {
    "ui": "importer",
    "api": "scavenger",
    "fullstack": "warsmith",
    # docs/db are shell placeholders — catalogSource optional
    "docs": None,
    "db": None,
}

VALID_SOURCES = frozenset({"importer", "scavenger", "warsmith"})


def _normalize_module(raw: Dict[str, Any], index: int) -> Dict[str, Any]:
    role = str(raw.get("role") or "").strip().lower()
    if role not in VISION_ROLES:
        raise ValueError(
            f"modules[{index}].role invalid={role!r}; "
            f"expected one of {sorted(VISION_ROLES)}"
        )

    catalog_source = str(raw.get("catalogSource") or "").strip().lower() or None
    catalog_id = str(raw.get("catalogId") or "").strip() or None
    expected_source = ROLE_TO_SOURCE.get(role)

    if expected_source is not None:
        if not catalog_source:
            catalog_source = expected_source
        elif catalog_source != expected_source:
            raise ValueError(
                f"modules[{index}] dual-flag conflict: role={role} "
                f"expects catalogSource={expected_source}, "
                f"got {catalog_source}"
            )
        if not catalog_id:
            raise ValueError(
                f"modules[{index}].catalogId required for role={role}"
            )
    else:
        # docs/db placeholders — catalog optional
        if catalog_source and catalog_source not in VALID_SOURCES:
            raise ValueError(
                f"modules[{index}].catalogSource invalid={catalog_source!r}"
            )

    module_id = str(raw.get("moduleId") or "").strip()
    display_name = str(raw.get("displayName") or module_id or f"Module{index}")
    if not module_id:
        module_id = to_kebab(display_name) or f"module-{index}"
    else:
        module_id = to_kebab(module_id)

    name_error = validate_module_name(
        display_name if display_name[:1].isalpha() else f"M{display_name}"
    )
    # moduleId kebab is enough; displayName soft-validated
    if name_error and not display_name:
        raise ValueError(f"modules[{index}]: {name_error}")

    return {
        "role": role,
        "catalogSource": catalog_source,
        "catalogId": catalog_id,
        "moduleId": module_id,
        "displayName": display_name,
    }


def validate_project_manifest(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize and validate an N-way project manifest.

    Raises ValueError on hard failures.
    """
    project_name = str(payload.get("projectName") or "").strip()
    if not project_name:
        raise ValueError("projectName is required")

    project_kebab = to_kebab(project_name).strip("-")
    if len(project_kebab) < 3:
        raise ValueError(
            "projectName must yield a kebab id of at least 3 characters"
        )

    raw_modules = payload.get("modules")
    if not isinstance(raw_modules, list) or len(raw_modules) < 2:
        raise ValueError("modules must contain at least 2 entries")

    modules: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    seen_catalog: Set[str] = set()
    roles: Set[str] = set()

    for index, raw in enumerate(raw_modules):
        if not isinstance(raw, dict):
            raise ValueError(f"modules[{index}] must be an object")
        module = _normalize_module(raw, index)
        if module["moduleId"] in seen_ids:
            raise ValueError(
                f"duplicate moduleId: {module['moduleId']}"
            )
        seen_ids.add(module["moduleId"])
        if module["catalogSource"] and module["catalogId"]:
            key = f"{module['catalogSource']}:{module['catalogId']}"
            if key in seen_catalog:
                raise ValueError(f"duplicate catalog ref: {key}")
            seen_catalog.add(key)
        roles.add(module["role"])
        modules.append(module)

    if len(roles) < 2:
        raise ValueError(
            "modules must include at least 2 distinct roles "
            f"(got {sorted(roles)})"
        )

    warnings: List[str] = []
    if "docs" in roles or "db" in roles:
        warnings.append(
            "docs/db roles are shell placeholders in Stage 5 "
            "(no Stage 6 schema/deps merge)"
        )
    if not ({"ui", "api"} & roles) and "fullstack" not in roles:
        warnings.append(
            "no ui/api/fullstack roles — sandbox may lack FE/BE mounts"
        )

    return {
        "schema": PROTOCOL_MANIFEST,
        "projectName": project_name,
        "projectId": project_kebab,
        "modules": modules,
        "roles": sorted(roles),
        "warnings": warnings,
    }
