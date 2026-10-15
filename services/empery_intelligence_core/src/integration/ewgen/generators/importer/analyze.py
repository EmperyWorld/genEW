"""
Fortune Seaker - Source Analyzer
Extracts component/module candidates from uploaded source archives
"""

import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

from .asset_pass import collect_asset_candidates
from .ast_analyzer import extract_exports_batch, regex_extract_exports
from .component_cluster import (
    discover_component_groups,
    find_package_json_paths,
    prioritize_source_paths,
)
from .limits import (
    MAX_ANALYZED_SOURCES,
    MAX_ARCHIVE_ENTRIES,
    MAX_FILE_SIZE,
    MAX_TOTAL_SIZE,
)
from .path_filters import (
    count_noise_archive_entries,
    is_blocked_path,
    is_build_artifact_path,
    iter_budget_archive_paths,
)
from .source_import_graph import validate_source_import_graph
from .text_sanitize import sanitize_unicode_text

SOURCE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx"}


def _is_archive_file_entry(path: str) -> bool:
    return not path.endswith("/")


def _count_archive_file_entries(paths: List[str]) -> int:
    return sum(1 for path in paths if _is_archive_file_entry(path))


def _collect_source_paths(paths: List[str]) -> List[str]:
    source_paths: List[str] = []
    for path in paths:
        if not _is_archive_file_entry(path):
            continue
        if is_blocked_path(path):
            continue
        if Path(path).suffix.lower() not in SOURCE_EXTENSIONS:
            continue
        source_paths.append(path)
    return source_paths


def _collect_archive_paths(paths: List[str]) -> List[str]:
    return [path for path in paths if _is_archive_file_entry(path)]


def scan_archive_inventory(names: List[str]) -> Dict[str, Any]:
    """
    Summarize skipped archive entries for monorepo import reporting.
    """
    inventory: Dict[str, int] = {
        "archiveFileCount": 0,
        "skippedBuildArtifacts": 0,
        "skippedPythonFiles": 0,
        "skippedNonSource": 0,
        "skippedBlocked": 0,
        "skippedOverSourceLimit": 0,
        "discoverableAssets": 0,
        "analyzedSourceLimit": MAX_ANALYZED_SOURCES,
    }

    for name in names:
        if name.endswith("/"):
            continue

        inventory["archiveFileCount"] += 1
        suffix = Path(name).suffix.lower()

        if is_build_artifact_path(name):
            inventory["skippedBuildArtifacts"] += 1
            continue

        if suffix == ".py" or name.endswith(".pyc"):
            inventory["skippedPythonFiles"] += 1
            continue

        if suffix in SOURCE_EXTENSIONS:
            if is_blocked_path(name):
                inventory["skippedBlocked"] += 1
            continue

        if is_blocked_path(name):
            inventory["skippedBlocked"] += 1
            continue

        inventory["skippedNonSource"] += 1

    return inventory


def _infer_module_type(content: str, path: str) -> str:
    lower = content.lower()
    path_lower = path.lower()

    if "dnd-kit" in lower or "kanban" in path_lower:
        return "kanban"
    if "recharts" in lower or "dashboard" in path_lower:
        return "dashboard"
    if "websocket" in lower or "chat" in path_lower:
        return "chat"
    if "jspdf" in lower or "report" in path_lower:
        return "report"
    if "usequery" in lower or "crud" in path_lower:
        return "crud"
    return "imported"


def _build_candidate(
    path: str,
    content: str,
    size: int,
    exports: Optional[List[str]] = None,
) -> Dict[str, Any]:
    resolved_exports = exports if exports is not None else regex_extract_exports(content)
    module_type = _infer_module_type(content, path)
    return {
        "path": path,
        "exports": resolved_exports[:10],
        "suggestedModuleType": module_type,
        "size": size,
    }


