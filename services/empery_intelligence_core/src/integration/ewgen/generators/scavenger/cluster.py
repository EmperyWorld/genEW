"""
Scavenger - Cluster Python files into importable package groups
"""

import re
from collections import defaultdict
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional, Set

from generators.importer.naming import to_kebab

from .deps import find_dependency_files_for_group, load_dependency_preview
from .import_graph import validate_python_import_graph
from .infer import infer_python_bundle
from .platform import (
    PLATFORM_DISPLAY_LABEL,
    PLATFORM_GROUP_LABEL,
    SHARED_INFRA_FOLDERS,
    attach_platform_closure,
    bootstrap_layer_names,
    collect_platform_sources,
    is_platform_api_folder,
    remaining_folder_fallback,
)
from .domain_subsplit import (
    attach_domain_shared_closure,
    domain_subsplit_label,
    split_large_domain_bucket,
)
from .requirements_compare import analyze_requirements_against_backend

PYTHON_PROJECT_MARKERS = (
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "requirements.txt",
    "Pipfile",
    "poetry.lock",
)

API_LAYER_FOLDERS = frozenset({
    "services",
    "routers",
    "schemas",
    "models",
    "repositories",
    "tasks",
    "scrapers",
    "examples",
})

INVALID_DOMAIN_STEMS = frozenset({
    "__init__",
    "init",
    "conftest",
    "setup",
    "types",
    "constants",
})

DOMAIN_SUFFIXES = (
    "_service",
    "_services",
    "_router",
    "_routers",
    "_schema",
    "_schemas",
    "_model",
    "_models",
    "_repository",
    "_repositories",
    "_middleware",
    "_util",
    "_utils",
    "_task",
    "_tasks",
    "_scraper",
    "_scrapers",
)


def _parent_dir(path: str) -> str:
    parent = PurePosixPath(path).parent.as_posix()
    if parent in ("", "."):
        return ""
    return f"{parent}/"


def find_python_project_roots(archive_paths: List[str]) -> List[str]:
    roots: Set[str] = set()
    for path in archive_paths:
        name = PurePosixPath(path).name
        if name in PYTHON_PROJECT_MARKERS:
            roots.add(_parent_dir(path))
    return sorted(roots, key=lambda item: (-len(item.split("/")), item))


def _detect_api_prefix(paths: List[str]) -> Optional[str]:
    api_segments: Dict[str, int] = defaultdict(int)
    for path in paths:
        if not path.endswith(".py"):
            continue
        parts = PurePosixPath(path).parts
        for index, part in enumerate(parts):
            if part == "api" and index > 0:
                prefix = "/".join(parts[: index + 1]) + "/"
                api_segments[prefix] += 1
    if not api_segments:
        return None
    return max(api_segments.items(), key=lambda item: item[1])[0]


def _group_key_for_path(
    path: str,
    project_roots: List[str],
    api_prefix: Optional[str],
) -> str:
    for root in sorted(project_roots, key=lambda item: (-len(item), item)):
        if root and path.startswith(root):
            relative = path[len(root):]
            child = relative.split("/")[0] if "/" in relative else ""
            if child and child != "__pycache__":
                return f"{root}{child}/"
            return root

    if api_prefix and path.startswith(api_prefix):
        relative = path[len(api_prefix):]
        child = relative.split("/")[0] if "/" in relative else ""
        if child and child != "__pycache__":
            return f"{api_prefix}{child}/"
        return api_prefix

    parts = PurePosixPath(path).parts
    if len(parts) >= 2:
        return f"{parts[0]}/{parts[1]}/"
    if parts:
        return f"{parts[0]}/"
    return ""


def _label_for_group(root: str) -> str:
    cleaned = root.rstrip("/")
    if not cleaned:
        return "python-root"
    segment = cleaned.split("/")[-1]
    if segment.endswith(".py"):
        return PurePosixPath(segment).stem
    return segment or "python-root"


