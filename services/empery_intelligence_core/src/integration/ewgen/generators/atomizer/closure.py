# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Deterministic import-graph closure for seed files (Python + TS/JS).
# Invariants:
# - No LLM; reproducible BFS over local imports only.
# - External/stdlib edges are recorded but not followed into closure.
# Related:
# - generators/atomizer/import_rewrite.py
# ---

"""Closed-set extraction via import graph."""

from __future__ import annotations

import ast
import re
from pathlib import PurePosixPath
from typing import Dict, Iterable, List, Set, Tuple

PYTHON_EXTS = {".py"}
TS_EXTS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}

TS_IMPORT_RE = re.compile(
    r"""(?:from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"])""",
)

STDLIB = {
    "abc", "argparse", "ast", "asyncio", "base64", "collections", "contextlib",
    "copy", "csv", "dataclasses", "datetime", "enum", "functools", "hashlib",
    "http", "importlib", "inspect", "io", "json", "logging", "math", "os",
    "pathlib", "re", "shutil", "sys", "tempfile", "threading", "time", "typing",
    "uuid", "warnings", "zipfile", "__future__",
}


def _ext(path: str) -> str:
    return PurePosixPath(path).suffix.lower()


def _norm(path: str) -> str:
    return path.replace("\\", "/").lstrip("./")


def _resolve_py_module(base_dir: str, module: str, indexed: Set[str]) -> str | None:
    if not module or module.split(".", 1)[0] in STDLIB:
        return None
    parts = module.replace(".", "/")
    candidates = [
        f"{parts}.py",
        f"{parts}/__init__.py",
        f"{base_dir}/{parts}.py" if base_dir else "",
        f"{base_dir}/{parts}/__init__.py" if base_dir else "",
    ]
    for cand in candidates:
        cand = _norm(cand)
        if cand and cand in indexed:
            return cand
    # Monorepo-prefixed paths: api.core.b → …/api/core/b.py
    suffixes = (f"{parts}.py", f"{parts}/__init__.py")
    best: str | None = None
    for path in indexed:
        for suf in suffixes:
            if path == suf or path.endswith("/" + suf):
                if best is None or len(path) > len(best):
                    best = path
    return best


def _py_imports(path: str, content: str, indexed: Set[str]) -> List[str]:
    out: List[str] = []
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return out
    base_dir = str(PurePosixPath(path).parent)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                resolved = _resolve_py_module(base_dir, alias.name, indexed)
                if resolved:
                    out.append(resolved)
        elif isinstance(node, ast.ImportFrom):
            if node.level and node.level > 0:
                # relative
                rel_parts = list(PurePosixPath(base_dir).parts)
                up = max(0, node.level - 1)
                if up <= len(rel_parts):
                    prefix = rel_parts[: len(rel_parts) - up]
                    mod = ".".join(
                        filter(None, [".".join(prefix), node.module or ""])
                    ).replace(".", "/")
                    for cand in (f"{mod}.py", f"{mod}/__init__.py"):
                        cand = _norm(cand)
                        if cand in indexed:
                            out.append(cand)
                            break
            elif node.module:
                resolved = _resolve_py_module(base_dir, node.module, indexed)
                if resolved:
                    out.append(resolved)
    return out


def _resolve_ts_spec(base_dir: str, spec: str, indexed: Set[str]) -> str | None:
    if not spec or not spec.startswith("."):
        return None
    joined = _norm(str(PurePosixPath(base_dir) / spec))
    candidates = [
        joined,
        f"{joined}.ts",
        f"{joined}.tsx",
        f"{joined}.js",
        f"{joined}.jsx",
        f"{joined}/index.ts",
        f"{joined}/index.tsx",
    ]
    for cand in candidates:
        if cand in indexed:
            return cand
    return None


def _ts_imports(path: str, content: str, indexed: Set[str]) -> List[str]:
    out: List[str] = []
    base_dir = str(PurePosixPath(path).parent)
    for match in TS_IMPORT_RE.finditer(content):
        spec = match.group(1) or match.group(2) or match.group(3) or ""
        resolved = _resolve_ts_spec(base_dir, spec, indexed)
        if resolved:
            out.append(resolved)
    return out


def build_import_graph(
    files: Dict[str, str],
) -> Tuple[Dict[str, List[str]], List[Dict[str, str]]]:
    """Return adjacency map and edge list for local imports."""
    indexed = {_norm(p) for p in files}
    adj: Dict[str, List[str]] = {p: [] for p in indexed}
    edges: List[Dict[str, str]] = []
    for path, content in files.items():
        path = _norm(path)
        deps: List[str] = []
        ext = _ext(path)
        if ext in PYTHON_EXTS:
            deps = _py_imports(path, content, indexed)
        elif ext in TS_EXTS:
            deps = _ts_imports(path, content, indexed)
        seen: Set[str] = set()
        for dep in deps:
            if dep in seen or dep == path:
                continue
            seen.add(dep)
            adj[path].append(dep)
            edges.append({"from": path, "to": dep})
    return adj, edges


def closed_set(
    seeds: Iterable[str],
    files: Dict[str, str],
    *,
    max_files: int = 200,
) -> List[str]:
    """BFS closure from seeds over local import graph."""
    adj, _ = build_import_graph(files)
    indexed = {_norm(p) for p in files}
    queue: List[str] = []
    for seed in seeds:
        n = _norm(seed)
        if n in indexed:
            queue.append(n)
    seen: Set[str] = set()
    order: List[str] = []
    while queue:
        cur = queue.pop(0)
        if cur in seen:
            continue
        seen.add(cur)
        order.append(cur)
        if len(order) > max_files:
            raise ValueError(
                f"CLOSURE_TOO_LARGE: closed set exceeds max_files={max_files}"
            )
        for nxt in adj.get(cur, []):
            if nxt not in seen:
                queue.append(nxt)
    return sorted(order)
