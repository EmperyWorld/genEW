"""
Scavenger - Python import coverage for analyze and prepared bundles
"""

import re
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional, Set

from generators.analysis_cache import (
    fingerprint_entries,
    fingerprint_labels,
    fingerprint_path_set,
    get_cached_graph_result,
    get_or_compute_file_specs,
    graph_result_cache_key,
    set_cached_graph_result,
)

PYTHON_IMPORT_RE = re.compile(
    r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))",
    re.MULTILINE,
)

STDLIB_TOP_LEVEL = {
    "abc", "argparse", "array", "ast", "asyncio", "atexit", "base64", "binascii",
    "builtins", "calendar", "collections", "concurrent", "contextlib", "copy",
    "csv", "ctypes", "dataclasses", "datetime", "decimal", "email", "enum",
    "errno", "fnmatch", "fractions", "functools", "gc", "getpass", "glob",
    "gzip", "hashlib", "heapq", "hmac", "html", "http", "importlib", "inspect",
    "io", "ipaddress", "itertools", "json", "logging", "math", "mimetypes",
    "multiprocessing", "operator", "os", "pathlib", "pickle", "platform",
    "pprint", "queue", "random", "re", "secrets", "shutil", "signal", "socket",
    "sqlite3", "ssl", "statistics", "string", "struct", "subprocess", "sys",
    "tempfile", "textwrap", "threading", "time", "traceback", "types", "typing",
    "unicodedata", "urllib", "uuid", "warnings", "weakref", "xml", "zipfile",
    "zlib", "__future__",
}

KNOWN_EXTERNAL_PACKAGES = {
    "aio_pika", "aiofiles", "aiohttp", "aioredis", "aioboto3", "airflow", "anyio",
    "asyncpg", "av", "bcrypt", "boto3", "botocore", "bs4", "cachetools", "celery",
    "chromadb", "clamd", "cryptography", "cv2", "docx", "elasticsearch", "fastapi",
    "fitz", "httpx", "jinja2", "jwt", "langchain", "lxml", "minio", "numpy",
    "openai", "opencv_python", "orjson", "pandas", "passlib", "pil", "psutil",
    "psycopg2", "pydantic", "pypdf2", "pytest", "qdrant_client", "redis",
    "requests", "sentry_sdk", "sklearn", "socketio", "sqlalchemy", "starlette",
    "telethon", "tiktoken", "torch", "torchaudio", "torchvision", "transformers",
    "urllib3", "uvicorn", "websockets", "yaml",
}


def _normalize_relative(base_dir: str, import_path: str) -> str:
    """
    Resolve PEP 328 relative module specs (e.g. ..models.user).
    """
    dot_count = 0
    while dot_count < len(import_path) and import_path[dot_count] == ".":
        dot_count += 1

    if dot_count == 0:
        return ""

    # `.foo` = same package; `..foo` = parent package; `...foo` = grandparent
    levels_up = max(0, dot_count - 1)
    rest = import_path[dot_count:]
    base_parts = list(PurePosixPath(base_dir or ".").parts)
    if levels_up > len(base_parts):
        return ""

    prefix = base_parts[: len(base_parts) - levels_up] if levels_up else base_parts
    module_parts = rest.split(".") if rest else []
    return "/".join([*prefix, *module_parts])


def _path_exists(target: str, indexed: Set[str]) -> bool:
    normalized = PurePosixPath(target).as_posix()
    candidates = [
        normalized,
        f"{normalized}.py",
        f"{normalized}/__init__.py",
    ]
    return any(candidate in indexed for candidate in candidates)


def _detect_archive_prefixes(indexed: Set[str]) -> Set[str]:
    """
    Detect monorepo root prefixes (e.g. EliteEW2/) from archive paths.
    """
    prefixes: Set[str] = set()
    for path in indexed:
        parts = PurePosixPath(path).parts
        if len(parts) >= 2 and parts[1] in {"api", "src", "lib", "app"}:
            prefixes.add(f"{parts[0]}/")
    return prefixes


def _infer_importer_prefix(importer_path: str) -> str:
    """
    Infer monorepo prefix from the importing file path.
    """
    parts = PurePosixPath(importer_path.replace("\\", "/")).parts
    if len(parts) >= 2 and parts[1] in {"api", "src", "lib", "app"}:
        return f"{parts[0]}/"
    return ""


