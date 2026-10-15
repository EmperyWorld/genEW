"""Sticky port allocation — do not shift health bases after scaffold."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.src.integration.service_factory_peers import (
    resolve_service_port,
    upsert_peer_env_matrix,
)
from services.empery_intelligence_core.src.integration.service_scaffold import (
    allocate_service_port,
)


def test_allocate_reuses_compose_service_port(tmp_path: Path) -> None:
    name = "sticky_port_svc"
    fragment = tmp_path / "deploy" / "services" / f"{name}.yml"
    fragment.parent.mkdir(parents=True)
    fragment.write_text(
        f'services:\n  {name}:\n    build:\n      args:\n        SERVICE_PORT: "8066"\n'
        f'    ports:\n      - "8066:8066"\n    environment:\n      PORT: "8066"\n',
        encoding="utf-8",
    )
    # Poison health base with wrong port (simulates post-scaffold double allocate).
    eic = tmp_path / ".cursor" / "orchestration" / "eic"
    eic.mkdir(parents=True)
    (eic / "dynamic_health_bases.json").write_text(
        f'{{"{name}": "http://{name}:8067"}}\n',
        encoding="utf-8",
    )
    assert resolve_service_port(tmp_path, name) == 8066
    assert allocate_service_port(tmp_path, name) == 8066
    # Second call must not bump.
    assert allocate_service_port(tmp_path, name) == 8066


def test_upsert_peer_env_rewrites_health_base_to_compose_port(tmp_path: Path) -> None:
    name = "heal_port_svc"
    fragment = tmp_path / "deploy" / "services" / f"{name}.yml"
    fragment.parent.mkdir(parents=True)
    fragment.write_text(
        f'services:\n  {name}:\n    build:\n      args:\n        SERVICE_PORT: "8041"\n',
        encoding="utf-8",
    )
    eic = tmp_path / ".cursor" / "orchestration" / "eic"
    eic.mkdir(parents=True)
    (eic / "dynamic_health_bases.json").write_text(
        f'{{"{name}": "http://{name}:8042"}}\n',
        encoding="utf-8",
    )
    (tmp_path / "services" / name).mkdir(parents=True)
    (tmp_path / "services" / name / "manifest.json").write_text(
        f'{{"name": "{name}", "features": ["health"], "dependencies": []}}',
        encoding="utf-8",
    )
    out = upsert_peer_env_matrix(tmp_path, name)
    assert out["ok"] is True
    assert out["entry"]["port"] == 8041
    hb = (eic / "dynamic_health_bases.json").read_text(encoding="utf-8")
    assert f"http://{name}:8041" in hb
    assert ":8042" not in hb
