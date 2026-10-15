"""
Fortune Seaker - Import Prepare
Normalizes selected source files into EWGen GeneratedFile format
"""

import json
from typing import Any, Dict, List, Optional

from .ast_analyzer import regex_extract_exports
from .bundle_quality import build_bundle_quality, dedupe_hints
from .naming import to_kebab, validate_module_name
from .text_sanitize import sanitize_unicode_text
from .asset_pass import is_asset_path
from .contract_smoke import build_contract_smoke_test, resolve_primary_import
from .dependency_normalizer import normalize_dependencies
from .infer import infer_import_bundle
from .manifest_only import (
    augment_import_manifest,
    build_manifest_only_contract_test,
    build_source_index,
    count_source_files,
    detect_product_source_root,
    should_use_manifest_only,
)
from .manifest import build_manifest_file
from .import_graph import validate_import_graph
from .path_rewriter import rewrite_import_paths
from .path_utils import detect_common_root_prefix, strip_path_prefix
from .registry_merge import build_registry_merge_snippet
from .registry_snippet import build_registry_snippet
from .tsconfig_merge import build_tsconfig_merge_snippet
from .tsconfig_snippet import build_tsconfig_snippet
from .slice_completeness import scan_fe_slice_missing


def prepare_import_bundle(
    selected_files: List[Dict[str, str]],
    module_name: str,
    module_type: str = "imported",
    integration_hints: Optional[List[str]] = None,
    package_json: Optional[str] = None,
    source: str = "zip",
    source_ref: Optional[str] = None,
    import_manifest: Optional[Dict[str, Any]] = None,
    strict_slice_gate: bool = False,
    force_manifest_only: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Prepare import bundle for generator pipeline.

    force_manifest_only:
      True  → always manifest-only index
      False → always full runtime files (rematerialize / Stage 9)
      None  → auto (product root / size threshold)
    """
    name_error = validate_module_name(module_name)
    if name_error:
        raise ValueError(name_error)

    slice_scan = scan_fe_slice_missing(selected_files)
    if strict_slice_gate and slice_scan.get("criticalMissingCount", 0) > 0:
        raise ValueError(
            f"FE slice completeness gate failed: {slice_scan.get('criticalMissingCount', 0)} "
            f"critical missing imports — expand cluster closure in Fortune Seaker",
        )

    manifest_only = should_use_manifest_only(
        selected_files,
        force=force_manifest_only,
    )
    product_root = detect_product_source_root(selected_files)

    files: List[Dict[str, str]] = []
    source_paths = [
        str(item.get("path", "")).lstrip("./")
        for item in selected_files
        if item.get("path")
    ]
    root_prefix = detect_common_root_prefix(source_paths)

    if manifest_only:
        hints = list(integration_hints or [])
        hints.insert(
            0, "Manifest-only mode: no src/imported/ tree — SSOT + SHA256 index only"
        )
        hints.append(
            "Re-materialize full sources explicitly from catalog/SSOT when needed; "
            "shadow trees are forbidden on disk"
        )
        manifest = import_manifest
        if manifest is None:
            candidates = [
                {
                    "path": item.get("path", ""),
                    "exports": [],
                    "suggestedModuleType": module_type,
                }
                for item in selected_files
            ]
            inferred = infer_import_bundle(
                candidates,
                package_json=package_json,
                source=source,
                source_ref=source_ref,
            )
            manifest = inferred["importManifest"]
            if not integration_hints:
                hints.extend(inferred["integrationHints"])

        source_index = build_source_index(
            selected_files,
            module_name=module_name,
            source=source,
            source_ref=source_ref,
            product_root=product_root,
        )
        kebab = to_kebab(module_name)
        source_index_path = f"manifests/imported-{kebab}.source-index.json"
        manifest = augment_import_manifest(
            manifest,
            source_index={"path": source_index_path, **source_index},
            product_root=product_root,
        )
        manifest["displayName"] = module_name
        manifest["moduleType"] = module_type

        files.append(
            {
                "path": source_index_path,
                "content": json.dumps(source_index, indent=2, ensure_ascii=False),
                "language": "json",
                "description": "Manifest-only source index (SHA256 paths)",
            }
        )
        files.append(build_manifest_file(manifest, module_name))
        files.append(build_registry_snippet(module_name, module_type, manifest))
        files.append(build_registry_merge_snippet(module_name, module_type, manifest))
        files.append(build_tsconfig_snippet(module_name))
        files.append(build_tsconfig_merge_snippet(module_name))
        files.append(build_manifest_only_contract_test(module_name))

        dep_file, dep_report = normalize_dependencies(package_json, module_name)
        if dep_file:
            files.append(dep_file)

        hints = dedupe_hints(hints)
        readme = _generate_integration_readme(module_name, module_type, hints)
        files.append(
            {
                "path": "README.md",
                "content": readme,
                "language": "markdown",
                "description": "Integration guide",
            }
        )

        import_graph = validate_import_graph(files, module_name)
        quality = build_bundle_quality(
            files,
            count_source_files(selected_files),
            module_name,
            asset_file_count=0,
            import_graph=import_graph,
        )
        quality["manifestOnly"] = True

        return {
            "moduleName": module_name,
            "moduleType": module_type,
            "files": files,
            "integrationHints": hints,
            "importManifest": manifest,
            "dependencyNormalization": dep_report if package_json else None,
            "bundleQuality": quality,
            "importGraph": import_graph,
            "sliceCompleteness": slice_scan,
            "manifestOnly": True,
        }

    files = []
    for item in selected_files:
        path = item.get("path", "")
        content = sanitize_unicode_text(item.get("content", ""))
        if not path:
            continue

        stripped_path = strip_path_prefix(path, root_prefix)
        normalized_path = stripped_path
        if not normalized_path.startswith("src/"):
            normalized_path = f"src/imported/{to_kebab(module_name)}/{normalized_path}"

        if is_asset_path(stripped_path):
            rewritten_content = content
        else:
            rewritten_content = rewrite_import_paths(
                content,
                stripped_path,
                module_name,
            )

        files.append(
            {
                "path": normalized_path,
                "content": rewritten_content,
                "language": _detect_language(normalized_path),
                "description": f"Imported from {path}",
            }
        )

    hints = integration_hints or []
    manifest = import_manifest
    if manifest is None:
        candidates = [
            {
                "path": item.get("path", ""),
                "exports": [],
                "suggestedModuleType": module_type,
            }
            for item in selected_files
        ]
        inferred = infer_import_bundle(
            candidates,
            package_json=package_json,
            source=source,
            source_ref=source_ref,
        )
        manifest = inferred["importManifest"]
        if not hints:
            hints = inferred["integrationHints"]

    manifest["displayName"] = module_name
    manifest["moduleType"] = module_type
    files.append(build_manifest_file(manifest, module_name))
    files.append(build_registry_snippet(module_name, module_type, manifest))
    files.append(build_registry_merge_snippet(module_name, module_type, manifest))

    dep_file, dep_report = normalize_dependencies(package_json, module_name)
    if dep_file:
        files.append(dep_file)
        for adjustment in dep_report.get("adjusted", [])[:5]:
            hints.append(f"Dependency aligned: {adjustment}")

    files.append(build_tsconfig_snippet(module_name))
    files.append(build_tsconfig_merge_snippet(module_name))
    hints.append(
        f"Copy tsconfig.merge-imported-{to_kebab(module_name)}.json paths into tsconfig.json"
    )
    hints.append(
        f"Copy imported-{to_kebab(module_name)}.registry.merge.json entry into MODULE_REGISTRY"
    )

    manifest_exports = manifest.get("imports", {}).get("exports", [])
    export_names: List[str] = []
    if isinstance(manifest_exports, list):
        export_names.extend(str(name) for name in manifest_exports if name)

    for item in selected_files:
        if is_asset_path(str(item.get("path", ""))):
            continue
        for export_name in regex_extract_exports(item.get("content", "")):
            if export_name not in export_names:
                export_names.append(export_name)

    source_file_count = sum(
        1 for item in selected_files if not is_asset_path(str(item.get("path", "")))
    )
    asset_file_count = len(selected_files) - source_file_count
    if asset_file_count > 0:
        hints.append(f"Included {asset_file_count} static asset(s) (css/html/svg)")

    if export_names:
        primary_export, import_path, is_default = resolve_primary_import(
            selected_files,
            export_names,
            module_name,
            root_prefix,
        )
        files.append(
            build_contract_smoke_test(
                module_name,
                export_names,
                primary_export=primary_export,
                import_path=import_path,
                is_default_export=is_default,
            )
        )
        hints.append("Run contract smoke test before registry registration")

    hints = dedupe_hints(hints)

    readme = _generate_integration_readme(module_name, module_type, hints)
    files.append(
        {
            "path": "README.md",
            "content": readme,
            "language": "markdown",
            "description": "Integration guide",
        }
    )

    import_graph = validate_import_graph(files, module_name)
    if not import_graph.get("passed", True):
        hints.append(
            "Import graph: "
            f"{import_graph.get('brokenImportCount', 0)} unresolved internal imports "
            f"in {import_graph.get('filesWithBrokenImports', 0)} files"
        )

    slice_scan = scan_fe_slice_missing(files)
    if slice_scan.get("criticalMissingCount", 0) > 0:
        preview = ", ".join(slice_scan.get("criticalMissing") or [])[:200]
        hint = (
            "FE slice incomplete: "
            f"{slice_scan.get('criticalMissingCount', 0)} critical missing imports"
        )
        if preview:
            hint = f"{hint} ({preview})"
        hints.append(hint)

    quality = build_bundle_quality(
        files,
        source_file_count,
        module_name,
        asset_file_count=asset_file_count,
        import_graph=import_graph,
    )

    return {
        "moduleName": module_name,
        "moduleType": module_type,
        "files": files,
        "integrationHints": hints,
        "importManifest": manifest,
        "dependencyNormalization": dep_report if package_json else None,
        "bundleQuality": quality,
        "importGraph": import_graph,
        "sliceCompleteness": slice_scan,
    }


def _detect_language(path: str) -> str:
    if path.endswith(".tsx"):
        return "typescript"
    if path.endswith(".ts"):
        return "typescript"
    if path.endswith(".jsx"):
        return "javascript"
    if path.endswith(".js"):
        return "javascript"
    if path.endswith(".md"):
        return "markdown"
    if path.endswith(".json"):
        return "json"
    if path.endswith(".css"):
        return "css"
    if path.endswith(".html"):
        return "html"
    if path.endswith(".svg"):
        return "svg"
    return "typescript"


def _generate_integration_readme(
    module_name: str,
    module_type: str,
    hints: List[str],
) -> str:
    hint_lines = (
        "\n".join(f"- {h}" for h in hints) or "- Review imports and peer dependencies"
    )
    return f"""# {module_name}

Imported module prepared by Fortune Seaker (EWGen).

## Module Type
{module_type}

## Integration Steps
{hint_lines}

## Next Steps
1. Register module in `src/registry/moduleRegistry.ts`
2. Add manifest to `manifests/`
3. Run contract tests before enabling in production
"""
