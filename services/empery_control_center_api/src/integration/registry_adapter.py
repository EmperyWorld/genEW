"""Registry snapshot adapter wrapping GlobalServiceRegistry (no cross-service imports)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.empery_control_center_api.src.core.models import (
    RegistryServiceEntry,
    RegistrySnapshot,
)

_ECC_HUB = "empery_control_center_api"


def _disk_manifest_fields(
    service_name: str,
) -> tuple[list[str], list[str], list[str]] | None:
    """
    Best-effort read of dependencies/publishes/subscribes from bind-mounted JSON.

    Protects against stale baked-in ``core.ServiceManifest`` models that predate
    event-topic fields — the host ``services/*/manifest.json`` is source of truth.
    """
    # parents: integration → src → service dir → services/
    candidates = [
        Path(__file__).resolve().parents[3] / service_name / "manifest.json",
        Path("/app/services") / service_name / "manifest.json",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        deps = [str(x) for x in (raw.get("dependencies") or [])]
        pubs = [str(x) for x in (raw.get("publishes") or [])]
        subs = [str(x) for x in (raw.get("subscribes") or [])]
        return deps, pubs, subs
    return None


def _as_fabric_hub_subscribes(
    services: list[RegistryServiceEntry],
    *,
    hub_name: str = _ECC_HUB,
) -> list[RegistryServiceEntry]:
    """
    ECC is the ops fabric hub: it observes peer EventBus publishes.

    Union peer ``publishes`` into the hub's ``subscribes`` so the ecosystem map
    draws event edges for Core Auth / Desktop / studios / Hands without waiting
    for every topic to be hand-listed in ECC's static manifest. Does not invent
    hard dependencies.
    """
    peer_topics: list[str] = []
    seen: set[str] = set()
    for entry in services:
        if entry.name == hub_name:
            continue
        for topic in entry.publishes:
            if topic in seen:
                continue
            seen.add(topic)
            peer_topics.append(topic)
    if not peer_topics:
        return services

    out: list[RegistryServiceEntry] = []
    for entry in services:
        if entry.name != hub_name:
            out.append(entry)
            continue
        merged = list(dict.fromkeys([*entry.subscribes, *peer_topics]))
        out.append(
            RegistryServiceEntry(
                name=entry.name,
                version=entry.version,
                features=list(entry.features),
                entry_point=entry.entry_point,
                dependencies=list(entry.dependencies),
                publishes=list(entry.publishes),
                subscribes=merged,
            )
        )
    return out


class RegistrySnapshotAdapter:
    """Projects GlobalServiceRegistry manifests into RegistrySnapshot."""

    def __init__(self, registry: Any) -> None:
        self._registry = registry

    def snapshot(self) -> RegistrySnapshot:
        services: list[RegistryServiceEntry] = []
        for name in self._registry.list_services():
            manifest = self._registry.get_manifest(name)
            disk = _disk_manifest_fields(name)
            if disk is not None:
                dependencies, publishes, subscribes = disk
            else:
                dependencies = list(manifest.dependencies)
                publishes = list(getattr(manifest, "publishes", []) or [])
                subscribes = list(getattr(manifest, "subscribes", []) or [])
            services.append(
                RegistryServiceEntry(
                    name=manifest.name,
                    version=manifest.version,
                    features=list(manifest.features),
                    entry_point=manifest.entry_point,
                    dependencies=dependencies,
                    publishes=publishes,
                    subscribes=subscribes,
                )
            )
        services = _as_fabric_hub_subscribes(services)
        services.sort(key=lambda s: s.name)
        return RegistrySnapshot(
            generated_at=datetime.now(timezone.utc),
            services=services,
        )
