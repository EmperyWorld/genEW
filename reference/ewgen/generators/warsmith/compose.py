"""
Warsmith - Compose fullstack module from importer + scavenger catalogs
"""

from pathlib import Path
from typing import Any, Dict, Optional

from generators.importer.catalog import get_import_catalog
from generators.importer.naming import validate_module_name
from generators.scavenger.catalog import get_scavenger_catalog

from .catalog import get_warsmith_catalog
from .integration_pack import build_integration_pack
from .manifest import build_composite_manifest, build_layer_summary
from .integration_validate import validate_integration_pack
from .quality import validate_compose


def _default_module_name(frontend_entry: Dict[str, Any], backend_entry: Dict[str, Any]) -> str:
    fe_name = str(frontend_entry.get("moduleName", "Frontend"))
    be_name = str(backend_entry.get("moduleName", "Backend"))
    if fe_name == be_name:
        return f"{fe_name}Stack"
    return f"{fe_name}{be_name}"


def hydrate_warsmith_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    """
    Load full file trees for both layers from source catalogs.
    """
    layers = entry.get("layers") or {}
    fe_meta = layers.get("frontend") or {}
    be_meta = layers.get("backend") or {}

    fe_id = str(fe_meta.get("catalogId", ""))
    be_id = str(be_meta.get("catalogId", ""))
    fe_entry = get_import_catalog().get_entry(fe_id) if fe_id else None
    be_entry = get_scavenger_catalog().get_entry(be_id) if be_id else None

    return {
        **entry,
        "layers": {
            "frontend": {
                **fe_meta,
                "files": (fe_entry or {}).get("files") or [],
                "bundleQuality": (fe_entry or {}).get("bundleQuality") or fe_meta.get("bundleQuality"),
            },
            "backend": {
                **be_meta,
                "files": (be_entry or {}).get("files") or [],
                "bundleQuality": (be_entry or {}).get("bundleQuality") or be_meta.get("bundleQuality"),
            },
        },
    }


