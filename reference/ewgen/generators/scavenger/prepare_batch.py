"""
Scavenger - Batch prepare multiple Python package groups
"""

from typing import Any, Dict, List, Optional

from generators.importer.naming import to_kebab, validate_module_name

from .catalog import get_scavenger_catalog
from .integration_snippets import build_requirements_merge_snippet, merge_requirement_packages
from .requirements_compare import analyze_requirements_against_backend
from .materialize import materialize_scavenger_bundle
from .prepare import prepare_python_bundle
from .security import python_security_gate


def _dedupe_files_by_path(files: List[Dict[str, str]]) -> List[Dict[str, str]]:
    merged: Dict[str, Dict[str, str]] = {}
    for file in files:
        path = str(file.get("path", "")).replace("\\", "/")
        if not path:
            continue
        merged[path] = {"path": path, "content": str(file.get("content", ""))}
    return list(merged.values())


def _dedupe_dependency_files(files: List[Dict[str, str]]) -> List[Dict[str, str]]:
    return _dedupe_files_by_path(files)


def prepare_scavenger_batch(
    groups: List[Dict[str, Any]],
    license_text: Optional[str] = None,
    source: str = "zip",
    source_ref: Optional[str] = None,
    archive_paths: Optional[List[str]] = None,
    rewrite_monorepo_api_imports: bool = False,
    merge_into_single_bundle: bool = False,
    merged_module_name: Optional[str] = None,
    save_to_catalog: bool = True,
    write_to_disk: bool = False,
    overwrite: bool = False,
    register_manifest: bool = False,
) -> Dict[str, Any]:
    """
    Prepare multiple Python scavenger bundles sequentially.
    When merge_into_single_bundle is True, all groups are merged into one bundle.
    """
    if merge_into_single_bundle:
        return _prepare_merged_batch(
            groups=groups,
            license_text=license_text,
            source=source,
            source_ref=source_ref,
            archive_paths=archive_paths,
            rewrite_monorepo_api_imports=rewrite_monorepo_api_imports,
            merged_module_name=merged_module_name,
            save_to_catalog=save_to_catalog,
            write_to_disk=write_to_disk,
            overwrite=overwrite,
            register_manifest=register_manifest,
        )

    results: List[Dict[str, Any]] = []
    prepared = 0
    failed = 0
    used_module_names: set[str] = set()
    batch_dependency_files: List[Dict[str, str]] = []

    for group in groups:
        if group.get("preparable") is False:
            continue
        module_name = str(group.get("moduleName", "")).strip()
        module_type = str(group.get("moduleType", "imported"))
        files = group.get("files") or []
        label = str(group.get("displayLabel") or group.get("label") or module_name)

        item: Dict[str, Any] = {
            "label": label,
            "moduleName": module_name,
            "moduleType": module_type,
            "success": False,
            "catalogId": None,
            "error": None,
            "bundleQuality": None,
        }

        if not module_name or not files:
            item["error"] = "Missing module name or files"
            failed += 1
            results.append(item)
            continue

        if module_name in used_module_names:
            item["error"] = f"Duplicate module name in batch: {module_name}"
            failed += 1
            results.append(item)
            continue

        try:
            security = python_security_gate(files, license_text)
            if security.get("blocked"):
                item["error"] = "Security gate blocked Python import"
                item["security"] = security
                failed += 1
                results.append(item)
                continue

            bundle = prepare_python_bundle(
                selected_files=files,
                module_name=module_name,
                module_type=module_type,
                integration_hints=group.get("integrationHints"),
                dependency_files=group.get("dependencyFiles"),
                license_text=license_text,
                source=source,
                source_ref=source_ref,
                archive_paths=archive_paths,
                rewrite_monorepo_api_imports=rewrite_monorepo_api_imports,
            )

            catalog_id: Optional[str] = None
            if save_to_catalog:
                try:
                    entry = get_scavenger_catalog().save_entry(
                        module_name=bundle["moduleName"],
                        module_type=bundle["moduleType"],
                        files=bundle["files"],
                        source=source,
                        source_ref=source_ref,
                        integration_hints=bundle["integrationHints"],
                        tags=["scavenger", "python", bundle["moduleType"]],
                        bundle_quality=bundle.get("bundleQuality"),
                        display_label=label,
                    )
                    catalog_id = entry.get("id")
                except ValueError as catalog_error:
                    item["error"] = str(catalog_error)
                    failed += 1
                    results.append(item)
                    continue

            materialize_result = None
            if write_to_disk:
                materialize_result = materialize_scavenger_bundle(
                    module_name=bundle["moduleName"],
                    files=bundle["files"],
                    overwrite=overwrite,
                    register_manifest=register_manifest,
                )

            used_module_names.add(module_name)
            group_dependency_files = group.get("dependencyFiles") or []
            if group_dependency_files:
                batch_dependency_files.extend(group_dependency_files)
            item.update({
                "success": True,
                "moduleName": bundle["moduleName"],
                "moduleType": bundle["moduleType"],
                "catalogId": catalog_id,
                "bundleQuality": bundle.get("bundleQuality"),
                "importGraph": bundle.get("importGraph"),
                "integrationSnippets": bundle.get("integrationSnippets"),
                "materialize": materialize_result,
                "security": security,
                "files": bundle.get("files") or [],
            })
            prepared += 1
        except ValueError as error:
            item["error"] = str(error)
            failed += 1
        except Exception as error:  # noqa: BLE001
            item["error"] = str(error)
            failed += 1

        results.append(item)

    batch_requirements_merge = None
    batch_requirements_analysis = None
    merged_packages = merge_requirement_packages(batch_dependency_files)
    if merged_packages:
        batch_requirements_analysis = analyze_requirements_against_backend(batch_dependency_files)
        batch_requirements_merge = build_requirements_merge_snippet(
            "ScavengerBatch",
            merged_packages,
            requirements_analysis=batch_requirements_analysis,
        )
        batch_requirements_merge["path"] = "snippets/scavenger-batch.requirements.merge.txt"

    return {
        "success": failed == 0,
        "prepared": prepared,
        "failed": failed,
        "results": results,
        "batchRequirementsMerge": batch_requirements_merge,
        "batchRequirementsAnalysis": batch_requirements_analysis,
    }