def _normalize_domain_name(name: str) -> Optional[str]:
    cleaned = name.strip().lower().replace("-", "_")
    if cleaned.endswith(".py"):
        cleaned = PurePosixPath(cleaned).stem
    if not cleaned or cleaned in INVALID_DOMAIN_STEMS:
        return None
    return cleaned


def _display_label_for_group(label: str) -> str:
    if label == PLATFORM_GROUP_LABEL:
        return PLATFORM_DISPLAY_LABEL
    if label.endswith(".py"):
        return PurePosixPath(label).stem
    return label


def _layers_from_paths(paths: List[str], api_prefix: str) -> Set[str]:
    layers: Set[str] = set()
    for path in paths:
        if not path.startswith(api_prefix):
            continue
        parts = [part for part in path[len(api_prefix):].split("/") if part]
        if parts and parts[0] in API_LAYER_FOLDERS:
            layers.add(parts[0])
    return layers


def _strip_domain_suffix(stem: str) -> str:
    normalized = stem.replace("-", "_")
    lower = normalized.lower()
    for suffix in DOMAIN_SUFFIXES:
        if lower.endswith(suffix):
            return normalized[: -len(suffix)].rstrip("_")
    return normalized


def _domain_from_layer_parts(parts: List[str]) -> Optional[str]:
    """parts relative to api/, e.g. ['services', 'chat_service.py']."""
    if len(parts) < 2:
        return None
    if len(parts) >= 3:
        domain = _normalize_domain_name(parts[1])
        if domain:
            return domain
        if parts[-1].endswith(".py"):
            stem = PurePosixPath(parts[-1]).stem
            return _normalize_domain_name(_strip_domain_suffix(stem))
        return None
    leaf = parts[1]
    if leaf.endswith(".py"):
        stem = PurePosixPath(leaf).stem
        return _normalize_domain_name(_strip_domain_suffix(stem))
    return _normalize_domain_name(leaf)


def _should_cluster_by_domain(
    candidates: List[Dict[str, Any]],
    api_prefix: str,
) -> bool:
    layers_found: Set[str] = set()
    for candidate in candidates:
        path = str(candidate.get("path", ""))
        if not path.startswith(api_prefix):
            continue
        parts = [part for part in path[len(api_prefix):].split("/") if part]
        if parts and parts[0] in API_LAYER_FOLDERS:
            layers_found.add(parts[0])
    return len(layers_found) >= 2


def _common_path_prefix(paths: List[str]) -> str:
    if not paths:
        return ""
    split_paths = [path.split("/") for path in paths]
    prefix_parts: List[str] = []
    for index, segment in enumerate(split_paths[0]):
        if all(len(parts) > index and parts[index] == segment for parts in split_paths):
            prefix_parts.append(segment)
        else:
            break
    if not prefix_parts:
        return ""
    return "/".join(prefix_parts) + "/"


