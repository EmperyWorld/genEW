"""
Fortune Seaker — FE slice completeness gate for Warsmith/SET install
"""

from __future__ import annotations

import re
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional, Set

_IMPORT_FROM_RE = re.compile(
    r"""from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]""",
)
_DYNAMIC_IMPORT_RE = re.compile(
    r"""import\s*\(\s*['"]([^'"]+)['"]""",
)

# Shims injected at SET build time — not exempt from prepare/compose gates
_SET_SHIM_SUFFIXES = (
    "services/api/client",
)

CRITICAL_MISSING_LIMIT = 3


def _collect_import_specs(content: str) -> List[str]:
    specs: List[str] = []
    for match in _IMPORT_FROM_RE.finditer(content):
        spec = match.group(1) or match.group(2)
        if spec and (spec.startswith(".") or spec.startswith("@")):
            specs.append(spec)
    for match in _DYNAMIC_IMPORT_RE.finditer(content):
        spec = match.group(1)
        if spec and (spec.startswith(".") or spec.startswith("@")):
            specs.append(spec)
    return specs


def _infer_kebab_from_files(files: List[Dict[str, str]]) -> Optional[str]:
    for item in files:
        path = str(item.get("path", "")).replace("\\", "/").lstrip("/")
        marker = "src/imported/"
        if path.startswith(marker):
            suffix = path[len(marker):]
            kebab = suffix.split("/", 1)[0]
            if kebab:
                return kebab
    return None


def _resolve_alias(spec: str, *, kebab: Optional[str] = None) -> Optional[str]:
    if kebab and spec.startswith(f"@imported/{kebab}/"):
        rest = spec[len(f"@imported/{kebab}/"):]
        return f"src/imported/{kebab}/{rest.lstrip('/')}"
    if spec.startswith("@/"):
        return spec[2:].lstrip("/")
    for prefix in ("@components/", "@hooks/", "@services/", "@utils/", "@pages/"):
        if spec.startswith(prefix):
            return spec[len("@"):]
    if spec.startswith("."):
        return None
    return None


def _resolve_relative(
    importer_path: str,
    spec: str,
) -> Optional[str]:
    if not spec.startswith("."):
        return None
    base = PurePosixPath(importer_path).parent
    target = (base / spec).as_posix()
    parts: List[str] = []
    for segment in target.split("/"):
        if segment in ("", "."):
            continue
        if segment == "..":
            if parts:
                parts.pop()
            continue
        parts.append(segment)
    return "/".join(parts)


def _path_exists(target: str, indexed: Set[str]) -> bool:
    candidates = [
        target,
        f"{target}.ts",
        f"{target}.tsx",
        f"{target}.js",
        f"{target}.jsx",
        f"{target}/index.ts",
        f"{target}/index.tsx",
    ]
    return any(item in indexed for item in candidates)


def _is_shimmed_missing(spec: str) -> bool:
    normalized = spec.replace("\\", "/").rstrip("/")
    return any(
        normalized.endswith(suffix) or normalized.endswith(f"/{suffix}")
        for suffix in _SET_SHIM_SUFFIXES
    )


def scan_fe_slice_missing(
    files: List[Dict[str, str]],
    *,
    entry_path: Optional[str] = None,
    module_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Scan TS/TSX files for unresolved local imports (in-memory bundle).
    """
    kebab = _infer_kebab_from_files(files)
    if not kebab and module_name:
        from .naming import to_kebab

        kebab = to_kebab(module_name)

    code_files = [
        {
            "path": str(item.get("path", "")).replace("\\", "/"),
            "content": str(item.get("content", "")),
        }
        for item in files
        if str(item.get("path", "")).endswith((".ts", ".tsx", ".js", ".jsx"))
    ]
    indexed = {item["path"] for item in code_files}
    for path in list(indexed):
        if path.startswith("src/"):
            indexed.add(path[4:])

    def _is_test_path(path: str) -> bool:
        normalized = path.replace("\\", "/")
        return (
            "/__tests__/" in normalized
            or "/__test__/" in normalized
            or ".test." in normalized
            or ".spec." in normalized
        )

    entry = entry_path
    if not entry:
        for item in code_files:
            path = item["path"]
            if _is_test_path(path):
                continue
            if path.endswith("Page.tsx") or path.endswith("/App.tsx"):
                entry = path
                break
        if not entry:
            for item in code_files:
                path = item["path"]
                if _is_test_path(path):
                    continue
                if path.endswith((".tsx", ".jsx")):
                    entry = path
                    break
        if not entry and code_files:
            for item in code_files:
                if not _is_test_path(item["path"]):
                    entry = item["path"]
                    break

    if not entry:
        return {
            "entryPoint": None,
            "missing": [],
            "missingCount": 0,
            "criticalMissing": [],
            "criticalMissingCount": 0,
            "passed": True,
        }

    missing: List[str] = []
    seen_files: Set[str] = set()
    queue = [entry]

    while queue:
        current = queue.pop(0)
        if current in seen_files:
            continue
        seen_files.add(current)

        content = next(
            (item["content"] for item in code_files if item["path"] == current),
            None,
        )
        if content is None:
            alt = f"src/{current}" if not current.startswith("src/") else current[4:]
            content = next(
                (item["content"] for item in code_files if item["path"] == alt),
                None,
            )
            if content is not None:
                current = alt
        if content is None:
            continue

        for spec in _collect_import_specs(content):
            target = _resolve_relative(current, spec)
            if target is None:
                target = _resolve_alias(spec, kebab=kebab)
            if target is None:
                continue
            if _path_exists(target, indexed):
                resolved = target
                if not resolved.endswith((".ts", ".tsx")):
                    for candidate in (
                        f"{target}.ts",
                        f"{target}.tsx",
                        f"{target}/index.ts",
                    ):
                        if candidate in indexed:
                            resolved = candidate
                            break
                if resolved.endswith((".ts", ".tsx", ".js", ".jsx")):
                    queue.append(resolved)
                continue
            missing.append(spec)

    unique_missing = sorted(set(missing))
    critical = [
        spec for spec in unique_missing if not _is_shimmed_missing(spec)
    ]

    return {
        "entryPoint": entry,
        "missing": unique_missing[:30],
        "missingCount": len(unique_missing),
        "criticalMissing": critical[:20],
        "criticalMissingCount": len(critical),
        "passed": len(critical) <= CRITICAL_MISSING_LIMIT,
    }
