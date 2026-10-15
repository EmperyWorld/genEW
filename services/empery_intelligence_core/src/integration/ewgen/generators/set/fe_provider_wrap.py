"""
SET — detect React context providers required by imported FE slices.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

_PROVIDER_GUARD_RE = re.compile(
    r"throw new Error\('(\w+) must be used within (\w+)'\)",
)
_IMPORT_NAMED_RE = re.compile(
    r"""import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]""",
)
_HOOK_NAME_RE = re.compile(r"\buse[A-Z]\w*\b")
_SOURCE_EXTENSIONS = (".tsx", ".ts", ".jsx", ".js")


def _load_tsconfig_paths(fe_root: Path) -> Dict[str, str]:
    tsconfig_path = fe_root / "tsconfig.json"
    if not tsconfig_path.is_file():
        return {}
    try:
        data = json.loads(tsconfig_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    paths = (data.get("compilerOptions") or {}).get("paths") if isinstance(data, dict) else None
    if not isinstance(paths, dict):
        return {}
    resolved: Dict[str, str] = {}
    for key, targets in paths.items():
        if not isinstance(targets, list) or not targets:
            continue
        prefix = str(key).rstrip("/*")
        target = str(targets[0]).replace("\\", "/").rstrip("/*").lstrip("./")
        resolved[prefix] = target
    return resolved


def _resolve_import(
    spec: str,
    from_file: Path,
    fe_root: Path,
    alias_paths: Dict[str, str],
) -> Optional[Path]:
    normalized = spec.replace("\\", "/")
    base: Optional[Path] = None

    for prefix, target in sorted(alias_paths.items(), key=lambda item: len(item[0]), reverse=True):
        if normalized == prefix or normalized.startswith(f"{prefix}/"):
            suffix = normalized[len(prefix):].lstrip("/")
            base = fe_root / target
            if suffix:
                base = base / suffix
            break

    if base is None:
        if normalized.startswith("."):
            base = (from_file.parent / normalized).resolve()
        else:
            return None

    candidates: List[Path] = []
    if base.suffix in _SOURCE_EXTENSIONS:
        candidates.append(base)
    else:
        for ext in _SOURCE_EXTENSIONS:
            candidates.append(Path(f"{base}{ext}"))
        for ext in (".tsx", ".ts"):
            candidates.append(base / f"index{ext}")

    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def _relative_import_from_set_dir(fe_root: Path, target: Path) -> str:
    set_dir = (fe_root / ".set").resolve()
    rel = Path(target.resolve()).relative_to(fe_root.resolve())
    without_suffix = rel.with_suffix("") if rel.suffix in _SOURCE_EXTENSIONS else rel
    return f"../{without_suffix.as_posix()}"


def _hook_provider_map_in_file(path: Path) -> Dict[str, str]:
    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        return {}
    return {
        hook: provider
        for hook, provider in _PROVIDER_GUARD_RE.findall(content)
    }


_SKIP_DIR_NAMES = frozenset({"node_modules", "dist", ".set", ".git"})


def _is_project_source(path: Path) -> bool:
    return not any(part in _SKIP_DIR_NAMES for part in path.parts)


def _collect_source_files(fe_root: Path) -> List[Path]:
    files: List[Path] = []
    for pattern in ("**/*.tsx", "**/*.ts", "**/*.jsx", "**/*.js"):
        files.extend(
            path
            for path in fe_root.glob(pattern)
            if _is_project_source(path)
        )
    return files


def _parse_named_imports(content: str) -> List[Tuple[str, str]]:
    imports: List[Tuple[str, str]] = []
    for names_blob, spec in _IMPORT_NAMED_RE.findall(content):
        for chunk in names_blob.split(","):
            token = chunk.strip()
            if not token:
                continue
            if token.startswith("type "):
                token = token[5:].strip()
            name = token.split(" as ")[0].strip()
            if name:
                imports.append((name, spec))
    return imports


def detect_context_providers(fe_root: Path, entry_point: str) -> List[Dict[str, str]]:
    """
    Scan FE slice for context hooks and return providers to wrap the SET entry shell.

    Each item: {"provider": "ToastProvider", "importPath": "../src/.../Toast"}
    """
    alias_paths = _load_tsconfig_paths(fe_root)
    source_files = _collect_source_files(fe_root)

    hook_to_provider: Dict[str, Tuple[str, Path]] = {}
    for path in source_files:
        for hook, provider in _hook_provider_map_in_file(path).items():
            hook_to_provider[hook] = (provider, path)

    if not hook_to_provider:
        return []

    used_hooks: Set[str] = set()
    for path in source_files:
        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for name, spec in _parse_named_imports(content):
            if "node_modules" in spec.replace("\\", "/"):
                continue
            if name in hook_to_provider:
                used_hooks.add(name)
                continue
            for hook in _HOOK_NAME_RE.findall(name):
                if hook in hook_to_provider:
                    used_hooks.add(hook)

    providers: List[Dict[str, str]] = []
    seen_providers: Set[str] = set()
    for hook in sorted(used_hooks):
        provider_name, provider_file = hook_to_provider[hook]
        if not _is_project_source(provider_file):
            continue
        if provider_name in seen_providers:
            continue
        seen_providers.add(provider_name)
        providers.append({
            "provider": provider_name,
            "importPath": _relative_import_from_set_dir(fe_root, provider_file),
            "hook": hook,
        })

    return providers


def wrap_jsx_with_providers(inner_jsx: str, providers: List[Dict[str, str]]) -> str:
    wrapped = inner_jsx
    for item in reversed(providers):
        provider = item["provider"]
        wrapped = f"<{provider}>\n{wrapped}\n</{provider}>"
    return wrapped


def provider_import_lines(providers: List[Dict[str, str]]) -> List[str]:
    lines: List[str] = []
    seen: Set[str] = set()
    for item in providers:
        provider = item["provider"]
        if provider in seen:
            continue
        seen.add(provider)
        lines.append(f"import {{ {provider} }} from '{item['importPath']}';")
    return lines
