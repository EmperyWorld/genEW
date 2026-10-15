# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Stage 15 layout/contract quality grade for prepare → bank entries.
# Invariants:
# - Does not block catalog upsert; weak entries are flagged for craft.
# - Grades from prepared file paths/content signals only (no LLM).
# Related:
# - generators/unified_ingest/prepare_orchestrate.py
# - documentation/platform/EWGEN-COMPONENT-FACTORY-VISION.md
# ---

"""Layout / contract quality grades for Component Factory bank entries."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

GRADE_STRONG = "strong"
GRADE_WEAK = "weak"

_GENERIC_MODULE_NAMES = frozenset(
    {
        "src",
        "app",
        "components",
        "hooks",
        "utils",
        "views",
        "pages",
        "lib",
        "shared",
        "common",
        "backendapp",
        "backendtests",
        "backendalembic",
        "importedpython",
        "modules",
        "examples",
        "e2e",
        "tests",
    }
)

_GENERIC_NAME_RE = re.compile(
    r"^(hooks|utils|components|views|src)\d*$",
    re.IGNORECASE,
)

_FE_RUNTIME = {".ts", ".tsx", ".js", ".jsx"}
_SOURCE_SUFFIXES = _FE_RUNTIME | {".py"}
_SIDECAR_NAMES = frozenset(
    {
        "readme.md",
        "package.json",
        "package.imported.json",
        "requirements.txt",
        "pyproject.toml",
    }
)
_SIDECAR_PREFIXES = (
    "manifests/",
    "tsconfig.",
    "MANIFEST.",
)
_DEEP_RELATIVE_IMPORT = re.compile(
    r"""(?:from\s+['"]|import\s+['"]|require\s*\(\s*['"])(\.\./\.\./\.\./)""",
)

_MONOREPO_LEAK = re.compile(
    r"(?:EliteEW|powered_by_emperyworld|node_modules)/",
    re.IGNORECASE,
)


def _norm_name(module_name: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]", "", (module_name or "").lower())


def _is_generic_module_name(module_name: Optional[str]) -> bool:
    raw = (module_name or "").strip()
    if not raw:
        return True
    key = _norm_name(raw)
    if key in _GENERIC_MODULE_NAMES:
        return True
    return bool(_GENERIC_NAME_RE.match(raw))


def _file_paths(files: Sequence[Dict[str, Any]]) -> List[str]:
    paths: List[str] = []
    for item in files:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "").replace("\\", "/").lstrip("./")
        if path:
            paths.append(path)
    return paths


def _is_sidecar_path(path: str) -> bool:
    base = path.rsplit("/", 1)[-1].lower()
    if base in _SIDECAR_NAMES:
        return True
    lower = path.lower()
    return any(lower.startswith(prefix.lower()) for prefix in _SIDECAR_PREFIXES)


def _source_paths(paths: Sequence[str]) -> List[str]:
    out: List[str] = []
    for path in paths:
        if _is_sidecar_path(path):
            continue
        suffix = Path(path).suffix.lower()
        if suffix and suffix not in _SOURCE_SUFFIXES:
            # Keep extensionless only if not sidecar; otherwise require source suffix
            if suffix not in {".json", ".md", ".txt", ".toml", ".lock"}:
                continue
            continue
        if suffix in _SOURCE_SUFFIXES:
            out.append(path)
    return out


def _top_roots(paths: Iterable[str]) -> List[str]:
    roots: List[str] = []
    seen = set()
    for path in paths:
        root = path.split("/", 1)[0] if path else ""
        if not root or root in seen:
            continue
        seen.add(root)
        roots.append(root)
    return roots


def _has_dedicated_layout(paths: Sequence[str], *, role: str) -> bool:
    """True when files sit under a single dedicated component-ish prefix."""
    if not paths:
        return False
    if role == "frontend":
        under_imported = sum(
            1 for p in paths if "/imported/" in f"/{p}" or p.startswith("src/")
        )
        if under_imported >= max(1, len(paths) // 2):
            return True
    roots = _top_roots(paths)
    if len(roots) == 1:
        return True
    # Common prepare rewrite: all under src/imported/<module>/
    prefixes = {("/".join(p.split("/")[:3]) if "/" in p else p) for p in paths}
    return len(prefixes) <= 2


def _count_deep_relative_imports(files: Sequence[Dict[str, Any]]) -> int:
    hits = 0
    for item in files:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content") or "")
        if not content:
            continue
        hits += len(_DEEP_RELATIVE_IMPORT.findall(content))
        if _MONOREPO_LEAK.search(content):
            hits += 1
    return hits


def grade_bank_entry(
    *,
    role: str,
    module_name: Optional[str],
    files: Sequence[Dict[str, Any]] | None = None,
    manifest_only: bool = False,
    runtime_source_count: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Return layout/contract grade for one prepare → bank entry.

    strong = craft-ready layout signals; weak = usable but needs operator care.
    """
    role_norm = (role or "").strip().lower()
    file_list = list(files or [])
    paths = _file_paths(file_list)
    source_paths = _source_paths(paths)
    reasons: List[str] = []
    checks: Dict[str, Any] = {
        "fileCount": len(paths),
        "sourceFileCount": len(source_paths),
        "topRoots": _top_roots(source_paths or paths),
        "genericName": _is_generic_module_name(module_name),
        "dedicatedLayout": _has_dedicated_layout(
            source_paths or paths,
            role=role_norm,
        ),
        "manifestOnly": bool(manifest_only),
        "runtimeSourceCount": runtime_source_count,
        "deepRelativeImports": 0,
    }

    if checks["genericName"]:
        reasons.append("generic_module_name")
    if not source_paths:
        reasons.append("no_files")
    if not checks["dedicatedLayout"] and source_paths:
        reasons.append("scattered_layout")
    if len(checks["topRoots"]) > 3:
        reasons.append("too_many_top_roots")

    if role_norm in {"frontend", "ui", "fe"}:
        runtime = runtime_source_count
        if runtime is None:
            runtime = sum(
                1
                for p in source_paths
                if Path(p).suffix.lower() in _FE_RUNTIME
            )
        checks["runtimeSourceCount"] = runtime
        if manifest_only or runtime == 0:
            reasons.append("no_runtime_frontend")
        deep = _count_deep_relative_imports(file_list)
        checks["deepRelativeImports"] = deep
        if deep >= 3:
            reasons.append("deep_or_leaky_imports")
    elif role_norm in {"backend", "api", "be"}:
        py_count = sum(1 for p in source_paths if p.lower().endswith(".py"))
        checks["pythonFileCount"] = py_count
        if py_count == 0:
            reasons.append("no_python_sources")

    grade = GRADE_WEAK if reasons else GRADE_STRONG
    return {
        "grade": grade,
        "reasons": reasons,
        "checks": checks,
    }


def summarize_grades(entries: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    strong = 0
    weak = 0
    ungraded = 0
    for entry in entries:
        grade = (entry.get("quality") or {}).get("grade")
        if grade == GRADE_STRONG:
            strong += 1
        elif grade == GRADE_WEAK:
            weak += 1
        else:
            ungraded += 1
    return {
        "strongCount": strong,
        "weakCount": weak,
        "ungradedCount": ungraded,
        "gradedTotal": strong + weak,
    }
