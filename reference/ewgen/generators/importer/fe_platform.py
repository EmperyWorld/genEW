"""
Fortune Seaker - Frontend platform foundation bundled with feature components
"""

from pathlib import PurePosixPath
from typing import Any, Dict, List, Set

PLATFORM_GROUP_LABEL = "fe_platform"
PLATFORM_DISPLAY_LABEL = "Frontend platform"

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

PLATFORM_COMPONENT_NAMES = frozenset({
    "ui",
    "shared",
})

SRC_SHELL_FILES = frozenset({
    "app.tsx",
    "app.ts",
    "main.tsx",
    "main.ts",
    "index.tsx",
    "index.ts",
})

PREPARABLE_GROUP_KINDS = frozenset({"component", "router"})


def is_platform_component_folder(folder_key: str) -> bool:
    segment = folder_key.rstrip("/").split("/")[-1].lower()
    return segment in PLATFORM_COMPONENT_NAMES


def is_src_shell_relative_path(relative: str) -> bool:
    parts = [part for part in relative.split("/") if part]
    if len(parts) == 2 and parts[0] == "src":
        return parts[1].lower() in SRC_SHELL_FILES
    return False


def is_preparable_fe_group(group: Dict[str, Any]) -> bool:
    if group.get("preparable") is False:
        return False
    return str(group.get("groupKind", "")) in PREPARABLE_GROUP_KINDS


def platform_paths_from_group(group: Dict[str, Any]) -> List[str]:
    return [
        str(path)
        for path in (group.get("candidatePaths") or [])
        if path
    ]


def attach_platform_closure(
    groups: List[Dict[str, Any]],
    platform_paths: List[str],
    package_root: str,
) -> None:
    if not platform_paths:
        return
    for group in groups:
        if group.get("parentPackageRoot") != package_root:
            continue
        if not is_preparable_fe_group(group):
            continue
        feature_paths = platform_paths_from_group(group)
        asset_paths = [
            str(path)
            for path in (group.get("assetPaths") or [])
            if path
        ]
        group["platformClosurePaths"] = sorted(
            set(feature_paths) | set(asset_paths) | set(platform_paths),
        )
        group["platformFileCount"] = len(platform_paths)
        group["preparable"] = True


def collect_platform_sources(
    *,
    platform_component_buckets: Dict[str, List[Dict[str, Any]]],
    orphan_buckets: Dict[str, List[Dict[str, Any]]],
    package_root: str,
) -> List[Dict[str, Any]]:
    sources: List[Dict[str, Any]] = []
    seen_paths: Set[str] = set()

    def add_sources(items: List[Dict[str, Any]]) -> None:
        for item in items:
            path = str(item.get("path", ""))
            if not path or path in seen_paths:
                continue
            seen_paths.add(path)
            sources.append(item)

    for bucket_sources in platform_component_buckets.values():
        add_sources(bucket_sources)

    for area_key, bucket_sources in orphan_buckets.items():
        if area_key:
            add_sources(bucket_sources)
            continue
        for item in bucket_sources:
            path = str(item.get("path", ""))
            relative = path[len(package_root):] if package_root and path.startswith(package_root) else path
            if is_src_shell_relative_path(relative) or _is_platform_support_path(relative):
                add_sources([item])

    return sources


def _is_platform_support_path(relative: str) -> bool:
    parts = [part for part in relative.split("/") if part]
    if len(parts) >= 2 and parts[0] == "src" and parts[1] in SRC_AREA_FOLDERS:
        return True
    return False
