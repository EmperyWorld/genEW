"""
SET Adapter — transform Warsmith bundle to SET-ready staging
"""

from __future__ import annotations

import textwrap
from typing import Any, Dict, List, Optional

from generators.importer.naming import to_kebab
from generators.module.docs import generate_module_docs
from generators.module.normalize import (
    extract_integration_files,
    normalize_module_bundle,
    to_staging_layer_files,
)
from generators.warsmith.catalog import get_warsmith_catalog
from generators.warsmith.compose import hydrate_warsmith_entry

from generators.set.integration_apply import apply_integration_snippets, apply_local_tsconfig_merges
from generators.set.router_mount import build_set_module_router

from .analyze import analyze_for_set
from .constants import (
    ADAPTER_STATUS_FAILED,
    ADAPTER_STATUS_PARTIAL,
    ADAPTER_STATUS_READY,
    SET_COMPONENT_MODULE_KIND,
)
from .fe_closure import expand_fe_closure
from .staging import (
    clear_staging,
    normalize_path,
    now_iso,
    staging_module_root,
    write_adapter_manifest,
    write_layer_files,
)


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
              <p>SET Adapter slot · {file_count} files</p>
              <p><code>{{health}}</code></p>
            </div>
          );
        }}
        ''',
    ).strip() + "\n"


def transform_for_set(
    warsmith_catalog_id: str,
    *,
    overwrite: bool = False,
    require_set_ready: bool = True,
    allow_shims: bool = False,
    allow_weak_contract: bool = False,
    expand_closure: bool = True,
    generate_readme: bool = True,
    generate_architecture: bool = True,
    entry_point_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Normalize Warsmith bundle and materialize to data/set-adapter-staging/{moduleId}/.

    Does not install into set-runtime — use SET install after adapterStatus=ready.
    """
    catalog = get_warsmith_catalog()
    entry = catalog.get_entry(warsmith_catalog_id)
    if not entry:
        raise ValueError(f"Warsmith catalog entry not found: {warsmith_catalog_id}")

    hydrated = hydrate_warsmith_entry(entry)
    module_name = str(hydrated.get("moduleName", "ImportedModule"))
    module_id = to_kebab(module_name)

    layers = hydrated.get("layers") or {}
    fe_meta = layers.get("frontend") or {}
    fe_files = list(fe_meta.get("files") or [])
    be_files = list((layers.get("backend") or {}).get("files") or [])

    closure_result: Dict[str, Any] = {"expanded": False, "addedCount": 0}
    resolved_entry_point = entry_point_override.strip() if entry_point_override else None
    source_ref = (
        str(fe_meta.get("sourceRef", "")).strip()
        or str(entry.get("sourceRef", "")).strip()
        or str((entry.get("manifest") or {}).get("sourceRef", "")).strip()
        or None
    )
    if expand_closure and fe_files:
        from generators.set.entry_detect import detect_module_runtime

        runtime_detection = detect_module_runtime(
            {"layers": {"frontend": {"files": fe_files}, "backend": {"files": be_files}}},
        )
        detected_entry = (runtime_detection.get("frontend") or {}).get("entryPoint")
        if not resolved_entry_point:
            resolved_entry_point = detected_entry
        archive_fe_prefix = None
        if source_ref and str(source_ref).strip().endswith(".zip"):
            from pathlib import Path as _Path

            archive_fe_prefix = f"{_Path(str(source_ref).strip()).stem}/frontend/"
        closure_result = expand_fe_closure(
            fe_files,
            module_name,
            source_ref,
            entry_point=resolved_entry_point,
            archive_fe_prefix=archive_fe_prefix,
        )
        if closure_result.get("addedCount", 0) > 0:
            fe_files = list(closure_result.get("files") or fe_files)
            hydrated = {
                **hydrated,
                "layers": {
                    **layers,
                    "frontend": {**fe_meta, "files": fe_files},
                },
            }

    normalize_result = normalize_module_bundle(
        module_name=module_name,
        module_id=module_id,
        entry_point=resolved_entry_point,
        frontend_files=fe_files,
        backend_files=be_files,
    )
    fe_files = to_staging_layer_files(
        list(normalize_result["frontend"]["files"]),
        "frontend",
    )
    be_files = to_staging_layer_files(
        list(normalize_result["backend"]["files"]),
        "backend",
    )
    integration_files = extract_integration_files(
        list(normalize_result["frontend"]["files"]),
        list(normalize_result["backend"]["files"]),
    )
    hydrated = {
        **hydrated,
        "layers": {
            **(hydrated.get("layers") or {}),
            "frontend": {
                **((hydrated.get("layers") or {}).get("frontend") or {}),
                "files": fe_files,
            },
            "backend": {
                **((hydrated.get("layers") or {}).get("backend") or {}),
                "files": be_files,
            },
        },
    }

    analysis = analyze_for_set(
        hydrated=hydrated,
        warsmith_catalog_id=warsmith_catalog_id,
        require_set_ready=require_set_ready,
        allow_weak_contract=allow_weak_contract,
        overwrite=overwrite,
    )
    module_root = staging_module_root(module_id)

    if module_root.exists():
        if not overwrite:
            raise FileExistsError(
                f"Adapter staging already exists: {module_id}. Pass overwrite=true.",
            )
        clear_staging(module_id)

    transformations: List[Dict[str, str]] = []

    fe_root = module_root / "frontend"
    be_root = module_root / "backend"
    fe_written = write_layer_files(fe_root, fe_files)
    be_written = write_layer_files(be_root, be_files)
    integration_written = 0
    for file in integration_files:
        rel = normalize_path(str(file.get("path", "")))
        if not rel:
            continue
        target = module_root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(str(file.get("content", "")), encoding="utf-8")
        integration_written += 1

    transformations.append({
        "kind": "path-normalize",
        "pathsRemapped": str(normalize_result.get("pathMappingCount", 0)),
        "importsRewritten": str(normalize_result.get("importRewriteCount", 0)),
    })
    transformations.append({"kind": "layer-materialize", "target": "frontend", "fileCount": str(fe_written)})
    if closure_result.get("addedCount", 0) > 0:
        transformations.append({
            "kind": "fe-closure-expand",
            "addedCount": str(closure_result.get("addedCount", 0)),
        })
    transformations.append({"kind": "layer-materialize", "target": "backend", "fileCount": str(be_written)})
    if integration_written > 0:
        transformations.append({
            "kind": "integration-artifacts",
            "fileCount": str(integration_written),
        })

    module_docs = generate_module_docs(
        module_name=module_name,
        module_id=module_id,
        frontend_files=list(normalize_result["frontend"]["files"]),
        backend_files=list(normalize_result["backend"]["files"]),
        entry_point=resolved_entry_point or (normalize_result.get("sliceCompleteness") or {}).get("entryPoint"),
        source_ref=source_ref,
        slice_completeness=normalize_result.get("sliceCompleteness"),
        generate_readme=generate_readme,
        generate_architecture=generate_architecture,
    )
    docs_written = 0
    for doc_path, doc_content in module_docs.items():
        target = module_root / doc_path
        target.write_text(doc_content, encoding="utf-8")
        docs_written += 1
        transformations.append({"kind": "doc-generated", "path": doc_path})
    if docs_written > 0:
        transformations.append({"kind": "docs-materialize", "fileCount": str(docs_written)})

    integration = hydrated.get("integrationPack") or {}
    integration_result = apply_integration_snippets(
        module_root,
        integration,
        module_id=module_id,
    )
    for applied in integration_result.get("applied") or []:
        transformations.append({"kind": "integration-snippet", "path": str(applied)})

    tsconfig_merges = apply_local_tsconfig_merges(fe_root)
    for merge_name in tsconfig_merges:
        transformations.append({"kind": "tsconfig-merge", "path": merge_name})

    contract = analysis.get("contract") or {}
    matched = list(contract.get("overlap") or [])
    router_build = build_set_module_router(
        module_id,
        module_name,
        be_files,
        [str(item) for item in matched],
    )
    router_path = be_root / "router.py"
    router_path.write_text(router_build["content"], encoding="utf-8")
    transformations.append({"kind": "router-generated", "path": "backend/router.py"})

    stub_path = fe_root / "SetModuleStub.tsx"
    stub_path.write_text(
        _generate_frontend_stub(module_id, module_name, fe_written),
        encoding="utf-8",
    )
    transformations.append({"kind": "fe-stub", "path": "frontend/SetModuleStub.tsx"})

    shim_result: Dict[str, Any] = {}
    if allow_shims:
        from generators.set.fe_slice_shims import apply_fe_slice_shims

        entry_point = (analysis.get("frontend") or {}).get("entryPoint")
        if entry_point:
            shim_result = apply_fe_slice_shims(fe_root, str(entry_point))
            for injected in shim_result.get("injected") or []:
                transformations.append({"kind": "fe-shim", "path": str(injected)})

    blockers = list(analysis.get("blockers") or [])
    if allow_shims and shim_result.get("missingCount", 0) == 0 and blockers:
        slice_blockers = [item for item in blockers if "FE slice" in item]
        for item in slice_blockers:
            blockers.remove(item)

    if blockers:
        adapter_status = ADAPTER_STATUS_PARTIAL if allow_shims else ADAPTER_STATUS_FAILED
    elif analysis.get("ready"):
        adapter_status = ADAPTER_STATUS_READY
    else:
        adapter_status = ADAPTER_STATUS_PARTIAL if allow_shims else ADAPTER_STATUS_FAILED

    module_kind = SET_COMPONENT_MODULE_KIND if any(
        "set_stubs/" in str(item.get("path", "")) for item in be_files
    ) else "warsmith-import"

    manifest = {
        "schemaVersion": "1.0.0",
        "adapterVersion": analysis.get("adapterVersion"),
        "standardVersion": analysis.get("standardVersion"),
        "warsmithCatalogId": warsmith_catalog_id,
        "moduleId": module_id,
        "moduleName": module_name,
        "moduleKind": module_kind,
        "adapterStatus": adapter_status,
        "ready": adapter_status == ADAPTER_STATUS_READY,
        "transformedAt": now_iso(),
        "grade": analysis.get("grade"),
        "mountMode": router_build.get("mountMode", analysis.get("mountMode")),
        "blockers": blockers,
        "warnings": analysis.get("warnings") or [],
        "transformations": transformations,
        "integration": integration_result,
        "routerBuild": {
            "mountMode": router_build.get("mountMode"),
            "mountedRouterCount": router_build.get("mountedRouterCount", 0),
        },
        "shims": shim_result,
        "closure": closure_result,
        "normalization": {
            "pathMappingCount": normalize_result.get("pathMappingCount", 0),
            "importRewriteCount": normalize_result.get("importRewriteCount", 0),
            "sliceCompleteness": normalize_result.get("sliceCompleteness"),
        },
        "analysis": {
            "checks": analysis.get("checks"),
            "recommendations": analysis.get("recommendations"),
        },
    }
    write_adapter_manifest(module_root, manifest)

    return {
        "success": adapter_status != ADAPTER_STATUS_FAILED,
        "warsmithCatalogId": warsmith_catalog_id,
        "moduleId": module_id,
        "moduleName": module_name,
        "adapterStatus": adapter_status,
        "ready": adapter_status == ADAPTER_STATUS_READY,
        "stagingPath": str(module_root),
        "blockers": blockers,
        "warnings": analysis.get("warnings") or [],
        "transformations": transformations,
        "grade": analysis.get("grade"),
        "mountMode": manifest["mountMode"],
        "feWritten": fe_written,
        "beWritten": be_written,
        "manifestPath": str(module_root / "set.adapter.manifest.json"),
        "closure": closure_result,
        "normalization": {
            "pathMappingCount": normalize_result.get("pathMappingCount", 0),
            "importRewriteCount": normalize_result.get("importRewriteCount", 0),
        },
        "analysis": analysis,
    }
