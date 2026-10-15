"""
Scavenger - Prepare Python import bundle
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from generators.importer.naming import to_kebab, validate_module_name

from .boundary_gate import IntegrationBoundaryError
from .import_graph import validate_python_import_graph
from .import_rewriter import (
    rewrite_python_files,
    strip_non_importable_archive_prefix,
    summarize_import_rewrites,
)
from .integration_snippets import (
    build_integration_snippets,
    validate_router_mount_readiness,
)
from .integration_validate import validate_scavenger_integration
from .manifest_snippet import build_manifest_registration_snippet
from .security import python_security_gate
from .self_contained_bundle import rewrite_to_self_contained_bundle


def prepare_python_bundle(
    selected_files: List[Dict[str, str]],
    module_name: str,
    module_type: str = "imported",
    integration_hints: Optional[List[str]] = None,
    dependency_files: Optional[List[Dict[str, str]]] = None,
    license_text: Optional[str] = None,
    source: str = "zip",
    source_ref: Optional[str] = None,
    archive_paths: Optional[List[str]] = None,
    rewrite_monorepo_api_imports: bool = False,
) -> Dict[str, Any]:
    """
    Build a Python scavenger bundle under generators/imported_python/<kebab>/.
    """
    name_error = validate_module_name(module_name)
    if name_error:
        raise ValueError(name_error)

    if not selected_files:
        raise ValueError("No Python files selected")

    if rewrite_monorepo_api_imports:
        raise IntegrationBoundaryError([
            "rewriteMonorepoApiImports is disabled — Scavenger uses self-contained "
            "ewgen_bundle.* packages (Neutral Contract mode)",
        ])

    normalized_files = strip_non_importable_archive_prefix(selected_files)
    normalized_dependencies = (
        strip_non_importable_archive_prefix(dependency_files)
        if dependency_files
        else None
    )

    self_contained_files, self_contained_meta = rewrite_to_self_contained_bundle(
        normalized_files,
        module_name,
    )
    dependency_self_contained = None
    if normalized_dependencies:
        dependency_self_contained, _dependency_meta = rewrite_to_self_contained_bundle(
            normalized_dependencies,
            module_name,
        )

    rewritten_files = rewrite_python_files(self_contained_files)
    import_rewrite = summarize_import_rewrites(normalized_files, rewritten_files)
    import_rewrite["selfContained"] = self_contained_meta
    extra_files = dependency_self_contained or []
    all_source_files = [*rewritten_files, *extra_files]

    security = python_security_gate(all_source_files, license_text)
    if security.get("blocked"):
        raise ValueError("Security gate blocked Python import")

    kebab = to_kebab(module_name)
    bundle_root = f"generators/imported_python/{kebab}"
    prepared: List[Dict[str, Any]] = []

    for file in rewritten_files:
        original_path = str(file.get("path", "")).replace("\\", "/")
        if not original_path:
            continue
        prepared.append({
            "path": f"{bundle_root}/{original_path}",
            "content": str(file.get("content", "")),
            "language": "python",
        })

    for file in extra_files:
        original_path = str(file.get("path", "")).replace("\\", "/")
        if not original_path:
            continue
        language = "text"
        if original_path.endswith(".toml"):
            language = "toml"
        elif original_path.endswith(".json"):
            language = "json"
        prepared.append({
            "path": f"{bundle_root}/{original_path}",
            "content": str(file.get("content", "")),
            "language": language,
        })

    manifest = {
        "moduleName": module_name,
        "moduleType": module_type,
        "importRoot": bundle_root,
        "source": source,
        "sourceRef": source_ref,
        "fileCount": len(prepared),
        "importsRewritten": import_rewrite.get("applied", False),
        "importRewrite": import_rewrite,
        "selfContainedPackagePrefix": self_contained_meta.get("packagePrefix"),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "track": "scavenger",
    }

    manifest_registration = build_manifest_registration_snippet(module_name, manifest)

    hints = list(integration_hints or [])
    hints.extend([
        f"Python bundle root: {bundle_root}",
        f"Self-contained package: {self_contained_meta.get('packagePrefix', 'ewgen_bundle')}",
        (
            f"Relative imports rewritten: {import_rewrite.get('filesRewritten', 0)} file(s), "
            f"{import_rewrite.get('relativeImportSpecs', 0)} spec(s)"
            if import_rewrite.get("applied")
            else "No relative imports required rewriting"
        ),
        "Add router includes in api_server.py only after manual review",
        f"Register manifest index — see {manifest_registration['path']}",
    ])
    if extra_files:
        hints.append(f"Bundled dependency manifests: {len(extra_files)} file(s)")

    prepared.append({
        "path": f"manifests/imported-python-{kebab}.manifest.json",
        "content": json.dumps(manifest, indent=2, ensure_ascii=False),
        "language": "json",
    })
    prepared.append({
        "path": manifest_registration["path"],
        "content": manifest_registration["content"],
        "language": manifest_registration.get("language", "text"),
    })
    bundle_prefix = f"{bundle_root}/"
    bundle_entries = [
        {
            "path": path[len(bundle_prefix):],
            "content": str(item.get("content", "")),
        }
        for item in prepared
        if (path := str(item.get("path", ""))).startswith(bundle_prefix)
        and path.endswith(".py")
    ]
    bundle_graph = validate_python_import_graph(bundle_entries)
    archive_graph = None
    if archive_paths:
        archive_graph = validate_python_import_graph(
            bundle_entries,
            archive_paths={path.replace("\\", "/") for path in archive_paths if path},
        )

    import_graph_payload: Dict[str, Any] = {"bundleSelfContained": bundle_graph}
    if archive_graph is not None:
        import_graph_payload["archiveContext"] = archive_graph
    import_graph = bundle_graph

    prepared.append({
        "path": f"{bundle_root}/import-graph.json",
        "content": json.dumps(import_graph_payload, indent=2, ensure_ascii=False),
        "language": "json",
    })
    if not import_graph.get("passed", True):
        hints.append(
            "Review unresolved Python imports before mounting routers — "
            f"{import_graph.get('brokenImportCount', 0)} broken spec(s)"
        )

    prepared.append({
        "path": f"{bundle_root}/README.md",
        "content": _readme_content(module_name, bundle_root, hints, import_graph_payload),
        "language": "markdown",
    })

    integration_validation = validate_scavenger_integration(module_name)
    suggested_router_prefix = integration_validation.get("suggestedRouterPrefix")
    integration = build_integration_snippets(
        module_name,
        bundle_root,
        rewritten_files,
        extra_files,
        suggested_router_prefix=suggested_router_prefix,
    )
    for artifact in integration["artifacts"]:
        prepared.append({
            "path": artifact["path"],
            "content": artifact["content"],
            "language": artifact.get("language", "text"),
        })
    if integration["routerCount"] > 0:
        hints.append(
            f"FastAPI routers detected: {integration['routerCount']} — "
            f"see snippets/imported-python-{kebab}.api-server.py.snippet"
        )
    if integration["requirementsPackages"]:
        hints.append(
            f"Merged {len(integration['requirementsPackages'])} requirement(s) — "
            f"see snippets/imported-python-{kebab}.requirements.merge.txt"
        )

    router_mount = validate_router_mount_readiness(integration.get("routers") or [])

    quality_score = 100 if security.get("passed") else 60
    if not import_graph.get("passed", True):
        quality_score = max(50, quality_score - 15)
    if integration["routerCount"] > 0 and not router_mount["ready"]:
        quality_score = max(45, quality_score - 20)

    return {
        "moduleName": module_name,
        "moduleType": module_type,
        "files": prepared,
        "integrationHints": hints,
        "security": security,
        "importManifest": manifest,
        "importGraph": import_graph,
        "integrationSnippets": integration,
        "integrationValidation": integration_validation,
        "bundleQuality": {
            "sourceFileCount": len(rewritten_files),
            "artifactCount": len(prepared),
            "hasManifest": True,
            "hasReadme": True,
            "hasRouterMountSnippet": integration["routerCount"] > 0,
            "routerMountReady": router_mount["ready"],
            "importableRouterCount": router_mount["importableCount"],
            "nonImportableRouterCount": router_mount["nonImportableCount"],
            "hasSyspathSnippet": any(
                str(artifact.get("path", "")).endswith(".syspath.py.snippet")
                for artifact in integration.get("artifacts", [])
            ),
            "hasRequirementsMerge": any(
                str(artifact.get("path", "")).endswith(".requirements.merge.txt")
                for artifact in integration.get("artifacts", [])
            ),
            "hasManifestIndexSnippet": True,
            "hasImportGraphArtifact": True,
            "importRoot": bundle_root,
            "importGraphPassed": import_graph.get("passed", True),
            "importGraphCoverageRate": import_graph.get("coverageRate", 100),
            "brokenImportCount": import_graph.get("brokenImportCount", 0),
            "qualityScore": quality_score,
            "qualityGrade": "A" if quality_score >= 90 else "B" if quality_score >= 75 else "C",
            "track": "scavenger",
        },
    }


def _readme_content(
    module_name: str,
    bundle_root: str,
    hints: List[str],
    import_graph_payload: Optional[Dict[str, Any]] = None,
) -> str:
    hint_lines = "\n".join(f"- {hint}" for hint in hints[:8])
    unresolved_section = _readme_unresolved_section(import_graph_payload)
    return (
        f"# {module_name} (Scavenger import)\n\n"
        f"Python bundle imported via **Scavenger** into `{bundle_root}`.\n\n"
        "## Integration hints\n"
        f"{hint_lines}\n"
        f"{unresolved_section}"
    )


def _readme_unresolved_section(import_graph_payload: Optional[Dict[str, Any]]) -> str:
    if not import_graph_payload:
        return ""

    bundle_graph = import_graph_payload.get("bundleSelfContained") or import_graph_payload
    if bundle_graph.get("passed", True):
        return ""

    internal = bundle_graph.get("internalMissingTargets") or []
    external = bundle_graph.get("externalMissingTargets") or []
    lines = ["\n## Unresolved imports checklist\n"]

    if internal:
        lines.append("### Internal monorepo modules (add package groups)\n")
        for target in internal[:10]:
            lines.append(f"- `{target}`")
        lines.append("")

    if external:
        lines.append("### External pip packages\n")
        for target in external[:10]:
            lines.append(f"- `{target}`")
        lines.append("")

    impossible = [
        target for target in (bundle_graph.get("missingTargets") or [])
        if "document_editor" in target or target.startswith("workers")
    ]
    if impossible:
        lines.append("### Not available in source archive\n")
        for target in impossible[:5]:
            lines.append(f"- `{target}`")
        lines.append("")

    archive_graph = import_graph_payload.get("archiveContext")
    if archive_graph and archive_graph.get("coverageRate") != bundle_graph.get("coverageRate"):
        lines.append(
            f"Coverage: **{bundle_graph.get('coverageRate', 0)}%** in bundle, "
            f"**{archive_graph.get('coverageRate', 0)}%** with full archive context.\n"
        )

    return "\n".join(lines)
