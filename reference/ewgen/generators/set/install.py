"""
Install fullstack modules into SET runtime
"""

import shutil
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.importer.naming import to_kebab, validate_module_name
from generators.warsmith.catalog import get_warsmith_catalog
from generators.warsmith.compose import hydrate_warsmith_entry

from .bootstrap import bootstrap_set_runtime
from .contract_gate import evaluate_install_contract
from .entry_detect import detect_module_runtime
from .fe_build import build_module_frontend
from .integration_apply import apply_integration_snippets, apply_local_tsconfig_merges
from .inventory import get_set_inventory
from .paths import runtime_modules_root, runtime_root
from .registry_sync import sync_runtime_registry
from .requirements_merge import merge_module_requirements
from .router_mount import build_set_module_router
from .runtime import restart_set_backend
from .runtime_manifest import (
    build_runtime_manifest,
    runtime_summary_for_registry,
    write_module_manifest,
)
from .snapshots import install_snapshot_guard
from .volume_permissions import ensure_module_volume_access


def _normalize_path(path: str) -> str:
    return path.replace("\\", "/").lstrip("/")


def _write_files(base_dir: Path, files: List[Dict[str, str]], *, strip_prefix: str = "") -> int:
    written = 0
    for file in files:
        rel = _normalize_path(str(file.get("path", "")))
        if not rel:
            continue
        if strip_prefix and rel.startswith(strip_prefix):
            rel = rel[len(strip_prefix):].lstrip("/")
        target = base_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(str(file.get("content", "")), encoding="utf-8")
        written += 1
    return written


def _generate_frontend_stub(module_id: str, module_name: str, file_count: int) -> str:
    return textwrap.dedent(
        f'''
        import {{ useEffect, useState }} from 'react';

        interface Props {{
          apiUrl: string;
        }}

        export function SetInstalledModule({{ apiUrl }}: Props) {{
          const [health, setHealth] = useState('...');

          useEffect(() => {{
            void fetch(`${{apiUrl}}/api/modules/{module_id}/health`)
              .then((response) => response.json())
              .then((data: {{ status?: string }}) => setHealth(data.status ?? 'unknown'))
              .catch(() => setHealth('offline'));
          }}, [apiUrl]);

          return (
            <div>
              <h1>{module_name}</h1>
              <p>SET slot · {file_count} imported files</p>
              <p><code>{{health}}</code></p>
            </div>
          );
        }}
        ''',
    ).strip() + "\n"


