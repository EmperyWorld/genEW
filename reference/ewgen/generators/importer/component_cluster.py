"""
Fortune Seaker - Component clustering for monorepo archives
Groups source files into importable components by package.json roots and folder prefixes.
"""

import json
import re
from collections import defaultdict
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional, Set

from .fe_platform import (
    PLATFORM_DISPLAY_LABEL,
    PLATFORM_GROUP_LABEL,
    attach_platform_closure,
    collect_platform_sources,
    is_platform_component_folder,
)
from .infer import infer_import_bundle
from .naming import normalize_module_name, to_kebab
from .path_filters import is_blocked_path
from .source_import_graph import validate_source_import_graph

LARGE_PACKAGE_SPLIT_THRESHOLD = 40
MIN_SPLIT_COMPONENT_FOLDERS = 2
MIN_ORPHAN_AREA_SPLIT = 8
LARGE_COMPONENT_SUBSPLIT_THRESHOLD = 15
MIN_COMPONENT_SUBSPLIT_FOLDERS = 2

COMPONENT_FOLDER_MARKERS = (
    "src/components/",
    "src/features/",
    "src/pages/",
    "src/widgets/",
    "src/modules/",
    "src/views/",
)

SRC_AREA_FOLDERS = frozenset({
    "hooks",
    "utils",
    "lib",
    "api",
    "contexts",
    "stores",
    "services",
    "types",
    "constants",
    "config",
    "layouts",
    "routes",
    "providers",
    "theme",
    "styles",
    "shared",
    "core",
    "state",
    "i18n",
    "locales",
})

ROUTER_ENTRY_STEMS = frozenset({
    "AppRouter",
    "Router",
    "routes",
    "AppRoutes",
    "MainRouter",
})

SOURCE_FILE_RE = re.compile(r"\.(tsx?|jsx?|mjs|cjs)$", re.IGNORECASE)


def find_package_json_paths(archive_paths: List[str]) -> List[str]:
    """Collect package.json paths from an archive listing."""
    paths: List[str] = []
    for path in archive_paths:
        if path.endswith("/"):
            continue
        if not path.endswith("package.json"):
            continue
        if "node_modules" in path.lower():
            continue
        if is_blocked_path(path):
            continue
        paths.append(path)
    return sorted(paths)


def _package_root(package_json_path: str) -> str:
    parent = PurePosixPath(package_json_path).parent.as_posix()
    if not parent or parent == ".":
        return ""
    return f"{parent}/"


def _is_workspace_root_package(
    package_json_path: str,
    package_map: Dict[str, str],
    package_json_paths: List[str],
) -> bool:
    """Detect monorepo workspace roots that should not become import groups."""
    content = package_map.get(package_json_path, "")
    if not content:
        return False

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return False

    root = _package_root(package_json_path)
    nested_packages = [
        path
        for path in package_json_paths
        if path != package_json_path and path.startswith(root)
    ]
    if not nested_packages:
        return False

    if data.get("workspaces"):
        return True

    name = str(data.get("name", "")).strip()
    is_private = data.get("private") is True
    has_entry = bool(data.get("main") or data.get("module") or data.get("exports"))
    if is_private and not has_entry:
        return True

    if name and not has_entry and nested_packages:
        return True

    return False


def _filter_importable_package_paths(
    package_json_paths: List[str],
    package_map: Dict[str, str],
) -> List[str]:
    """Drop workspace root package.json files when nested packages exist."""
    filtered = list(package_json_paths)
    for path in package_json_paths:
        if _is_workspace_root_package(path, package_map, package_json_paths):
            filtered = [item for item in filtered if item != path]
    return filtered


def _build_package_roots(package_json_paths: List[str]) -> List[str]:
    roots = {_package_root(path) for path in package_json_paths}
    return sorted(roots, key=lambda root: (-len(root.split("/")), root))


def _match_package_root(path: str, roots: List[str]) -> Optional[str]:
    for root in roots:
        if root == "":
            continue
        if path.startswith(root):
            return root
    return None


def _to_pascal_component(leaf: str) -> str:
    stem = re.sub(r"\.(tsx?|jsx?|mjs|cjs)$", "", leaf, flags=re.IGNORECASE)
    if not stem:
        return "Core"
    if re.match(r"^[A-Z][a-zA-Z0-9]*$", stem):
        return stem
    parts = re.split(r"[-_./]+", stem)
    return "".join(part.capitalize() for part in parts if part) or "Core"


