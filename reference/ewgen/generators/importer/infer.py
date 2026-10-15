"""
Fortune Seaker - Import Inference
Infers module metadata, dependencies, and integration hints from analyzed sources
"""

import json
import re
from collections import Counter
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional

from .dependency_normalizer import normalize_dependencies
from .naming import normalize_module_name


MODULE_TYPE_PRIORITY = ("crud", "dashboard", "kanban", "chat", "report", "imported")


def _suggest_module_name(
    candidates: List[Dict[str, Any]],
    package_json: Optional[str] = None,
) -> str:
    if package_json:
        try:
            data = json.loads(package_json)
            name = str(data.get("name", "")).strip()
            if name:
                cleaned = re.sub(r"^@[^/]+/", "", name)
                parts = re.split(r"[-_/]", cleaned)
                if parts:
                    return normalize_module_name(
                        "".join(part.capitalize() for part in parts if part),
                        package_json,
                    )
        except json.JSONDecodeError:
            pass

    path_segments: List[str] = []
    for candidate in candidates:
        path = candidate.get("path", "")
        parts = PurePosixPath(path).parts
        if parts:
            path_segments.append(parts[0])

    if path_segments:
        most_common = Counter(path_segments).most_common(1)[0][0]
        return normalize_module_name(
            most_common.replace("-", " ").title().replace(" ", ""),
            package_json,
        )

    first_export = ""
    for candidate in candidates:
        exports = candidate.get("exports") or []
        if exports:
            first_export = str(exports[0])
            break

    if first_export and first_export != "default":
        return normalize_module_name(first_export, package_json)

    return normalize_module_name("ImportedModule", package_json)


def _suggest_module_type(candidates: List[Dict[str, Any]]) -> str:
    counts: Counter[str] = Counter()
    for candidate in candidates:
        suggested = str(candidate.get("suggestedModuleType", "imported"))
        if suggested == "asset":
            continue
        counts[suggested] += 1

    if not counts:
        return "imported"

    ranked = sorted(
        counts.items(),
        key=lambda item: (
            -item[1],
            MODULE_TYPE_PRIORITY.index(item[0])
            if item[0] in MODULE_TYPE_PRIORITY
            else len(MODULE_TYPE_PRIORITY),
        ),
    )
    return ranked[0][0]


def _parse_dependencies(package_json: Optional[str]) -> Dict[str, Any]:
    if not package_json:
        return {
            "dependencies": [],
            "devDependencies": [],
            "peerDependencies": [],
        }

    try:
        data = json.loads(package_json)
    except json.JSONDecodeError:
        return {
            "dependencies": [],
            "devDependencies": [],
            "peerDependencies": [],
            "error": "Invalid package.json",
        }

    def names(section: str) -> List[str]:
        value = data.get(section, {})
        if not isinstance(value, dict):
            return []
        return sorted(value.keys())

    return {
        "dependencies": names("dependencies"),
        "devDependencies": names("devDependencies"),
        "peerDependencies": names("peerDependencies"),
    }


def _build_integration_hints(
    module_type: str,
    dependencies: Dict[str, Any],
    candidates: List[Dict[str, Any]],
) -> List[str]:
    hints = [
        "Review rewritten import paths under src/imported/",
        "Add manifests/imported manifest and register in moduleRegistry",
        "Run contract tests before enabling in production registry",
    ]

    deps = dependencies.get("dependencies", [])
    if "react" in deps or "react-dom" in deps:
        hints.append("Verify React version compatibility with EWGen (React 19)")
    if module_type == "dashboard" and any(
        dep in deps for dep in ("recharts", "chart.js", "react-chartjs-2")
    ):
        hints.append("Align chart library with EWGen dashboard generators")
    if module_type == "chat" and any(
        dep in deps for dep in ("socket.io-client", "ws")
    ):
        hints.append("Configure WebSocket transport in chat module config")
    if len(candidates) > 10:
        hints.append("Large import bundle — consider splitting into smaller modules")

    return hints


def infer_import_bundle(
    candidates: List[Dict[str, Any]],
    package_json: Optional[str] = None,
    source: str = "zip",
    source_ref: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Infer import metadata and manifest draft from analyzed candidates.
    """
    module_name = normalize_module_name(
        _suggest_module_name(candidates, package_json),
        package_json,
    )
    module_type = _suggest_module_type(candidates)
    dependencies = _parse_dependencies(package_json)
    integration_hints = _build_integration_hints(
        module_type,
        dependencies,
        candidates,
    )

    _, dep_report = normalize_dependencies(package_json, module_name)
    for adjustment in dep_report.get("adjusted", [])[:3]:
        integration_hints.append(f"EWGen will align dependency: {adjustment}")
    for warning in dep_report.get("warnings", [])[:2]:
        integration_hints.append(warning)

    exports = sorted({
        export_name
        for candidate in candidates
        for export_name in (candidate.get("exports") or [])
        if export_name
    })

    import_manifest = {
        "moduleType": module_type,
        "displayName": module_name,
        "compatVersion": "1.0.0",
        "source": source,
        "sourceRef": source_ref,
        "configSchema": "schemas/generator-contract.json#/GeneratorRequest",
        "generatorEntrypoint": "generators/importer/prepare.py",
        "previewEntrypoint": "src/components/Generator/LivePreview.tsx",
        "exportRules": {
            "includePackageJson": True,
            "includeReadme": True,
        },
        "imports": {
            "candidateCount": len(candidates),
            "exports": exports[:20],
            "dependencies": dependencies.get("dependencies", []),
        },
        "integrationHints": integration_hints,
    }

    return {
        "suggestedModuleName": module_name,
        "suggestedModuleType": module_type,
        "dependencies": dependencies,
        "integrationHints": integration_hints,
        "importManifest": import_manifest,
        "dependencyNormalization": dep_report,
    }
