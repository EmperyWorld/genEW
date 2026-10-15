"""P18: product packs are assembly-active only with PASSED golden evidence."""

from __future__ import annotations

import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from services.empery_intelligence_core.src.integration.assembly_profiles import (
    is_law_pack,
    is_product_pack,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)

_log = logging.getLogger("eic.pack_golden_law")

_PASSED_RE = re.compile(
    r"(?is)(?:#{1,3}\s*verdict\b.{0,160}\bPASSED\b)|(?:verdict|status)\s*[:\*]*\s*\**\s*PASSED\b"
)


def pack_golden_registry_path(paths: EicOrchestrationPaths) -> Path:
    return paths.orchestration_root / "recipes" / "pack_golden_registry.yaml"


def reports_dir(paths: EicOrchestrationPaths) -> Path:
    return paths.orchestration_root / "reports"


@lru_cache(maxsize=4)
def _load_registry_raw(registry_file: str) -> dict[str, Any]:
    path = Path(registry_file)
    if not path.is_file():
        return {}
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return _parse_simple_registry(path.read_text(encoding="utf-8"))


def _parse_simple_registry(text: str) -> dict[str, Any]:
    """Minimal fallback when PyYAML missing."""
    always: list[str] = []
    product: dict[str, list[str]] = {}
    section: str | None = None
    current_pack: str | None = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith("always_active:"):
            section = "always"
            current_pack = None
            continue
        if line.startswith("product_goldens:"):
            section = "product"
            current_pack = None
            continue
        if section == "always" and line.strip().startswith("- "):
            always.append(line.strip()[2:].strip())
            continue
        if section == "product":
            if line.startswith("  ") and line.strip().endswith(":") and not line.strip().startswith("-"):
                current_pack = line.strip().rstrip(":")
                product[current_pack] = []
                continue
            if current_pack and line.strip().startswith("- "):
                product[current_pack].append(line.strip()[2:].strip())
    return {"always_active": always, "product_goldens": product}


def load_pack_golden_registry(paths: EicOrchestrationPaths) -> dict[str, Any]:
    path = pack_golden_registry_path(paths)
    return _load_registry_raw(str(path.resolve()))


def _report_passed(report: Path) -> bool:
    if not report.is_file():
        return False
    text = report.read_text(encoding="utf-8", errors="replace")
    head = "\n".join(text.splitlines()[:40])
    if _PASSED_RE.search(head):
        return True
    return bool(re.search(r"(?m)^\|\s*[^|]+\s*\|\s*PASSED\s*\|", text))


def pack_has_passed_golden(paths: EicOrchestrationPaths, stem: str) -> bool:
    data = load_pack_golden_registry(paths)
    goldens = data.get("product_goldens") or {}
    if not isinstance(goldens, dict):
        return False
    reports = goldens.get(stem) or []
    if not isinstance(reports, list) or not reports:
        return False
    base = reports_dir(paths)
    for name in reports:
        if not isinstance(name, str) or not name.strip():
            continue
        if _report_passed(base / name.strip()):
            return True
    return False


def is_pack_assembly_active(paths: EicOrchestrationPaths, stem: str) -> bool:
    """True when pack may be matched for Hands assembly (P18 INDEX law)."""
    if is_law_pack(stem):
        return True
    data = load_pack_golden_registry(paths)
    always = data.get("always_active") or []
    if isinstance(always, list) and stem in always:
        return True
    if is_product_pack(stem):
        ok = pack_has_passed_golden(paths, stem)
        if not ok:
            _log.info(
                "pack %s not assembly-active: no PASSED golden in registry",
                stem,
            )
        return ok
    # Unknown non-product stems (explicit .md attach) stay allowed.
    return True


def filter_active_pack_stems(
    paths: EicOrchestrationPaths, stems: list[str] | tuple[str, ...]
) -> list[str]:
    out: list[str] = []
    for stem in stems:
        s = stem[:-3] if stem.endswith(".md") else stem
        if is_pack_assembly_active(paths, s):
            out.append(s)
    return out


def inactive_product_packs(paths: EicOrchestrationPaths) -> list[str]:
    """Product packs that would be matched historically but lack golden PASSED."""
    from services.empery_intelligence_core.src.integration.assembly_profiles import (
        _PRODUCT_PACKS,
    )

    data = load_pack_golden_registry(paths)
    always = set(data.get("always_active") or [])
    bad: list[str] = []
    for stem in sorted(_PRODUCT_PACKS):
        if stem in always:
            continue
        if not pack_has_passed_golden(paths, stem):
            bad.append(stem)
    return bad