def _component_suffix_from_sub_root(package_root: str, sub_root: str) -> str:
    relative = sub_root.removeprefix(package_root).strip("/")
    if not relative:
        return "Core"
    leaf = relative.rstrip("/").split("/")[-1]
    return _to_pascal_component(leaf)


def _component_display_label(package_root: str, sub_root: str) -> str:
    """Short UI label: component folder/file name without package path prefix."""
    return _component_suffix_from_sub_root(package_root, sub_root)


def _suggested_module_name_for_split(
    _package_module_name: str,
    package_root: str,
    sub_root: str,
    package_json: Optional[str],
) -> str:
    """Component bundle id from folder name only (uniqueness handled upstream)."""
    suffix = _component_suffix_from_sub_root(package_root, sub_root)
    return normalize_module_name(suffix, package_json)


def _slug_for_group(
    root: str,
    package_json_path: Optional[str],
    package_contents: Dict[str, str],
) -> str:
    if package_json_path and package_json_path in package_contents:
        try:
            data = json.loads(package_contents[package_json_path])
            name = str(data.get("name", "")).strip()
            if name:
                cleaned = re.sub(r"^@[^/]+/", "", name)
                slug = re.sub(r"[^a-z0-9]+", "-", cleaned.lower()).strip("-")
                if slug:
                    return slug
        except json.JSONDecodeError:
            pass

    parts = [part for part in root.rstrip("/").split("/") if part]
    if parts:
        return to_kebab(parts[-1])
    return "component"


def _package_json_for_root(
    root: str,
    package_json_paths: List[str],
) -> Optional[str]:
    exact = f"{root.rstrip('/')}/package.json"
    for path in package_json_paths:
        if path == exact or path.endswith(f"/{exact}"):
            return path
    for path in package_json_paths:
        if _package_root(path) == root:
            return path
    return None


def _folder_prefix(path: str) -> str:
    parts = PurePosixPath(path).parts
    if len(parts) <= 1:
        return ""
    return f"{parts[0]}/"


def _component_folder_key(package_root: str, path: str) -> Optional[str]:
    """Return src/components/<Name>/ key relative to package root, if any."""
    if package_root and not path.startswith(package_root):
        return None
    relative = path[len(package_root):] if package_root else path
    for marker in COMPONENT_FOLDER_MARKERS:
        if marker not in relative:
            continue
        tail = relative.split(marker, 1)[1]
        if not tail:
            continue
        parts = tail.split("/")
        first = parts[0]
        if not first:
            continue
        if len(parts) == 1 and SOURCE_FILE_RE.search(first):
            stem = PurePosixPath(first).stem
            if stem:
                return f"{marker}{stem}/"
        return f"{marker}{first}/"
    return None


def _is_top_level_component_router_relative(relative: str) -> bool:
    """Only src/components/AppRouter.tsx — not nested viewers/FormatRouter.tsx."""
    for marker in COMPONENT_FOLDER_MARKERS:
        if marker not in relative:
            continue
        tail = relative.split(marker, 1)[1]
        parts = [part for part in tail.split("/") if part]
        if len(parts) == 1 and SOURCE_FILE_RE.search(parts[0]):
            return True
        if (
            len(parts) == 2
            and parts[1].lower() in ("index.tsx", "index.ts", "index.jsx", "index.js")
        ):
            return True
        return False
    return False


def _is_router_entry(path: str) -> bool:
    stem = PurePosixPath(path).stem
    if stem not in ROUTER_ENTRY_STEMS and not stem.endswith("Router"):
        return False
    normalized = path.replace("\\", "/")
    for marker in COMPONENT_FOLDER_MARKERS:
        marker_index = normalized.find(marker)
        if marker_index < 0:
            continue
        relative = normalized[marker_index:]
        return _is_top_level_component_router_relative(relative)
    return False


