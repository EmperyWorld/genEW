# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Stage 9 unified prepare — ZIP → group discovery → batch prepare →
# runtime-valid catalog/bank entries (optional SSOT rematerialize).
# Invariants:
# - Reuses importer/scavenger prepare-batch; does not fork sanitizers.
# - rematerialize + allow_manifest_only → 400 dual-flag conflict.
# - SSOT rematerialize hard-fails when root/files offline.
# - Stage 15: bank entries carry layout quality grade (strong|weak).
# Related:
# - generators/unified_ingest/orchestrate.py
# - generators/unified_ingest/ssot.py
# - generators/unified_ingest/layout_grade.py
# - documentation/platform/EWGEN-COMPONENT-FACTORY-VISION.md
# ---

"""Unified ingest prepare orchestration (Component Factory Stage 9)."""

from __future__ import annotations

import logging
import os
import zipfile
from io import BytesIO
from typing import Any, Dict, List, Optional, Sequence, Set

from generators.importer.analyze import analyze_zip as analyze_fe_zip
from generators.importer.manifest_only import count_runtime_frontend_sources
from generators.importer.prepare_batch import prepare_import_batch
from generators.scavenger.analyze import analyze_zip as analyze_be_zip
from generators.scavenger.prepare_batch import prepare_scavenger_batch

from .classify import (
    TRACK_FORTUNE_SEAKER,
    TRACK_SCAVENGER,
    classify_zip_bytes,
)
from .layout_grade import grade_bank_entry, summarize_grades
from .ssot import SsotError, default_allowlist, load_files_from_ssot, resolve_ssot_root

PROTOCOL_PREPARE_V1 = "ewgen_unified_ingest_prepare_v1"
DEFAULT_MAX_GROUPS = 25

logger = logging.getLogger("ewgen.unified_ingest.prepare")


class PrepareConflictError(ValueError):
    def __init__(self, message: str, *, code: str) -> None:
        super().__init__(message)
        self.code = code


def _track_skipped(reason: str) -> Dict[str, Any]:
    return {
        "status": "skipped",
        "reason": reason,
        "prepared": 0,
        "failed": 0,
        "results": [],
    }


def _is_fe_preparable(group: Dict[str, Any]) -> bool:
    if group.get("preparable") is False:
        return False
    kind = str(group.get("groupKind") or "").strip().lower()
    if kind == "platform":
        return False
    if kind in {"component", "router"}:
        return True
    # Whole package without split: no groupKind → still preparable
    return int(group.get("sourceCount") or 0) > 0


def _is_be_preparable(group: Dict[str, Any]) -> bool:
    if group.get("preparable") is False:
        return False
    if group.get("preparable") is True:
        return True
    return int(group.get("sourceCount") or 0) > 0


def _read_zip_map(data: bytes) -> Dict[str, str]:
    out: Dict[str, str] = {}
    with zipfile.ZipFile(BytesIO(data)) as archive:
        for name in archive.namelist():
            if name.endswith("/"):
                continue
            try:
                out[name.replace("\\", "/")] = archive.read(name).decode(
                    "utf-8",
                    errors="ignore",
                )
            except Exception:  # noqa: BLE001 — skip unreadable entry
                continue
    return out


def _files_from_paths(
    paths: Sequence[str],
    content_map: Dict[str, str],
) -> List[Dict[str, str]]:
    files: List[Dict[str, str]] = []
    for path in paths:
        normalized = str(path).replace("\\", "/")
        if not normalized or normalized not in content_map:
            continue
        files.append(
            {
                "path": normalized,
                "content": content_map[normalized],
            }
        )
    return files


def _group_paths_fe(group: Dict[str, Any]) -> List[str]:
    paths: Set[str] = set()
    for key in ("candidatePaths", "assetPaths", "platformClosurePaths"):
        for path in group.get(key) or []:
            if path:
                paths.add(str(path).replace("\\", "/"))
    return sorted(paths)


def _resolve_group_files(
    paths: Sequence[str],
    *,
    zip_map: Dict[str, str],
    rematerialize: bool,
    ssot_root: Optional[str],
    use_ssot: bool,
) -> List[Dict[str, str]]:
    if rematerialize and use_ssot:
        root = resolve_ssot_root(ssot_root)
        return load_files_from_ssot(
            paths,
            ssot_root=root,
            allowlist=default_allowlist(),
        )
    return _files_from_paths(paths, zip_map)


