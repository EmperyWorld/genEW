# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Stage 12 one-shot Component Factory pipeline:
# prepare → scoped suggest → compose → resolve → validate → register.
# Invariants:
# - Craft candidates come only from this run's prepared bank entries.
# - Empty bank / no craft / validate blockers → structured failure.
# Related:
# - generators/unified_ingest/prepare_orchestrate.py
# - generators/warsmith/craft_suggest.py
# - generators/factory/validate_shell.py
# - documentation/platform/EWGEN-COMPONENT-FACTORY-VISION.md
# ---

"""One-shot Component Factory run envelope."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from generators.bank.hydrate import hydrate_bank_refs
from generators.factory.validate_shell import validate_factory_shell
from generators.importer.catalog import get_import_catalog
from generators.project_shell.compose import compose_project_shell
from generators.project_shell.lifecycle import register_shell
from generators.project_shell.resolver import resolve_project_shell
from generators.scavenger.catalog import get_scavenger_catalog
from generators.unified_ingest.prepare_orchestrate import prepare_ingest_zip
from generators.warsmith.craft_suggest import suggest_project_crafts

logger = logging.getLogger("ewgen.factory.component_run")

PROTOCOL_V1 = "ewgen_component_factory_run_v1"


class FactoryRunError(ValueError):
    def __init__(self, message: str, *, code: str) -> None:
        super().__init__(message)
        self.code = code


def _module_key(module: Dict[str, Any]) -> Optional[Tuple[str, str]]:
    source = str(module.get("catalogSource") or "").strip().lower()
    catalog_id = str(module.get("catalogId") or "").strip()
    if not source or not catalog_id:
        return None
    return source, catalog_id


def _assert_craft_in_scope(
    modules: List[Dict[str, Any]],
    allowed: Set[Tuple[str, str]],
) -> None:
    for module in modules:
        key = _module_key(module)
        if key is None:
            continue
        if key not in allowed:
            raise FactoryRunError(
                f"Craft module out of prepare scope: {key[0]}:{key[1]}",
                code="FACTORY_CRAFT_OUT_OF_SCOPE",
            )


def _files_for_modules(
    modules: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    fe: List[Dict[str, Any]] = []
    be: List[Dict[str, Any]] = []
    for module in modules:
        source = str(module.get("catalogSource") or "").strip().lower()
        catalog_id = str(module.get("catalogId") or "").strip()
        if not catalog_id:
            continue
        if source == "importer":
            raw = get_import_catalog().get_entry(catalog_id)
            if raw:
                fe.extend(
                    f
                    for f in (raw.get("files") or [])
                    if isinstance(f, dict)
                )
        elif source == "scavenger":
            raw = get_scavenger_catalog().get_entry(catalog_id)
            if raw:
                be.extend(
                    f
                    for f in (raw.get("files") or [])
                    if isinstance(f, dict)
                )
    return fe, be


def run_component_factory(
    data: bytes,
    *,
    project_name: str,
    intent: str = "",
    capabilities: Optional[List[str]] = None,
    rematerialize: bool = True,
    allow_weak_contracts: bool = False,
    register: bool = True,
    overwrite: bool = True,
    use_llm: bool = False,
    source_ref: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute prepare → scoped suggest → compose → resolve → validate → register.
    """
    steps: Dict[str, Any] = {}
    name = (project_name or "").strip() or "FactoryShell"
    caps = list(capabilities or [])

    logger.info("[STEP] factory_run prepare")
    prepare = prepare_ingest_zip(
        data,
        rematerialize=rematerialize,
        allow_manifest_only=False,
        save_to_catalog=True,
        source_ref=source_ref or "factory-run.zip",
    )
    bank_refs = list(prepare.get("bankEntries") or [])
    bank_modules = [
        str(entry.get("moduleName") or entry.get("catalogId") or "").strip()
        for entry in bank_refs
        if isinstance(entry, dict)
    ]
    bank_modules = [item for item in bank_modules if item]
    steps["prepare"] = {
        "protocol": prepare.get("protocol"),
        "preparedTotal": prepare.get("preparedTotal"),
        "runtimeFrontendEntries": prepare.get("runtimeFrontendEntries"),
        "bankEntryCount": len(bank_refs),
        "bankModules": bank_modules,
        "success": bool(prepare.get("success")),
        "ok": bool(prepare.get("success") and bank_refs),
    }
    if not prepare.get("success") or not bank_refs:
        raise FactoryRunError(
            "Prepare produced no bank entries",
            code="FACTORY_PREPARE_EMPTY",
        )

    hydrated, skipped = hydrate_bank_refs(bank_refs)
    steps["prepare"]["hydratedCount"] = len(hydrated)
    steps["prepare"]["hydrateSkipped"] = skipped
    if not hydrated:
        raise FactoryRunError(
            "Prepared bank refs could not be hydrated from catalogs",
            code="FACTORY_BANK_HYDRATE_EMPTY",
        )
    allowed = {
        (
            str(entry.get("catalogSource") or "").strip().lower(),
            str(entry.get("catalogId") or "").strip(),
        )
        for entry in hydrated
        if entry.get("catalogSource") and entry.get("catalogId")
    }

    logger.info("[STEP] factory_run suggest scoped=%s", len(hydrated))
    suggest = suggest_project_crafts(
        intent=intent,
        capabilities=caps,
        limit=5,
        use_llm=use_llm,
        dry_run_validate=True,
        bank_entries=hydrated,
    )
    steps["suggest"] = {
        "protocol": suggest.get("protocol"),
        "count": suggest.get("count"),
        "rankingMode": suggest.get("rankingMode"),
        "candidateScope": suggest.get("candidateScope"),
        "candidateCount": suggest.get("candidateCount"),
        "ok": int(suggest.get("count") or 0) >= 1,
    }
    crafts = [
        c
        for c in (suggest.get("crafts") or [])
        if c.get("manifestValid") is not False
    ]
    if not crafts:
        raise FactoryRunError(
            "No valid craft manifests from prepared bank",
            code="FACTORY_SUGGEST_EMPTY",
        )
    craft = crafts[0]
    modules = list(craft.get("modules") or [])
    _assert_craft_in_scope(modules, allowed)

    logger.info("[STEP] factory_run compose")
    composed = compose_project_shell(
        {
            "projectName": name,
            "modules": modules,
        },
        overwrite=overwrite,
    )
    steps["compose"] = {
        "protocol": composed.get("protocol"),
        "projectId": (composed.get("manifest") or {}).get("projectId"),
        "projectPath": composed.get("projectPath"),
        "bootReady": composed.get("bootReady"),
        "ok": bool(composed.get("bootReady")),
    }
    project_id = str(
        (composed.get("manifest") or {}).get("projectId")
        or composed.get("projectId")
        or ""
    ).strip()
    project_path = composed.get("projectPath")
    if not project_id and project_path:
        project_id = str(project_path).rstrip("/").split("/")[-1]

    logger.info("[STEP] factory_run resolve")
    resolved = resolve_project_shell(
        project_id=project_id or None,
        project_path=None,
        allow_weak_contracts=allow_weak_contracts,
        dry_run=False,
    )
    steps["resolve"] = {
        "protocol": resolved.get("protocol"),
        "strongCount": resolved.get("strongCount"),
        "weakCount": resolved.get("weakCount"),
        "ok": True,
        "deep": {
            "db": (resolved.get("deep") or {}).get("db", {}).get(
                "contractGrade"
            ),
            "auth": (resolved.get("deep") or {}).get("auth", {}).get(
                "status"
            ),
            "events": (resolved.get("deep") or {}).get("events", {}).get(
                "status"
            ),
        },
    }

    logger.info("[STEP] factory_run validate")
    fe_files, be_files = _files_for_modules(modules)
    deep_payload = (
        resolved.get("deep")
        if isinstance(resolved.get("deep"), dict)
        else {}
    )
    validation = validate_factory_shell(
        project_path=str(project_path) if project_path else None,
        project_id=project_id,
        boot_ready=bool(composed.get("bootReady")),
        frontend_files=fe_files,
        backend_files=be_files,
        deep=deep_payload,
        allow_weak_contracts=allow_weak_contracts,
    )
    steps["validate"] = {
        "ok": bool(validation.get("ok")),
        "success": bool(validation.get("success")),
        "blockers": validation.get("blockers") or [],
        "warnings": validation.get("warnings") or [],
        "checks": validation.get("checks") or {},
        "bootSmoke": validation.get("bootSmoke"),
    }
    if not validation.get("ok"):
        if not allow_weak_contracts:
            raise FactoryRunError(
                "Factory validate failed: "
                + ",".join(validation.get("blockers") or ["unknown"]),
                code="FACTORY_VALIDATE_FAILED",
            )
        steps["validate"]["ok"] = False
        steps["validate"]["continuedWithWeak"] = True

    registration: Optional[Dict[str, Any]] = None
    if register and project_id and (
        validation.get("ok") or allow_weak_contracts
    ):
        logger.info("[STEP] factory_run register")
        registration = register_shell(project_id)
        steps["register"] = {
            "success": True,
            "ok": True,
            "projectId": project_id,
            "registered": True,
            "needsRepair": not bool(validation.get("ok")),
        }
    elif register and not validation.get("ok"):
        steps["register"] = {
            "skipped": True,
            "ok": False,
            "reason": "validate_blockers",
        }
    else:
        steps["register"] = {"skipped": True, "ok": True}

    step_order = [
        "prepare",
        "suggest",
        "compose",
        "resolve",
        "validate",
        "register",
    ]
    return {
        "success": True,
        "protocol": PROTOCOL_V1,
        "jobId": datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"),
        "projectId": project_id,
        "projectPath": project_path,
        "craft": {
            "score": craft.get("score"),
            "rationale": craft.get("rationale"),
            "forgeMode": craft.get("forgeMode"),
            "routeContract": craft.get("routeContract"),
            "modules": modules,
            "scopedToPrepare": True,
        },
        "steps": steps,
        "summary": {
            "stepOrder": step_order,
            "bankModules": bank_modules,
            "craftModuleCount": len(modules),
            "candidateScope": "provided",
            "strongCount": steps.get("resolve", {}).get("strongCount"),
            "weakCount": steps.get("resolve", {}).get("weakCount"),
            "validated": bool(validation.get("ok")),
            "registered": bool(
                (steps.get("register") or {}).get("registered")
            ),
            "bootReady": bool((steps.get("compose") or {}).get("bootReady")),
        },
        "registration": registration,
        "validation": validation,
    }