def _build_package_group(
    *,
    root: str,
    label: str,
    sources: List[Dict[str, Any]],
    archive_paths: List[str],
    project_roots: List[str],
    all_group_labels: Set[str],
    source_entries: Optional[List[Dict[str, Any]]],
    archive_path_set: Optional[Set[str]],
    coverage_partial: bool,
    file_contents: Optional[Dict[str, str]],
    seen_ids: Set[str],
    clustering_mode: str,
    group_kind: str,
    layers: Optional[List[str]] = None,
) -> Dict[str, Any]:
    group_id = to_kebab(label)
    if group_id in seen_ids:
        suffix = 2
        while f"{group_id}-{suffix}" in seen_ids:
            suffix += 1
        group_id = f"{group_id}-{suffix}"
    seen_ids.add(group_id)

    top_exports = sorted({
        export_name
        for item in sources
        for export_name in (item.get("exports") or [])
        if export_name
    })[:8]

    project_root = _match_project_root(root, project_roots)
    contents_map = file_contents or {}
    dependency_paths = find_dependency_files_for_group(
        archive_paths,
        root,
        project_root,
        file_contents=contents_map,
    )
    dependency_preview = load_dependency_preview(dependency_paths, contents_map)
    dependency_files = [
        {"path": path, "content": contents_map[path]}
        for path in dependency_paths
        if contents_map.get(path)
    ]
    requirements_analysis = (
        analyze_requirements_against_backend(dependency_files)
        if dependency_files
        else None
    )
    inferred = infer_python_bundle(
        sources,
        root,
        label,
        dependency_paths=dependency_paths,
        dependency_preview=dependency_preview,
    )
    candidate_paths = [str(item.get("path", "")) for item in sources]
    import_coverage = None
    if source_entries:
        import_coverage = validate_python_import_graph(
            source_entries,
            scope_paths=set(candidate_paths),
            archive_paths=archive_path_set,
            partial=coverage_partial,
            available_group_labels=all_group_labels,
            selected_group_labels={label},
        )

    payload: Dict[str, Any] = {
        "id": group_id,
        "root": root,
        "label": label,
        "displayLabel": _display_label_for_group(label),
        "projectRoot": project_root,
        "dependencyPaths": dependency_paths,
        "dependencyPreview": dependency_preview,
        "requirementsAnalysis": requirements_analysis,
        "suggestedModuleName": inferred["suggestedModuleName"],
        "suggestedModuleType": "imported",
        "sourceCount": len(sources),
        "candidatePaths": candidate_paths,
        "topExports": top_exports,
        "integrationHints": inferred["integrationHints"],
        "importCoverage": import_coverage,
        "clusteringMode": clustering_mode,
        "groupKind": group_kind,
    }
    if layers:
        payload["layers"] = layers
    if group_kind in {"domain", "feature", "folder"}:
        payload["preparable"] = True
    return payload


def _discover_folder_package_groups(
    grouped: Dict[str, List[Dict[str, Any]]],
    archive_paths: List[str],
    project_roots: List[str],
    source_entries: Optional[List[Dict[str, Any]]],
    archive_path_set: Optional[Set[str]],
    coverage_partial: bool,
    file_contents: Optional[Dict[str, str]],
) -> List[Dict[str, Any]]:
    groups: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    all_group_labels: Set[str] = {
        _label_for_group(root) for root in grouped
    }

    for root in sorted(
        grouped.keys(),
        key=lambda key: (-len(grouped[key]), key),
    ):
        sources = grouped[root]
        if not sources:
            continue

        label = _label_for_group(root)
        groups.append(
            _build_package_group(
                root=root,
                label=label,
                sources=sources,
                archive_paths=archive_paths,
                project_roots=project_roots,
                all_group_labels=all_group_labels,
                source_entries=source_entries,
                archive_path_set=archive_path_set,
                coverage_partial=coverage_partial,
                file_contents=file_contents,
                seen_ids=seen_ids,
                clustering_mode="folder",
                group_kind="folder",
            ),
        )

    return groups


