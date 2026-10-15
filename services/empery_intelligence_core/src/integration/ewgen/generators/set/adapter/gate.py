"""
SET Adapter — install gate (require adapterStatus=ready before SET install)
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from generators.importer.naming import to_kebab
from generators.warsmith.catalog import get_warsmith_catalog

from .constants import ADAPTER_STATUS_READY, SET_COMPONENT_MODULE_KIND
from .staging import get_staging_status, read_adapter_manifest, staging_module_root


def resolve_module_id(
    *,
    warsmith_catalog_id: Optional[str] = None,
    module_id: Optional[str] = None,
    module_name: Optional[str] = None,
) -> str:
    if module_id:
        return module_id.strip()
    if module_name:
        return to_kebab(module_name)
    if warsmith_catalog_id:
        entry = get_warsmith_catalog().get_entry(warsmith_catalog_id)
        if entry:
            return to_kebab(str(entry.get("moduleName", "ImportedModule")))
    raise ValueError("module_id, module_name, or warsmith_catalog_id required")


def evaluate_adapter_gate(
    *,
    warsmith_catalog_id: Optional[str] = None,
    module_id: Optional[str] = None,
    module_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Check whether adapter staging is ready for SET install.
    """
    resolved_id = resolve_module_id(
        warsmith_catalog_id=warsmith_catalog_id,
        module_id=module_id,
        module_name=module_name,
    )
    staging = get_staging_status(resolved_id)
    manifest = read_adapter_manifest(resolved_id)
    errors: list[str] = []
    warnings: list[str] = []

    if not staging.get("exists"):
        errors.append(
            f"Adapter staging not found for {resolved_id} — run POST /api/set/adapter/transform",
        )
    elif not manifest:
        errors.append("set.adapter.manifest.json missing in staging")
    else:
        status = str(manifest.get("adapterStatus", ""))
        if status != ADAPTER_STATUS_READY:
            errors.append(f"Adapter status is {status!r}, required {ADAPTER_STATUS_READY!r}")
            for blocker in manifest.get("blockers") or []:
                warnings.append(str(blocker))
        catalog_in_manifest = str(manifest.get("warsmithCatalogId", "")).strip()
        if warsmith_catalog_id and catalog_in_manifest and catalog_in_manifest != warsmith_catalog_id:
            errors.append(
                "Staging was built for a different Warsmith catalog entry — re-run transform",
            )
        if not (staging_module_root(resolved_id) / "backend" / "router.py").is_file():
            errors.append("Staging backend/router.py missing")
        verify_status = str(manifest.get("verifyStatus", "")).strip()
        module_kind = str(manifest.get("moduleKind", "")).strip()
        if module_kind == SET_COMPONENT_MODULE_KIND:
            if verify_status != "ready":
                errors.append(
                    "Component standard verify not passed — run POST /api/set/adapter/verify",
                )
                for blocker in manifest.get("verifyBlockers") or []:
                    warnings.append(str(blocker))
        elif verify_status and verify_status != "ready":
            warnings.append(f"SET verify status is {verify_status!r}")

    ready = len(errors) == 0

    return {
        "ready": ready,
        "allowed": ready,
        "moduleId": resolved_id,
        "adapterStatus": (manifest or {}).get("adapterStatus"),
        "moduleKind": (manifest or {}).get("moduleKind"),
        "verifyStatus": (manifest or {}).get("verifyStatus"),
        "verifyBlockers": (manifest or {}).get("verifyBlockers") or [],
        "verifyChecks": (manifest or {}).get("verifyChecks") or [],
        "stagingPath": staging.get("stagingPath"),
        "transformedAt": (manifest or {}).get("transformedAt"),
        "verifiedAt": (manifest or {}).get("verifiedAt"),
        "grade": (manifest or {}).get("grade"),
        "mountMode": (manifest or {}).get("mountMode"),
        "warsmithCatalogId": (manifest or {}).get("warsmithCatalogId") or warsmith_catalog_id,
        "errors": errors,
        "warnings": warnings,
        "manifest": manifest,
    }


def assert_adapter_ready_for_install(
    *,
    warsmith_catalog_id: Optional[str] = None,
    module_id: Optional[str] = None,
    module_name: Optional[str] = None,
) -> Dict[str, Any]:
    gate = evaluate_adapter_gate(
        warsmith_catalog_id=warsmith_catalog_id,
        module_id=module_id,
        module_name=module_name,
    )
    if not gate.get("ready"):
        errors = gate.get("errors") or []
        raise ValueError("; ".join(str(item) for item in errors) or "SET Adapter gate failed")
    return gate
