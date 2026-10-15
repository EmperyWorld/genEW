# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Scavenger integration snippet generators — bundle-only sys.path, boundary-gated (EG-01).
# Invariants:
# - Never emit _SCAVENGER_MONOREPO_ROOT or product-tree sys.path inserts.
# Related:
# - generators/scavenger/boundary_gate.py
# - generators/scavenger/self_contained_bundle.py
# ---

"""
Scavenger - Integration snippet generators for Python bundles
"""

import ast
import json
import re
from typing import Any, Dict, List, Optional

from generators.importer.naming import to_kebab

from .boundary_gate import assert_integration_boundary, assert_snippet_boundary
from .deps import merge_packages_from_dependency_files
from .requirements_compare import analyze_requirements_against_backend
from .self_contained_bundle import bundle_package_prefix

_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_BUNDLE_ROOT_MARKER = "generators/imported_python/"


def is_importable_module_path(module_path: str) -> bool:
    parts = module_path.split(".")
    return bool(parts) and all(_IDENT_RE.match(part) for part in parts)


def validate_router_mount_readiness(
    routers: List[Dict[str, str]],
) -> Dict[str, Any]:
    """
    Check whether detected FastAPI routers can be mounted via Python imports.
    """
    non_importable: List[Dict[str, str]] = []
    for router in routers:
        module_path = str(router.get("modulePath", ""))
        if not is_importable_module_path(module_path):
            non_importable.append({
                "path": router.get("path", ""),
                "varName": router.get("varName", ""),
                "modulePath": module_path,
            })
    importable_count = len(routers) - len(non_importable)
    return {
        "ready": len(routers) == 0 or len(non_importable) == 0,
        "routerCount": len(routers),
        "importableCount": importable_count,
        "nonImportableCount": len(non_importable),
        "nonImportableRouters": non_importable[:20],
    }


