# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Deterministic AST/regex import rewrite into atom-local package paths.
# Invariants:
# - Only rewrites imports that resolve inside the closed set.
# - Absolute monorepo imports (api.core.x) rewrite when target is in-set.
# - External imports left unchanged; no LLM.
# Related:
# - generators/atomizer/closure.py
# ---

"""Import rewrite for ESAL atoms."""

from __future__ import annotations

import ast
import re
from pathlib import PurePosixPath
from typing import Dict, Optional, Set, Tuple


def _norm(path: str) -> str:
    return path.replace("\\", "/").lstrip("./")


def _module_name_for_path(path: str, role: str) -> str:
    """Map original path to atom-local module path under backend/ or frontend/.

    Neutral Contract: paths under ``ewgen_bundle/`` keep package layout so
    ``import ewgen_bundle.<slug>.*`` resolves without flattening to
    ``backend/{stem}.py`` (which left dangling Absolute imports).
    """
    path = _norm(path)
    marker = "ewgen_bundle/"
    if marker in path:
        return path[path.index(marker) :]
    if path.startswith("ewgen_bundle/"):
        return path
    name = PurePosixPath(path).name
    if path.endswith(".py"):
        stem = PurePosixPath(path).stem
        if stem == "__init__":
            parent = PurePosixPath(path).parent.name or "pkg"
            return f"backend/{parent}/__init__.py"
        return f"backend/{stem}.py"
    # FE
    return f"frontend/src/{name}"


def build_rewrite_map(
    closed_paths: list[str],
    *,
    role: str,
) -> Dict[str, str]:
    """old_path → new relative path inside atom root."""
    mapping: Dict[str, str] = {}
    used: Set[str] = set()
    for path in sorted(_norm(p) for p in closed_paths):
        target = _module_name_for_path(path, role)
        # disambiguate collisions
        if target in used:
            stem = PurePosixPath(target).stem
            suffix = PurePosixPath(target).suffix
            parent = str(PurePosixPath(target).parent)
            digest = abs(hash(path)) % 10000
            target = f"{parent}/{stem}_{digest}{suffix}"
        used.add(target)
        mapping[path] = target
    return mapping


def _py_local_module(target_path: str) -> str:
    """backend/foo.py → backend.foo ; backend/pkg/__init__.py → backend.pkg"""
    p = PurePosixPath(target_path)
    if p.name == "__init__.py":
        parts = list(p.parent.parts)
    else:
        parts = list(p.with_suffix("").parts)
    return ".".join(parts)


def resolve_absolute_module(
    module: str,
    rewrite_map: Dict[str, str],
) -> Optional[str]:
    """
    Map dotted absolute import to atom-local module if target is in closed set.

    ``api.core.database_manager`` matches ``112/api/core/database_manager.py``
    via path suffix (monorepo prefix stripped).
    """
    dotted = (module or "").strip(".")
    if not dotted:
        return None
    rel = dotted.replace(".", "/")
    candidates = (f"{rel}.py", f"{rel}/__init__.py")
    # Prefer longest old_path match (most specific prefix)
    best_old: Optional[str] = None
    for old in rewrite_map:
        for cand in candidates:
            if old == cand or old.endswith("/" + cand):
                if best_old is None or len(old) > len(best_old):
                    best_old = old
    if best_old is None:
        return None
    return _py_local_module(rewrite_map[best_old])


class _RewriteImports(ast.NodeTransformer):
    def __init__(self, path: str, rewrite_map: Dict[str, str], indexed: Set[str]):
        self.path = path
        self.rewrite_map = rewrite_map
        self.indexed = indexed
        self.base_dir = str(PurePosixPath(path).parent)

    def _resolve(self, module: str | None, level: int = 0) -> str | None:
        if level and level > 0:
            rel_parts = list(PurePosixPath(self.base_dir).parts)
            up = max(0, level - 1)
            if up > len(rel_parts):
                return None
            prefix = rel_parts[: len(rel_parts) - up]
            rest = (module or "").replace(".", "/")
            joined = "/".join([*prefix, *([rest] if rest else [])])
            for cand in (f"{joined}.py", f"{joined}/__init__.py", _norm(joined)):
                if cand in self.rewrite_map:
                    return _py_local_module(self.rewrite_map[cand])
            return None
        if not module:
            return None
        # Absolute: exact path, then monorepo-prefixed suffix match
        parts = module.replace(".", "/")
        for cand in (f"{parts}.py", f"{parts}/__init__.py"):
            if cand in self.rewrite_map:
                return _py_local_module(self.rewrite_map[cand])
        return resolve_absolute_module(module, self.rewrite_map)

    def visit_Import(self, node: ast.Import) -> ast.AST:
        new_names = []
        for alias in node.names:
            resolved = self._resolve(alias.name, 0)
            if resolved:
                new_names.append(ast.alias(name=resolved, asname=alias.asname))
            else:
                new_names.append(alias)
        return ast.Import(names=new_names)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> ast.AST:
        resolved = self._resolve(node.module, node.level or 0)
        if resolved:
            return ast.ImportFrom(module=resolved, names=node.names, level=0)
        return node


