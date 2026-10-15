"""
SET Module Slot v2 — runtime manifest schema and helpers
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

RUNTIME_SCHEMA_VERSION = "2.0.0"


def build_api_bridge(module_id: str) -> Dict[str, Any]:
    public_base = f"/api/modules/{module_id}/proxy"
    return {
        "mode": "module-proxy",
        "publicBase": public_base,
        "feEnv": {
            "VITE_API_URL": public_base,
            "VITE_MODULE_API_BASE": public_base,
        },
    }


def build_runtime_manifest(
    module_id: str,
    *,
    display_name: str,
    source: str,
    detection: Dict[str, Any],
    router_build: Dict[str, Any],
    fe_build: Optional[Dict[str, Any]] = None,
    source_catalog_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build runtime section for inventory and set.module.json."""
    fe_detection = detection.get("frontend") or {}
    be_detection = detection.get("backend") or {}
    mount_mode = str(router_build.get("mountMode", "stub"))
    mounted_count = int(router_build.get("mountedRouterCount", 0))

    fe_build = fe_build or {}
    build_status = str(fe_build.get("buildStatus", "pending"))

    runtime: Dict[str, Any] = {
        "schemaVersion": RUNTIME_SCHEMA_VERSION,
        "runtimeGrade": str(detection.get("runtimeGrade", "C")),
        "fe": {
            "mount": f"/app/{module_id}",
            "root": f"modules/{module_id}/frontend",
            "entryPoint": fe_detection.get("entryPoint"),
            "framework": fe_detection.get("framework", "react-vite"),
            "buildStatus": build_status,
            "buildOutput": f"modules/{module_id}/frontend/dist",
            "buildLogPath": f"modules/{module_id}/.set/fe-build.log",
            "staticMount": f"/app/{module_id}",
        },
        "be": {
            "prefix": f"/api/modules/{module_id}",
            "root": f"modules/{module_id}/backend",
            "mountMode": mount_mode,
            "mountedRouterCount": mounted_count,
            "monorepoDir": router_build.get("monorepoDir"),
            "requirementsFile": be_detection.get("requirementsFile"),
            "routerFiles": be_detection.get("routerFiles") or [],
        },
        "apiBridge": build_api_bridge(module_id),
    }

    manifest: Dict[str, Any] = {
        "schemaVersion": RUNTIME_SCHEMA_VERSION,
        "moduleId": module_id,
        "displayName": display_name,
        "source": source,
        "runtime": runtime,
        "detection": detection,
    }
    if source_catalog_id:
        manifest["sourceCatalogId"] = source_catalog_id
    if fe_build.get("buildError"):
        runtime["fe"]["buildError"] = str(fe_build["buildError"])
    if router_build.get("mountedRoutes"):
        runtime["be"]["mountedRoutes"] = router_build["mountedRoutes"]
    return manifest


def write_module_manifest(module_root: Any, manifest: Dict[str, Any]) -> str:
    """Write set.module.json to module root. Returns relative path."""
    import json
    from pathlib import Path

    path = Path(module_root) / "set.module.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return "set.module.json"


def read_module_manifest(module_id: str) -> Optional[Dict[str, Any]]:
    """Load set.module.json for an installed module."""
    import json
    from pathlib import Path

    from .paths import runtime_modules_root

    path = runtime_modules_root() / module_id / "set.module.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        return data
    return None


def runtime_summary_for_registry(manifest: Dict[str, Any]) -> Dict[str, Any]:
    """Compact runtime fields for modules/registry.json."""
    runtime = manifest.get("runtime") or {}
    fe = runtime.get("fe") or {}
    be = runtime.get("be") or {}
    return {
        "schemaVersion": runtime.get("schemaVersion", RUNTIME_SCHEMA_VERSION),
        "runtimeGrade": manifest.get("detection", {}).get("runtimeGrade")
        or runtime.get("runtimeGrade", "C"),
        "fe": {
            "mount": fe.get("mount"),
            "buildStatus": fe.get("buildStatus", "pending"),
            "entryPoint": fe.get("entryPoint"),
            "staticMount": fe.get("staticMount"),
            "buildError": fe.get("buildError"),
        },
        "be": {
            "prefix": be.get("prefix"),
            "mountMode": be.get("mountMode", "stub"),
            "mountedRouterCount": be.get("mountedRouterCount", 0),
        },
        "apiBridge": runtime.get("apiBridge"),
    }