def install_from_warsmith_catalog(
    warsmith_catalog_id: str,
    *,
    module_name: Optional[str] = None,
    overwrite: bool = False,
    allow_weak_contract: bool = False,
    build_frontend: bool = False,
    build_backend: bool = True,
    require_adapter: bool = True,
    skip_adapter_gate: bool = False,
) -> Dict[str, Any]:
    """Install a Warsmith fullstack module into set-runtime/modules/{id}/."""
    bootstrap_set_runtime()

    catalog = get_warsmith_catalog()
    entry = catalog.get_entry(warsmith_catalog_id)
    if not entry:
        raise ValueError(f"Warsmith catalog entry not found: {warsmith_catalog_id}")

    hydrated = hydrate_warsmith_entry(entry)
    gate = evaluate_install_contract(
        hydrated,
        allow_weak_contract=allow_weak_contract,
    )
    if not gate.get("allowed"):
        errors = gate.get("errors") or []
        raise ValueError("; ".join(str(item) for item in errors) or "Route contract gate failed")

    resolved_name = module_name or str(hydrated.get("moduleName", "ImportedModule"))
    name_error = validate_module_name(resolved_name)
    if name_error:
        raise ValueError(name_error)

    module_id = to_kebab(resolved_name)

    adapter_gate: Dict[str, Any] = {"skipped": True}
    if require_adapter and not skip_adapter_gate:
        from .adapter.gate import assert_adapter_ready_for_install

        adapter_gate = assert_adapter_ready_for_install(
            warsmith_catalog_id=warsmith_catalog_id,
            module_id=module_id,
        )

    inventory = get_set_inventory()
    existing = inventory.get_module(module_id)
    if existing and not overwrite:
        raise FileExistsError(f"Module slot already exists: {module_id}")

    prior_status = str(existing.get("status", "enabled")) if existing else "enabled"
    installed_at = str(existing.get("installedAt", "")) if existing else ""
    now_iso = datetime.now(timezone.utc).isoformat()

    runtime = runtime_root()
    module_root = runtime_modules_root() / module_id
    needs_snapshot = bool(existing or module_root.exists())

    layers = hydrated.get("layers") or {}
    fe_files = list((layers.get("frontend") or {}).get("files") or [])
    be_files = list((layers.get("backend") or {}).get("files") or [])

    integration = hydrated.get("integrationPack") or {}
    contract = gate.get("contract") or {}
    matched = list(contract.get("overlap") or [])
    if not matched:
        matched_routes = integration.get("matchedRoutes") or []
        if isinstance(matched_routes, dict):
            matched = list(matched_routes.get("matched") or [])
        else:
            matched = list(matched_routes)

    snapshot_meta = None
    fe_written = 0
    be_written = 0
    integration_result: Dict[str, Any] = {}
    router_build: Dict[str, Any] = {}
    req_merge = None
    detection: Dict[str, Any] = {}
    fe_build_result: Dict[str, Any] = {"buildStatus": "pending"}
    manifest: Dict[str, Any] = {}
    with install_snapshot_guard(
        module_id,
        reason="pre-warsmith-install",
        enabled=needs_snapshot,
    ) as snapshot:
        snapshot_meta = snapshot
        fe_root = module_root / "frontend"
        be_root = module_root / "backend"
        if module_root.exists() and overwrite:
            shutil.rmtree(module_root)

        fe_written = _write_files(fe_root, fe_files)
        be_written = _write_files(be_root, be_files)

        integration_result = apply_integration_snippets(
            module_root,
            integration,
            module_id=module_id,
        )
        tsconfig_merges = apply_local_tsconfig_merges(fe_root)
        if tsconfig_merges:
            integration_result["tsconfigMerges"] = tsconfig_merges

        router_build = build_set_module_router(
            module_id,
            resolved_name,
            be_files,
            [str(item) for item in matched],
        )
        router_path = be_root / "router.py"
        router_path.write_text(router_build["content"], encoding="utf-8")

        stub_path = fe_root / "SetModuleStub.tsx"
        stub_path.write_text(
            _generate_frontend_stub(module_id, resolved_name, fe_written),
            encoding="utf-8",
        )

        req_merge = None
        if build_backend:
            req_merge = merge_module_requirements(
                module_id,
                be_files,
                module_root=module_root,
            )

        detection = detect_module_runtime(hydrated, router_build=router_build)
        entry_override = integration_result.get("entryPointOverride")
        if entry_override and detection.get("frontend"):
            detection["frontend"]["entryPoint"] = entry_override

        if build_frontend:
            entry_point = (detection.get("frontend") or {}).get("entryPoint")
            api_base = f"/api/modules/{module_id}/proxy"
            fe_build_result = build_module_frontend(
                module_id,
                fe_root,
                entry_point=entry_point,
                api_base=api_base,
            )

        manifest = build_runtime_manifest(
            module_id,
            display_name=resolved_name,
            source="warsmith",
            detection=detection,
            router_build=router_build,
            fe_build=fe_build_result,
            source_catalog_id=warsmith_catalog_id,
        )
        write_module_manifest(module_root, manifest)
        volume_access = ensure_module_volume_access(
            module_root,
            modules_root=runtime_modules_root(),
        )

    runtime_summary = runtime_summary_for_registry(manifest)
    contract_v2 = detection.get("contract") or {}
    slot_entry = {
        "moduleId": module_id,
        "displayName": resolved_name,
        "source": "warsmith",
        "sourceCatalogId": warsmith_catalog_id,
        "status": prior_status,
        "installedAt": installed_at or now_iso,
        "lastSyncedAt": now_iso,
        "warsmithUpdatedAt": entry.get("updatedAt"),
        "fe": {
            "mount": f"/app/{module_id}",
            "root": f"modules/{module_id}/frontend",
        },
        "be": {
            "prefix": f"/api/modules/{module_id}",
            "root": f"modules/{module_id}/backend",
        },
        "contract": {
            "matchedRouteCount": len(matched),
            "overlapCount": contract_v2.get("overlapCount", gate.get("overlapCount", len(matched))),
            "grade": detection.get("runtimeGrade", gate.get("grade")),
            "compatVersion": "2.0.0",
            "warnings": gate.get("warnings") or [],
        },
        "runtime": runtime_summary,
        "stats": {
            "frontendFiles": fe_written,
            "backendFiles": be_written,
            "mountMode": router_build.get("mountMode"),
            "mountedRouterCount": router_build.get("mountedRouterCount", 0),
            "feBuildStatus": fe_build_result.get("buildStatus", "pending"),
        },
    }
    inventory.upsert_module(slot_entry)
    sync_runtime_registry(inventory.list_modules())
    backend_reload = restart_set_backend() if build_backend else {"success": True, "skipped": True}

    return {
        "success": True,
        "moduleId": module_id,
        "moduleName": resolved_name,
        "warsmithCatalogId": warsmith_catalog_id,
        "runtimePath": str(runtime),
        "slot": slot_entry,
        "manifest": manifest,
        "detection": detection,
        "integration": integration_result,
        "requirementsMerge": req_merge,
        "feBuild": fe_build_result,
        "filesWritten": fe_written + be_written + 2,
        "gate": gate,
        "adapterGate": adapter_gate,
        "backendReload": backend_reload,
        "snapshot": snapshot_meta,
    }