def rewrite_python(content: str, path: str, rewrite_map: Dict[str, str]) -> str:
    indexed = set(rewrite_map.keys())
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return content
    new_tree = _RewriteImports(path, rewrite_map, indexed).visit(tree)
    ast.fix_missing_locations(new_tree)
    try:
        return ast.unparse(new_tree) + "\n"
    except Exception:  # noqa: BLE001
        return content


_TS_SPEC_RE = re.compile(
    r"""((?:from|import)\s+)(['"])(\.[^'"]+)\2"""
)
_TS_DYN_RE = re.compile(
    r"""(import\s*\(\s*|require\s*\(\s*)(['"])(\.[^'"]+)\2"""
)
# Absolute TS/alias specs that may map into closed set (e.g. api/core/x)
_TS_ABS_RE = re.compile(
    r"""((?:from|import)\s+)(['"])(@/[^'"]+|api/[^'"]+)\2"""
)


def rewrite_typescript(
    content: str,
    path: str,
    rewrite_map: Dict[str, str],
    *,
    atom_id: Optional[str] = None,
) -> str:
    base_dir = str(PurePosixPath(path).parent)
    prefix_atom = f"@atom/{atom_id}/" if atom_id else "@atom/"

    def _map_spec(spec: str) -> Optional[str]:
        if spec.startswith("."):
            joined = _norm(str(PurePosixPath(base_dir) / spec))
            for cand in (
                joined,
                f"{joined}.ts",
                f"{joined}.tsx",
                f"{joined}.js",
                f"{joined}/index.ts",
                f"{joined}/index.tsx",
            ):
                if cand in rewrite_map:
                    return rewrite_map[cand]
            return None
        # Absolute / alias: strip @/ then suffix-match like Python
        cleaned = spec[2:] if spec.startswith("@/") else spec
        cleaned = cleaned.lstrip("/")
        for old, new in rewrite_map.items():
            for cand in (
                cleaned,
                f"{cleaned}.ts",
                f"{cleaned}.tsx",
                f"{cleaned}.js",
                f"{cleaned}/index.ts",
            ):
                if old == cand or old.endswith("/" + cand):
                    return new
        return None

    def repl_rel(match: re.Match[str]) -> str:
        prefix, quote, spec = match.group(1), match.group(2), match.group(3)
        target = _map_spec(spec)
        if target:
            return f"{prefix}{quote}{prefix_atom}{target}{quote}"
        return match.group(0)

    def repl_abs(match: re.Match[str]) -> str:
        prefix, quote, spec = match.group(1), match.group(2), match.group(3)
        target = _map_spec(spec)
        if target:
            return f"{prefix}{quote}{prefix_atom}{target}{quote}"
        return match.group(0)

    content = _TS_SPEC_RE.sub(repl_rel, content)
    content = _TS_DYN_RE.sub(repl_rel, content)
    content = _TS_ABS_RE.sub(repl_abs, content)
    return content


def rewrite_content(
    path: str,
    content: str,
    rewrite_map: Dict[str, str],
    *,
    atom_id: Optional[str] = None,
) -> Tuple[str, str]:
    """Return (new_path, rewritten_content)."""
    path = _norm(path)
    new_path = rewrite_map[path]
    if path.endswith(".py"):
        return new_path, rewrite_python(content, path, rewrite_map)
    if PurePosixPath(path).suffix.lower() in {".ts", ".tsx", ".js", ".jsx"}:
        return new_path, rewrite_typescript(
            content, path, rewrite_map, atom_id=atom_id
        )
    return new_path, content


BANNED_IMPORT_RE = re.compile(
    r"""(?:from|import)\s+['"]?(?:\.\./)+"""
    r"""|from\s+\.{2,}[\w.]"""
    r"""|from\s+EliteEW\.|import\s+EliteEW"""
)


def has_banned_imports(content: str) -> bool:
    return bool(BANNED_IMPORT_RE.search(content))


def has_unresolved_in_set_absolute_imports(
    content: str,
    rewrite_map: Dict[str, str],
) -> list[str]:
    """
    Return absolute ``api.*`` import modules that still resolve into rewrite_map
    (should be empty after a successful rewrite pass).
    """
    hits: list[str] = []
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return hits
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and (node.level or 0) == 0 and node.module:
            resolved = resolve_absolute_module(node.module, rewrite_map)
            # Neutral Contract: import already equals atom-local module path —
            # not residual (preserve ewgen_bundle.* layout).
            if resolved and resolved != node.module:
                if node.module.startswith(("api.", "ewgen_bundle.")) or node.module in {
                    "api",
                    "ewgen_bundle",
                }:
                    hits.append(node.module)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                resolved = resolve_absolute_module(alias.name, rewrite_map)
                if resolved and resolved != alias.name:
                    if alias.name.startswith(("api.", "ewgen_bundle.")) or alias.name in {
                        "api",
                        "ewgen_bundle",
                    }:
                        hits.append(alias.name)
    return hits
