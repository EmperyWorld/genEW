"""Global registry lists Empery core services including Control Center API."""

from __future__ import annotations

from core.registry import register_all_services

REQUIRED_CORE = [
    "analytics_service",
    "core_auth_service",
    "empery_control_center_api",
    "empery_intelligence_core",
    "identity_service",
    "intelligence_service",
    "task_orchestrator_service",
]


def test_register_all_services_lists_expected() -> None:
    registry = register_all_services()
    names = registry.list_services()
    assert len(names) >= len(REQUIRED_CORE)
    for name in REQUIRED_CORE:
        assert name in names
        manifest = registry.get_manifest(name)
        assert manifest.name == name


def test_trinity_manifests_load() -> None:
    registry = register_all_services()
    identity = registry.get_manifest("identity_service")
    task = registry.get_manifest("task_orchestrator_service")
    intelligence = registry.get_manifest("intelligence_service")
    assert identity.version
    assert task.version
    assert intelligence.version