def _split_orphans_by_src_area(
    package_root: str,
    orphans: List[Dict[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    if len(orphans) < MIN_ORPHAN_AREA_SPLIT:
        return {"": orphans}

    buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for candidate in orphans:
        path = str(candidate.get("path", ""))
        relative = path[len(package_root):] if package_root else path
        parts = [part for part in relative.split("/") if part]
        area_key = ""
        if len(parts) >= 2 and parts[0] == "src" and parts[1] in SRC_AREA_FOLDERS:
            area_key = f"src/{parts[1]}/"
        buckets[area_key].append(candidate)

    area_keys = [key for key in buckets if key]
    if len(area_keys) < 2:
        return {"": orphans}
    return buckets


def _split_sources_by_component_folder(
    package_root: str,
    sources: List[Dict[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for candidate in sources:
        path = str(candidate.get("path", ""))
        folder_key = _component_folder_key(package_root, path)
        if folder_key:
            buckets[folder_key].append(candidate)
        else:
            buckets[""].append(candidate)
    return buckets


def _split_large_component_folder_sources(
    package_root: str,
    component_folder_key: str,
    sources: List[Dict[str, Any]],
) -> List[tuple[str, List[Dict[str, Any]]]]:
    """Split oversized src/components/<Name>/ trees by immediate child folder."""
    component_root = f"{package_root}{component_folder_key}"
    if len(sources) < LARGE_COMPONENT_SUBSPLIT_THRESHOLD:
        return [(component_root, sources)]

    buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for candidate in sources:
        path = str(candidate.get("path", ""))
        if not path.startswith(component_root):
            buckets[""].append(candidate)
            continue
        relative = path[len(component_root):]
        parts = [part for part in relative.split("/") if part]
        if len(parts) <= 1:
            buckets[""].append(candidate)
            continue
        buckets[f"{parts[0]}/"].append(candidate)

    subfolder_keys = [key for key in buckets if key and buckets[key]]
    if len(subfolder_keys) < MIN_COMPONENT_SUBSPLIT_FOLDERS:
        return [(component_root, sources)]

    splits: List[tuple[str, List[Dict[str, Any]]]] = []
    root_sources = buckets.get("", [])
    if root_sources:
        splits.append((component_root, root_sources))
    for subfolder_key in sorted(
        subfolder_keys,
        key=lambda key: (-len(buckets[key]), key),
    ):
        splits.append((f"{component_root}{subfolder_key}", list(buckets[subfolder_key])))
    return splits


def _split_assets_by_component_folder(
    package_root: str,
    assets: List[Dict[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for asset in assets:
        path = str(asset.get("path", ""))
        folder_key = _component_folder_key(package_root, path)
        if folder_key:
            buckets[folder_key].append(asset)
        else:
            buckets[""].append(asset)
    return buckets


def _plan_package_source_splits(
    package_root: str,
    sources: List[Dict[str, Any]],
    _source_entries: Optional[List[Dict[str, Any]]] = None,
    _archive_path_set: Optional[Set[str]] = None,
) -> tuple[List[tuple[str, List[Dict[str, Any]]]], List[Dict[str, Any]]]:
    if len(sources) < LARGE_PACKAGE_SPLIT_THRESHOLD:
        return [(package_root, sources)], []

    buckets = _split_sources_by_component_folder(package_root, sources)
    component_keys = sorted(
        key for key in buckets if key and len(buckets[key]) > 0
    )
    if len(component_keys) < MIN_SPLIT_COMPONENT_FOLDERS:
        return [(package_root, sources)], []

    planned_map: Dict[str, List[Dict[str, Any]]] = {}
    platform_component_buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for key in component_keys:
        if is_platform_component_folder(key):
            platform_component_buckets[key] = list(buckets[key])
            continue
        for sub_root, sub_sources in _split_large_component_folder_sources(
            package_root,
            key,
            list(buckets[key]),
        ):
            planned_map[sub_root] = sub_sources

    orphan_splits = _split_orphans_by_src_area(package_root, list(buckets.get("", [])))
    platform_sources = collect_platform_sources(
        platform_component_buckets=platform_component_buckets,
        orphan_buckets=orphan_splits,
        package_root=package_root,
    )

    splits = sorted(
        ((sub_root, sub_sources) for sub_root, sub_sources in planned_map.items() if sub_sources),
        key=lambda item: (-len(item[1]), item[0]),
    )
    return splits, platform_sources


def prioritize_source_paths(
    paths: List[str],
    package_json_paths: List[str],
    limit: int,
) -> List[str]:
    """
    When an archive has more source files than the analyze limit, keep package-scoped
    files first and deprioritize tests/specs.
    """
    if len(paths) <= limit:
        return paths

    package_roots = _build_package_roots(package_json_paths)

    def sort_key(path: str) -> tuple:
        in_package = 0 if _match_package_root(path, package_roots) is not None else 1
        is_test = 1 if re.search(r"\.(test|spec)\.(tsx?|jsx?)$", path, re.IGNORECASE) else 0
        return (in_package, is_test, path.count("/"), path)

    return sorted(paths, key=sort_key)[:limit]


def discover_component_groups(
    candidates: List[Dict[str, Any]],
    asset_candidates: List[Dict[str, Any]],
    archive_paths: List[str],
    package_contents: Optional[Dict[str, str]] = None,
    source_entries: Optional[List[Dict[str, Any]]] = None,
    archive_path_set: Optional[Set[str]] = None,
    coverage_partial: bool = False,
) -> List[Dict[str, Any]]:
    """
    Cluster analyzed candidates into importable components (packages / subprojects).
    """
    package_json_paths = find_package_json_paths(archive_paths)
    package_map = package_contents or {}
    package_json_paths = _filter_importable_package_paths(
        package_json_paths,
        package_map,
    )
    package_roots = _build_package_roots(package_json_paths)

    source_candidates = [
        candidate
        for candidate in candidates
        if candidate.get("suggestedModuleType") != "asset"
    ]

    grouped_sources: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    unassigned: List[Dict[str, Any]] = []

    for candidate in source_candidates:
        path = str(candidate.get("path", ""))
        if not path:
            continue
        root = _match_package_root(path, package_roots)
        if root is not None:
            grouped_sources[root].append(candidate)
        else:
            unassigned.append(candidate)

    if unassigned:
        prefix_groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for candidate in unassigned:
            prefix = _folder_prefix(str(candidate.get("path", "")))
            prefix_groups[prefix or "__root__"].append(candidate)

        for prefix, items in prefix_groups.items():
            root = "" if prefix == "__root__" else prefix
            grouped_sources[root].extend(items)

    grouped_assets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for asset in asset_candidates:
        path = str(asset.get("path", ""))
        root = _match_package_root(path, package_roots)
        if root is None:
            root = _folder_prefix(path) or ""
        grouped_assets[root].append(asset)

    groups: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    seen_module_names: Set[str] = set()
    seen_labels: Set[str] = set()

    def _unique_module_name(name: str, package_json: Optional[str]) -> str:
        candidate = normalize_module_name(name, package_json)
        if candidate not in seen_module_names:
            seen_module_names.add(candidate)
            return candidate

        suffix = 2
        while suffix < 100:
            stem = candidate
            suffix_text = str(suffix)
            if len(stem) + len(suffix_text) > 50:
                stem = stem[: 50 - len(suffix_text)]
            next_name = normalize_module_name(f"{stem}{suffix_text}", package_json)
            if next_name not in seen_module_names:
                seen_module_names.add(next_name)
                return next_name
            suffix += 1

        seen_module_names.add(candidate)
        return candidate

    def _unique_group_id(base_id: str) -> str:
        if base_id not in seen_ids:
            seen_ids.add(base_id)
            return base_id
        suffix = 2
        while f"{base_id}-{suffix}" in seen_ids:
            suffix += 1
        unique = f"{base_id}-{suffix}"
        seen_ids.add(unique)
        return unique

    def _unique_display_label(name: str) -> str:
        candidate = name.strip() or "Component"
        if candidate not in seen_labels:
            seen_labels.add(candidate)
            return candidate
        suffix = 2
        while f"{candidate} ({suffix})" in seen_labels:
            suffix += 1
        unique = f"{candidate} ({suffix})"
        seen_labels.add(unique)
        return unique

    def _is_platform_support_relative(relative: str) -> bool:
        parts = [part for part in relative.split("/") if part]
        if len(parts) >= 2 and parts[0] == "src" and parts[1] in SRC_AREA_FOLDERS:
            return True
        if len(parts) >= 3 and parts[0] == "src" and parts[1] == "components":
            return parts[2].lower() in {"ui", "shared"}
        return False

    def _append_group(
        package_root: str,
        sub_root: str,
        sources: List[Dict[str, Any]],
        assets: List[Dict[str, Any]],
        *,
        split_from_package: bool,
        package_label: str,
        forced_label: Optional[str] = None,
        forced_display_label: Optional[str] = None,
        forced_group_kind: Optional[str] = None,
    ) -> None:
        package_json_path = _package_json_for_root(package_root, package_json_paths)
        base_id = _slug_for_group(sub_root, package_json_path, package_map)
        if split_from_package and sub_root != package_root:
            component_slug = sub_root.removeprefix(package_root).strip("/").replace("/", "-")
            base_id = f"{base_id}-{component_slug}" if component_slug else f"{base_id}-core"
        group_id = _unique_group_id(base_id)

        package_json = (
            package_map.get(package_json_path, "")
            if package_json_path
            else None
        )
        inferred = infer_import_bundle(
            sources,
            package_json=package_json or None,
            source="zip",
        )

        if forced_label:
            label = forced_label
        elif split_from_package and sub_root != package_root:
            label = _component_display_label(package_root, sub_root)
        elif split_from_package and sub_root == package_root:
            label = PLATFORM_GROUP_LABEL
        else:
            label = package_label
        label = _unique_display_label(label)
        display_label = forced_display_label or label

        package_module_name = inferred["suggestedModuleName"]
        if split_from_package:
            suggested_name = _suggested_module_name_for_split(
                package_module_name,
                package_root,
                sub_root,
                package_json,
            )
        else:
            suggested_name = package_module_name
        suggested_name = _unique_module_name(suggested_name, package_json)

        candidate_paths = [str(item.get("path", "")) for item in sources]
        asset_paths = [str(item.get("path", "")) for item in assets]
        import_coverage = None
        if source_entries:
            scope_paths = set(candidate_paths + asset_paths)
            import_coverage = validate_source_import_graph(
                source_entries,
                scope_paths=scope_paths,
                archive_paths=archive_path_set,
                partial=coverage_partial,
            )

        group_payload: Dict[str, Any] = {
            "id": group_id,
            "root": sub_root,
            "label": label,
            "displayLabel": display_label,
            "packageJsonPath": package_json_path,
            "suggestedModuleName": suggested_name,
            "suggestedModuleType": inferred["suggestedModuleType"],
            "sourceCount": len(sources),
            "assetCount": len(assets),
            "candidatePaths": candidate_paths,
            "assetPaths": asset_paths,
            "topExports": sorted({
                export_name
                for item in sources
                for export_name in (item.get("exports") or [])
                if export_name
            })[:8],
            "importCoverage": import_coverage,
        }
        if split_from_package:
            group_payload["parentPackageRoot"] = package_root
            group_payload["splitFromPackage"] = True
            if forced_group_kind:
                group_payload["groupKind"] = forced_group_kind
            else:
                has_router_entry = any(
                    _is_router_entry(str(item.get("path", "")))
                    for item in sources
                )
                if has_router_entry:
                    group_payload["groupKind"] = "router"
                    group_payload["preparable"] = True
                elif sub_root != package_root:
                    group_payload["groupKind"] = "component"
                    group_payload["preparable"] = True
                else:
                    group_payload["groupKind"] = "platform"
                    group_payload["preparable"] = False
        groups.append(group_payload)

    for root in sorted(
        grouped_sources.keys(),
        key=lambda key: (-len(grouped_sources[key]), key),
    ):
        sources = grouped_sources[root]
        if not sources:
            continue

        package_json_path = _package_json_for_root(root, package_json_paths)
        package_json = (
            package_map.get(package_json_path, "")
            if package_json_path
            else None
        )
        package_label = _slug_for_group(root, package_json_path, package_map)
        if package_json_path and package_json:
            try:
                package_label = str(json.loads(package_json).get("name", package_label))
            except json.JSONDecodeError:
                pass
        elif root:
            package_label = root.rstrip("/").split("/")[-1] or package_label

        package_assets = grouped_assets.get(root, [])
        package_group_start = len(groups)
        source_splits, platform_sources = _plan_package_source_splits(
            root,
            sources,
            source_entries,
            archive_path_set,
        )
        split_from_package = len(source_splits) > 1 or bool(platform_sources)

        for sub_root, sub_sources in source_splits:
            if not sub_sources:
                continue
            sub_assets = [
                asset
                for asset in package_assets
                if str(asset.get("path", "")).startswith(sub_root)
            ]
            _append_group(
                root,
                sub_root,
                sub_sources,
                sub_assets,
                split_from_package=split_from_package,
                package_label=package_label,
            )

        if platform_sources:
            platform_paths = [
                str(item.get("path", ""))
                for item in platform_sources
                if item.get("path")
            ]
            platform_assets: List[Dict[str, Any]] = []
            for asset in package_assets:
                path = str(asset.get("path", ""))
                relative = path[len(root):] if path.startswith(root) else path
                if _is_platform_support_relative(relative):
                    platform_assets.append(asset)
            _append_group(
                root,
                root,
                platform_sources,
                platform_assets,
                split_from_package=True,
                package_label=package_label,
                forced_label=PLATFORM_GROUP_LABEL,
                forced_display_label=PLATFORM_DISPLAY_LABEL,
                forced_group_kind="platform",
            )
            platform_group = groups[-1]
            platform_group["preparable"] = False
            attach_platform_closure(groups[package_group_start:], platform_paths, root)

    return groups
