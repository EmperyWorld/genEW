"""
Fortune Seaker - Supply Chain Analysis
Dependency allowlist/blocklist and version pinning checks
"""

import json
import re
from typing import Any, Dict, List, Optional, Set


BLOCKED_PACKAGES: Set[str] = {
    "colors",
    "faker",
    "node-ipc",
    "peacenotwar",
    "ua-parser-js",
}

KNOWN_PACKAGES: Set[str] = {
    "react",
    "react-dom",
    "react-router-dom",
    "react-is",
    "zustand",
    "immer",
    "lucide-react",
    "framer-motion",
    "recharts",
    "chart.js",
    "react-chartjs-2",
    "socket.io-client",
    "axios",
    "date-fns",
    "clsx",
    "tailwind-merge",
    "tailwindcss",
    "typescript",
    "vite",
    "vitest",
    "jspdf",
    "xlsx",
    "keycloak-js",
    "@biomejs/biome",
    "@dnd-kit/core",
    "@dnd-kit/sortable",
    "@heroicons/react",
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-popover",
    "@radix-ui/react-select",
    "@radix-ui/react-tabs",
    "@radix-ui/react-tooltip",
    "@tailwindcss/vite",
    "@tanstack/react-query",
    "@vitejs/plugin-react",
    "jszip",
}

UNPINNED_VERSION_RE = re.compile(r"^(\^|~|>=|<=|>|\*|\blatest\b)", re.IGNORECASE)


def _collect_dependency_names(data: Dict[str, Any]) -> Dict[str, str]:
    names: Dict[str, str] = {}
    for section in ("dependencies", "devDependencies", "peerDependencies"):
        section_value = data.get(section, {})
        if not isinstance(section_value, dict):
            continue
        for name, version in section_value.items():
            names[str(name)] = str(version)
    return names


def analyze_supply_chain(package_json: Optional[str]) -> Dict[str, Any]:
    """
    Analyze package.json dependencies for supply-chain risks.
    """
    if not package_json:
        return {
            "dependencyCount": 0,
            "blocked": [],
            "unknown": [],
            "warnings": [],
            "passed": True,
        }

    try:
        data = json.loads(package_json)
    except json.JSONDecodeError:
        return {
            "dependencyCount": 0,
            "blocked": [],
            "unknown": [],
            "warnings": ["Invalid package.json"],
            "passed": False,
        }

    deps = _collect_dependency_names(data)
    blocked: List[str] = []
    unknown: List[str] = []
    warnings: List[str] = []

    for name, version in deps.items():
        base_name = name.split("/")[0] if name.startswith("@") else name
        scoped_base = name if name.startswith("@") else base_name

        if name in BLOCKED_PACKAGES or base_name in BLOCKED_PACKAGES:
            blocked.append(name)
            continue

        if (
            scoped_base not in KNOWN_PACKAGES
            and name not in KNOWN_PACKAGES
            and not name.startswith("@types/")
        ):
            unknown.append(name)

        if UNPINNED_VERSION_RE.search(version) or version.strip() in ("*", "latest"):
            warnings.append(f"{name}@{version}: unpinned or floating version")

    return {
        "dependencyCount": len(deps),
        "blocked": sorted(blocked),
        "unknown": sorted(unknown)[:30],
        "warnings": warnings[:20],
        "passed": len(blocked) == 0,
    }
