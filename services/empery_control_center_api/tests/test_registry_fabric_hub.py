"""Registry snapshot fabric-hub enrichment for ecosystem map edges."""

from __future__ import annotations

from types import SimpleNamespace

from services.empery_control_center_api.src.core.models import RegistryServiceEntry
from services.empery_control_center_api.src.integration.registry_adapter import (
    RegistrySnapshotAdapter,
    _as_fabric_hub_subscribes,
)


def test_fabric_hub_unions_peer_publishes() -> None:
    services = [
        RegistryServiceEntry(
            name="core_auth_service",
            version="0.1.0",
            features=[],
            entry_point="x",
            dependencies=[],
            publishes=["auth.login.succeeded"],
            subscribes=[],
        ),
        RegistryServiceEntry(
            name="desktop_shell",
            version="0.1.0",
            features=[],
            entry_point="x",
            dependencies=[],
            publishes=["desktop.items.changed"],
            subscribes=[],
        ),
        RegistryServiceEntry(
            name="empery_control_center_api",
            version="0.1.0",
            features=[],
            entry_point="x",
            dependencies=["identity_service"],
            publishes=["ecc.registry.refreshed"],
            subscribes=["task.created"],
        ),
    ]
    out = _as_fabric_hub_subscribes(services)
    hub = next(s for s in out if s.name == "empery_control_center_api")
    assert "task.created" in hub.subscribes
    assert "auth.login.succeeded" in hub.subscribes
    assert "desktop.items.changed" in hub.subscribes
    # Peers unchanged
    assert next(s for s in out if s.name == "core_auth_service").subscribes == []


def test_adapter_snapshot_applies_hub(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    class _Reg:
        def list_services(self):
            return ["core_auth_service", "empery_control_center_api"]

        def get_manifest(self, name: str):
            if name == "core_auth_service":
                return SimpleNamespace(
                    name=name,
                    version="0.1.0",
                    features=[],
                    entry_point="x",
                    dependencies=[],
                    publishes=["auth.register.succeeded"],
                    subscribes=[],
                )
            return SimpleNamespace(
                name=name,
                version="0.1.0",
                features=[],
                entry_point="x",
                dependencies=[],
                publishes=[],
                subscribes=["eic.job.completed"],
            )

    snap = RegistrySnapshotAdapter(_Reg()).snapshot()
    hub = next(s for s in snap.services if s.name == "empery_control_center_api")
    assert "auth.register.succeeded" in hub.subscribes
    assert "eic.job.completed" in hub.subscribes