def detect_fastapi_routers(files: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Detect FastAPI APIRouter assignments in Python source files.
    """
    routers: List[Dict[str, str]] = []

    for file in files:
        path = str(file.get("path", "")).replace("\\", "/")
        content = str(file.get("content", ""))
        if not path.endswith(".py") or not content.strip():
            continue

        try:
            tree = ast.parse(content)
        except SyntaxError:
            continue

        for node in tree.body:
            if not isinstance(node, ast.Assign):
                continue
            if len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name):
                continue
            if not isinstance(node.value, ast.Call):
                continue

            func = node.value.func
            is_api_router = False
            if isinstance(func, ast.Name) and func.id == "APIRouter":
                is_api_router = True
            elif isinstance(func, ast.Attribute) and func.attr == "APIRouter":
                is_api_router = True

            if not is_api_router:
                continue

            module_path = _path_to_import_module(path)
            if not module_path:
                continue

            routers.append({
                "path": path,
                "varName": node.targets[0].id,
                "modulePath": module_path,
            })

    return routers


def merge_requirement_packages(
    dependency_files: Optional[List[Dict[str, str]]],
) -> List[str]:
    """
    Merge unique package names from bundled dependency manifests.
    """
    return merge_packages_from_dependency_files(dependency_files)


def detect_monorepo_root_dir(source_files: List[Dict[str, str]]) -> Optional[str]:
    """
    Detect monorepo directory (e.g. EliteEW2) when sources live under <root>/api/.
    """
    for file in source_files:
        path = str(file.get("path", "")).replace("\\", "/")
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 2 and parts[1] == "api":
            return parts[0]
    return None


def detect_python_import_root(
    source_files: List[Dict[str, str]],
    routers: Optional[List[Dict[str, str]]] = None,
) -> Optional[str]:
    """
    Directory (relative to backend root) to add to sys.path for router imports.

    Examples:
      generators/imported_python/elite-api122/api/routers/x.py + api.routers.x
        -> generators/imported_python/elite-api122
      generators/.../EliteEW2/api/routers/x.py + EliteEW2.api.routers.x
        -> generators/imported_python/api-services
      api/routers/x.py + api.routers.x -> "" (backend root)
    """
    router_list = routers or detect_fastapi_routers(source_files)
    for router in router_list:
        module_path = str(router.get("modulePath", "")).strip()
        file_path = str(router.get("path", "")).replace("\\", "/").lstrip("/")
        if not module_path or not file_path:
            continue
        top_package = module_path.split(".", 1)[0]
        if not top_package:
            continue
        if file_path.startswith(f"{top_package}/"):
            return ""
        marker = f"/{top_package}/"
        marker_index = file_path.find(marker)
        if marker_index >= 0:
            return file_path[:marker_index]
    return None


def build_bundle_bootstrap_snippet(
    module_name: str,
    package_prefix: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Bundle-only sys.path bootstrap for self-contained ewgen_bundle.* imports.
    """
    kebab = to_kebab(module_name)
    prefix = package_prefix or bundle_package_prefix(module_name)
    lines = [
        "# Auto-generated by Scavenger — bundle-only sys.path (no product monorepo roots)",
        "import sys",
        "from pathlib import Path",
        "",
        f"_SCAVENGER_BUNDLE_ROOT = Path(__file__).parent / \"generators\" / \"imported_python\" / \"{kebab}\"",
        "if str(_SCAVENGER_BUNDLE_ROOT) not in sys.path:",
        "    sys.path.insert(0, str(_SCAVENGER_BUNDLE_ROOT))",
        "",
        f"# Example: from {prefix}.api.services import <module>",
        "",
    ]
    content = "\n".join(lines)
    assert_snippet_boundary(content)
    return {
        "path": f"snippets/imported-python-{kebab}.syspath.py.snippet",
        "content": content,
        "language": "python",
        "description": "Bundle-root sys.path for ewgen_bundle.* imports",
        "packagePrefix": prefix,
    }


def build_router_mount_snippet(
    module_name: str,
    bundle_root: str,
    routers: List[Dict[str, str]],
    suggested_router_prefix: Optional[str] = None,
    monorepo_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build api_server.py router mount snippet for manual integration.
    """
    del bundle_root, monorepo_dir  # legacy params retained for call-site compatibility
    kebab = to_kebab(module_name)
    lines = [
        "# Auto-generated by Scavenger — review before enabling in api_server.py",
        "import sys",
        "from pathlib import Path",
        "",
        f"_SCAVENGER_BUNDLE_ROOT = Path(__file__).parent / \"generators\" / \"imported_python\" / \"{kebab}\"",
        "if str(_SCAVENGER_BUNDLE_ROOT) not in sys.path:",
        "    sys.path.insert(0, str(_SCAVENGER_BUNDLE_ROOT))",
        "",
    ]

    mount_lines: List[str] = []
    router_count = len(routers)
    for index, router in enumerate(routers):
        alias = f"scavenger_{router['varName']}"
        prefix = _resolve_router_prefix(
            router["path"],
            router["varName"],
            suggested_router_prefix,
            index,
            router_count,
        )
        lines.append(
            f"from {router['modulePath']} import {router['varName']} as {alias}"
        )
        mount_lines.append(
            f"app.include_router({alias}, prefix=\"{prefix}\", tags=[\"scavenger-{kebab}\"])"
        )

    if mount_lines:
        lines.append("")
        lines.extend(mount_lines)

    content = "\n".join(lines) + "\n"
    assert_snippet_boundary(content)
    return {
        "path": f"snippets/imported-python-{kebab}.api-server.py.snippet",
        "content": content,
        "language": "python",
        "description": "Suggested FastAPI router mounts for api_server.py",
        "routerCount": len(routers),
        "suggestedRouterPrefix": suggested_router_prefix,
    }


def build_requirements_merge_snippet(
    module_name: str,
    packages: List[str],
    requirements_analysis: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build merged requirements snippet from bundled dependency manifests.
    """
    kebab = to_kebab(module_name)
    body = "\n".join(packages) + ("\n" if packages else "")
    manifest: Dict[str, Any] = {
        "moduleName": module_name,
        "packageCount": len(packages),
        "packages": packages,
        "instruction": "Review pins against EWGen backend requirements before installing",
    }
    if requirements_analysis:
        manifest["requirementsAnalysis"] = {
            "passed": requirements_analysis.get("passed", True),
            "conflictCount": len(requirements_analysis.get("conflicts", [])),
            "newPackageCount": len(requirements_analysis.get("newPackages", [])),
            "conflicts": requirements_analysis.get("conflicts", []),
            "newPackages": requirements_analysis.get("newPackages", []),
        }

    return {
        "path": f"snippets/imported-python-{kebab}.requirements.merge.txt",
        "content": body,
        "language": "text",
        "description": "Merged requirements from bundled dependency manifests",
        "manifest": manifest,
    }


def build_integration_snippets(
    module_name: str,
    bundle_root: str,
    source_files: List[Dict[str, str]],
    dependency_files: Optional[List[Dict[str, str]]] = None,
    suggested_router_prefix: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build all integration snippets for a prepared Python bundle.
    """
    assert_integration_boundary(source_files)
    routers = detect_fastapi_routers(source_files)
    packages = merge_requirement_packages(dependency_files)
    requirements_analysis = analyze_requirements_against_backend(dependency_files)
    package_prefix = bundle_package_prefix(module_name)
    artifacts: List[Dict[str, Any]] = []

    has_python_sources = any(
        str(file.get("path", "")).endswith(".py") for file in source_files
    )
    if has_python_sources and not routers:
        artifacts.append(build_bundle_bootstrap_snippet(module_name, package_prefix))
    if routers:
        artifacts.append(build_router_mount_snippet(
            module_name,
            bundle_root,
            routers,
            suggested_router_prefix=suggested_router_prefix,
        ))
    if packages:
        artifacts.append(build_requirements_merge_snippet(
            module_name,
            packages,
            requirements_analysis=requirements_analysis,
        ))
    elif dependency_files:
        artifacts.append(build_requirements_merge_snippet(
            module_name,
            [],
            requirements_analysis=requirements_analysis,
        ))

    return {
        "routerCount": len(routers),
        "routers": routers,
        "requirementsPackages": packages,
        "requirementsAnalysis": requirements_analysis,
        "suggestedRouterPrefix": suggested_router_prefix,
        "artifacts": artifacts,
    }


def _strip_bundle_root_prefix(path: str) -> str:
    normalized = path.replace("\\", "/")
    marker_index = normalized.find(_BUNDLE_ROOT_MARKER)
    if marker_index < 0:
        return normalized
    rest = normalized[marker_index + len(_BUNDLE_ROOT_MARKER):]
    slash = rest.find("/")
    if slash < 0:
        return normalized
    return rest[slash + 1:]


def _path_to_import_module(path: str) -> str:
    normalized = _strip_bundle_root_prefix(path)
    if normalized.endswith(".py"):
        normalized = normalized[:-3]
    if normalized.endswith("/__init__"):
        normalized = normalized[:-9]
    return normalized.replace("/", ".")


def _router_slug(path: str, var_name: str) -> str:
    parts = [part for part in path.replace("\\", "/").split("/") if part]
    if "routers" in parts:
        index = parts.index("routers")
        tail = parts[index + 1:]
        if tail:
            return tail[-1].replace(".py", "").replace("_", "-")
    return var_name.replace("_", "-")


def _suggest_router_prefix(path: str, var_name: str) -> str:
    return f"/api/imported/{_router_slug(path, var_name)}"


def _resolve_router_prefix(
    path: str,
    var_name: str,
    base_prefix: Optional[str],
    _router_index: int,
    router_count: int,
) -> str:
    if not base_prefix:
        return _suggest_router_prefix(path, var_name)
    if router_count == 1:
        return base_prefix
    slug = _router_slug(path, var_name)
    return f"{base_prefix.rstrip('/')}/{slug}"
