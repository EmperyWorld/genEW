# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Harvest routes/exports/fetch paths from closed-set sources (Core only).
# Invariants:
# - AST/regex only; no LLM.
# Related:
# - generators/atomizer/evidence_pack.py
# ---

"""Signature harvest for Evidence Pack."""

from __future__ import annotations

import ast
import re
from pathlib import PurePosixPath
from typing import Any, Dict, List, Mapping

ROUTE_DECO_RE = re.compile(
    r"""@(?:router|app)\.(get|post|put|patch|delete|options|head)\(\s*['"]([^'"]+)['"]""",
    re.IGNORECASE,
)
FETCH_RE = re.compile(
    r"""(?:fetch|axios\.(?:get|post|put|patch|delete))\(\s*['"`]([^'"`]+)['"`]""",
)


def harvest_signatures(files: Mapping[str, str]) -> Dict[str, Any]:
    routes: List[Dict[str, str]] = []
    exports: List[Dict[str, str]] = []
    fe_fetches: List[Dict[str, str]] = []
    snippets: List[Dict[str, str]] = []

    for path, content in sorted(files.items()):
        path_n = path.replace("\\", "/")
        suffix = PurePosixPath(path_n).suffix.lower()

        if suffix == ".py":
            for match in ROUTE_DECO_RE.finditer(content):
                routes.append(
                    {
                        "method": match.group(1).upper(),
                        "path": match.group(2),
                        "file": path_n,
                    }
                )
            try:
                tree = ast.parse(content)
            except SyntaxError:
                tree = None
            if tree is not None:
                for node in tree.body:
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                        exports.append(
                            {
                                "symbol": node.name,
                                "file": path_n,
                                "kind": type(node).__name__,
                            }
                        )
            # snippet window
            lines = content.splitlines()
            if lines:
                snippets.append(
                    {
                        "file": path_n,
                        "text": "\n".join(lines[:40])[:2000],
                    }
                )

        elif suffix in {".ts", ".tsx", ".js", ".jsx"}:
            for match in FETCH_RE.finditer(content):
                fe_fetches.append({"path": match.group(1), "file": path_n})
            export_re = re.compile(
                r"""export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+(\w+)"""
            )
            for match in export_re.finditer(content):
                exports.append(
                    {
                        "symbol": match.group(1),
                        "file": path_n,
                        "kind": "export",
                    }
                )
            lines = content.splitlines()
            if lines:
                snippets.append(
                    {
                        "file": path_n,
                        "text": "\n".join(lines[:40])[:2000],
                    }
                )

    return {
        "routes": routes,
        "exports": exports,
        "feFetches": fe_fetches,
        "snippets": snippets,
    }
