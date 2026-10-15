"""
Smart truncation — preserve structural integrity when packing context snippets.
"""

from __future__ import annotations

import re
from typing import List, Optional

from .context_knowledge import estimate_tokens

TS_DECL_START = re.compile(
    r"^\s*(?:export\s+)?(?:default\s+)?(?:interface|type|class|enum|const|function|async function)\b",
    re.MULTILINE,
)
PY_DECL_START = re.compile(
    r"^\s*(?:@\w+\s*\([^)]*\)\s*)?(?:async\s+)?(?:class|def)\s+\w+",
    re.MULTILINE,
)


def validate_structural_integrity(content: str, language: str) -> bool:
    """
    Return True when content has balanced delimiters and no dangling declarations.
    """
    if not content or not content.strip():
        return False

    if content.count("{") != content.count("}"):
        return False
    if content.count("(") != content.count(")"):
        return False
    if content.count("[") != content.count("]"):
        return False

    stripped = content.rstrip()
    if stripped.endswith("{") or stripped.endswith(",") or stripped.endswith(":"):
        return False

    if language == "typescript":
        # Incomplete declaration only at EOF (not on opening-brace lines)
        if re.search(r"export\s+(?:interface|class)\s+\w+[^{]*\{\s*$", stripped):
            return False
        if re.search(r"export\s+type\s+\w+\s*=\s*[^;{}\s]+\s*$", stripped):
            return False

    return True


def split_declaration_units(content: str, language: str) -> List[str]:
    """Split source into complete top-level declaration units."""
    if language == "typescript":
        return _split_typescript_units(content)
    return _split_python_units(content)


def smart_trim_content(
    content: str,
    language: str,
    token_limit: int,
) -> Optional[str]:
    """
    Fit as many **complete** declaration units as possible within token_limit.

    Returns None when no structurally valid partial fits — caller must drop the
    snippet rather than inject poisoned context.
    """
    if token_limit <= 0:
        return None

    if estimate_tokens(content) <= token_limit:
        if validate_structural_integrity(content, language):
            return content
        return None

    units = split_declaration_units(content, language)
    if not units:
        return None

    packed: List[str] = []
    used = 0
    for unit in units:
        unit_tokens = estimate_tokens(unit)
        if used + unit_tokens > token_limit:
            continue
        if not validate_structural_integrity(unit, language):
            continue
        packed.append(unit)
        used += unit_tokens

    if not packed:
        return None

    merged = "\n\n".join(packed)
    if not validate_structural_integrity(merged, language):
        return None
    return merged


def _split_typescript_units(content: str) -> List[str]:
    lines = content.splitlines()
    units: List[str] = []
    buffer: List[str] = []
    depth = 0
    active = False

    for line in lines:
        stripped = line.strip()
        if not active and TS_DECL_START.match(line):
            active = True
            buffer = [line]
            depth = line.count("{") - line.count("}")
            if depth <= 0 and (";" in line or stripped.endswith("}")):
                units.append("\n".join(buffer))
                buffer = []
                active = False
            continue

        if active:
            buffer.append(line)
            depth += line.count("{") - line.count("}")
            if depth <= 0 and (stripped.endswith("}") or stripped.endswith(";")):
                units.append("\n".join(buffer))
                buffer = []
                active = False

    if buffer and validate_structural_integrity("\n".join(buffer), "typescript"):
        units.append("\n".join(buffer))

    return [unit for unit in units if unit.strip()]


def _split_python_units(content: str) -> List[str]:
    lines = content.splitlines()
    units: List[str] = []
    buffer: List[str] = []
    active = False

    for line in lines:
        if not active and PY_DECL_START.match(line):
            active = True
            buffer = [line]
            if line.rstrip().endswith(":"):
                continue
            units.append("\n".join(buffer))
            buffer = []
            active = False
            continue

        if active:
            if line.strip() == "" and buffer:
                units.append("\n".join(buffer))
                buffer = []
                active = False
                continue
            if line and not line.startswith((" ", "\t")) and PY_DECL_START.match(line):
                if buffer:
                    units.append("\n".join(buffer))
                buffer = [line]
                continue
            buffer.append(line)

    if buffer:
        units.append("\n".join(buffer))

    return [
        unit
        for unit in units
        if unit.strip() and validate_structural_integrity(unit, "python")
    ]