def _candidate_targets(spec: str, importer_path: str, archive_prefixes: Set[str]) -> List[str]:
    """
    Build candidate filesystem targets for an absolute import spec.
    """
    dotted = spec.replace(".", "/")
    candidates = [dotted]

    importer_prefix = _infer_importer_prefix(importer_path)
    if importer_prefix:
        candidates.append(f"{importer_prefix.rstrip('/')}/{dotted}")

    for prefix in archive_prefixes:
        if prefix and prefix != importer_prefix:
            candidates.append(f"{prefix.rstrip('/')}/{dotted}")

    parts = PurePosixPath(dotted).parts
    if len(parts) >= 2 and parts[0] in archive_prefixes:
        stripped = "/".join(parts[1:])
        if stripped:
            candidates.append(stripped)
            if importer_prefix:
                candidates.append(f"{importer_prefix.rstrip('/')}/{stripped}")

    # Deduplicate while preserving order
    seen: Set[str] = set()
    ordered: List[str] = []
    for candidate in candidates:
        if candidate not in seen:
            seen.add(candidate)
            ordered.append(candidate)
    return ordered


def _fuzzy_resolve_module(
    dotted: str,
    indexed: Set[str],
    archive_prefixes: Set[str],
) -> bool:
    """
    Fallback: resolve by module basename when monorepo layout differs from import path.
    """
    basename = PurePosixPath(dotted).name
    if not basename:
        return False

    matches: List[str] = []
    for path in indexed:
        normalized = path.replace("\\", "/")
        if normalized.endswith(f"/{basename}.py"):
            matches.append(normalized)
        elif normalized.endswith(f"/{basename}/__init__.py"):
            matches.append(normalized)

    if not matches:
        return False
    if len(matches) == 1:
        return True

    dotted_parts = PurePosixPath(dotted).parts
    best_score = -1
    for path in matches:
        score = sum(1 for part in dotted_parts if part in PurePosixPath(path).parts)
        if score > best_score:
            best_score = score
    return best_score > 0


def _is_external_module(spec: str) -> bool:
    if not spec:
        return True
    top = spec.split(".")[0].lower()
    if top in STDLIB_TOP_LEVEL:
        return True
    if top in KNOWN_EXTERNAL_PACKAGES:
        return True
    return False


def _classify_missing_target(target: str, spec: str) -> str:
    """
    Classify unresolved import target: external pip package vs internal monorepo path.
    """
    if spec == "api" or spec.startswith("api."):
        if not spec.startswith("ewgen_bundle."):
            return "boundary"
    probe = target.replace("/", ".").split(".")[0].lower()
    if probe in KNOWN_EXTERNAL_PACKAGES or probe in STDLIB_TOP_LEVEL:
        return "external"
    if target.startswith("api/") or "/api/" in target or spec.startswith("api."):
        return "internal"
    return "unknown"


def resolve_python_import(
    spec: str,
    importer_path: str,
    indexed: Set[str],
    archive_prefixes: Optional[Set[str]] = None,
) -> Optional[bool]:
    """
    Return True if resolved in archive, False if missing, None if external/stdlib.
    """
    if not spec or _is_external_module(spec):
        return None

    importer = importer_path.replace("\\", "/")
    importer_dir = str(PurePosixPath(importer).parent)
    prefixes = archive_prefixes if archive_prefixes is not None else _detect_archive_prefixes(indexed)

    if spec.startswith("."):
        target = _normalize_relative(importer_dir, spec)
        py_target = target if target.endswith(".py") else target
        return _path_exists(py_target, indexed)

    candidates = _candidate_targets(spec, importer_path, prefixes)
    for candidate in candidates:
        if _path_exists(candidate, indexed):
            return True

    dotted = spec.replace(".", "/")
    if _fuzzy_resolve_module(dotted, indexed, prefixes):
        return True
    for candidate in candidates:
        if _fuzzy_resolve_module(candidate, indexed, prefixes):
            return True
    return False


def _filter_suggested_package_groups(
    suggested_groups: Set[str],
    available_group_labels: Optional[Set[str]],
    selected_group_labels: Optional[Set[str]],
) -> List[str]:
    """
    Keep only suggested groups that exist in the archive and are not already selected.
    """
    filtered: List[str] = []
    for label in sorted(suggested_groups):
        if available_group_labels is not None and label not in available_group_labels:
            continue
        if selected_group_labels is not None and label in selected_group_labels:
            continue
        filtered.append(label)
    return filtered[:10]


