"""
Bootstrap SET runtime from templates/set-base
"""

import shutil
from pathlib import Path
from typing import Any, Dict

from .inventory import get_set_inventory
from .paths import runtime_root, template_root
from .registry_sync import sync_runtime_registry
from .volume_permissions import ensure_runtime_volume_access


def _copy_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def is_runtime_bootstrapped() -> bool:
    root = runtime_root()
    return (
        root.exists()
        and (root / "compose.yaml").exists()
        and (root / "backend" / "main.py").exists()
        and (root / "frontend" / "package.json").exists()
    )


def materialize_set_runtime(*, overwrite: bool = False) -> None:
    """Copy templates/set-base into set-runtime/ without installing modules."""
    template = template_root()
    runtime = runtime_root()

    if not template.exists():
        raise FileNotFoundError(f"SET template not found: {template}")

    if is_runtime_bootstrapped() and not overwrite:
        return

    if runtime.exists() and overwrite:
        shutil.rmtree(runtime)

    runtime.parent.mkdir(parents=True, exist_ok=True)
    _copy_tree(template, runtime)
    ensure_runtime_volume_access(runtime)

    env_example = runtime / ".env.example"
    env_file = runtime / ".env"
    if env_example.exists() and not env_file.exists():
        shutil.copy(env_example, env_file)


def bootstrap_set_runtime(*, overwrite: bool = False) -> Dict[str, Any]:
    """Materialize set-runtime/ from templates/set-base (no demo modules)."""
    template = template_root()
    runtime = runtime_root()

    if not template.exists():
        raise FileNotFoundError(f"SET template not found: {template}")

    if is_runtime_bootstrapped() and not overwrite:
        inventory = get_set_inventory()
        sync_runtime_registry(inventory.list_modules())
        return {
            "success": True,
            "bootstrapped": True,
            "alreadyExists": True,
            "runtimePath": str(runtime),
            "inventory": inventory.to_summary(),
            "standardModules": {
                "success": True,
                "installedCount": 0,
                "skippedCount": 0,
                "modules": [],
                "message": "Sample modules disabled — install templates explicitly",
            },
        }

    materialize_set_runtime(overwrite=overwrite)

    inventory = get_set_inventory()
    sync_runtime_registry(inventory.list_modules())

    return {
        "success": True,
        "bootstrapped": True,
        "alreadyExists": False,
        "runtimePath": str(runtime),
        "inventory": inventory.to_summary(),
        "standardModules": {
            "success": True,
            "installedCount": 0,
            "skippedCount": 0,
            "modules": [],
            "message": "Sample modules disabled — install templates explicitly",
        },
    }


def upgrade_set_shell() -> Dict[str, Any]:
    """Refresh SET shell frontend/backend from template without touching modules/."""
    template = template_root()
    runtime = runtime_root()

    if not template.exists():
        raise FileNotFoundError(f"SET template not found: {template}")
    if not is_runtime_bootstrapped():
        raise FileNotFoundError("SET runtime not bootstrapped — run bootstrap first")

    upgraded: list[str] = []
    for subdir in ("frontend", "backend"):
        src = template / subdir
        dst = runtime / subdir
        if not src.is_dir():
            continue
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        upgraded.append(subdir)

    ensure_runtime_volume_access(runtime)

    inventory = get_set_inventory()
    sync_runtime_registry(inventory.list_modules())
    from .runtime import rebuild_set_backend_image, restart_set_backend
    from .runtime_backfill import backfill_all_module_runtimes

    backfill = backfill_all_module_runtimes(source="warsmith", rewrite_router=False)
    if "backend" in upgraded:
        backend_reload = rebuild_set_backend_image()
    else:
        backend_reload = restart_set_backend()

    return {
        "success": True,
        "upgraded": upgraded,
        "runtimePath": str(runtime),
        "inventory": inventory.to_summary(),
        "runtimeBackfill": backfill,
        "backendReload": backend_reload,
    }

