"""
ContextGatheringService — resolve ComponentSpec dependencies from local catalogs.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable

from generators.set.paths import inventory_path

from .artifacts import get_run_workspace
from .pipeline_context import ContextGatherResult, ResolvedDependency
from .spec import ComponentSpec

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


@runtime_checkable
class ContextGatheringService(Protocol):
    def gather(self, run_id: str, spec: ComponentSpec) -> ContextGatherResult:
        ...

    def gather_dependencies(
        self,
        run_id: str,
        dependency_ids: List[str],
    ) -> ContextGatherResult:
        ...


class CatalogContextGatheringService:
    """Resolve dependency ids against import/scavenger/SET inventories."""

    def __init__(
        self,
        *,
        import_catalog_path: Optional[Path] = None,
        scavenger_catalog_path: Optional[Path] = None,
        set_inventory_path: Optional[Path] = None,
    ):
        self._import_path = import_catalog_path or (PROJECT_ROOT / "data" / "import-catalog.json")
        self._scavenger_path = scavenger_catalog_path or (
            PROJECT_ROOT / "data" / "scavenger-catalog.json"
        )
        self._set_path = set_inventory_path or inventory_path()

    def gather(self, run_id: str, spec: ComponentSpec) -> ContextGatherResult:
        return self.gather_dependencies(run_id, list(spec.dependencies))

    def gather_dependencies(
        self,
        run_id: str,
        dependency_ids: List[str],
    ) -> ContextGatherResult:
        resolved: List[ResolvedDependency] = []
        missing: List[str] = []

        for dep_id in dependency_ids:
            dep_key = dep_id.strip()
            if not dep_key:
                continue
            hit = self._resolve_dependency(dep_key)
            if hit is None:
                missing.append(dep_key)
                continue
            resolved.append(hit)

        workspace = str(get_run_workspace(run_id))
        logger.info(
            "[factory-pipeline] context_gathered run_id=%s resolved=%d missing=%d",
            run_id,
            len(resolved),
            len(missing),
        )
        return ContextGatherResult(
            resolved_dependencies=resolved,
            missing_dependencies=missing,
            effective_dependencies=[dep.strip() for dep in dependency_ids if dep.strip()],
            workspace_path=workspace,
        )

    def _resolve_dependency(self, dep_id: str) -> Optional[ResolvedDependency]:
        for catalog_name, path in (
            ("set-inventory", self._set_path),
            ("import-catalog", self._import_path),
            ("scavenger-catalog", self._scavenger_path),
        ):
            entry = self._find_entry(path, dep_id)
            if entry is not None:
                module_id = str(
                    entry.get("moduleId")
                    or entry.get("catalogId")
                    or entry.get("id")
                    or dep_id
                )
                summary = str(
                    entry.get("moduleName")
                    or entry.get("name")
                    or entry.get("intent")
                    or dep_id
                )
                return ResolvedDependency(
                    dependency_id=dep_id,
                    catalog=catalog_name,
                    module_id=module_id,
                    summary=summary,
                )
        return None

    def _find_entry(self, path: Path, dep_id: str) -> Optional[Dict[str, Any]]:
        if not path.is_file():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

        candidates: List[Dict[str, Any]] = []
        if isinstance(payload, dict):
            for key in ("modules", "entries", "items", "catalog"):
                bucket = payload.get(key)
                if isinstance(bucket, list):
                    candidates.extend(item for item in bucket if isinstance(item, dict))
            if not candidates and payload.get("moduleId"):
                candidates.append(payload)
        elif isinstance(payload, list):
            candidates.extend(item for item in payload if isinstance(item, dict))

        dep_lower = dep_id.lower()
        for entry in candidates:
            for field in ("moduleId", "catalogId", "id", "name", "warsmithCatalogId"):
                value = str(entry.get(field, "")).strip()
                if value and value.lower() == dep_lower:
                    return entry
            if dep_lower in str(entry.get("moduleName", "")).lower():
                return entry
        return None
