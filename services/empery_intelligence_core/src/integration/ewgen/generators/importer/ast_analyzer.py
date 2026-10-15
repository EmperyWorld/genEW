"""
Fortune Seaker - AST Export Analyzer Bridge
Invokes TypeScript AST analyzer with regex fallback
"""

import json
import logging
import os
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

USE_AST_ANALYZER = os.getenv(
    "EWGEN_USE_AST_ANALYZER", "true"
).lower() in ("1", "true", "yes")

EXPORT_REGEX = re.compile(
    r"export\s+(?:default\s+)?(?:function|const|class|interface|type|enum)\s+(\w+)"
)


def _project_root() -> Path:
    return Path(__file__).parent.parent.parent


def _analyzer_script() -> Path:
    return (
        _project_root()
        / "src"
        / "services"
        / "importers"
        / "exportAnalyzer.ts"
    )


def regex_extract_exports(content: str) -> List[str]:
    """
    Regex fallback for export extraction.
    """
    names = EXPORT_REGEX.findall(content)
    if "export default" in content and "default" not in names:
        names.insert(0, "default")
    return names[:20]


def extract_exports_batch(
    entries: List[Dict[str, str]],
) -> Dict[str, List[str]]:
    """
    Extract exports for multiple files using AST analyzer.
    """
    if not entries:
        return {}

    if not USE_AST_ANALYZER:
        return {
            entry["path"]: regex_extract_exports(entry.get("content", ""))
            for entry in entries
            if entry.get("path")
        }

    script = _analyzer_script()
    if not script.exists():
        logger.warning("AST analyzer script not found: %s", script)
        return {
            entry["path"]: regex_extract_exports(entry.get("content", ""))
            for entry in entries
            if entry.get("path")
        }

    payload = json.dumps([
        {"path": entry["path"], "content": entry.get("content", "")}
        for entry in entries
        if entry.get("path")
    ])

    try:
        result = subprocess.run(
            ["npx", "tsx", str(script)],
            input=payload,
            capture_output=True,
            text=True,
            cwd=str(_project_root()),
            timeout=int(os.getenv("EWGEN_AST_ANALYZER_TIMEOUT", "30")),
            check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        logger.warning("AST analyzer subprocess failed: %s", str(exc))
        return {
            entry["path"]: regex_extract_exports(entry.get("content", ""))
            for entry in entries
            if entry.get("path")
        }

    if result.returncode != 0:
        logger.warning(
            "AST analyzer failed: %s",
            result.stderr.strip() or result.stdout.strip(),
        )
        return {
            entry["path"]: regex_extract_exports(entry.get("content", ""))
            for entry in entries
            if entry.get("path")
        }

    try:
        parsed: Dict[str, Any] = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        logger.warning("AST analyzer returned invalid JSON")
        return {
            entry["path"]: regex_extract_exports(entry.get("content", ""))
            for entry in entries
            if entry.get("path")
        }

    output: Dict[str, List[str]] = {}
    for entry in entries:
        path = entry.get("path")
        if not path:
            continue
        raw_exports = parsed.get(path, [])
        if isinstance(raw_exports, list) and raw_exports:
            output[path] = [str(item) for item in raw_exports[:20]]
        else:
            output[path] = regex_extract_exports(entry.get("content", ""))

    return output