def compose_warsmith_module(
    frontend_catalog_id: str,
    backend_catalog_id: str,
    module_name: Optional[str] = None,
    allow_source_ref_mismatch: bool = False,
    require_set_ready: bool = False,
    save_to_catalog: bool = True,
    pairing_strategy: str = "manual",
    pairing_confidence: Optional[float] = None,
    write_to_disk: bool = False,
    overwrite: bool = False,
    register_manifest: bool = False,
    project_root: Optional[Path] = None,
    allow_manifest_only_frontend: bool = False,
) -> Dict[str, Any]:
    """
    Compose a fullstack Warsmith module from two catalog entries.
    """
    frontend_entry = get_import_catalog().get_entry(frontend_catalog_id)
    if not frontend_entry:
        raise ValueError(f"Frontend catalog entry not found: {frontend_catalog_id}")

    backend_entry = get_scavenger_catalog().get_entry(backend_catalog_id)
    if not backend_entry:
        raise ValueError(f"Backend catalog entry not found: {backend_catalog_id}")

    resolved_name = (module_name or _default_module_name(frontend_entry, backend_entry)).strip()
    name_error = validate_module_name(resolved_name)
    if name_error:
        raise ValueError(name_error)

    skip_duplicate_id: Optional[str] = None
    if overwrite:
        for summary in get_warsmith_catalog().list_entries():
            if str(summary.get("moduleName", "")).strip().lower() == resolved_name.lower():
                skip_duplicate_id = str(summary.get("id", "")) or None
                break

    validation = validate_compose(
        frontend_entry,
        backend_entry,
        resolved_name,
        allow_source_ref_mismatch=allow_source_ref_mismatch,
        skip_duplicate_name_check=skip_duplicate_id,
        require_set_ready=require_set_ready,
        overwrite=overwrite,
        allow_manifest_only_frontend=allow_manifest_only_frontend,
    )
    if not validation["passed"]:
        raise ValueError("; ".join(validation["errors"]))

    confidence = pairing_confidence
    if confidence is None:
        confidence = 1.0 if validation.get("sourceRefMatch") else 0.6

    integration_pack = build_integration_pack(
        resolved_name,
        frontend_entry,
        backend_entry,
        pairing_strategy=pairing_strategy,
        pairing_confidence=confidence,
    )

    fe_layer = build_layer_summary(
        "importer",
        frontend_catalog_id,
        str(frontend_entry.get("moduleName", "")),
        len(frontend_entry.get("files") or []),
        frontend_entry.get("bundleQuality"),
    )
    be_layer = build_layer_summary(
        "scavenger",
        backend_catalog_id,
        str(backend_entry.get("moduleName", "")),
        len(backend_entry.get("files") or []),
        backend_entry.get("bundleQuality"),
    )

    artifact_paths = [file["path"] for file in integration_pack.get("artifacts") or []]
    manifest = build_composite_manifest(
        module_name=resolved_name,
        source_ref=frontend_entry.get("sourceRef") or backend_entry.get("sourceRef"),
        frontend_layer=fe_layer,
        backend_layer=be_layer,
        pairing={
            "strategy": pairing_strategy,
            "sourceRefMatch": validation.get("sourceRefMatch", False),
            "confidence": confidence,
            "warnings": validation.get("warnings") or [],
        },
        integration_artifacts=artifact_paths,
    )

    layers_payload = {
        "frontend": {
            **fe_layer,
            "bundleQuality": frontend_entry.get("bundleQuality"),
        },
        "backend": {
            **be_layer,
            "bundleQuality": backend_entry.get("bundleQuality"),
        },
    }

    catalog_id: Optional[str] = None
    catalog_entry: Optional[Dict[str, Any]] = None
    if save_to_catalog:
        catalog = get_warsmith_catalog()
        integration_payload = {
            "envExample": integration_pack["envExample"],
            "dockerCompose": integration_pack["dockerCompose"],
            "readmeSection": integration_pack["readmeSection"],
            "matchedRoutes": integration_pack["matchedRoutes"],
            "aggregatedSnippets": integration_pack["aggregatedSnippets"],
            "routeContract": integration_pack.get("routeContract") or {},
            "contractArtifacts": integration_pack.get("contractArtifacts") or [],
        }
        if overwrite and skip_duplicate_id:
            catalog_entry = catalog.update_entry(
                skip_duplicate_id,
                moduleName=resolved_name,
                sourceRef=manifest.get("sourceRef"),
                manifest=manifest,
                integrationPack=integration_payload,
                layers=layers_payload,
            )
        else:
            catalog_entry = catalog.save_entry(
                module_name=resolved_name,
                source_ref=manifest.get("sourceRef"),
                manifest=manifest,
                integration_pack=integration_payload,
                layers=layers_payload,
            )
        catalog_id = catalog_entry.get("id")

    materialize_result: Optional[Dict[str, Any]] = None
    if write_to_disk and catalog_entry:
        from .materialize import materialize_warsmith_module

        materialize_result = materialize_warsmith_module(
            catalog_entry,
            overwrite=overwrite,
            register_manifest=register_manifest,
            project_root=project_root,
        )

    integration_validation = validate_integration_pack(integration_pack)

    return {
        "success": True,
        "catalogId": catalog_id,
        "materialize": materialize_result,
        "moduleName": resolved_name,
        "moduleType": "fullstack-imported",
        "manifest": manifest,
        "integrationPack": integration_pack,
        "validation": validation,
        "layers": {
            "frontend": {
                "moduleName": fe_layer["moduleName"],
                "fileCount": fe_layer["fileCount"],
                "qualityGrade": (frontend_entry.get("bundleQuality") or {}).get("qualityGrade"),
                "files": frontend_entry.get("files") or [],
            },
            "backend": {
                "moduleName": be_layer["moduleName"],
                "fileCount": be_layer["fileCount"],
                "qualityGrade": (backend_entry.get("bundleQuality") or {}).get("qualityGrade"),
                "files": backend_entry.get("files") or [],
            },
        },
        "artifactFiles": integration_pack.get("artifacts") or [],
        "integrationValidation": integration_validation,
        "routeContract": integration_pack.get("routeContract"),
    }
