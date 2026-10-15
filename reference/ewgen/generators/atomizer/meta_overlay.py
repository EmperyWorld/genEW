# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Cognitive Overlay — draft atom.json + interfaces.json from Evidence Pack.
# Invariants:
# - No filesystem writes; Core validates claims against evidence (AST facts).
# - EWGEN_ASE_LLM=0 skips Overlay (status llm=skipped).
# - Hallucinated routes/exports/fetches are stripped; heavy hallucination
#   rejects Overlay and falls back to heuristic META.
# Related:
# - generators/factory/llama_client.py
# - generators/atomizer/meta_prompts.py
# - schemas/atom-manifest.v2.json
# ---

"""Overlay META drafting + Core-side validation helpers."""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from .evidence_pack import heuristic_atom_meta, heuristic_interfaces
from .meta_prompts import CAPABILITY_VOCAB, build_meta_prompt

logger = logging.getLogger(__name__)

JSON_BLOCK_RE = re.compile(r"\{[\s\S]*\}")
CompleteFn = Callable[[str], str]

# If more than this fraction of claimed routes/exports are stripped → reject.
HALLUCINATION_REJECT_RATIO = 0.5

ATOM_ROLES = frozenset(
    {"ui", "api", "db", "docs", "auth", "worker", "mixed"}
)
ATOM_SCALES = frozenset({"micro", "meso", "macro"})
ATOM_GRADES = frozenset({"strong", "weak", "broken"})


def llm_enabled() -> bool:
    from generators.core_settings.runtime import get_bool

    return get_bool("EWGEN_ASE_LLM", default=True)


def _parse_json_blob(text: str) -> Optional[Dict[str, Any]]:
    text = text.strip()
    # Prefer fenced JSON if present
    fence = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text)
    if fence:
        text = fence.group(1)
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = JSON_BLOCK_RE.search(text)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


def _evidence_route_keys(evidence: Dict[str, Any]) -> Set[Tuple[str, str]]:
    routes = (evidence.get("signatures") or {}).get("routes") or []
    keys: Set[Tuple[str, str]] = set()
    for route in routes:
        if not isinstance(route, dict):
            continue
        path = str(route.get("path") or "").strip()
        if not path:
            continue
        method = str(route.get("method") or "GET").upper().strip()
        keys.add((method, path))
    return keys


def _evidence_route_paths(evidence: Dict[str, Any]) -> Set[str]:
    return {path for _, path in _evidence_route_keys(evidence)}


def _evidence_symbols(evidence: Dict[str, Any]) -> Set[str]:
    exports = (evidence.get("signatures") or {}).get("exports") or []
    return {
        str(e.get("symbol"))
        for e in exports
        if isinstance(e, dict) and e.get("symbol")
    }


def _evidence_export_pairs(evidence: Dict[str, Any]) -> Set[Tuple[str, str]]:
    exports = (evidence.get("signatures") or {}).get("exports") or []
    pairs: Set[Tuple[str, str]] = set()
    for exp in exports:
        if not isinstance(exp, dict):
            continue
        sym = str(exp.get("symbol") or "").strip()
        file_p = str(exp.get("file") or "").strip()
        if sym:
            pairs.add((sym, file_p))
    return pairs


def _evidence_files(evidence: Dict[str, Any]) -> Set[str]:
    return {str(p) for p in (evidence.get("files") or [])}


def _evidence_fetch_paths(evidence: Dict[str, Any]) -> Set[str]:
    fetches = (evidence.get("signatures") or {}).get("feFetches") or []
    return {
        str(f.get("path"))
        for f in fetches
        if isinstance(f, dict) and f.get("path")
    }


def _normalize_capabilities(raw: Any) -> List[str]:
    if not isinstance(raw, list):
        return []
    vocab = set(CAPABILITY_VOCAB)
    out: List[str] = []
    seen: Set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            continue
        key = item.strip().lower().replace(" ", "_").replace("-", "_")
        if not key or key in seen:
            continue
        seen.add(key)
        # Keep vocabulary hits and free-form tags (synthesis may use both)
        if key in vocab or len(key) <= 48:
            out.append(key if key in vocab else item.strip()[:48])
    return out[:16]


