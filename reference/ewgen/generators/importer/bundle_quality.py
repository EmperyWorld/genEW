"""
Fortune Seaker - Bundle Quality Report
Summarizes prepared import bundle completeness
"""

import os
from typing import Any, Dict, List, Optional

from .naming import to_kebab, validate_module_name

MIN_PREPARE_QUALITY_SCORE = int(os.getenv("EWGEN_IMPORT_MIN_QUALITY_SCORE", "62"))
MIN_IMPORT_COVERAGE_RATE = int(os.getenv("EWGEN_IMPORT_MIN_COVERAGE_RATE", "80"))


def dedupe_hints(hints: List[str]) -> List[str]:
    """
    Remove duplicate integration hints while preserving order.
    """
    seen: set[str] = set()
    unique: List[str] = []
    for hint in hints:
        if hint in seen:
            continue
        seen.add(hint)
        unique.append(hint)
    return unique


def build_bundle_quality(
    files: List[Dict[str, Any]],
    source_file_count: int,
    module_name: str,
    asset_file_count: int = 0,
    import_graph: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build quality summary for prepared import bundle.
    """
    paths = [str(file.get("path", "")) for file in files]
    kebab_name = to_kebab(module_name)

    quality = {
        "sourceFileCount": source_file_count,
        "artifactCount": len(files),
        "hasManifest": any(path.startswith("manifests/imported-") for path in paths),
        "hasRegistrySnippet": any("/registry/snippets/" in path for path in paths),
        "hasPackageImported": "package.imported.json" in paths,
        "hasTsconfigSnippet": f"tsconfig.imported-{kebab_name}.json" in paths,
        "hasTsconfigMergeSnippet": f"tsconfig.merge-imported-{kebab_name}.json" in paths,
        "hasRegistryMergeSnippet": (
            f"src/registry/snippets/imported-{kebab_name}.registry.merge.json" in paths
        ),
        "hasContractTest": any(path.endswith(".contract.test.ts") for path in paths),
        "hasReadme": "README.md" in paths,
        "hasAssets": asset_file_count > 0,
        "assetFileCount": asset_file_count,
        "importAlias": f"@imported/{kebab_name}",
        "readyForRegistry": any("/registry/snippets/" in path for path in paths)
        and any(path.startswith("manifests/imported-") for path in paths),
    }
    if import_graph is not None:
        quality["importGraphPassed"] = import_graph.get("passed", True)
        quality["importGraphResolutionRate"] = import_graph.get("resolutionRate", 100)
        quality["brokenImportCount"] = import_graph.get("brokenImportCount", 0)
        quality["filesWithBrokenImports"] = import_graph.get("filesWithBrokenImports", 0)
        quality["brokenImports"] = import_graph.get("brokenImports", [])[:10]

    score = compute_quality_score(quality, import_graph=import_graph)
    quality["qualityScore"] = score
    quality["qualityGrade"] = quality_grade(score)
    return quality


def compute_quality_score(
    quality: Dict[str, Any],
    import_graph: Optional[Dict[str, Any]] = None,
) -> int:
    """
    Score bundle completeness from 0 to 100.
    """
    import_graph_passed = True
    if import_graph is not None:
        import_graph_passed = import_graph.get("passed", True)
    elif quality.get("importGraphPassed") is not None:
        import_graph_passed = bool(quality.get("importGraphPassed"))

    required_checks = [
        quality.get("hasManifest"),
        quality.get("hasRegistrySnippet"),
        quality.get("hasTsconfigSnippet"),
        quality.get("hasContractTest"),
        quality.get("hasReadme"),
        quality.get("hasPackageImported"),
        quality.get("readyForRegistry"),
        import_graph_passed,
    ]

    # Assets are optional for a complete bundle. Penalize only when the input
    # explicitly reports assets but they were not preserved in the prepared output.
    checks = list(required_checks)
    asset_file_count_raw = quality.get("assetFileCount")
    asset_file_count = _safe_int(asset_file_count_raw)
    include_asset_check = asset_file_count > 0
    if not include_asset_check and asset_file_count_raw is None:
        # Backward compatibility for direct/legacy callers/tests that do not pass
        # assetFileCount and historically counted hasAssets as a required check.
        include_asset_check = True
    if include_asset_check:
        checks.append(bool(quality.get("hasAssets")))

    if not checks:
        return 0
    passed = sum(1 for check in checks if check)
    return round((passed / len(checks)) * 100)


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def quality_grade(score: int) -> str:
    """
    Map quality score to letter grade.
    """
    if score >= 90:
        return "A"
    if score >= 75:
        return "B"
    if score >= 60:
        return "C"
    return "D"


def predict_bundle_quality(
    module_name: str,
    source_file_count: int,
    has_package_json: bool,
    security_passed: Optional[bool],
    import_coverage_passed: Optional[bool] = None,
    import_coverage_rate: Optional[int] = None,
    import_coverage_partial: bool = False,
) -> Dict[str, Any]:
    """
    Predict prepare readiness before bundle generation.
    """
    valid_name = validate_module_name(module_name) is None
    has_sources = source_file_count > 0
    security_ready = security_passed is True

    coverage_known = import_coverage_rate is not None
    coverage_ready = True
    if coverage_known:
        if import_coverage_partial:
            coverage_ready = False
        elif import_coverage_passed is True:
            coverage_ready = True
        else:
            coverage_ready = int(import_coverage_rate or 0) >= MIN_IMPORT_COVERAGE_RATE

    checklist = [
        {"id": "moduleName", "ready": valid_name},
        {"id": "selectedSources", "ready": has_sources},
        {"id": "security", "ready": security_ready},
    ]
    if coverage_known:
        checklist.append({"id": "importCoverage", "ready": coverage_ready})
    checklist.extend([
        {"id": "manifest", "ready": valid_name and has_sources and security_ready},
        {"id": "registrySnippet", "ready": valid_name and has_sources and security_ready},
        {"id": "tsconfigSnippet", "ready": valid_name and has_sources and security_ready},
        {"id": "contractTest", "ready": valid_name and has_sources and security_ready},
        {
            "id": "packageImported",
            "ready": valid_name and has_sources and security_ready and has_package_json,
        },
    ])

    passed = sum(1 for item in checklist if item["ready"])
    score = round((passed / len(checklist)) * 100) if checklist else 0
    can_prepare = (
        valid_name
        and has_sources
        and security_ready
        and score >= MIN_PREPARE_QUALITY_SCORE
    )

    warnings: List[str] = []
    if import_coverage_partial:
        warnings.append(
            "Import coverage is partial — not all archive sources were analyzed"
        )
    elif coverage_known and not coverage_ready and import_coverage_rate is not None:
        warnings.append(
            "Import coverage below threshold: "
            f"{import_coverage_rate}% clean (minimum {MIN_IMPORT_COVERAGE_RATE}%)"
        )

    return {
        "qualityScore": score,
        "qualityGrade": quality_grade(score),
        "minPrepareScore": MIN_PREPARE_QUALITY_SCORE,
        "minImportCoverageRate": MIN_IMPORT_COVERAGE_RATE,
        "canPrepare": can_prepare,
        "importAlias": f"@imported/{to_kebab(module_name)}" if valid_name else None,
        "checklist": checklist,
        "warnings": warnings,
    }
