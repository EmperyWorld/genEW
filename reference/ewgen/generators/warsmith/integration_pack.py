"""
Warsmith - Integration pack for composed fullstack modules
"""

import json
from typing import Any, Dict, List

from generators.importer.naming import to_kebab

from .contract_tests import build_contract_artifacts


def _aggregate_snippet_files(
    frontend_files: List[Dict[str, str]],
    backend_files: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    snippets: List[Dict[str, str]] = []

    def collect(files: List[Dict[str, str]], layer: str) -> None:
        for file in files:
            path = str(file.get("path", "")).replace("\\", "/")
            if "/snippets/" in path or path.startswith("snippets/"):
                snippets.append({
                    "path": path,
                    "content": str(file.get("content", "")),
                    "sourceLayer": layer,
                })

    collect(frontend_files, "frontend")
    collect(backend_files, "backend")
    return snippets


def build_integration_pack(
    module_name: str,
    frontend_entry: Dict[str, Any],
    backend_entry: Dict[str, Any],
    pairing_strategy: str = "manual",
    pairing_confidence: float = 1.0,
) -> Dict[str, Any]:
    """
    Build env, docker-compose, README and matched-routes artifacts.
    """
    kebab = to_kebab(module_name)
    fe_name = str(frontend_entry.get("moduleName", "Frontend"))
    be_name = str(backend_entry.get("moduleName", "Backend"))
    fe_kebab = to_kebab(fe_name)
    be_kebab = to_kebab(be_name)

    env_example = "\n".join([
        "# Warsmith fullstack integration",
        f"# Module: {module_name}",
        "VITE_API_URL=http://localhost:8000",
        "EWGEN_API_KEY=",
        "BACKEND_PORT=8000",
        "FRONTEND_PORT=9190",
        "",
    ])

    docker_compose = "\n".join([
        "services:",
        "  backend:",
        "    build:",
        "      context: ./backend",
        "    ports:",
        '      - "8000:8000"',
        "    environment:",
        "      - EWGEN_API_KEY=${EWGEN_API_KEY:-}",
        "  frontend:",
        "    build:",
        "      context: ./frontend",
        "    ports:",
        '      - "9190:9190"',
        "    environment:",
        "      - VITE_API_URL=http://localhost:8000",
        "    depends_on:",
        "      - backend",
        "",
    ])

    readme_section = "\n".join([
        f"# {module_name} — Warsmith integration",
        "",
        "## Layers",
        f"- Frontend: `{fe_name}` (Fortune Seaker)",
        f"- Backend: `{be_name}` (Scavenger)",
        "",
        "## Steps",
        "1. Materialize backend bundle to `generators/imported_python/`.",
        "2. Apply router mount / syspath snippets from backend bundle.",
        "3. Register frontend components via registry/tsconfig snippets.",
        "4. Copy `.env.example` values to project `.env`.",
        "5. Run `docker compose -f docker-compose.yml up` for local fullstack.",
        "",
        "## Snippets",
        "Reuse layer-specific snippets from importer and scavenger bundles —",
        "do not duplicate router/registry blocks; apply in order backend → frontend.",
        "",
    ])

    frontend_files = frontend_entry.get("files") or []
    backend_files = backend_entry.get("files") or []
    contract_pack = build_contract_artifacts(module_name, frontend_files, backend_files)
    route_contract = contract_pack["contract"]
    overlap = route_contract.get("overlap") or []

    matched_routes = {
        "pairingStrategy": pairing_strategy,
        "confidence": pairing_confidence,
        "matches": [
            {"path": route, "method": "GET", "status": "overlap"}
            for route in overlap
        ],
        "frontendOnly": route_contract.get("frontendOnly") or [],
        "backendOnly": route_contract.get("backendOnly") or [],
        "overlapCount": route_contract.get("overlapCount", 0),
    }

    aggregated_snippets = _aggregate_snippet_files(frontend_files, backend_files)

    artifact_files = [
        {
            "path": f"snippets/warsmith-{kebab}.env.example",
            "content": env_example,
            "language": "plaintext",
        },
        {
            "path": f"snippets/warsmith-{kebab}.docker-compose.yml",
            "content": docker_compose,
            "language": "yaml",
        },
        {
            "path": f"snippets/warsmith-{kebab}.integration.md",
            "content": readme_section,
            "language": "markdown",
        },
        {
            "path": f"manifests/warsmith-{kebab}.matched-routes.json",
            "content": json.dumps(matched_routes, indent=2, ensure_ascii=False),
            "language": "json",
        },
        *contract_pack["artifacts"],
    ]

    contract_artifacts = [
        {
            "path": artifact["path"],
            "content": artifact["content"],
            "language": artifact.get("language", "plaintext"),
            "kind": (
                "msw"
                if artifact["path"].endswith(".msw.handlers.ts")
                else "pytest"
                if artifact["path"].endswith("_contract_smoke.py")
                else "contract"
            ),
        }
        for artifact in contract_pack["artifacts"]
    ]

    return {
        "envExample": env_example,
        "dockerCompose": docker_compose,
        "readmeSection": readme_section,
        "matchedRoutes": matched_routes,
        "routeContract": route_contract,
        "contractArtifacts": contract_artifacts,
        "aggregatedSnippets": aggregated_snippets,
        "artifacts": artifact_files,
        "frontendKebab": fe_kebab,
        "backendKebab": be_kebab,
    }
