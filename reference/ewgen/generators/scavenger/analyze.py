"""
Scavenger - Python archive analyzer
"""

import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List

from generators.importer.path_filters import (
    count_noise_archive_entries,
    is_blocked_path,
    is_build_artifact_path,
    iter_budget_archive_paths,
)
from generators.importer.text_sanitize import sanitize_unicode_text

from .cluster import discover_package_groups, find_python_project_roots
from .deps import DEPENDENCY_FILE_NAMES, find_project_dependency_files
from .import_graph import validate_python_import_graph
from .exports import extract_python_exports
from .limits import MAX_ANALYZED_PYTHON, MAX_ARCHIVE_ENTRIES, MAX_FILE_SIZE
from .requirements_compare import analyze_requirements_against_backend

PYTHON_EXTENSIONS = {".py"}
FRONTEND_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx"}


def _is_archive_file_entry(path: str) -> bool:
    return not path.endswith("/")


def _collect_archive_paths(names: List[str]) -> List[str]:
    return [
        name.replace("\\", "/")
        for name in names
        if _is_archive_file_entry(name)
    ]


def _collect_python_paths(names: List[str]) -> List[str]:
    paths: List[str] = []
    for name in _collect_archive_paths(names):
        if is_blocked_path(name):
            continue
        suffix = Path(name).suffix.lower()
        if suffix not in PYTHON_EXTENSIONS:
            continue
        if name.endswith(".pyc") or "/__pycache__/" in name:
            continue
        paths.append(name)
    return sorted(paths)


def _is_dependency_manifest_path(path: str) -> bool:
    name = Path(path.replace("\\", "/")).name
    return name in DEPENDENCY_FILE_NAMES


def _collect_dependency_contents(paths: List[str], read_content) -> Dict[str, str]:
    """
    Load dependency manifest contents for analyze-time preview.
    """
    contents: Dict[str, str] = {}
    for path in paths:
        normalized = path.replace("\\", "/")
        if not _is_dependency_manifest_path(normalized):
            continue
        try:
            contents[normalized] = sanitize_unicode_text(read_content(normalized))
        except Exception:  # noqa: BLE001
            continue
    return contents


def _prioritize_python_paths(paths: List[str], limit: int) -> List[str]:
    if len(paths) <= limit:
        return paths

    def sort_key(path: str) -> tuple:
        is_test = 1 if "test" in path.lower() or path.endswith("_test.py") else 0
        return (is_test, path.count("/"), path)

    return sorted(paths, key=sort_key)[:limit]


def scan_python_inventory(names: List[str]) -> Dict[str, Any]:
    """
    Summarize archive entries for Scavenger reporting (inverse of Fortune Seaker).
    """
    inventory: Dict[str, int] = {
        "archiveFileCount": 0,
        "skippedBuildArtifacts": 0,
        "skippedFrontendFiles": 0,
        "skippedNonPython": 0,
        "skippedBlocked": 0,
        "skippedOverPythonLimit": 0,
        "pythonProjectRoots": 0,
        "analyzedPythonLimit": MAX_ANALYZED_PYTHON,
    }

    for name in names:
        if name.endswith("/"):
            continue

        inventory["archiveFileCount"] += 1
        suffix = Path(name).suffix.lower()

        if is_build_artifact_path(name):
            inventory["skippedBuildArtifacts"] += 1
            continue

        if suffix in FRONTEND_EXTENSIONS:
            inventory["skippedFrontendFiles"] += 1
            continue

        if suffix == ".py" or name.endswith(".pyc"):
            if is_blocked_path(name):
                inventory["skippedBlocked"] += 1
            continue

        if is_blocked_path(name):
            inventory["skippedBlocked"] += 1
            continue

        inventory["skippedNonPython"] += 1

    return inventory