def _schema_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "schemas"


def _soft_schema_check_atom(atom: Dict[str, Any]) -> List[str]:
    errs: List[str] = []
    if atom.get("schemaVersion") != "ewgen_atom_manifest_v2":
        errs.append("ATOM_SCHEMA_VERSION")
    for key in ("atomId", "semanticName", "role", "capabilities"):
        if not atom.get(key) and atom.get(key) != []:
            errs.append(f"ATOM_MISSING:{key}")
    role = atom.get("role")
    if role and role not in ATOM_ROLES:
        errs.append(f"ATOM_ROLE_INVALID:{role}")
    scale = atom.get("scale")
    if scale and scale not in ATOM_SCALES:
        errs.append(f"ATOM_SCALE_INVALID:{scale}")
    grade = atom.get("qualityGrade")
    if grade and grade not in ATOM_GRADES:
        errs.append(f"ATOM_GRADE_INVALID:{grade}")
    if not isinstance(atom.get("capabilities"), list):
        errs.append("ATOM_CAPABILITIES_TYPE")
    return errs


def validate_overlay_payload(
    payload: Dict[str, Any],
    evidence: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any], List[str]]:
    """
    Strip hallucinated routes/symbols/fetches against Evidence Pack.

    Returns (atom, interfaces, warnings). May set atom.overlay.status to
    ``rejected_hallucination`` when strip ratio exceeds threshold — caller
    should fall back to heuristic META in that case.
    """
    warnings: List[str] = []
    raw_atom = payload.get("atom")
    atom: Dict[str, Any] = (
        dict(raw_atom) if isinstance(raw_atom, dict) else {}
    )
    raw_interfaces = payload.get("interfaces")
    interfaces_in: Dict[str, Any] = (
        dict(raw_interfaces) if isinstance(raw_interfaces, dict) else {}
    )

    known_route_keys = _evidence_route_keys(evidence)
    known_route_paths = _evidence_route_paths(evidence)
    known_symbols = _evidence_symbols(evidence)
    known_export_pairs = _evidence_export_pairs(evidence)
    known_files = _evidence_files(evidence)
    known_fetches = _evidence_fetch_paths(evidence)

    claimed_routes = 0
    stripped_routes = 0
    clean_routes: List[Dict[str, Any]] = []
    for route in interfaces_in.get("routes") or []:
        if not isinstance(route, dict):
            continue
        path = str(route.get("path") or "").strip()
        if not path:
            continue
        claimed_routes += 1
        method = str(route.get("method") or "GET").upper().strip()
        file_p = str(route.get("file") or "").strip()
        key = (method, path)
        if not known_route_keys:
            warnings.append(f"STRIPPED_ROUTE:{method}:{path}")
            stripped_routes += 1
            continue
        if key not in known_route_keys and path not in known_route_paths:
            warnings.append(f"STRIPPED_ROUTE:{method}:{path}")
            stripped_routes += 1
            continue
        clean_route: Dict[str, Any] = {"method": method, "path": path}
        if file_p and known_files and file_p in known_files:
            clean_route["file"] = file_p
        elif file_p and known_files and file_p not in known_files:
            warnings.append(f"STRIPPED_ROUTE_FILE:{file_p}")
        if route.get("symbol"):
            clean_route["symbol"] = str(route["symbol"])
        clean_routes.append(clean_route)

    claimed_exports = 0
    stripped_exports = 0
    clean_exports: List[Dict[str, Any]] = []
    for exp in interfaces_in.get("exports") or []:
        if not isinstance(exp, dict):
            continue
        sym = str(exp.get("symbol") or "").strip()
        if not sym:
            continue
        claimed_exports += 1
        file_p = str(exp.get("file") or "").strip()
        if not known_symbols:
            warnings.append(f"STRIPPED_EXPORT:{sym}")
            stripped_exports += 1
            continue
        if sym not in known_symbols:
            warnings.append(f"STRIPPED_EXPORT:{sym}")
            stripped_exports += 1
            continue
        if file_p and known_files and file_p not in known_files:
            warnings.append(f"STRIPPED_EXPORT_FILE:{file_p}")
            # Prefer evidence file for this symbol
            file_p = next(
                (f for s, f in known_export_pairs if s == sym and f),
                "",
            )
        if not file_p:
            file_p = next(
                (f for s, f in known_export_pairs if s == sym and f),
                "",
            )
        if not file_p:
            warnings.append(f"STRIPPED_EXPORT_NO_FILE:{sym}")
            stripped_exports += 1
            continue
        entry: Dict[str, Any] = {"symbol": sym, "file": file_p}
        if exp.get("kind"):
            entry["kind"] = str(exp["kind"])
        clean_exports.append(entry)

    clean_fetches: List[Dict[str, Any]] = []
    for fetch in interfaces_in.get("feFetches") or []:
        if not isinstance(fetch, dict):
            continue
        fpath = str(fetch.get("path") or "").strip()
        if not fpath:
            continue
        if known_fetches and fpath not in known_fetches:
            warnings.append(f"STRIPPED_FETCH:{fpath}")
            continue
        if not known_fetches:
            warnings.append(f"STRIPPED_FETCH:{fpath}")
            continue
        entry_f: Dict[str, Any] = {"path": fpath}
        ff = str(fetch.get("file") or "").strip()
        if ff and (not known_files or ff in known_files):
            entry_f["file"] = ff
        clean_fetches.append(entry_f)

    signatures = evidence.get("signatures") or {}
    if not isinstance(signatures, dict):
        signatures = {}

    # Fall back to Core signatures when Overlay produced nothing usable
    interfaces: Dict[str, Any] = {
        "schemaVersion": "ewgen_interfaces_v1",
        "routes": clean_routes or list(signatures.get("routes") or []),
        "exports": clean_exports or list(signatures.get("exports") or []),
        "feFetches": clean_fetches
        if clean_fetches
        else list(signatures.get("feFetches") or []),
    }

    atom.setdefault("schemaVersion", "ewgen_atom_manifest_v2")
    # atomId is Core-owned — never trust Overlay to rename identity
    atom["atomId"] = evidence.get("atomId") or atom.get("atomId")
    atom.setdefault("role", evidence.get("role") or "mixed")
    if atom.get("role") not in ATOM_ROLES:
        atom["role"] = evidence.get("role") or "mixed"
    atom["capabilities"] = _normalize_capabilities(
        atom.get("capabilities")
    ) or list(
        heuristic_atom_meta(
            str(evidence.get("atomId")),
            role=str(evidence.get("role") or "mixed"),
            evidence=evidence,
            quality_grade="weak",
        ).get("capabilities")
        or ["mixed"]
    )
    atom.setdefault("semanticName", atom.get("atomId"))
    atom.setdefault("kind", "module")
    if atom.get("scale") not in ATOM_SCALES:
        atom["scale"] = "meso"
    if not atom.get("purpose"):
        atom["purpose"] = (
            f"Overlay atom for {atom.get('semanticName') or atom.get('atomId')}"
        )
    if not isinstance(atom.get("tags"), list):
        atom["tags"] = [str(atom.get("role") or "mixed")]

    schema_errs = _soft_schema_check_atom(atom)
    for err in schema_errs:
        warnings.append(err)

    # Hallucination reject gate
    route_ratio = (
        stripped_routes / claimed_routes if claimed_routes else 0.0
    )
    export_ratio = (
        stripped_exports / claimed_exports if claimed_exports else 0.0
    )
    reject = False
    if claimed_routes >= 2 and route_ratio > HALLUCINATION_REJECT_RATIO:
        reject = True
        warnings.append(
            f"REJECT_HALLUCINATION_ROUTES:{route_ratio:.2f}"
        )
    if claimed_exports >= 2 and export_ratio > HALLUCINATION_REJECT_RATIO:
        reject = True
        warnings.append(
            f"REJECT_HALLUCINATION_EXPORTS:{export_ratio:.2f}"
        )
    if schema_errs and "ATOM_MISSING:atomId" in schema_errs:
        reject = True

    if reject:
        atom["overlay"] = {
            "used": True,
            "status": "rejected_hallucination",
        }
        return atom, interfaces, warnings

    if any(e.startswith("ATOM_MISSING") for e in schema_errs):
        warnings.append("ATOM_INCOMPLETE")
        atom = heuristic_atom_meta(
            str(evidence.get("atomId")),
            role=str(evidence.get("role") or "mixed"),
            evidence=evidence,
            quality_grade="weak",
        )
        atom["overlay"] = {"used": True, "status": "fallback_incomplete"}
        return atom, interfaces, warnings

    atom["overlay"] = {"used": True, "status": "ok"}
    return atom, interfaces, warnings


