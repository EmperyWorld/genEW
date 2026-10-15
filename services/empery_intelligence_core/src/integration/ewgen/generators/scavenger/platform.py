"""
Scavenger - API platform foundation bundled with every domain module
"""

from pathlib import PurePosixPath
from typing import Any, Dict, List, Set

PLATFORM_GROUP_LABEL = "api_platform"
API_BOOTSTRAP_LABEL = "api_bootstrap"

SHARED_INFRA_FOLDERS = frozenset({
    "core",
    "middleware",
    "utils",
    "monitoring",
    "migrations",
    "workers",
})
PLATFORM_DISPLAY_LABEL = "API platform"

PLATFORM_API_FOLDERS = frozenset({
    "socketio_handler",
    "websocket_handler",
    "telemetry",
    "celery_app",
})

PREPARABLE_GROUP_KINDS = frozenset({"domain", "feature", "folder"})


def is_platform_api_folder(name: str) -> bool:
    normalized = name.strip().lower().replace("-", "_")
    if not normalized:
        return False
    if normalized in PLATFORM_API_FOLDERS:
        return True
    if normalized in SHARED_INFRA_FOLDERS:
        return True
    if normalized.endswith("_handler"):
        return True
    return False


def is_preparable_group(group: Dict[str, Any]) -> bool:
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
) -> None:
    if not platform_paths:
        return
    for group in groups:
        if not is_preparable_group(group):
            continue
        domain_paths = platform_paths_from_group(group)
        group["platformClosurePaths"] = sorted(set(domain_paths) | set(platform_paths))
        group["platformFileCount"] = len(platform_paths)
        group["preparable"] = True


def fallback_under_api_prefix(key: str, api_prefix: str) -> bool:
    normalized_key = key.replace("\\", "/")
    normalized_prefix = api_prefix.replace("\\", "/")
    return normalized_key.startswith(normalized_prefix)


def collect_platform_sources(
    *,
    api_bootstrap: List[Dict[str, Any]],
    shared_buckets: Dict[str, List[Dict[str, Any]]],
    platform_feature_buckets: Dict[str, List[Dict[str, Any]]],
    folder_fallback: Dict[str, List[Dict[str, Any]]],
    api_prefix: str,
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

    add_sources(api_bootstrap)
    for bucket_sources in shared_buckets.values():
        add_sources(bucket_sources)
    for bucket_sources in platform_feature_buckets.values():
        add_sources(bucket_sources)

    for key, bucket_sources in folder_fallback.items():
        if fallback_under_api_prefix(key, api_prefix):
            add_sources(bucket_sources)

    return sources


def remaining_folder_fallback(
    folder_fallback: Dict[str, List[Dict[str, Any]]],
    api_prefix: str,
) -> Dict[str, List[Dict[str, Any]]]:
    remaining: Dict[str, List[Dict[str, Any]]] = {}
    for key, bucket_sources in folder_fallback.items():
        if fallback_under_api_prefix(key, api_prefix):
            continue
        remaining[key] = bucket_sources
    return remaining


def bootstrap_layer_names(paths: List[str], api_prefix: str) -> List[str]:
    layers: Set[str] = set()
    for path in paths:
        if not path.startswith(api_prefix):
            name = PurePosixPath(path).name
            if name.endswith(".py"):
                layers.add(PurePosixPath(name).stem)
            continue
        relative = path[len(api_prefix):]
        parts = [part for part in relative.split("/") if part]
        if parts and parts[0] in SHARED_INFRA_FOLDERS:
            layers.add(parts[0])
        elif len(parts) == 1 and parts[0].endswith(".py"):
            layers.add(PurePosixPath(parts[0]).stem)
    return sorted(layers)