def _discover_domain_package_groups(
    candidates: List[Dict[str, Any]],
    archive_paths: List[str],
    api_prefix: str,
    project_roots: List[str],
    source_entries: Optional[List[Dict[str, Any]]],
    archive_path_set: Optional[Set[str]],
    coverage_partial: bool,
    file_contents: Optional[Dict[str, str]],
) -> List[Dict[str, Any]]:
    domain_buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    domain_layers: Dict[str, Set[str]] = defaultdict(set)
    feature_buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    shared_buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    platform_feature_buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    api_bootstrap: List[Dict[str, Any]] = []
    folder_fallback: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for candidate in candidates:
        path = str(candidate.get("path", ""))
        if not path:
            continue

        if not path.startswith(api_prefix):
            key = _group_key_for_path(path, project_roots, api_prefix)
            folder_fallback[key].append(candidate)
            continue

        relative_parts = [part for part in path[len(api_prefix):].split("/") if part]
        if not relative_parts:
            folder_fallback[api_prefix].append(candidate)
            continue

        first = relative_parts[0]

        if len(relative_parts) == 1 and first.endswith(".py"):
            api_bootstrap.append(candidate)
            continue

        if first in SHARED_INFRA_FOLDERS:
            shared_buckets[first].append(candidate)
            continue

        if first not in API_LAYER_FOLDERS:
            feature_key = _normalize_domain_name(first) or first
            if is_platform_api_folder(feature_key):
                platform_feature_buckets[feature_key].append(candidate)
            else:
                feature_buckets[feature_key].append(candidate)
            continue

        domain = _domain_from_layer_parts(relative_parts)
        if not domain:
            folder_fallback[f"{api_prefix}{first}/"].append(candidate)
            continue

        domain_buckets[domain].append(candidate)
        domain_layers[domain].add(first)

    for feature_name, sources in list(feature_buckets.items()):
        if feature_name not in domain_buckets:
            continue
        domain_buckets[feature_name].extend(sources)
        domain_layers[feature_name].update(
            _layers_from_paths(
                [str(item.get("path", "")) for item in sources],
                api_prefix,
            ),
        )
        del feature_buckets[feature_name]

    groups: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    all_group_labels: Set[str] = set()

    expanded_domain_buckets: Dict[str, List[Dict[str, Any]]] = {}
    domain_parent_map: Dict[str, str] = {}
    domain_feature_map: Dict[str, str] = {}
    domain_shared_paths: Dict[str, List[str]] = {}
    for domain, sources in domain_buckets.items():
        feature_splits, shared_sources = split_large_domain_bucket(
            domain,
            sources,
            api_prefix,
        )
        if not feature_splits:
            expanded_domain_buckets[domain] = sources
            continue
        for feature, feature_sources in feature_splits.items():
            label = domain_subsplit_label(domain, feature)
            expanded_domain_buckets[label] = feature_sources
            domain_parent_map[label] = domain
            domain_feature_map[label] = feature
        if shared_sources:
            domain_shared_paths[domain] = [
                str(item.get("path", ""))
                for item in shared_sources
                if item.get("path")
            ]

    for domain in sorted(expanded_domain_buckets, key=lambda key: (-len(expanded_domain_buckets[key]), key)):
        all_group_labels.add(domain)
    for feature in feature_buckets:
        all_group_labels.add(feature)
    for shared in shared_buckets:
        all_group_labels.add(shared)

    for domain in sorted(expanded_domain_buckets, key=lambda key: (-len(expanded_domain_buckets[key]), key)):
        sources = expanded_domain_buckets[domain]
        if not sources:
            continue
        paths = [str(item.get("path", "")) for item in sources]
        root = _common_path_prefix(paths) or f"{api_prefix}domains/{domain}/"
        parent_domain = domain_parent_map.get(domain, domain)
        feature_name = domain_feature_map.get(domain)
        layers = sorted(domain_layers.get(parent_domain, domain_layers.get(domain, set())))
        display_label = (
            f"{parent_domain} / {feature_name}"
            if feature_name
            else _display_label_for_group(domain)
        )
        group = _build_package_group(
            root=root,
            label=domain,
            sources=sources,
            archive_paths=archive_paths,
            project_roots=project_roots,
            all_group_labels=all_group_labels,
            source_entries=source_entries,
            archive_path_set=archive_path_set,
            coverage_partial=coverage_partial,
            file_contents=file_contents,
            seen_ids=seen_ids,
            clustering_mode="domain",
            group_kind="domain",
            layers=layers,
        )
        group["displayLabel"] = display_label
        if feature_name:
            group["parentDomain"] = parent_domain
            group["domainFeature"] = feature_name
        groups.append(group)

    for feature in sorted(feature_buckets, key=lambda key: (-len(feature_buckets[key]), key)):
        sources = feature_buckets[feature]
        if not sources:
            continue
        groups.append(
            _build_package_group(
                root=f"{api_prefix}{feature}/",
                label=feature,
                sources=sources,
                archive_paths=archive_paths,
                project_roots=project_roots,
                all_group_labels=all_group_labels,
                source_entries=source_entries,
                archive_path_set=archive_path_set,
                coverage_partial=coverage_partial,
                file_contents=file_contents,
                seen_ids=seen_ids,
                clustering_mode="domain",
                group_kind="feature",
            ),
        )

    platform_sources = collect_platform_sources(
        api_bootstrap=api_bootstrap,
        shared_buckets=shared_buckets,
        platform_feature_buckets=platform_feature_buckets,
        folder_fallback=folder_fallback,
        api_prefix=api_prefix,
    )
    platform_paths: List[str] = []
    if platform_sources:
        all_group_labels.add(PLATFORM_GROUP_LABEL)
        platform_paths = [str(item.get("path", "")) for item in platform_sources if item.get("path")]
        groups.append(
            _build_package_group(
                root=api_prefix,
                label=PLATFORM_GROUP_LABEL,
                sources=platform_sources,
                archive_paths=archive_paths,
                project_roots=project_roots,
                all_group_labels=all_group_labels,
                source_entries=source_entries,
                archive_path_set=archive_path_set,
                coverage_partial=coverage_partial,
                file_contents=file_contents,
                seen_ids=seen_ids,
                clustering_mode="domain",
                group_kind="platform",
                layers=bootstrap_layer_names(platform_paths, api_prefix),
            ),
        )
        platform_group = groups[-1]
        platform_group["displayLabel"] = PLATFORM_DISPLAY_LABEL
        platform_group["preparable"] = False

    attach_platform_closure(groups, platform_paths)

    for parent_domain, shared_paths in domain_shared_paths.items():
        attach_domain_shared_closure(
            groups,
            domain=parent_domain,
            shared_paths=shared_paths,
        )

    external_fallback = remaining_folder_fallback(folder_fallback, api_prefix)
    if external_fallback:
        groups.extend(
            _discover_folder_package_groups(
                external_fallback,
                archive_paths,
                project_roots,
                source_entries,
                archive_path_set,
                coverage_partial,
                file_contents,
            ),
        )

    return groups


