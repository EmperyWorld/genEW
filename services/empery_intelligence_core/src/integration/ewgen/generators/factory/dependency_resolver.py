"""
DependencyResolver — infer hidden dependencies from prompt against catalog index.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Set

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

SERVICE_SUFFIX_RE = re.compile(r"\b([a-z][a-z0-9-]*-service)\b", re.IGNORECASE)
USES_RE = re.compile(
    r"\b(?:uses?|using|integrate(?:s|d)?\s+with|depends?\s+on|consumes?|calls?)\s+"
    r"(?:the\s+)?([a-z][a-z0-9-]*(?:-service)?)\b",
    re.IGNORECASE,
)
MODULE_RE = re.compile(r"\b([a-z][a-z0-9-]{2,})\b", re.IGNORECASE)

STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "build",
        "create",
        "crud",
        "for",
        "generate",
        "make",
        "module",
        "that",
        "the",
        "this",
        "uses",
        "using",
        "with",
        "tasks",
        "task",
        "api",
        "new",
    },
)


class CatalogIndexEntry(BaseModel):
    """Normalized catalog module reference."""

    module_id: str
    catalog: str
    display_name: str = ""
    tags: List[str] = Field(default_factory=list)


class CatalogIndex:
    """Unified index over scavenger, import, and SET inventories."""

    def __init__(self, entries: List[CatalogIndexEntry]):
        self._entries = entries
        self._by_id: Dict[str, CatalogIndexEntry] = {}
        self._aliases: Dict[str, str] = {}
        for entry in entries:
            key = entry.module_id.lower()
            self._by_id[key] = entry
            self._aliases[key] = key
            slug = key.replace("-service", "").replace("_", "-")
            if slug and slug not in self._aliases:
                self._aliases[slug] = key
            if entry.display_name:
                display_key = entry.display_name.lower().replace(" ", "-")
                if display_key not in self._aliases:
                    self._aliases[display_key] = key

    @classmethod
    def load(
        cls,
        *,
        scavenger_catalog_path: Optional[Path] = None,
        import_catalog_path: Optional[Path] = None,
        set_inventory_path: Optional[Path] = None,
    ) -> "CatalogIndex":
        scavenger_path = scavenger_catalog_path or (
            PROJECT_ROOT / "data" / "scavenger-catalog.json"
        )
        import_path = import_catalog_path or (PROJECT_ROOT / "data" / "import-catalog.json")
        set_path = set_inventory_path or (PROJECT_ROOT / "data" / "set-inventory.json")

        entries: List[CatalogIndexEntry] = []
        for catalog_name, path in (
            ("scavenger-catalog", scavenger_path),
            ("import-catalog", import_path),
            ("set-inventory", set_path),
        ):
            entries.extend(cls._load_catalog_file(path, catalog_name))
        return cls(entries)

    @classmethod
    def _load_catalog_file(cls, path: Path, catalog_name: str) -> List[CatalogIndexEntry]:
        if not path.is_file():
            return []
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []

        candidates: List[dict] = []
        if isinstance(payload, dict):
            for key in ("modules", "entries", "items", "catalog"):
                bucket = payload.get(key)
                if isinstance(bucket, list):
                    candidates.extend(item for item in bucket if isinstance(item, dict))
            if not candidates and payload.get("moduleId"):
                candidates.append(payload)
        elif isinstance(payload, list):
            candidates.extend(item for item in payload if isinstance(item, dict))

        entries: List[CatalogIndexEntry] = []
        seen: Set[str] = set()
        for item in candidates:
            module_id = str(
                item.get("moduleId")
                or item.get("catalogId")
                or item.get("id")
                or item.get("moduleName")
                or item.get("name")
                or "",
            ).strip()
            if not module_id:
                continue
            key = module_id.lower()
            if key in seen:
                continue
            seen.add(key)
            display = str(
                item.get("moduleName") or item.get("displayLabel") or item.get("name") or module_id,
            )
            tags = [str(tag) for tag in (item.get("tags") or []) if tag]
            entries.append(
                CatalogIndexEntry(
                    module_id=module_id,
                    catalog=catalog_name,
                    display_name=display,
                    tags=tags,
                ),
            )
        return entries

    def module_ids(self) -> List[str]:
        return [entry.module_id for entry in self._entries]

    def resolve_hint(self, hint: str) -> Optional[str]:
        normalized = hint.strip().lower().replace("_", "-")
        if not normalized:
            return None
        if normalized in self._by_id:
            return self._by_id[normalized].module_id
        if normalized in self._aliases:
            return self._by_id[self._aliases[normalized]].module_id
        for entry in self._entries:
            entry_lower = entry.module_id.lower()
            if normalized in entry_lower or entry_lower in normalized:
                return entry.module_id
            if entry.display_name and normalized in entry.display_name.lower():
                return entry.module_id
        return None

    def find_entry(self, module_id: str) -> Optional[CatalogIndexEntry]:
        return self._by_id.get(module_id.strip().lower())


class DependencyResolutionResult(BaseModel):
    """Declared + inferred dependency plan for context gathering."""

    declared: List[str] = Field(default_factory=list)
    inferred: List[str] = Field(default_factory=list)
    effective: List[str] = Field(default_factory=list)
    catalog_hits: List[str] = Field(default_factory=list)
    unresolved_hints: List[str] = Field(default_factory=list)


class DependencyResolver:
    """
    Match natural-language prompts to catalog module ids.

    Extracts service tokens and verb phrases (uses/integrates with) then
    validates hints against the live CatalogIndex.
    """

    def __init__(self, catalog_index: Optional[CatalogIndex] = None):
        self._index = catalog_index or CatalogIndex.load()

    def resolve(self, prompt: str, declared: Optional[List[str]] = None) -> DependencyResolutionResult:
        declared_list = [dep.strip() for dep in (declared or []) if dep and dep.strip()]
        declared_keys = {dep.lower() for dep in declared_list}

        hints = self._extract_hints(prompt)
        inferred: List[str] = []
        catalog_hits: List[str] = []
        unresolved_hints: List[str] = []

        for hint in hints:
            if hint.lower() in declared_keys:
                continue
            resolved = self._index.resolve_hint(hint)
            if resolved:
                if resolved.lower() not in declared_keys and resolved not in inferred:
                    inferred.append(resolved)
                    catalog_hits.append(resolved)
            elif hint.lower() not in STOPWORDS and len(hint) >= 4:
                unresolved_hints.append(hint)

        effective: List[str] = []
        seen: Set[str] = set()
        for dep in [*declared_list, *inferred]:
            key = dep.lower()
            if key not in seen:
                seen.add(key)
                effective.append(dep)

        logger.info(
            "[dependency-resolver] declared=%d inferred=%d effective=%d hints=%d",
            len(declared_list),
            len(inferred),
            len(effective),
            len(hints),
        )
        return DependencyResolutionResult(
            declared=declared_list,
            inferred=inferred,
            effective=effective,
            catalog_hits=catalog_hits,
            unresolved_hints=unresolved_hints,
        )

    def _extract_hints(self, prompt: str) -> List[str]:
        if not prompt.strip():
            return []

        hints: List[str] = []
        seen: Set[str] = set()

        def _add(raw: str) -> None:
            token = raw.strip().lower().replace("_", "-")
            if not token or token in STOPWORDS or len(token) < 3:
                return
            if token not in seen:
                seen.add(token)
                hints.append(token)

        for pattern in (SERVICE_SUFFIX_RE, USES_RE):
            for match in pattern.finditer(prompt):
                _add(match.group(1))

        for entry in self._index.module_ids():
            entry_lower = entry.lower()
            if entry_lower in prompt.lower():
                _add(entry)

        for match in MODULE_RE.finditer(prompt):
            candidate = match.group(1)
            if self._index.resolve_hint(candidate):
                _add(candidate)

        return hints
