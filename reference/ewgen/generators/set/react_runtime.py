"""
SET runtime — pinned React/tooling versions (aligned with EWGen control plane)
"""

SET_REACT_VERSION = "19.2.0"
SET_REACT_IS_VERSION = "19.2.0"
SET_REACT_ROUTER_VERSION = "^7.9.4"
SET_TYPES_REACT_VERSION = "^19.2.0"
SET_TYPES_REACT_DOM_VERSION = "^19.2.0"
SET_VITE_PLUGIN_REACT_VERSION = "^4.3.4"
SET_VITE_VERSION = "^5.4.11"
SET_TYPESCRIPT_VERSION = "^5.6.3"
SET_TANSTACK_QUERY_VERSION = "^5.90.2"


def default_fe_dependencies() -> dict[str, str]:
    return {
        "react": SET_REACT_VERSION,
        "react-dom": SET_REACT_VERSION,
        "react-router-dom": SET_REACT_ROUTER_VERSION,
        "@tanstack/react-query": SET_TANSTACK_QUERY_VERSION,
    }


def default_fe_dev_dependencies() -> dict[str, str]:
    return {
        "@tailwindcss/postcss": "^4.0.0",
        "@types/react": SET_TYPES_REACT_VERSION,
        "@types/react-dom": SET_TYPES_REACT_DOM_VERSION,
        "@vitejs/plugin-react": SET_VITE_PLUGIN_REACT_VERSION,
        "tailwindcss": "^4.0.0",
        "typescript": SET_TYPESCRIPT_VERSION,
        "vite": SET_VITE_VERSION,
    }


def default_shell_package_json() -> dict[str, object]:
    return {
        "name": "ewgen-set-frontend",
        "private": True,
        "version": "1.0.0",
        "type": "module",
        "scripts": {
            "dev": "vite --host 0.0.0.0 --port 3100",
            "build": "tsc && vite build",
            "preview": "vite preview --host 0.0.0.0 --port 3100",
        },
        "dependencies": {
            "react": SET_REACT_VERSION,
            "react-dom": SET_REACT_VERSION,
            "react-router-dom": SET_REACT_ROUTER_VERSION,
        },
        "devDependencies": default_fe_dev_dependencies(),
    }


def shell_react_version_outdated(package_json_text: str) -> bool:
    """True when materialized shell package.json is not on SET React 19.2."""
    try:
        import json

        data = json.loads(package_json_text)
    except json.JSONDecodeError:
        return True
    deps = data.get("dependencies") or {}
    react = str(deps.get("react", "")).strip()
    if not react:
        return True
    normalized = react.lstrip("^~>=<")
    return not normalized.startswith("19.2")