def discover_package_groups(
    candidates: List[Dict[str, Any]],
    archive_paths: List[str],
    source_entries: Optional[List[Dict[str, Any]]] = None,
    archive_path_set: Optional[Set[str]] = None,
    coverage_partial: bool = False,
    file_contents: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Group analyzed Python candidates into scavenger package groups.

    Layered FastAPI trees (api/services + api/routers + …) are clustered by domain
    module name so routers, schemas and services for the same feature stay together.
    """
    project_roots = find_python_project_roots(archive_paths)
    py_paths = [str(item.get("path", "")) for item in candidates if item.get("path")]
    api_prefix = _detect_api_prefix(py_paths)

    if api_prefix and _should_cluster_by_domain(candidates, api_prefix):
        return _discover_domain_package_groups(
            candidates,
            archive_paths,
            api_prefix,
            project_roots,
            source_entries,
            archive_path_set,
            coverage_partial,
            file_contents,
        )

    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for candidate in candidates:
        path = str(candidate.get("path", ""))
        if not path:
            continue
        key = _group_key_for_path(path, project_roots, api_prefix)
        grouped[key].append(candidate)

    return _discover_folder_package_groups(
        grouped,
        archive_paths,
        project_roots,
        source_entries,
        archive_path_set,
        coverage_partial,
        file_contents,
    )


def _match_project_root(group_root: str, project_roots: List[str]) -> Optional[str]:
    for root in sorted(project_roots, key=lambda item: (-len(item), item)):
        if group_root.startswith(root):
            return root
    return None
