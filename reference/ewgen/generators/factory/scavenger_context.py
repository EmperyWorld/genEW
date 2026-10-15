"""
ScavengerContextKnowledgeService — fetch dependency contracts from local catalogs.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable

from generators.scavenger.catalog import ScavengerCatalog

from .context_knowledge import ContextSnippet

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

TS_INTERFACE_RE = re.compile(r"(?:export\s+)?interface\s+(\w+)")
TS_TYPE_RE = re.compile(r"export\s+type\s+(\w+)")
TS_CLASS_RE = re.compile(r"export\s+(?:default\s+)?class\s+(\w+)")
TS_METHOD_RE = re.compile(r"^\s+(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*\(", re.MULTILINE)
PY_CLASS_RE = re.compile(r"^class\s+(\w+)", re.MULTILINE)
PY_DEF_RE = re.compile(r"^def\s+(\w+)\s*\(", re.MULTILINE)
ROUTE_RE = re.compile(r"@(?:router|app)\.(?:get|post|put|patch|delete)\([\"']([^\"']+)")

HIGH_SIGNAL_EXTENSIONS = {".ts", ".tsx", ".py", ".d.ts"}
SKIP_PATH_PARTS = ("node_modules", "__pycache__", ".test.", ".spec.", "/dist/")


@runtime_checkable
class ContextKnowledgeService(Protocol):
    def fetch_for_dependencies(self, dependency_ids: List[str]) -> List[ContextSnippet]:
        ...


class ScavengerContextKnowledgeService:
    """Load code snippets and symbols for ComponentSpec dependencies."""

    def __init__(
        self,
        *,
        scavenger_catalog: Optional[ScavengerCatalog] = None,
        import_catalog_path: Optional[Path] = None,
        set_inventory_path: Optional[Path] = None,
    ):
        self._scavenger = scavenger_catalog or ScavengerCatalog()
        self._import_path = import_catalog_path or (PROJECT_ROOT / "data" / "import-catalog.json")
        self._set_path = set_inventory_path or (PROJECT_ROOT / "data" / "set-inventory.json")

    def fetch_for_dependencies(self, dependency_ids: List[str]) -> List[ContextSnippet]:
        snippets: List[ContextSnippet] = []
        seen: set[str] = set()

        for dep_id in dependency_ids:
            dep_key = dep_id.strip()
            if not dep_key or dep_key in seen:
                continue
            seen.add(dep_key)

            entry, catalog = self._resolve_entry(dep_key)
            if entry is None:
                logger.debug("[factory-cag] dependency not found in catalogs: %s", dep_key)
                continue

            for file_item in entry.get("files") or []:
                snippet = self._snippet_from_file(dep_key, catalog, file_item)
                if snippet is not None:
                    snippets.append(snippet)

        logger.info(
            "[factory-cag] fetched snippets=%d dependencies=%d",
            len(snippets),
            len(dependency_ids),
        )
        return snippets

    def _resolve_entry(self, dep_id: str) -> tuple[Optional[Dict[str, Any]], str]:
        scavenger_entry = self._find_scavenger_entry(dep_id)
        if scavenger_entry is not None:
            return scavenger_entry, "scavenger-catalog"

        for catalog_name, path in (
            ("import-catalog", self._import_path),
            ("set-inventory", self._set_path),
        ):
            entry = self._find_json_catalog_entry(path, dep_id)
            if entry is not None:
                return entry, catalog_name
        return None, ""

    def _find_scavenger_entry(self, dep_id: str) -> Optional[Dict[str, Any]]:
        dep_lower = dep_id.lower()
        for entry in self._scavenger.load_entries():
            for field in ("id", "moduleName", "displayLabel"):
                value = str(entry.get(field, "")).strip()
                if value and value.lower() == dep_lower:
                    return entry
            if dep_lower in str(entry.get("moduleName", "")).lower():
                return entry
        return None

    def _find_json_catalog_entry(self, path: Path, dep_id: str) -> Optional[Dict[str, Any]]:
        if not path.is_file():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

        candidates: List[Dict[str, Any]] = []
        if isinstance(payload, dict):
            for key in ("modules", "entries", "items"):
                bucket = payload.get(key)
                if isinstance(bucket, list):
                    candidates.extend(item for item in bucket if isinstance(item, dict))
        elif isinstance(payload, list):
            candidates.extend(item for item in payload if isinstance(item, dict))

        dep_lower = dep_id.lower()
        for entry in candidates:
            for field in ("moduleId", "catalogId", "id", "moduleName", "name"):
                value = str(entry.get(field, "")).strip()
                if value and value.lower() == dep_lower:
                    return entry
        return None

    def _snippet_from_file(
        self,
        source_id: str,
        catalog: str,
        file_item: Dict[str, Any],
    ) -> Optional[ContextSnippet]:
        rel_path = str(file_item.get("path", "")).replace("\\", "/")
        if not rel_path or any(part in rel_path for part in SKIP_PATH_PARTS):
            return None

        suffix = Path(rel_path).suffix.lower()
        if suffix not in HIGH_SIGNAL_EXTENSIONS:
            return None

        content = str(file_item.get("content", "")).strip()
        if not content:
            return None

        language = "typescript" if suffix in {".ts", ".tsx", ".d.ts"} else "python"
        symbols = _extract_symbols(content, language)
        score = _score_snippet(rel_path, symbols, content)

        return ContextSnippet(
            source_id=source_id,
            catalog=catalog,
            path=rel_path,
            language=language,
            content=content,
            symbols=symbols,
            relevance_score=score,
            source_file=rel_path,
        )


def _extract_symbols(content: str, language: str) -> List[str]:
    symbols: List[str] = []
    if language == "typescript":
        for pattern in (TS_INTERFACE_RE, TS_TYPE_RE, TS_CLASS_RE):
            symbols.extend(pattern.findall(content))
        symbols.extend(name for name in TS_METHOD_RE.findall(content) if not name.startswith("_"))
        symbols.extend(ROUTE_RE.findall(content))
    else:
        symbols.extend(PY_CLASS_RE.findall(content))
        symbols.extend(name for name in PY_DEF_RE.findall(content) if not name.startswith("_"))

    deduped: List[str] = []
    seen: set[str] = set()
    for symbol in symbols:
        if symbol not in seen:
            seen.add(symbol)
            deduped.append(symbol)
    return deduped


def _score_snippet(path: str, symbols: List[str], content: str) -> float:
    score = 1.0
    lowered = path.lower()
    if "/types/" in lowered or lowered.endswith(".d.ts"):
        score += 3.0
    if "api" in lowered or "contract" in lowered or "schema" in lowered:
        score += 2.0
    if any(name.endswith("Repository") or name.endswith("Service") for name in symbols):
        score += 2.0
    if "interface" in content or "type " in content:
        score += 1.0
    if len(content) > 4000:
        score -= 0.5
    return score
