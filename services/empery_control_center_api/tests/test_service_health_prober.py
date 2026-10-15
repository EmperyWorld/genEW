"""Unit tests for dynamic health-base discovery (Hands + compose.reflex)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import httpx
import pytest

from services.empery_control_center_api.src.integration.service_health_prober import (
    ServiceHealthProber,
    _load_compose_reflex_health_bases,
    _load_flat_health_bases,
    _load_peer_matrix_health_bases,
    map_remote_status,
)


def test_map_remote_status_ok() -> None:
    assert map_remote_status({"status": "ok"}, 200) == "ok"
    assert map_remote_status({"status": "down"}, 200) == "down"
    assert map_remote_status(None, 500) == "down"


def test_load_compose_reflex_health_bases(tmp_path: Path) -> None:
    path = tmp_path / "compose.reflex.yml"
    path.write_text(
        """# overlay
services:
  hands_alpha:
    environment:
      SERVICE_PORT: "8091"
      PORT: "8091"
  hands_beta:
    environment:
      FOO: bar
      SERVICE_PORT: "8092"
""",
        encoding="utf-8",
    )
    bases = _load_compose_reflex_health_bases(path)
    assert bases["hands_alpha"] == "http://hands_alpha:8091"
    assert bases["hands_beta"] == "http://hands_beta:8092"


def test_load_peer_matrix_and_flat(tmp_path: Path) -> None:
    peers = tmp_path / "peer_env_matrix.json"
    peers.write_text(
        """{
  "peers": {
    "svc_a": {"health_base": "http://svc_a:8011", "port": 8011},
    "svc_b": {"port": 8012}
  }
}
""",
        encoding="utf-8",
    )
    flat = tmp_path / "dynamic_health_bases.json"
    flat.write_text('{"svc_c": "http://svc_c:8013/"}\n', encoding="utf-8")
    assert _load_peer_matrix_health_bases(peers) == {
        "svc_a": "http://svc_a:8011",
        "svc_b": "http://svc_b:8012",
    }
    assert _load_flat_health_bases(flat) == {"svc_c": "http://svc_c:8013"}


@pytest.mark.asyncio
async def test_prober_merges_compose_reflex_when_dynamic_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    orch = tmp_path / ".cursor" / "orchestration"
    eic = orch / "eic"
    eic.mkdir(parents=True)
    (eic / "compose.reflex.yml").write_text(
        """services:
  newborn_hands:
    environment:
      SERVICE_PORT: "8064"
""",
        encoding="utf-8",
    )
    (eic / "dynamic_health_bases.json").write_text("{}\n", encoding="utf-8")

    entry = MagicMock()
    entry.name = "newborn_hands"
    snapshot = MagicMock()
    snapshot.services = [entry]
    registry = MagicMock()
    registry.snapshot.return_value = snapshot

    prober = ServiceHealthProber(
        registry,
        service_bases={},
        timeout_ms=500,
        cache_ttl_ms=0,
        orchestration_root=orch,
    )
    assert prober._merged_bases()["newborn_hands"] == "http://newborn_hands:8064"

    async def fake_get(self, url, **kwargs):  # noqa: ANN001, ANN003
        assert url == "http://newborn_hands:8064/api/v1/health"
        return httpx.Response(200, json={"status": "ok"})

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    result = await prober.probe_all(local_status="ok", force=True)
    by_name = {i.name: i.health for i in result.services}
    assert by_name["newborn_hands"] == "ok"


def test_dynamic_bases_override_compose(tmp_path: Path) -> None:
    orch = tmp_path / "orch"
    eic = orch / "eic"
    eic.mkdir(parents=True)
    (eic / "compose.reflex.yml").write_text(
        """services:
  svc_x:
    environment:
      SERVICE_PORT: "8001"
""",
        encoding="utf-8",
    )
    (eic / "dynamic_health_bases.json").write_text(
        '{"svc_x": "http://svc_x:9999"}\n', encoding="utf-8"
    )
    registry = MagicMock()
    registry.snapshot.return_value = MagicMock(services=[])
    prober = ServiceHealthProber(
        registry,
        service_bases={"svc_x": "http://svc_x:1111"},
        orchestration_root=orch,
    )
    assert prober._merged_bases()["svc_x"] == "http://svc_x:9999"
