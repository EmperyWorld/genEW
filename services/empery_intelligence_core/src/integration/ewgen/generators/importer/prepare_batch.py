"""
Fortune Seaker - Batch prepare multiple component groups
"""

from typing import Any, Dict, List, Optional

from .catalog import get_import_catalog
from .prepare import prepare_import_bundle
from .security import security_gate


def prepare_import_batch(
    groups: List[Dict[str, Any]],
    license_text: Optional[str] = None,
    source: str = "zip",
    source_ref: Optional[str] = None,
    save_to_catalog: bool = True,
    force_manifest_only: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Prepare multiple import bundles sequentially.
    Each group must include moduleName, moduleType, files, and optional metadata.

    force_manifest_only: see prepare_import_bundle (Stage 9 rematerialize uses False).
    """
    results: List[Dict[str, Any]] = []
    prepared = 0
    failed = 0

    for group in groups:
        module_name = str(group.get("moduleName", "")).strip()
        module_type = str(group.get("moduleType", "imported"))
        files = group.get("files") or []
        label = str(group.get("displayLabel") or group.get("label") or module_name)
        group_force = group.get("forceManifestOnly")
        if group_force is None:
            group_force = force_manifest_only

        item: Dict[str, Any] = {
            "label": label,
            "moduleName": module_name,
            "moduleType": module_type,
            "success": False,
            "catalogId": None,
            "error": None,
            "bundleQuality": None,
            "files": [],
            "manifestOnly": None,
        }

        if not module_name or not files:
            item["error"] = "Missing module name or files"
            failed += 1
            results.append(item)
            continue

        try:
            security = security_gate(
                files,
                group.get("packageJson"),
                license_text,
            )

            if security.get("blocked"):
                item["error"] = "Security gate blocked import"
                item["security"] = security
                failed += 1
                results.append(item)
                continue

            bundle = prepare_import_bundle(
                selected_files=files,
                module_name=module_name,
                module_type=module_type,
                integration_hints=group.get("integrationHints"),
                package_json=group.get("packageJson"),
                source=source,
                source_ref=source_ref,
                import_manifest=group.get("importManifest"),
                force_manifest_only=(
                    bool(group_force) if group_force is not None else None
                ),
            )

            catalog_id: Optional[str] = None
            if save_to_catalog:
                try:
                    catalog_entry = get_import_catalog().save_entry(
                        module_name=bundle["moduleName"],
                        module_type=bundle["moduleType"],
                        files=bundle["files"],
                        source=source,
                        source_ref=source_ref,
                        integration_hints=bundle["integrationHints"],
                        tags=["imported", bundle["moduleType"]],
                        bundle_quality=bundle.get("bundleQuality"),
                        display_label=label,
                    )
                    catalog_id = catalog_entry.get("id")
                except ValueError as catalog_error:
                    item["error"] = str(catalog_error)
                    failed += 1
                    results.append(item)
                    continue

            item.update({
                "success": True,
                "moduleName": bundle["moduleName"],
                "moduleType": bundle["moduleType"],
                "catalogId": catalog_id,
                "files": bundle["files"],
                "bundleQuality": bundle.get("bundleQuality"),
                "importGraph": bundle.get("importGraph"),
                "importManifest": bundle.get("importManifest"),
                "dependencyNormalization": bundle.get("dependencyNormalization"),
                "security": security,
                "manifestOnly": bool(bundle.get("manifestOnly")),
            })
            prepared += 1
        except ValueError as error:
            item["error"] = str(error)
            failed += 1
        except Exception as error:  # noqa: BLE001 - batch must continue on single-group failure
            item["error"] = str(error)
            failed += 1

        results.append(item)

    return {
        "success": failed == 0,
        "prepared": prepared,
        "failed": failed,
        "results": results,
    }
