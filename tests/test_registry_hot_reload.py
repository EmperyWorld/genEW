"""Hot registry discovery for Empery Reflex System."""

from __future__ import annotations

import json
from pathlib import Path

from core.registry import (
    GlobalServiceRegistry,
    discover_and_register_dynamic,
    discover_manifest_names,
)


def test_discover_and_register_dynamic(tmp_path: Path, monkeypatch) -> None:
    services = tmp_path / "services"
    name = "hot_reload_probe"
    root = services / name
    (root / "src" / "api").mkdir(parents=True)
    (root / "src" / "core").mkdir(parents=True)
    (root / "src" / "data").mkdir(parents=True)
    (root / "src" / "integration").mkdir(parents=True)
    (root / "tests").mkdir(parents=True)
    (root / "manifest.json").write_text(
        json.dumps(
            {
                "name": name,
                "version": "0.1.0",
                "features": ["health"],
                "entry_point": "src/api/main.py",
                "dependencies": [],
            }
        ),
        encoding="utf-8",
    )
    (root / "config.py").write_text(
        "class ServiceConfig: pass\n",
        encoding="utf-8",
    )
    (root / "src" / "__init__.py").write_text("", encoding="utf-8")
    (root / "src" / "api" / "__init__.py").write_text("", encoding="utf-8")
    (root / "src" / "api" / "main.py").write_text(
        """
from fastapi import FastAPI
from core.registry import ServiceManifest

def create_app(container=None, config=None):
    return FastAPI(title="hot_reload_probe")

def register(registry):
    registry.register(
        ServiceManifest(
            name="hot_reload_probe",
            version="0.1.0",
            features=["health"],
            entry_point="src/api/main.py",
            dependencies=[],
        ),
        create_app,
    )
""",
        encoding="utf-8",
    )

    # Ensure import path resolves for services.<name>
    import sys

    sys.path.insert(0, str(tmp_path))
    try:
        assert name in discover_manifest_names(services)
        local = GlobalServiceRegistry()
        added = discover_and_register_dynamic(local, services_root=services)
        assert name in added
        assert name in local.list_services()
        # Idempotent
        added2 = discover_and_register_dynamic(local, services_root=services)
        assert name not in added2
    finally:
        if str(tmp_path) in sys.path:
            sys.path.remove(str(tmp_path))