def draft_meta_from_overlay(
    evidence: Dict[str, Any],
    *,
    quality_grade: str,
    complete_fn: Optional[CompleteFn] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """
    Returns (atom_meta, interfaces, overlay_info).
    Never writes files.

    ``complete_fn`` — optional injectable LLM callable(prompt)→text for tests.
    """
    info: Dict[str, Any] = {"used": False, "status": "llm=skipped"}
    if not llm_enabled() and complete_fn is None:
        logger.debug("[STEP] overlay_skip reason=EWGEN_ASE_LLM_off")
        atom = heuristic_atom_meta(
            str(evidence.get("atomId")),
            role=str(evidence.get("role") or "mixed"),
            evidence=evidence,
            quality_grade=quality_grade,
        )
        return atom, heuristic_interfaces(evidence), info

    prompt = build_meta_prompt(evidence)

    def _call_llm(p: str) -> str:
        if complete_fn is not None:
            return complete_fn(p)
        from generators.factory.llama_client import LlamaClient

        return LlamaClient().complete(p, temperature=0.1)

    try:
        logger.debug(
            "[STEP] overlay_infer atomId=%s files=%s",
            evidence.get("atomId"),
            len(evidence.get("files") or []),
        )
        raw = _call_llm(prompt)
        parsed = _parse_json_blob(raw)
        if not parsed:
            raise ValueError("non-json overlay response")
        if "atom" not in parsed and "interfaces" not in parsed:
            raise ValueError("overlay JSON missing atom/interfaces")

        atom, interfaces, warnings = validate_overlay_payload(
            parsed, evidence
        )
        status = (atom.get("overlay") or {}).get("status") or "ok"

        if status == "rejected_hallucination":
            logger.info(
                "[STEP] overlay_reject atomId=%s warnings=%s",
                evidence.get("atomId"),
                warnings[:8],
            )
            atom = heuristic_atom_meta(
                str(evidence.get("atomId")),
                role=str(evidence.get("role") or "mixed"),
                evidence=evidence,
                quality_grade=quality_grade,
            )
            atom["overlay"] = {
                "used": True,
                "status": "rejected_hallucination",
                "warnings": warnings,
            }
            info = {
                "used": True,
                "status": "rejected_hallucination",
                "warnings": warnings,
            }
            return atom, heuristic_interfaces(evidence), info

        atom["qualityGrade"] = quality_grade
        info = {
            "used": True,
            "status": status,
            "warnings": warnings,
        }
        atom["overlay"] = info
        logger.info(
            "[STEP] overlay_ok atomId=%s semanticName=%s caps=%s",
            atom.get("atomId"),
            atom.get("semanticName"),
            atom.get("capabilities"),
        )
        return atom, interfaces, info
    except Exception as exc:  # noqa: BLE001 — degrade to heuristic
        logger.debug(
            "[STEP] overlay_error atomId=%s err=%s",
            evidence.get("atomId"),
            exc,
        )
        info = {"used": False, "status": f"overlay_error:{exc}"}
        atom = heuristic_atom_meta(
            str(evidence.get("atomId")),
            role=str(evidence.get("role") or "mixed"),
            evidence=evidence,
            quality_grade=quality_grade,
        )
        return atom, heuristic_interfaces(evidence), info


def load_schema_paths() -> Dict[str, Path]:
    """Paths to META JSON schemas (for operators / optional validators)."""
    root = _schema_dir()
    return {
        "atom": root / "atom-manifest.v2.json",
        "interfaces": root / "interfaces.v1.json",
        "evidence": root / "evidence-pack.v1.json",
    }