def _parse_python_import_specs(content: str) -> List[str]:
    specs: List[str] = []
    for match in PYTHON_IMPORT_RE.finditer(content):
        spec = match.group(1) or match.group(2)
        if spec:
            specs.append(spec)
    return specs


def validate_python_import_graph(
    entries: List[Dict[str, Any]],
    scope_paths: Optional[Set[str]] = None,
    archive_paths: Optional[Set[str]] = None,
    partial: bool = False,
    available_group_labels: Optional[Set[str]] = None,
    selected_group_labels: Optional[Set[str]] = None,
    cache_session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Validate Python import coverage for archive entries.
    """
    entries_fp = fingerprint_entries(entries)
    scope_fp = fingerprint_path_set(scope_paths)
    archive_fp = fingerprint_path_set(archive_paths)
    mode = "archive" if archive_paths else "bundle"
    cache_key = graph_result_cache_key(
        language="python",
        entries_fp=entries_fp,
        scope_fp=scope_fp,
        archive_fp=archive_fp,
        partial=partial,
        mode=mode,
        available_labels_fp=fingerprint_labels(available_group_labels),
        selected_labels_fp=fingerprint_labels(selected_group_labels),
        session_id=cache_session_id,
    )
    cached = get_cached_graph_result(cache_key)
    if cached is not None:
        return cached

    indexed: Set[str] = set()
    if archive_paths:
        indexed.update(path.replace("\\", "/") for path in archive_paths if path)

    code_files: List[str] = []
    for entry in entries:
        path = str(entry.get("path", "")).replace("\\", "/")
        if not path:
            continue
        indexed.add(path)
        if path.endswith(".py"):
            if scope_paths is None or path in scope_paths:
                code_files.append(path)

    archive_prefixes = _detect_archive_prefixes(indexed)
    broken: List[Dict[str, str]] = []
    missing_targets: Set[str] = set()
    files_with_issues: Set[str] = set()
    external_missing: Set[str] = set()
    boundary_missing: Set[str] = set()
    internal_missing: Set[str] = set()
    suggested_groups: Set[str] = set()

    for path in sorted(code_files):
        entry = next((item for item in entries if item.get("path") == path), None)
        if not entry:
            continue

        content = str(entry.get("content", ""))
        specs = get_or_compute_file_specs(
            language="python",
            content=content,
            parse_fn=_parse_python_import_specs,
        )

        for spec in specs:
            resolution = resolve_python_import(spec, path, indexed, archive_prefixes)
            if resolution is None:
                continue
            if resolution:
                continue

            target = spec.replace(".", "/")
            if spec.startswith("."):
                target = _normalize_relative(
                    str(PurePosixPath(path).parent),
                    spec,
                )
            else:
                candidates = _candidate_targets(spec, path, archive_prefixes)
                target = candidates[0] if candidates else target

            classification = _classify_missing_target(target, spec)
            broken.append({
                "file": path,
                "spec": spec,
                "target": target,
                "classification": classification,
            })
            missing_targets.add(target)
            files_with_issues.add(path)

            if classification == "external":
                external_missing.add(target)
            elif classification == "boundary":
                boundary_missing.add(target)
            elif classification == "internal":
                internal_missing.add(target)
                parts = PurePosixPath(target).parts
                for idx, part in enumerate(parts):
                    if part == "api" and idx + 1 < len(parts):
                        suggested_groups.add(parts[idx + 1])
                        break

    total = len(code_files)
    clean = total - len(files_with_issues)
    broken_count = len(broken)

    result = {
        "codeFileCount": total,
        "cleanCodeFiles": clean,
        "filesWithMissingImports": len(files_with_issues),
        "missingTargetCount": len(missing_targets),
        "brokenImportCount": broken_count,
        "brokenImports": broken[:50],
        "missingTargets": sorted(missing_targets)[:30],
        "externalMissingTargets": sorted(external_missing)[:20],
        "boundaryMissingTargets": sorted(boundary_missing)[:20],
        "internalMissingTargets": sorted(internal_missing)[:20],
        "suggestedPackageGroups": _filter_suggested_package_groups(
            suggested_groups,
            available_group_labels,
            selected_group_labels,
        ),
        "passed": broken_count == 0,
        "partial": partial,
        "coverageRate": round((clean / total) * 100) if total else 100,
    }
    set_cached_graph_result(cache_key, result)
    return result