def _prepare_merged_batch(
    groups: List[Dict[str, Any]],
    license_text: Optional[str] = None,
    source: str = "zip",
    source_ref: Optional[str] = None,
    archive_paths: Optional[List[str]] = None,
    rewrite_monorepo_api_imports: bool = False,
    merged_module_name: Optional[str] = None,
    save_to_catalog: bool = True,
    write_to_disk: bool = False,
    overwrite: bool = False,
    register_manifest: bool = False,
) -> Dict[str, Any]:
    module_name = (merged_module_name or "ApiBackend").strip()
    name_error = validate_module_name(module_name)
    if name_error:
        raise ValueError(name_error)

    all_files: List[Dict[str, str]] = []
    all_dependency_files: List[Dict[str, str]] = []
    labels: List[str] = []
    hints: List[str] = []

    for group in groups:
        label = str(group.get("label") or group.get("moduleName") or "")
        if label:
            labels.append(label)
        all_files.extend(group.get("files") or [])
        all_dependency_files.extend(group.get("dependencyFiles") or [])
        hints.extend(group.get("integrationHints") or [])

    files = _dedupe_files_by_path(all_files)
    dependency_files = _dedupe_dependency_files(all_dependency_files)
    if not files:
        raise ValueError("No Python files to merge")

    item: Dict[str, Any] = {
        "label": ", ".join(labels[:8]) if labels else module_name,
        "moduleName": module_name,
        "moduleType": "imported",
        "success": False,
        "catalogId": None,
        "error": None,
        "bundleQuality": None,
    }

    try:
        security = python_security_gate(files, license_text)
        if security.get("blocked"):
            item["error"] = "Security gate blocked Python import"
            item["security"] = security
            return {
                "success": False,
                "prepared": 0,
                "failed": 1,
                "results": [item],
                "batchRequirementsMerge": None,
                "batchRequirementsAnalysis": None,
                "merged": True,
            }

        bundle = prepare_python_bundle(
            selected_files=files,
            module_name=module_name,
            module_type="imported",
            integration_hints=[*dict.fromkeys(hints)],
            dependency_files=dependency_files,
            license_text=license_text,
            source=source,
            source_ref=source_ref,
            archive_paths=archive_paths,
            rewrite_monorepo_api_imports=rewrite_monorepo_api_imports,
        )

        catalog_id: Optional[str] = None
        if save_to_catalog:
            entry = get_scavenger_catalog().save_entry(
                module_name=bundle["moduleName"],
                module_type=bundle["moduleType"],
                files=bundle["files"],
                source=source,
                source_ref=source_ref,
                integration_hints=bundle["integrationHints"],
                tags=["scavenger", "python", "merged", bundle["moduleType"]],
                bundle_quality=bundle.get("bundleQuality"),
            )
            catalog_id = entry.get("id")

        materialize_result = None
        if write_to_disk:
            materialize_result = materialize_scavenger_bundle(
                module_name=bundle["moduleName"],
                files=bundle["files"],
                overwrite=overwrite,
                register_manifest=register_manifest,
            )

        item.update({
            "success": True,
            "moduleName": bundle["moduleName"],
            "moduleType": bundle["moduleType"],
            "catalogId": catalog_id,
            "bundleQuality": bundle.get("bundleQuality"),
            "importGraph": bundle.get("importGraph"),
            "integrationSnippets": bundle.get("integrationSnippets"),
            "materialize": materialize_result,
            "security": security,
            "files": bundle.get("files") or [],
        })

        batch_requirements_analysis = (
            analyze_requirements_against_backend(dependency_files)
            if dependency_files
            else None
        )
        merged_packages = merge_requirement_packages(dependency_files)
        batch_requirements_merge = None
        if merged_packages or dependency_files:
            batch_requirements_merge = build_requirements_merge_snippet(
                module_name,
                merged_packages,
                requirements_analysis=batch_requirements_analysis,
            )
            batch_requirements_merge["path"] = (
                f"snippets/imported-python-{to_kebab(module_name)}.requirements.merge.txt"
            )

        return {
            "success": True,
            "prepared": 1,
            "failed": 0,
            "results": [item],
            "batchRequirementsMerge": batch_requirements_merge,
            "batchRequirementsAnalysis": batch_requirements_analysis,
            "merged": True,
        }
    except ValueError as error:
        item["error"] = str(error)
        return {
            "success": False,
            "prepared": 0,
            "failed": 1,
            "results": [item],
            "batchRequirementsMerge": None,
            "batchRequirementsAnalysis": None,
            "merged": True,
        }
