# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Scavenger integration boundary gate — block cross-domain sys.path and monorepo
# import snippets using domain_matrix product roots (EG-01).
# Invariants:
# - Snippets must never insert product monorepo roots (EliteEW, DEWA, …) on sys.path.
# Related:
# - generators/scavenger/integration_snippets.py
# - documentation/platform/EWGEN-MONOREPO-INTEGRATION.md
# ---

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from .import_rewriter import FROM_IMPORT_RE, IMPORT_RE

INTEGRATION_BOUNDARY_ERROR = (
    "Integration Error: Cross-domain dependency detected. Use Neutral Contract mode."
)

_SYSPATH_INSERT_RE = re.compile(
    r"sys\.path\.insert\s*\(\s*0\s*,\s*str\s*\(\s*_SCAVENGER_MONOREPO_ROOT\s*\)\s*\)",
)
_MONOREPO_ROOT_VAR_RE = re.compile(r"_SCAVENGER_MONOREPO_ROOT\s*=")
_BARE_API_IMPORT_RE = re.compile(r"^\s*(?:from|import)\s+api(?:\.|\s)", re.MULTILINE)

_DOMAIN_MATRIX_RELATIVE = Path(__file__).resolve().parents[3] / ".cursor" / "domain_matrix.json"

_FALLBACK_PRODUCT_ROOTS = frozenset({
    "EliteEW",
    "EliteEW2",
    "DEWA",
    "MobileAndroid",
    "EWPower",
    "EWC",
    "EWGen",
    "EWCO",
    "nexus-root",
})


class IntegrationBoundaryError(ValueError):
    """Raised when Scavenger would emit a cross-domain integration artifact."""

    def __init__(self, violations: Optional[List[str]] = None) -> None:
        self.violations = list(violations or [])
        if self.violations:
            detail = "; ".join(self.violations[:3])
            message = f"{INTEGRATION_BOUNDARY_ERROR} ({detail})"
        else:
            message = INTEGRATION_BOUNDARY_ERROR
        super().__init__(message)


def _load_product_roots() -> frozenset[str]:
    matrix_path = _DOMAIN_MATRIX_RELATIVE
    if not matrix_path.is_file():
        return _FALLBACK_PRODUCT_ROOTS

    try:
        payload = json.loads(matrix_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _FALLBACK_PRODUCT_ROOTS

    roots: Set[str] = set()
    for domain in payload.get("domains", []):
        domain_id = str(domain.get("id", ""))
        if domain_id in {"ewgen", "documentation", "cursor_governance", "scripts_host"}:
            continue
        for pattern in domain.get("path_patterns", []):
            segment = str(pattern).split("/", 1)[0]
            if segment and segment not in {"*", "."}:
                roots.add(segment)
    return frozenset(roots or _FALLBACK_PRODUCT_ROOTS)


PRODUCT_DOMAIN_ROOTS = _load_product_roots()
_EWGEN_BUNDLE_TOP = "ewgen_bundle"


def is_blocked_product_root(name: str) -> bool:
    return name in PRODUCT_DOMAIN_ROOTS


def detect_product_monorepo_root(source_files: List[Dict[str, str]]) -> Optional[str]:
    """
    Detect product/archive layout `{Root}/api/` (or backend/app) not yet self-contained.
    """
    for file in source_files:
        path = str(file.get("path", "")).replace("\\", "/")
        parts = [part for part in path.split("/") if part]
        if len(parts) < 2:
            continue
        if parts[0] in {"ewgen_bundle", _EWGEN_BUNDLE_TOP}:
            continue
        if parts[1] in {"api", "backend", "app"}:
            return parts[0]
    return None


def _collect_bare_api_imports(content: str) -> List[str]:
    specs: List[str] = []
    for match in FROM_IMPORT_RE.finditer(content):
        spec = match.group(2)
        if spec == "api" or spec.startswith("api."):
            specs.append(spec)
    for match in IMPORT_RE.finditer(content):
        spec = match.group(2)
        if spec == "api" or spec.startswith("api."):
            specs.append(spec)
    return specs


def validate_integration_sources(
    source_files: List[Dict[str, str]],
    *,
    allow_product_layout: bool = False,
) -> Dict[str, Any]:
    """
    Validate prepared sources before integration snippet emission.
    """
    violations: List[str] = []

    product_root = detect_product_monorepo_root(source_files)
    if product_root and not allow_product_layout:
        violations.append(
            f"product monorepo layout detected ({product_root}/…) — "
            "apply self-contained bundle rewrite first",
        )

    for file in source_files:
        path = str(file.get("path", "")).replace("\\", "/")
        content = str(file.get("content", ""))
        parts = [part for part in path.split("/") if part]
        if parts and is_blocked_product_root(parts[0]) and not path.startswith("ewgen_bundle/"):
            violations.append(f"source path still references product root: {path}")

        for spec in _collect_bare_api_imports(content):
            if not spec.startswith("ewgen_bundle."):
                violations.append(f"bare api import `{spec}` in {path or '<unknown>'}")

    return {
        "blocked": bool(violations),
        "violations": violations[:30],
        "productMonorepoRoot": product_root,
    }


def validate_snippet_content(content: str) -> Dict[str, Any]:
    """
    Reject integration snippet bodies that re-introduce cross-domain sys.path hooks.
    """
    violations: List[str] = []

    if _MONOREPO_ROOT_VAR_RE.search(content):
        violations.append("snippet defines _SCAVENGER_MONOREPO_ROOT")
    if _SYSPATH_INSERT_RE.search(content):
        violations.append("snippet inserts _SCAVENGER_MONOREPO_ROOT on sys.path")

    for line in content.splitlines():
        stripped = line.strip()
        if "sys.path.insert" not in stripped:
            continue
        for root in PRODUCT_DOMAIN_ROOTS:
            if f'"{root}"' in stripped or f"'{root}'" in stripped:
                violations.append(f"sys.path.insert references product root `{root}`")
            if f"/ {root}" in stripped or f'/{root}"' in stripped:
                violations.append(f"sys.path.insert path segment references `{root}`")

    if _BARE_API_IMPORT_RE.search(content):
        for match in FROM_IMPORT_RE.finditer(content):
            spec = match.group(2)
            if spec == "api" or spec.startswith("api."):
                violations.append(f"snippet contains bare import `{spec}`")
        for match in IMPORT_RE.finditer(content):
            spec = match.group(2)
            if spec == "api" or spec.startswith("api."):
                violations.append(f"snippet contains bare import `{spec}`")

    return {"blocked": bool(violations), "violations": violations[:20]}


def assert_integration_boundary(
    source_files: List[Dict[str, str]],
    *,
    allow_product_layout: bool = False,
) -> None:
    result = validate_integration_sources(
        source_files,
        allow_product_layout=allow_product_layout,
    )
    if result["blocked"]:
        raise IntegrationBoundaryError(result["violations"])


def assert_snippet_boundary(content: str) -> None:
    result = validate_snippet_content(content)
    if result["blocked"]:
        raise IntegrationBoundaryError(result["violations"])
