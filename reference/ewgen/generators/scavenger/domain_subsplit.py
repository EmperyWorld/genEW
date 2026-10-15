"""
Scavenger - Split oversized API domain bundles into feature sub-modules
"""

from collections import defaultdict
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional, Set

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


def _normalize_domain_name(name: str) -> Optional[str]:
    cleaned = name.strip().lower().replace("-", "_")
    if cleaned.endswith(".py"):
        cleaned = PurePosixPath(cleaned).stem
    if not cleaned or cleaned in INVALID_DOMAIN_STEMS:
        return None
    return cleaned


def _strip_domain_suffix(stem: str) -> str:
    normalized = stem.replace("-", "_")
    lower = normalized.lower()
    for suffix in DOMAIN_SUFFIXES:
        if lower.endswith(suffix):
            return normalized[: -len(suffix)].rstrip("_")
    return normalized

LARGE_DOMAIN_SUBSPLIT_THRESHOLD = 20
MIN_DOMAIN_SUBSPLIT_FEATURES = 3

ROUTER_SKIP_STEMS = frozenset({
    "__init__",
    "REFACTORING_EXAMPLE",
    "UNIFIED_CONTENT_INTEGRATION_EXAMPLE",
})

SHARED_SCHEMA_STEMS = frozenset({
    "__init__",
    "base",
})

SHARED_SERVICE_FEATURES = frozenset({
    "cache",
    "celery_config",
    "clustering_engine",
    "query_monitor",
    "ollama_pool",
    "unified_content_integration",
})


def _normalize_feature_name(stem: str) -> Optional[str]:
    cleaned = _strip_domain_suffix(stem)
    for suffix in ("_api", "_router"):
        if cleaned.endswith(suffix):
            cleaned = cleaned[: -len(suffix)]
    cleaned = cleaned.rstrip("_")
    return _normalize_domain_name(cleaned)


def _relative_api_parts(api_prefix: str, path: str) -> List[str]:
    if not path.startswith(api_prefix):
        return []
    return [part for part in path[len(api_prefix):].split("/") if part]


def _router_feature_from_path(domain: str, api_prefix: str, path: str) -> Optional[str]:
    parts = _relative_api_parts(api_prefix, path)
    if len(parts) < 3:
        return None
    layer, folder, leaf = parts[0], parts[1], parts[2]
    if layer != "routers" or folder != domain or not leaf.endswith(".py"):
        return None
    stem = PurePosixPath(leaf).stem
    if stem in ROUTER_SKIP_STEMS:
        return None
    return _normalize_feature_name(stem)


def _schema_feature_from_path(domain: str, api_prefix: str, path: str) -> Optional[str]:
    parts = _relative_api_parts(api_prefix, path)
    if len(parts) < 3:
        return None
    layer, folder, leaf = parts[0], parts[1], parts[-1]
    if layer != "schemas" or folder != domain or not leaf.endswith(".py"):
        return None
    stem = PurePosixPath(leaf).stem
    if stem in SHARED_SCHEMA_STEMS:
        return None
    return _normalize_domain_name(stem)


def _service_feature_from_path(
    domain: str,
    api_prefix: str,
    path: str,
    router_features: Set[str],
) -> Optional[str]:
    parts = _relative_api_parts(api_prefix, path)
    if len(parts) < 3:
        return None
    layer, folder, leaf = parts[0], parts[1], parts[-1]
    if layer != "services" or folder != domain or not leaf.endswith(".py"):
        return None
    stem = PurePosixPath(leaf).stem
    if stem == "__init__":
        return None
    feature = _normalize_feature_name(stem)
    if not feature or feature in SHARED_SERVICE_FEATURES:
        return None
    if feature in router_features:
        return feature
    for candidate in sorted(router_features, key=len, reverse=True):
        if (
            stem == candidate
            or stem.startswith(f"{candidate}_")
            or feature.startswith(f"{candidate}_")
        ):
            return candidate
    return None


def _collect_router_features(
    domain: str,
    api_prefix: str,
    sources: List[Dict[str, Any]],
) -> Set[str]:
    features: Set[str] = set()
    for item in sources:
        path = str(item.get("path", ""))
        feature = _router_feature_from_path(domain, api_prefix, path)
        if feature:
            features.add(feature)
    return features


def _assign_domain_feature(
    domain: str,
    api_prefix: str,
    path: str,
    router_features: Set[str],
) -> Optional[str]:
    return (
        _router_feature_from_path(domain, api_prefix, path)
        or _schema_feature_from_path(domain, api_prefix, path)
        or _service_feature_from_path(domain, api_prefix, path, router_features)
    )


def split_large_domain_bucket(
    domain: str,
    sources: List[Dict[str, Any]],
    api_prefix: str,
) -> tuple[Dict[str, List[Dict[str, Any]]], List[Dict[str, Any]]]:
    """
    Returns feature buckets keyed by feature name and shared domain sources.
    Empty feature map means keep the original domain bundle.
    """
    if len(sources) < LARGE_DOMAIN_SUBSPLIT_THRESHOLD:
        return {}, []

    router_features = _collect_router_features(domain, api_prefix, sources)
    if len(router_features) < MIN_DOMAIN_SUBSPLIT_FEATURES:
        return {}, []

    feature_buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    shared_sources: List[Dict[str, Any]] = []

    for item in sources:
        path = str(item.get("path", ""))
        feature = _assign_domain_feature(domain, api_prefix, path, router_features)
        if feature:
            feature_buckets[feature].append(item)
        else:
            shared_sources.append(item)

    active_features = {
        feature
        for feature, bucket in feature_buckets.items()
        if bucket
    }
    if len(active_features) < MIN_DOMAIN_SUBSPLIT_FEATURES:
        return {}, []

    return dict(feature_buckets), shared_sources


def domain_subsplit_label(domain: str, feature: str) -> str:
    return f"{domain}_{feature}"


def attach_domain_shared_closure(
    groups: List[Dict[str, Any]],
    *,
    domain: str,
    shared_paths: List[str],
) -> None:
    if not shared_paths:
        return
    prefix = f"{domain}_"
    for group in groups:
        label = str(group.get("label", ""))
        if label != domain and not label.startswith(prefix):
            continue
        if group.get("groupKind") not in {"domain", "feature"}:
            continue
        feature_paths = [
            str(path)
            for path in (group.get("candidatePaths") or [])
            if path
        ]
        existing_closure = [
            str(path)
            for path in (group.get("platformClosurePaths") or [])
            if path
        ]
        group["platformClosurePaths"] = sorted(
            set(feature_paths) | set(existing_closure) | set(shared_paths),
        )
        group["domainSharedFileCount"] = len(shared_paths)
