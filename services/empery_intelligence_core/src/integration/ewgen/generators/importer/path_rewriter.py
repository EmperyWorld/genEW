"""
Fortune Seaker - Import Path Rewriter
Normalizes relative and path-alias imports for imported modules
"""

import re
from pathlib import PurePosixPath
from typing import Optional, Tuple

from .naming import to_kebab

PROJECT_PATH_ALIASES = (
    "hooks",
    "utils",
    "components",
    "services",
    "stores",
    "types",
)

IMPORT_FROM_RE = re.compile(
    r"(from\s+)(['\"])([^'\"]+)\2"
)
IMPORT_SIDE_RE = re.compile(
    r"(import\s+)(['\"])([^'\"]+)\2"
)
DYNAMIC_IMPORT_RE = re.compile(
    r"(import\s*\(\s*)(['\"])([^'\"]+)\2"
)
REQUIRE_RE = re.compile(
    r"(require\s*\(\s*)(['\"])([^'\"]+)\2"
)


def detect_src_alias_prefix(original_path: str) -> str:
    """
    Detect TypeScript @/* alias root relative to the imported bundle.
    web/frontend/src/App.tsx -> web/frontend/src
  src/pages/Home.tsx -> src
    """
    normalized = original_path.replace("\\", "/").lstrip("./")
    if "/src/" in normalized:
        return f"{normalized.split('/src/', 1)[0]}/src"
    if normalized == "src" or normalized.startswith("src/"):
        return "src"
    return "src"


def _resolve_relative(base_dir: str, import_path: str) -> str:
    base = PurePosixPath(base_dir or ".")
    target = (base / import_path).as_posix()
    parts: list[str] = []

    for segment in target.split("/"):
        if segment in ("", "."):
            continue
        if segment == "..":
            if parts:
                parts.pop()
            continue
        parts.append(segment)

    return "/".join(parts)


def _join_import_path(target_base: str, *segments: str) -> str:
    path = "/".join(segment.strip("/") for segment in (target_base, *segments) if segment)
    return re.sub(r"/+", "/", path)


def rewrite_module_spec(
    spec: str,
    source_dir: str,
    target_base: str,
    src_alias_prefix: str,
) -> str:
    """
    Rewrite a single module specifier.
    """
    if spec.startswith(f"{target_base}/") or spec == target_base:
        return spec

    if spec.startswith("."):
        resolved = _resolve_relative(source_dir, spec)
        return _join_import_path(target_base, resolved)

    if spec.startswith("@/"):
        rest = spec[2:].lstrip("/")
        return _join_import_path(target_base, src_alias_prefix, rest)

    for alias in PROJECT_PATH_ALIASES:
        alias_token = f"@{alias}/"
        if spec.startswith(alias_token):
            rest = spec[len(alias_token):]
            return _join_import_path(target_base, src_alias_prefix, alias, rest)

    return spec


def _replace_spec(
    match: re.Match[str],
    source_dir: str,
    target_base: str,
    src_alias_prefix: str,
) -> str:
    prefix = match.group(1)
    quote = match.group(2)
    spec = match.group(3)
    rewritten = rewrite_module_spec(spec, source_dir, target_base, src_alias_prefix)
    if rewritten == spec:
        return match.group(0)
    return f"{prefix}{quote}{rewritten}{quote}"


def rewrite_import_paths(
    content: str,
    original_path: str,
    module_name: str,
    target_base: Optional[str] = None,
    src_alias_prefix: Optional[str] = None,
) -> str:
    """
    Rewrite relative and project path-alias imports to imported module base path.
    """
    if target_base is None:
        target_base = f"@imported/{to_kebab(module_name)}"

    if src_alias_prefix is None:
        src_alias_prefix = detect_src_alias_prefix(original_path)

    source_dir = PurePosixPath(original_path).parent.as_posix()
    replace = lambda match: _replace_spec(
        match,
        source_dir,
        target_base,
        src_alias_prefix,
    )

    content = IMPORT_FROM_RE.sub(replace, content)
    content = IMPORT_SIDE_RE.sub(replace, content)
    content = DYNAMIC_IMPORT_RE.sub(replace, content)
    content = REQUIRE_RE.sub(replace, content)
    return content


def collect_project_alias_prefixes(
    source_paths: list[str],
) -> Tuple[str, ...]:
    """
    Collect distinct src alias prefixes used across selected source paths.
    """
    prefixes = {detect_src_alias_prefix(path) for path in source_paths if path}
    return tuple(sorted(prefixes))