def _infer_python_module_type(path: str, content: str) -> str:
    lower = content.lower()
    if "apirouter" in lower or "router =" in lower or "api_router" in lower:
        return "imported"
    if "fastapi" in lower:
        return "imported"
    if "sqlalchemy" in lower or "declarative_base" in lower:
        return "imported"
    if "pydantic" in lower and "basemodel" in lower:
        return "imported"
    if "test" in path.lower():
        return "imported"
    return "imported"


def analyze_python_entries(
    entries: List[Dict[str, Any]],
    warnings: List[str],
) -> Dict[str, Any]:
    candidates: List[Dict[str, Any]] = []
    total_size = 0

    for entry in entries:
        path = str(entry.get("path", ""))
        content = str(entry.get("content", ""))
        size = int(entry.get("size", len(content.encode("utf-8"))))
        total_size += size

        exports = extract_python_exports(content)
        candidates.append({
            "path": path,
            "exports": exports,
            "suggestedModuleType": _infer_python_module_type(path, content),
            "size": size,
        })

    return {
        "candidates": candidates,
        "warnings": warnings,
        "stats": {
            "fileCount": len(candidates),
            "totalSize": total_size,
            "packageGroupCount": 0,
        },
    }


def analyze_zip(data: bytes, *, include_file_contents: bool = False) -> Dict[str, Any]:
    """
    Analyze ZIP archive for Python scavenger import.

    fileContents are omitted by default (Fortune Seaker reads the zip in the browser).
    Pass include_file_contents=True for server-side presets/tests.
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
        python_paths = _collect_python_paths(names)
        selected_paths = python_paths
        if len(python_paths) > MAX_ANALYZED_PYTHON:
            selected_paths = _prioritize_python_paths(python_paths, MAX_ANALYZED_PYTHON)
            warnings.append(
                "Analyzed "
                f"{len(selected_paths)} of {len(python_paths)} Python files "
                f"(limit {MAX_ANALYZED_PYTHON})"
            )

        skipped_artifacts = 0
        for name in selected_paths:
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

        dependency_contents = _collect_dependency_contents(
            archive_paths,
            lambda path: archive.read(path).decode("utf-8", errors="ignore"),
        )

    result = _finalize_python_analysis(
        entries=entries,
        archive_paths=archive_paths,
        inventory_names=names,
        python_paths=python_paths,
        selected_paths=selected_paths,
        warnings=warnings,
        extra_file_contents=dependency_contents,
    )
    result["archivePaths"] = archive_paths
    if not include_file_contents:
        result.pop("fileContents", None)
    return result


def _finalize_python_analysis(
    entries: List[Dict[str, Any]],
    archive_paths: List[str],
    inventory_names: List[str],
    python_paths: List[str],
    selected_paths: List[str],
    warnings: List[str],
    extra_file_contents: Dict[str, str] | None = None,
) -> Dict[str, Any]:
    result = analyze_python_entries(entries, warnings)
    inventory = scan_python_inventory(inventory_names)
    inventory["skippedOverPythonLimit"] = max(
        0,
        len(python_paths) - len(selected_paths),
    )
    inventory["pythonProjectRoots"] = len(find_python_project_roots(archive_paths))
    result["inventory"] = inventory

    if inventory["skippedFrontendFiles"] > 0:
        warnings.append(
            f"Frontend TS/JS files ({inventory['skippedFrontendFiles']}) "
            "are handled by Fortune Seaker, not Scavenger"
        )

    source_entries = [
        {"path": entry.get("path", ""), "content": entry.get("content", "")}
        for entry in entries
        if entry.get("path")
    ]
    file_contents = {
        str(entry.get("path", "")): str(entry.get("content", ""))
        for entry in entries
        if entry.get("path")
    }
    if extra_file_contents:
        file_contents.update(extra_file_contents)
    coverage_partial = inventory["skippedOverPythonLimit"] > 0
    archive_path_set = set(archive_paths)
    source_import_graph = validate_python_import_graph(
        source_entries,
        archive_paths=archive_path_set,
        partial=coverage_partial,
    )
    result["sourceImportGraph"] = source_import_graph
    if coverage_partial:
        partial_hint = (
            "Import coverage is partial — analyzed subset only; "
            "missing-import hints may be incomplete"
        )
        if partial_hint not in warnings:
            warnings.append(partial_hint)
    if not source_import_graph.get("passed", True):
        warnings.append(
            "Python import coverage: "
            f"{source_import_graph.get('brokenImportCount', 0)} unresolved import(s) "
            f"({source_import_graph.get('coverageRate', 0)}% clean files)"
        )

    result["packageGroups"] = discover_package_groups(
        result["candidates"],
        archive_paths,
        source_entries=source_entries,
        archive_path_set=archive_path_set,
        coverage_partial=coverage_partial,
        file_contents=file_contents,
    )
    result["stats"]["packageGroupCount"] = len(result["packageGroups"])

    project_roots = find_python_project_roots(archive_paths)
    project_dependency_paths = find_project_dependency_files(
        archive_paths,
        project_roots,
        file_contents=file_contents,
    )
    project_dependency_files = [
        {"path": path, "content": file_contents[path]}
        for path in project_dependency_paths
        if file_contents.get(path)
    ]
    result["projectDependencyPaths"] = project_dependency_paths
    result["projectRequirementsAnalysis"] = (
        analyze_requirements_against_backend(project_dependency_files)
        if project_dependency_files
        else None
    )

    result["warnings"] = warnings
    result["fileContents"] = file_contents
    return result


def analyze_directory(root: Path, prefix: str = "") -> Dict[str, Any]:
    """
    Analyze directory tree for Python scavenger import.
    """
    entries: List[Dict[str, Any]] = []
    warnings: List[str] = []
    archive_paths: List[str] = []
    all_rel_paths: List[str] = []

    for file_path in root.rglob("*"):
        if not file_path.is_file():
            continue
        rel_path = file_path.relative_to(root).as_posix()
        if prefix:
            rel_path = f"{prefix}/{rel_path}"
        all_rel_paths.append(rel_path)
        archive_paths.append(rel_path)

    budget_paths = iter_budget_archive_paths(all_rel_paths)
    noise_skipped = count_noise_archive_entries(all_rel_paths)
    if noise_skipped > 0:
        warnings.append(
            f"Skipped {noise_skipped} noise path(s) "
            "(node_modules/.git/dist/…) before entry budget"
        )
    if len(budget_paths) > MAX_ARCHIVE_ENTRIES:
        raise ValueError(
            f"Too many archive entries: {len(budget_paths)} > {MAX_ARCHIVE_ENTRIES}"
        )

    python_paths = _collect_python_paths(all_rel_paths)
    selected_paths = python_paths
    if len(python_paths) > MAX_ANALYZED_PYTHON:
        selected_paths = _prioritize_python_paths(python_paths, MAX_ANALYZED_PYTHON)
        warnings.append(
            "Analyzed "
            f"{len(selected_paths)} of {len(python_paths)} Python files "
            f"(limit {MAX_ANALYZED_PYTHON})"
        )

    selected_set = set(selected_paths)
    for file_path in root.rglob("*"):
        if not file_path.is_file():
            continue
        rel_path = file_path.relative_to(root).as_posix()
        if prefix:
            rel_path = f"{prefix}/{rel_path}"

        if is_blocked_path(rel_path):
            continue
        if rel_path not in selected_set:
            continue
        if file_path.suffix.lower() not in PYTHON_EXTENSIONS:
            continue

        size = file_path.stat().st_size
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

    dependency_contents = _collect_dependency_contents(
        archive_paths,
        lambda path: (root / path).read_text(encoding="utf-8", errors="ignore"),
    )

    result = _finalize_python_analysis(
        entries=entries,
        archive_paths=archive_paths,
        inventory_names=all_rel_paths,
        python_paths=python_paths,
        selected_paths=selected_paths,
        warnings=warnings,
        extra_file_contents=dependency_contents,
    )
    result["archivePaths"] = archive_paths
    return result
