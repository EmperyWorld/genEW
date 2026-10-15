"""
Scavenger - Python export extraction (functions / classes)
"""

import ast
import re
from typing import List

_FALLBACK_DEF_RE = re.compile(r"^def\s+([a-zA-Z_][\w]*)\s*\(", re.MULTILINE)
_FALLBACK_CLASS_RE = re.compile(r"^class\s+([a-zA-Z_][\w]*)\s*[\(:]", re.MULTILINE)


def extract_python_exports(content: str) -> List[str]:
    """
    Extract public function and class names from Python source.
    """
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return _regex_exports(content)

    names: List[str] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if not node.name.startswith("_"):
                names.append(node.name)
        elif isinstance(node, ast.ClassDef):
            if not node.name.startswith("_"):
                names.append(node.name)

    if not names:
        return _regex_exports(content)
    return sorted(set(names))


def _regex_exports(content: str) -> List[str]:
    names = _FALLBACK_DEF_RE.findall(content) + _FALLBACK_CLASS_RE.findall(content)
    return sorted({name for name in names if not name.startswith("_")})
