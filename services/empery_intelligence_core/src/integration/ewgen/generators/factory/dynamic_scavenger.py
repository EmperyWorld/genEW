"""
DynamicScavenger — targeted dependency discovery with scan budget limits.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from pydantic import BaseModel, Field

from generators.scavenger.catalog import ScavengerCatalog

from .context_knowledge import ContextSnippet
from .scavenger_context import (
    HIGH_SIGNAL_EXTENSIONS,
    SKIP_PATH_PARTS,
    ScavengerContextKnowledgeService,
    _extract_symbols,
    _score_snippet,
)

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

DEFAULT_SCAN_SECONDS = float(os.getenv("EWGEN_FACTORY_SCAN_BUDGET_SECONDS", "30"))
DEFAULT_MAX_FILES = int(os.getenv("EWGEN_FACTORY_SCAN_MAX_FILES", "80"))
DEFAULT_MAX_DEPTH = int(os.getenv("EWGEN_FACTORY_SCAN_MAX_DEPTH", "4"))


class DependencyNotFoundError(Exception):
    """Raised when targeted scan exhausts budget without locating a dependency."""

    def __init__(self, dependency_id: str, *, reason: str = "", elapsed_seconds: float = 0.0):
        super().__init__(f"Dependency not found: {dependency_id} ({reason})")
        self.dependency_id = dependency_id
        self.reason = reason
        self.elapsed_seconds = elapsed_seconds


class ScanBudget(BaseModel):
    """Hard limits for automatic scavenger scans — prevents infinite repo walks."""

    max_seconds: float = Field(default=DEFAULT_SCAN_SECONDS, gt=0)
    max_files: int = Field(default=DEFAULT_MAX_FILES, gt=0)
    max_depth: int = Field(default=DEFAULT_MAX_DEPTH, ge=1)


class TargetedScanResult(BaseModel):
    dependency_id: str
    found: bool = False
    snippets: List[ContextSnippet] = Field(default_factory=list)
    catalog: str = ""
    elapsed_seconds: float = 0.0
    files_scanned: int = 0
    budget_exhausted: bool = False
    reason: str = ""


class DynamicScavenger:
    """
    Targeted search for a single dependency id.

    Phase 1 — fast catalog sweep (scavenger/import/set JSON).
    Phase 2 — bounded filesystem probe (filename/path slug match only).
    """

    def __init__(
        self,
        *,
        scavenger_catalog: Optional[ScavengerCatalog] = None,
        import_catalog_path: Optional[Path] = None,
        set_inventory_path: Optional[Path] = None,
        scan_roots: Optional[List[Path]] = None,
        knowledge_service: Optional[ScavengerContextKnowledgeService] = None,
    ):
        self._knowledge = knowledge_service or ScavengerContextKnowledgeService(
            scavenger_catalog=scavenger_catalog,
            import_catalog_path=import_catalog_path,
            set_inventory_path=set_inventory_path,
        )
        self._scan_roots = scan_roots or [
            PROJECT_ROOT / "data",
            PROJECT_ROOT / "generators",
        ]

    def targeted_search(
        self,
        dependency_id: str,
        *,
        budget: Optional[ScanBudget] = None,
    ) -> TargetedScanResult:
        dep_key = dependency_id.strip()
        if not dep_key:
            return TargetedScanResult(
                dependency_id=dependency_id,
                found=False,
                reason="empty dependency id",
            )

        scan_budget = budget or ScanBudget()
        started = time.monotonic()
        deadline = started + scan_budget.max_seconds

        catalog_snippets = self._knowledge.fetch_for_dependencies([dep_key])
        if catalog_snippets:
            elapsed = time.monotonic() - started
            catalog_name = catalog_snippets[0].catalog if catalog_snippets else ""
            logger.info(
                "[dynamic-scavenger] catalog hit dependency=%s snippets=%d elapsed=%.2fs",
                dep_key,
                len(catalog_snippets),
                elapsed,
            )
            return TargetedScanResult(
                dependency_id=dep_key,
                found=True,
                snippets=catalog_snippets,
                catalog=catalog_name,
                elapsed_seconds=elapsed,
                files_scanned=0,
                reason="catalog_index",
            )

        fs_snippets, files_scanned, exhausted = self._filesystem_probe(
            dep_key,
            deadline=deadline,
            max_files=scan_budget.max_files,
            max_depth=scan_budget.max_depth,
        )
        elapsed = time.monotonic() - started

        if fs_snippets:
            logger.info(
                "[dynamic-scavenger] filesystem hit dependency=%s snippets=%d "
                "files=%d elapsed=%.2fs",
                dep_key,
                len(fs_snippets),
                files_scanned,
                elapsed,
            )
            return TargetedScanResult(
                dependency_id=dep_key,
                found=True,
                snippets=fs_snippets,
                catalog="filesystem-probe",
                elapsed_seconds=elapsed,
                files_scanned=files_scanned,
                budget_exhausted=exhausted,
                reason="targeted_filesystem",
            )

        reason = "scan_budget_exhausted" if exhausted else "dependency_not_found"
        logger.warning(
            "[dynamic-scavenger] miss dependency=%s reason=%s files=%d elapsed=%.2fs",
            dep_key,
            reason,
            files_scanned,
            elapsed,
        )
        return TargetedScanResult(
            dependency_id=dep_key,
            found=False,
            elapsed_seconds=elapsed,
            files_scanned=files_scanned,
            budget_exhausted=exhausted,
            reason=reason,
        )

    def targeted_search_or_raise(
        self,
        dependency_id: str,
        *,
        budget: Optional[ScanBudget] = None,
    ) -> TargetedScanResult:
        result = self.targeted_search(dependency_id, budget=budget)
        if not result.found:
            raise DependencyNotFoundError(
                dependency_id,
                reason=result.reason,
                elapsed_seconds=result.elapsed_seconds,
            )
        return result

    def _filesystem_probe(
        self,
        dependency_id: str,
        *,
        deadline: float,
        max_files: int,
        max_depth: int,
    ) -> tuple[List[ContextSnippet], int, bool]:
        slug = dependency_id.lower().replace("_", "-")
        slug_variants = {slug, slug.replace("-service", ""), slug.replace("-", "")}
        slug_variants = {item for item in slug_variants if item and len(item) >= 3}

        snippets: List[ContextSnippet] = []
        files_scanned = 0
        exhausted = False
        seen_paths: Set[str] = set()

        for root in self._scan_roots:
            if not root.is_dir():
                continue
            for dirpath, dirnames, filenames in os.walk(root):
                if time.monotonic() >= deadline:
                    exhausted = True
                    break

                rel_parts = Path(dirpath).relative_to(root).parts
                if len(rel_parts) > max_depth:
                    dirnames.clear()
                    continue

                dirnames[:] = [
                    name
                    for name in dirnames
                    if name not in {".git", "node_modules", "__pycache__", "trash", ".venv"}
                ]

                path_lower = dirpath.lower()
                if not any(variant in path_lower for variant in slug_variants):
                    filename_hit = any(
                        any(variant in filename.lower() for variant in slug_variants)
                        for filename in filenames
                    )
                    if not filename_hit:
                        continue

                for filename in filenames:
                    if time.monotonic() >= deadline or files_scanned >= max_files:
                        exhausted = True
                        break

                    suffix = Path(filename).suffix.lower()
                    if suffix not in HIGH_SIGNAL_EXTENSIONS:
                        continue

                    full_path = Path(dirpath) / filename
                    try:
                        rel_path = str(full_path.relative_to(PROJECT_ROOT)).replace("\\", "/")
                    except ValueError:
                        rel_path = str(full_path).replace("\\", "/")
                    if any(part in rel_path for part in SKIP_PATH_PARTS):
                        continue
                    if not any(variant in rel_path.lower() for variant in slug_variants):
                        continue
                    if rel_path in seen_paths:
                        continue

                    seen_paths.add(rel_path)
                    files_scanned += 1

                    try:
                        content = full_path.read_text(encoding="utf-8").strip()
                    except OSError:
                        continue
                    if not content or len(content) > 120_000:
                        continue

                    language = "typescript" if suffix in {".ts", ".tsx", ".d.ts"} else "python"
                    symbols = _extract_symbols(content, language)
                    if not symbols and "interface " not in content:
                        continue

                    snippets.append(
                        ContextSnippet(
                            source_id=dependency_id,
                            catalog="filesystem-probe",
                            path=rel_path,
                            language=language,
                            content=content,
                            symbols=symbols,
                            relevance_score=_score_snippet(rel_path, symbols, content),
                            source_file=rel_path,
                        ),
                    )

                if exhausted:
                    break
            if exhausted:
                break

        return snippets, files_scanned, exhausted

    def auto_ingest_snippets(
        self,
        dependency_id: str,
        snippets: List[ContextSnippet],
        *,
        scavenger_catalog: Optional[ScavengerCatalog] = None,
    ) -> Optional[Dict[str, Any]]:
        """Optional hook — persist discovered snippets into scavenger catalog."""
        if not snippets:
            return None
        catalog = scavenger_catalog or ScavengerCatalog()
        files = [
            {"path": snippet.path, "content": snippet.content}
            for snippet in snippets[:12]
        ]
        try:
            return catalog.save_entry(
                module_name=dependency_id,
                module_type="integration",
                files=files,
                source="dynamic-scavenger",
                tags=["auto-ingest", "factory-phase3"],
                display_label=dependency_id,
            )
        except (ValueError, OSError) as error:
            logger.debug("[dynamic-scavenger] auto_ingest skipped: %s", error)
            return None
