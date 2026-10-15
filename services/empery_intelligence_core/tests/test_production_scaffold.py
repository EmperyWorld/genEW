"""Phase 1: Hands companion/studio/peer scaffolds emit production peers."""

from __future__ import annotations

import json
from pathlib import Path

from core.logging import configure_logging
from services.empery_intelligence_core.src.integration.service_scaffold import (
    ServiceScaffoldAction,
)
from services.empery_intelligence_core.src.integration.service_scaffold_companion import (
    companion_chat_file_map,
)


def test_companion_file_map_is_production() -> None:
    action = ServiceScaffoldAction(Path("/tmp"), configure_logging("map"))
    files = companion_chat_file_map(
        action,
        "factory_chat",
        features=["health"],
        port=8099,
        domain_hint="companion chat",
    )
    manifest = json.loads(files["manifest.json"])
    assert "empery_intelligence_core" in manifest["dependencies"]
    assert "identity_service" in manifest["dependencies"]
    assert "nervas_peer" in manifest["features"]
    assert "reflex_scaffold" not in manifest["features"]

    src_blob = "\n".join(
        content for rel, content in files.items() if rel.startswith("src/")
    )
    assert "InMemoryChatStore" not in src_blob
    assert "NERVAS_NOT_WIRED" not in src_blob
    assert "class NervasClient" in files["src/integration/nervas_client.py"]
    assert "IdentityVerifierAdapter" in files["src/integration/identity_adapter.py"]
    assert "ChatMessageRepository" in files["src/data/repository.py"]
    assert "register_service_database_manager" in files["src/api/main.py"]
    assert "alembic/versions/0001_create_chat_tables.py" in files
    assert "AUTO_CREATE_TABLES" in files["config.py"]
    assert "database_url" in files["config.py"]


def test_companion_scaffold_writes_prod_compose(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("companion_prod"))
    out = action.scaffold(
        "factory_buddy",
        features=["health"],
        scaffold_profile="companion_chat",
        domain_hint="companion chat",
        port=8098,
    )
    assert out["scaffold_profile"] == "companion_chat"
    root = tmp_path / "services" / "factory_buddy"
    assert (root / "src" / "integration" / "nervas_client.py").is_file()
    assert (root / "alembic" / "versions" / "0001_create_chat_tables.py").is_file()
    repo = (root / "src" / "data" / "repository.py").read_text(encoding="utf-8")
    assert "InMemoryChatStore" not in repo
    assert "ChatMessageRepository" in repo
    compose = (tmp_path / "deploy" / "services" / "factory_buddy.yml").read_text(
        encoding="utf-8"
    )
    assert "postgres" in compose
    assert "empery_intelligence_core" in compose
    assert "identity_service" in compose
    assert "FACTORY_BUDDY_DATABASE_URL" in compose
    assert 'EVENT_BUS_ALLOW_IN_MEMORY: "false"' in compose
    assert 'AUTO_CREATE_TABLES: "false"' in compose
    assert "EIC_API_BASE" in compose


def test_studio_scaffold_no_inmemory_in_src(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("studio_prod"))
    out = action.scaffold(
        "factory_studio",
        features=["health"],
        scaffold_profile="studio_job",
        domain_hint="music_forge",
        port=8097,
    )
    assert out["scaffold_profile"] == "studio_job"
    root = tmp_path / "services" / "factory_studio"
    repo = (root / "src" / "data" / "repository.py").read_text(encoding="utf-8")
    assert "InMemoryJobStore" not in repo
    assert "JobRepository" in repo
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    assert "identity_service" in manifest["dependencies"]
    compose = (tmp_path / "deploy" / "services" / "factory_studio.yml").read_text(
        encoding="utf-8"
    )
    assert "postgres" in compose
    assert "identity_service" in compose


def test_health_probe_has_probe_store_not_inmemory(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("probe_prod"))
    action.scaffold(
        "factory_probe",
        features=["health"],
        scaffold_profile="health_probe",
        port=8095,
    )
    root = tmp_path / "services" / "factory_probe"
    repo = (root / "src" / "data" / "repository.py").read_text(encoding="utf-8")
    assert "ProbeStore" in repo
    assert "InMemoryProbeStore" not in repo


def test_peer_http_emits_nervas_client(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("peer_prod"))
    action.scaffold(
        "factory_peer",
        features=["health"],
        scaffold_profile="peer_http",
        domain_hint="http peer",
        port=8096,
    )
    root = tmp_path / "services" / "factory_peer"
    nervas = (root / "src" / "integration" / "nervas_client.py").read_text(
        encoding="utf-8"
    )
    assert "class NervasClient" in nervas
    assert "192.168.1.111" not in nervas
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    assert "empery_intelligence_core" in manifest["dependencies"]
    compose = (tmp_path / "deploy" / "services" / "factory_peer.yml").read_text(
        encoding="utf-8"
    )
    assert "EIC_API_BASE" in compose
