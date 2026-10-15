"""
SET path helpers
"""

import os
from pathlib import Path


def project_root() -> Path:
    return Path(__file__).parent.parent.parent


def template_root() -> Path:
    return project_root() / "templates" / "set-base"


def set_module_templates_root() -> Path:
    configured = os.getenv("EWGEN_SET_MODULE_TEMPLATES_PATH", "").strip()
    if configured:
        return Path(configured)
    return project_root() / "templates" / "set-modules"


def runtime_root() -> Path:
    configured = os.getenv("EWGEN_SET_RUNTIME_PATH", "").strip()
    if configured:
        return Path(configured)
    return project_root() / "set-runtime"


def inventory_path() -> Path:
    configured = os.getenv("EWGEN_SET_INVENTORY_PATH", "").strip()
    if configured:
        return Path(configured)
    return project_root() / "data" / "set-inventory.json"


def runtime_modules_root() -> Path:
    return runtime_root() / "modules"


def runtime_registry_path() -> Path:
    return runtime_modules_root() / "registry.json"


def snapshots_root() -> Path:
    configured = os.getenv("EWGEN_SET_SNAPSHOTS_PATH", "").strip()
    if configured:
        return Path(configured)
    return project_root() / "data" / "set-snapshots"


def adapter_staging_root() -> Path:
    configured = os.getenv("EWGEN_SET_ADAPTER_STAGING_PATH", "").strip()
    if configured:
        return Path(configured)
    return project_root() / "data" / "set-adapter-staging"