def prepare_ingest_zip(
    data: bytes,
    *,
    rematerialize: bool = True,
    allow_manifest_only: bool = False,
    ssot_root: Optional[str] = None,
    save_to_catalog: bool = True,
    max_groups: int = DEFAULT_MAX_GROUPS,
    source_ref: Optional[str] = None,
    ase_atomize: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Classify ZIP, discover groups, batch-prepare FE/BE into catalogs.

    rematerialize=True forces full FE runtime files (force_manifest_only=False).
    When ssot_root / EWGEN_SSOT_ROOT is set with rematerialize, load from SSOT.
    ase_atomize (default EWGEN_ASE_ATOMIZE=1): Stage 21 ESAL Atomizer pass.
    """
    if rematerialize and allow_manifest_only:
        raise PrepareConflictError(
            "Dual-flag conflict: rematerialize=true cannot combine with "
            "allowManifestOnly=true",
            code="DUAL_FLAG_REMATERIALIZE_MANIFEST",
        )

    if ase_atomize is None:
        ase_atomize = os.getenv("EWGEN_ASE_ATOMIZE", "1").strip().lower() not in {
            "0",
            "false",
            "off",
            "no",
        }

    classification = classify_zip_bytes(data)
    suggested = list(classification.get("suggestedTracks") or [])
    zip_map = _read_zip_map(data)
    use_ssot = bool(
        rematerialize
        and (
            (ssot_root or "").strip()
            or os.getenv("EWGEN_SSOT_ROOT", "").strip()
        )
    )

    tracks: Dict[str, Any] = {
        TRACK_FORTUNE_SEAKER: _track_skipped("no frontend signals"),
        TRACK_SCAVENGER: _track_skipped("no backend signals"),
    }
    bank_refs: List[Dict[str, Any]] = []

    force_manifest_only: Optional[bool]
    if rematerialize:
        force_manifest_only = False
    elif allow_manifest_only:
        force_manifest_only = True
    else:
        force_manifest_only = None

    if TRACK_FORTUNE_SEAKER in suggested:
        try:
            logger.info("[STEP] unified_ingest prepare fortune_seaker")
            analysis = analyze_fe_zip(data)
            groups_raw = [
                g
                for g in (analysis.get("componentGroups") or [])
                if _is_fe_preparable(g)
            ][: max(1, max_groups)]
            prepare_groups: List[Dict[str, Any]] = []
            for group in groups_raw:
                paths = _group_paths_fe(group)
                files = _resolve_group_files(
                    paths,
                    zip_map=zip_map,
                    rematerialize=rematerialize,
                    ssot_root=ssot_root,
                    use_ssot=use_ssot,
                )
                if not files:
                    continue
                package_json = None
                pkg_path = group.get("packageJsonPath")
                if pkg_path and pkg_path in zip_map:
                    package_json = zip_map[pkg_path]
                prepare_groups.append(
                    {
                        "label": group.get("displayLabel")
                        or group.get("label")
                        or group.get("suggestedModuleName"),
                        "moduleName": group.get("suggestedModuleName"),
                        "moduleType": group.get("suggestedModuleType")
                        or "imported",
                        "files": files,
                        "packageJson": package_json,
                    }
                )
            if not prepare_groups:
                tracks[TRACK_FORTUNE_SEAKER] = _track_skipped(
                    "no preparable frontend groups with files"
                )
            else:
                batch = prepare_import_batch(
                    prepare_groups,
                    source="zip",
                    source_ref=source_ref,
                    save_to_catalog=save_to_catalog,
                    force_manifest_only=force_manifest_only,
                )
                runtime_ok = 0
                for item in batch.get("results") or []:
                    if not item.get("success"):
                        continue
                    files = item.get("files") or []
                    runtime_count = count_runtime_frontend_sources(files)
                    if runtime_count > 0 and not item.get("manifestOnly"):
                        runtime_ok += 1
                    if item.get("catalogId"):
                        quality = grade_bank_entry(
                            role="frontend",
                            module_name=item.get("moduleName"),
                            files=files,
                            manifest_only=bool(item.get("manifestOnly")),
                            runtime_source_count=runtime_count,
                        )
                        bank_refs.append(
                            {
                                "catalogSource": "importer",
                                "catalogId": item["catalogId"],
                                "moduleName": item.get("moduleName"),
                                "role": "frontend",
                                "runtimeSourceCount": runtime_count,
                                "manifestOnly": bool(
                                    item.get("manifestOnly")
                                ),
                                "quality": quality,
                                "qualityGrade": quality.get("grade"),
                                "sourceRef": source_ref,
                            }
                        )
                tracks[TRACK_FORTUNE_SEAKER] = {
                    "status": "ok" if batch.get("prepared", 0) else "failed",
                    "prepared": batch.get("prepared", 0),
                    "failed": batch.get("failed", 0),
                    "runtimeValid": runtime_ok,
                    "results": [
                        {
                            "label": r.get("label"),
                            "moduleName": r.get("moduleName"),
                            "success": r.get("success"),
                            "catalogId": r.get("catalogId"),
                            "error": r.get("error"),
                            "manifestOnly": r.get("manifestOnly"),
                        }
                        for r in (batch.get("results") or [])
                    ],
                }
        except SsotError as exc:
            logger.info("[STEP] unified_ingest prepare FE ssot fail: %s", exc)
            tracks[TRACK_FORTUNE_SEAKER] = {
                "status": "failed",
                "error": str(exc),
                "code": exc.code,
                "prepared": 0,
                "failed": 0,
                "results": [],
            }
        except Exception as exc:  # noqa: BLE001 — isolate track
            logger.exception("[STEP] unified_ingest prepare fortune_seaker")
            tracks[TRACK_FORTUNE_SEAKER] = {
                "status": "failed",
                "error": str(exc) or exc.__class__.__name__,
                "code": "PREPARE_FE_FAILED",
                "prepared": 0,
                "failed": 0,
                "results": [],
            }

    if TRACK_SCAVENGER in suggested:
        try:
            logger.info("[STEP] unified_ingest prepare scavenger")
            analysis = analyze_be_zip(data, include_file_contents=False)
            groups_raw = [
                g
                for g in (analysis.get("packageGroups") or [])
                if _is_be_preparable(g)
            ][: max(1, max_groups)]
            prepare_groups = []
            for group in groups_raw:
                # Prefer candidate-only for prepare; deps separate
                candidate_files = _files_from_paths(
                    group.get("candidatePaths") or [],
                    zip_map,
                )
                if rematerialize and use_ssot:
                    try:
                        candidate_files = load_files_from_ssot(
                            group.get("candidatePaths") or [],
                            ssot_root=resolve_ssot_root(ssot_root),
                            allowlist=default_allowlist(),
                        )
                    except SsotError:
                        # Fall back to zip for BE if SSOT path mismatch
                        candidate_files = _files_from_paths(
                            group.get("candidatePaths") or [],
                            zip_map,
                        )
                dep_files = _files_from_paths(
                    group.get("dependencyPaths") or [],
                    zip_map,
                )
                if not candidate_files:
                    continue
                prepare_groups.append(
                    {
                        "label": group.get("displayLabel")
                        or group.get("label")
                        or group.get("suggestedModuleName"),
                        "moduleName": group.get("suggestedModuleName"),
                        "moduleType": group.get("suggestedModuleType")
                        or "imported",
                        "files": candidate_files,
                        "dependencyFiles": dep_files,
                        "integrationHints": group.get("integrationHints"),
                        "preparable": True,
                    }
                )
            if not prepare_groups:
                tracks[TRACK_SCAVENGER] = _track_skipped(
                    "no preparable backend groups with files"
                )
            else:
                batch = prepare_scavenger_batch(
                    prepare_groups,
                    source="zip",
                    source_ref=source_ref,
                    save_to_catalog=save_to_catalog,
                    write_to_disk=False,
                )
                for item in batch.get("results") or []:
                    if item.get("success") and item.get("catalogId"):
                        quality = grade_bank_entry(
                            role="backend",
                            module_name=item.get("moduleName"),
                            files=item.get("files") or [],
                            manifest_only=False,
                            runtime_source_count=None,
                        )
                        bank_refs.append(
                            {
                                "catalogSource": "scavenger",
                                "catalogId": item["catalogId"],
                                "moduleName": item.get("moduleName"),
                                "role": "backend",
                                "runtimeSourceCount": None,
                                "manifestOnly": False,
                                "quality": quality,
                                "qualityGrade": quality.get("grade"),
                                "sourceRef": source_ref,
                            }
                        )
                tracks[TRACK_SCAVENGER] = {
                    "status": "ok" if batch.get("prepared", 0) else "failed",
                    "prepared": batch.get("prepared", 0),
                    "failed": batch.get("failed", 0),
                    "results": [
                        {
                            "label": r.get("label"),
                            "moduleName": r.get("moduleName"),
                            "success": r.get("success"),
                            "catalogId": r.get("catalogId"),
                            "error": r.get("error"),
                        }
                        for r in (batch.get("results") or [])
                    ],
                }
        except Exception as exc:  # noqa: BLE001 — isolate track
            logger.exception("[STEP] unified_ingest prepare scavenger")
            tracks[TRACK_SCAVENGER] = {
                "status": "failed",
                "error": str(exc) or exc.__class__.__name__,
                "code": "PREPARE_BE_FAILED",
                "prepared": 0,
                "failed": 0,
                "results": [],
            }

    fe_track = tracks[TRACK_FORTUNE_SEAKER]
    be_track = tracks[TRACK_SCAVENGER]
    prepared_total = int(fe_track.get("prepared") or 0) + int(
        be_track.get("prepared") or 0
    )
    runtime_fe = int(fe_track.get("runtimeValid") or 0)
    success = prepared_total > 0 and fe_track.get("status") != "failed" and (
        TRACK_SCAVENGER not in suggested or be_track.get("status") != "failed"
    )
    # Soft success: at least one track prepared when suggested
    if prepared_total > 0:
        success = True
        if rematerialize and TRACK_FORTUNE_SEAKER in suggested:
            if fe_track.get("status") == "ok" and runtime_fe == 0:
                success = False

    next_steps: List[str] = []
    if bank_refs:
        next_steps.append("GET /api/bank/search")
        next_steps.append("POST /api/project/suggest")
        next_steps.append("POST /api/warsmith/compose")

    quality_summary = summarize_grades(bank_refs)

    ase_atoms: List[Dict[str, Any]] = []
    if ase_atomize and rematerialize and zip_map:
        try:
            from generators.atomizer.atomize import atomize_files

            # One atom from whole zip map seeds (capped) — Core ESAL path
            seed_paths = sorted(zip_map.keys())[:5]
            subset = {
                k: v
                for k, v in zip_map.items()
                if k.endswith((".py", ".ts", ".tsx", ".js", ".jsx"))
            }
            # Cap subset size for prepare path
            if len(subset) > 80:
                keep = set(seed_paths)
                for path in sorted(subset.keys()):
                    if len(keep) >= 80:
                        break
                    keep.add(path)
                subset = {k: subset[k] for k in keep if k in subset}
            if subset:
                atom_result = atomize_files(
                    subset,
                    seeds=seed_paths,
                    origin=source_ref or "unified_ingest",
                    max_files=200,
                )
                ase_atoms.append(
                    {
                        "atomId": atom_result.get("atomId"),
                        "atomPath": atom_result.get("atomPath"),
                        "verify": atom_result.get("verify"),
                        "contentFingerprint": atom_result.get(
                            "contentFingerprint"
                        ),
                    }
                )
                next_steps.append("POST /api/synthesis/plan")
                next_steps.append("POST /api/synthesis/materialize")
        except Exception as exc:  # noqa: BLE001 — ASE optional degrade
            logger.exception("[STEP] unified_ingest ase_atomize_skip")
            ase_atoms.append(
                {
                    "error": str(exc) or exc.__class__.__name__,
                    "code": "ASE_ATOMIZE_FAILED",
                }
            )

    return {
        "success": success,
        "protocol": PROTOCOL_PREPARE_V1,
        "classification": classification,
        "rematerialize": rematerialize,
        "allowManifestOnly": allow_manifest_only,
        "ssotUsed": use_ssot,
        "aseAtomize": bool(ase_atomize),
        "aseAtoms": ase_atoms,
        "tracks": tracks,
        "bankEntries": bank_refs,
        "preparedTotal": prepared_total,
        "runtimeFrontendEntries": runtime_fe,
        "quality": quality_summary,
        "nextSteps": next_steps,
    }