def analyze_source_entries(
    entries: List[Dict[str, Any]],
    warnings: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Build analysis result from pre-read source file entries.
    Each entry: {path, content, size}
    """
    candidates: List[Dict[str, Any]] = []
    file_contents: Dict[str, str] = {}
    total_size = 0
    warn = warnings if warnings is not None else []

    valid_entries: List[Dict[str, Any]] = []

    for entry in entries:
        path = entry.get("path", "")
        content = entry.get("content", "")
        size = int(entry.get("size", len(content)))

        if not path or is_blocked_path(path):
            continue

        suffix = Path(path).suffix.lower()
        if suffix not in SOURCE_EXTENSIONS:
            continue

        if size > MAX_FILE_SIZE:
            warn.append(f"Skipped large file: {path}")
            continue

        total_size += size
        if total_size > MAX_TOTAL_SIZE:
            raise ValueError("Source exceeds maximum total size")

        valid_entries.append({
            "path": path,
            "content": content,
            "size": size,
        })
        file_contents[path] = content

    exports_map = extract_exports_batch(valid_entries)

    for entry in valid_entries:
        path = entry["path"]
        content = entry["content"]
        size = entry["size"]
        candidates.append(
            _build_candidate(
                path,
                content,
                size,
                exports=exports_map.get(path, regex_extract_exports(content)),
            )
        )

    return {
        "candidates": candidates,
        "warnings": warn,
        "fileContents": file_contents,
        "stats": {
            "fileCount": len(candidates),
            "totalSize": total_size,
        },
    }


def analyze_directory(root: Path, prefix: str = "") -> Dict[str, Any]:
    """
    Analyze directory tree and return import manifest candidates.
    """
    entries: List[Dict[str, Any]] = []
    warnings: List[str] = []
    archive_paths: List[str] = []
    size_map: Dict[str, int] = {}

    all_paths = [file_path for file_path in root.rglob("*") if file_path.is_file()]
    rel_paths = []
    for file_path in all_paths:
        rel_path = file_path.relative_to(root).as_posix()
        if prefix:
            rel_path = f"{prefix}/{rel_path}"
        rel_paths.append(rel_path)

    budget_paths = iter_budget_archive_paths(rel_paths)
    noise_skipped = count_noise_archive_entries(rel_paths)
    if noise_skipped > 0:
        warnings.append(
            f"Skipped {noise_skipped} noise path(s) "
            "(node_modules/.git/dist/…) before entry budget"
        )
    if len(budget_paths) > MAX_ARCHIVE_ENTRIES:
        raise ValueError(
            f"Too many archive entries: {len(budget_paths)} > {MAX_ARCHIVE_ENTRIES}"
        )

    source_paths = _collect_source_paths(rel_paths)
    package_json_paths = find_package_json_paths(
        [path for path in rel_paths if not is_blocked_path(path)]
    )
    selected_source_paths = source_paths
    if len(source_paths) > MAX_ANALYZED_SOURCES:
        selected_source_paths = prioritize_source_paths(
            source_paths,
            package_json_paths,
            MAX_ANALYZED_SOURCES,
        )
        warnings.append(
            "Analyzed "
            f"{len(selected_source_paths)} of {len(source_paths)} source files "
            f"(limit {MAX_ANALYZED_SOURCES}); package roots prioritized"
        )

    selected_source_set = set(selected_source_paths)

    for file_path in all_paths:
        if not file_path.is_file():
            continue

        rel_path = file_path.relative_to(root).as_posix()
        if prefix:
            rel_path = f"{prefix}/{rel_path}"

        archive_paths.append(rel_path)
        size_map[rel_path] = file_path.stat().st_size

        if is_blocked_path(rel_path):
            continue

        suffix = file_path.suffix.lower()
        if suffix not in SOURCE_EXTENSIONS:
            continue

        if rel_path not in selected_source_set:
            continue

        size = size_map[rel_path]
        if size > MAX_FILE_SIZE:
            warnings.append(f"Skipped large file: {rel_path}")
            continue

        content = sanitize_unicode_text(
            file_path.read_text(encoding="utf-8", errors="ignore")
        )
        entries.append({
            "path": rel_path,
            "content": content,
            "size": size,
        })

    result = analyze_source_entries(entries, warnings)
    asset_candidates = collect_asset_candidates(
        archive_paths,
        [candidate["path"] for candidate in result["candidates"]],
        size_map=size_map,
    )
    package_contents: Dict[str, str] = {}
    for package_path in find_package_json_paths(archive_paths):
        file_path = root / package_path
        if file_path.is_file():
            package_contents[package_path] = file_path.read_text(
                encoding="utf-8",
                errors="ignore",
            )

    result["assetCandidates"] = asset_candidates
    result["stats"]["assetCount"] = len(asset_candidates)
    inventory = scan_archive_inventory(archive_paths)
    inventory["discoverableAssets"] = len(asset_candidates)
    inventory["skippedOverSourceLimit"] = max(
        0,
        len(source_paths) - len(selected_source_paths),
    )
    result["inventory"] = inventory
    source_entries = [
        {
            "path": entry.get("path", ""),
            "content": entry.get("content", ""),
        }
        for entry in entries
        if entry.get("path")
    ]
    coverage_partial = inventory["skippedOverSourceLimit"] > 0
    archive_path_set = set(archive_paths)
    source_import_graph = validate_source_import_graph(
        source_entries,
        archive_paths=archive_path_set,
        partial=coverage_partial,
    )
    result["sourceImportGraph"] = source_import_graph
    if coverage_partial and "Import coverage is partial" not in " ".join(result["warnings"]):
        result["warnings"].append(
            "Import coverage is partial — analyzed subset only; missing-file hints may be incomplete"
        )
    if not source_import_graph.get("passed", True):
        missing_targets = int(source_import_graph.get("missingTargetCount", 0))
        broken_count = int(source_import_graph.get("brokenImportCount", 0))
        coverage_hint = (
            "Import coverage: "
            f"{broken_count} unresolved import(s) to {missing_targets} missing file(s) "
            f"({source_import_graph.get('coverageRate', 0)}% clean files)"
        )
        if coverage_hint not in result["warnings"]:
            result["warnings"].append(coverage_hint)
    result["componentGroups"] = discover_component_groups(
        result["candidates"],
        asset_candidates,
        archive_paths,
        package_contents,
        source_entries=source_entries,
        archive_path_set=archive_path_set,
        coverage_partial=coverage_partial,
    )
    result["stats"]["componentCount"] = len(result["componentGroups"])
    return result


def analyze_zip(data: bytes) -> Dict[str, Any]:
    """
    Analyze ZIP archive and return import manifest candidates.
    """
    entries: List[Dict[str, Any]] = []
    warnings: List[str] = []

    with zipfile.ZipFile(BytesIO(data)) as archive:
        names = archive.namelist()
        budget_paths = iter_budget_archive_paths(names)
        noise_skipped = count_noise_archive_entries(names)
        if noise_skipped > 0:
            warnings.append(
                f"Skipped {noise_skipped} noise archive entries "
                "(node_modules/.git/dist/…) before entry budget"
            )
        if len(budget_paths) > MAX_ARCHIVE_ENTRIES:
            raise ValueError(
                f"Too many archive entries: {len(budget_paths)} > {MAX_ARCHIVE_ENTRIES}"
            )

        archive_paths = _collect_archive_paths(names)
        source_paths = _collect_source_paths(names)
        package_json_paths = find_package_json_paths(
            [path for path in archive_paths if not is_blocked_path(path)]
        )
        selected_source_paths = source_paths
        if len(source_paths) > MAX_ANALYZED_SOURCES:
            selected_source_paths = prioritize_source_paths(
                source_paths,
                package_json_paths,
                MAX_ANALYZED_SOURCES,
            )
            warnings.append(
                "Analyzed "
                f"{len(selected_source_paths)} of {len(source_paths)} source files "
                f"(limit {MAX_ANALYZED_SOURCES}); package roots prioritized"
            )

        skipped_artifacts = 0

        for name in selected_source_paths:
            if is_blocked_path(name):
                if is_build_artifact_path(name):
                    skipped_artifacts += 1
                continue

            info = archive.getinfo(name)
            if info.file_size > MAX_FILE_SIZE:
                warnings.append(f"Skipped large file: {name}")
                continue

            content = sanitize_unicode_text(
                archive.read(name).decode("utf-8", errors="ignore")
            )
            entries.append({
                "path": name,
                "content": content,
                "size": info.file_size,
            })

        if skipped_artifacts > 0:
            warnings.append(
                f"Skipped {skipped_artifacts} build artifact(s) (dist/build/coverage)"
            )

        size_map = {
            name: archive.getinfo(name).file_size
            for name in archive_paths
        }

        package_contents: Dict[str, str] = {}
        for package_path in find_package_json_paths(archive_paths):
            try:
                package_contents[package_path] = archive.read(package_path).decode(
                    "utf-8",
                    errors="ignore",
                )
            except KeyError:
                continue

    result = analyze_source_entries(entries, warnings)
    result.pop("fileContents", None)
    asset_candidates = collect_asset_candidates(
        archive_paths,
        [candidate["path"] for candidate in result["candidates"]],
        size_map=size_map,
    )

    result["assetCandidates"] = asset_candidates
    result["stats"]["assetCount"] = len(asset_candidates)
    inventory = scan_archive_inventory(archive_paths)
    inventory["discoverableAssets"] = len(asset_candidates)
    inventory["skippedOverSourceLimit"] = max(
        0,
        len(source_paths) - len(selected_source_paths),
    )
    result["inventory"] = inventory
    source_entries = [
        {
            "path": entry.get("path", ""),
            "content": entry.get("content", ""),
        }
        for entry in entries
        if entry.get("path")
    ]
    coverage_partial = inventory["skippedOverSourceLimit"] > 0
    archive_path_set = set(archive_paths)
    source_import_graph = validate_source_import_graph(
        source_entries,
        archive_paths=archive_path_set,
        partial=coverage_partial,
    )
    result["sourceImportGraph"] = source_import_graph
    if coverage_partial:
        partial_hint = (
            "Import coverage is partial — analyzed subset only; "
            "missing-file hints may be incomplete"
        )
        if partial_hint not in result["warnings"]:
            result["warnings"].append(partial_hint)
    if not source_import_graph.get("passed", True):
        missing_targets = int(source_import_graph.get("missingTargetCount", 0))
        broken_count = int(source_import_graph.get("brokenImportCount", 0))
        coverage_hint = (
            "Import coverage: "
            f"{broken_count} unresolved import(s) to {missing_targets} missing file(s) "
            f"({source_import_graph.get('coverageRate', 0)}% clean files)"
        )
        if coverage_hint not in result["warnings"]:
            result["warnings"].append(coverage_hint)
    if inventory["skippedBuildArtifacts"] > 0:
        artifact_hint = (
            f"Skipped {inventory['skippedBuildArtifacts']} build artifact(s) "
            "(dist/build/coverage)"
        )
        if artifact_hint not in result["warnings"]:
            result["warnings"].append(artifact_hint)
    result["componentGroups"] = discover_component_groups(
        result["candidates"],
        asset_candidates,
        archive_paths,
        package_contents,
        source_entries=source_entries,
        archive_path_set=archive_path_set,
        coverage_partial=coverage_partial,
    )
    result["stats"]["componentCount"] = len(result["componentGroups"])
    return result
