"""Phase 5: deterministic factory DoD gates."""

from __future__ import annotations

from pathlib import Path

from core.logging import configure_logging
from services.empery_intelligence_core.src.integration.service_factory_gates import (
    normalize_verify_status,
    scan_src_for_fakes,
    verify_compose_prod_flags,
    verify_factory_gates,
    verify_manifest_ui,
    verify_primary_nav_ui_gate,
    verify_profile_peers,
    verify_register_symbol,
    verify_stateful_migrations,
)
from services.empery_intelligence_core.src.integration.service_scaffold import (
    ServiceScaffoldAction,
)


def test_normalize_rejects_demo_passed() -> None:
    assert normalize_verify_status("DEMO_PASSED") == "FAILED"
    assert normalize_verify_status("PASSED") == "PASSED"
    assert normalize_verify_status("stub_passed") == "FAILED"


def test_scan_src_for_fakes(tmp_path: Path) -> None:
    root = tmp_path / "services" / "bad"
    src = root / "src" / "core"
    src.mkdir(parents=True)
    (src / "x.py").write_text("class FakeAI:\n    pass\n", encoding="utf-8")
    (src / "y.py").write_text("class InMemoryWidgetStore:\n    pass\n", encoding="utf-8")
    (src / "ok.py").write_text(
        'PROMPT = "Never invent FakeAI stubs"\n', encoding="utf-8"
    )
    hits = scan_src_for_fakes(root)
    assert sorted(hits) == ["src/core/x.py", "src/core/y.py"]


def test_companion_scaffold_passes_factory_gates(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("factory_gates"))
    action.scaffold(
        "gate_buddy",
        features=["health"],
        scaffold_profile="companion_chat",
        domain_hint="companion chat",
        port=8091,
    )
    status, detail = verify_factory_gates(
        tmp_path, "gate_buddy", scaffold_profile="companion_chat"
    )
    assert status == "PASSED", detail
    assert "FakeAI" not in detail or "no FakeAI" in detail


def test_fake_in_src_fails_factory_gates(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("factory_fake"))
    action.scaffold(
        "gate_fake",
        features=["health"],
        scaffold_profile="companion_chat",
        port=8092,
    )
    bad = (
        tmp_path
        / "services"
        / "gate_fake"
        / "src"
        / "integration"
        / "evil.py"
    )
    bad.write_text("class FakeNervas:\n    pass\n", encoding="utf-8")
    status, detail = verify_factory_gates(
        tmp_path, "gate_fake", scaffold_profile="companion_chat"
    )
    assert status == "FAILED"
    assert "FakeNervas" in detail or "evil.py" in detail


def test_inmemory_compose_fails(tmp_path: Path) -> None:
    compose = tmp_path / "deploy" / "services"
    compose.mkdir(parents=True)
    (compose / "x.yml").write_text(
        'environment:\n  EVENT_BUS_ALLOW_IN_MEMORY: "true"\n',
        encoding="utf-8",
    )
    status, detail = verify_compose_prod_flags(tmp_path, "x")
    assert status == "FAILED"
    assert "EVENT_BUS_ALLOW_IN_MEMORY" in detail


def test_register_and_stateful(tmp_path: Path) -> None:
    root = tmp_path / "svc"
    (root / "src" / "api").mkdir(parents=True)
    (root / "src" / "api" / "main.py").write_text(
        "def register(registry):\n    pass\n", encoding="utf-8"
    )
    assert verify_register_symbol(root)[0] == "PASSED"
    (root / "manifest.json").write_text(
        '{"dependencies":["postgres"],"features":[]}', encoding="utf-8"
    )
    assert verify_stateful_migrations(root)[0] == "FAILED"
    (root / "alembic" / "versions").mkdir(parents=True)
    (root / "alembic" / "versions" / "0001.py").write_text("# mig\n", encoding="utf-8")
    assert verify_stateful_migrations(root)[0] == "PASSED"


def test_profile_peers_require_wiring(tmp_path: Path) -> None:
    root = tmp_path / "svc"
    (root / "src" / "integration").mkdir(parents=True)
    (root / "manifest.json").write_text('{"dependencies":[]}', encoding="utf-8")
    status, _ = verify_profile_peers(root, scaffold_profile="companion_chat")
    assert status == "FAILED"


def test_marketing_scaffold_passes_factory_gates(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("marketing_gates"))
    action.scaffold(
        "gate_marketing",
        features=["health"],
        domain_hint="marketing",
        port=8093,
    )
    status, detail = verify_factory_gates(
        tmp_path, "gate_marketing", scaffold_profile="marketing"
    )
    assert status == "PASSED", detail
    compose = (tmp_path / "deploy" / "services" / "gate_marketing.yml").read_text(
        encoding="utf-8"
    )
    assert "postgres" in compose
    assert "GATE_MARKETING_DATABASE_URL" in compose


def test_manifest_ui_required(tmp_path: Path) -> None:
    root = tmp_path / "svc"
    root.mkdir()
    (root / "manifest.json").write_text(
        '{"name":"svc","version":"0.1.0","entry_point":"x","features":[]}',
        encoding="utf-8",
    )
    assert verify_manifest_ui(root)[0] == "FAILED"
    (root / "manifest.json").write_text(
        '{"name":"svc","version":"0.1.0","entry_point":"x","features":[],'
        '"ui":{"required":false,"skip_reason":"infra peer"}}',
        encoding="utf-8",
    )
    assert verify_manifest_ui(root)[0] == "PASSED"


def test_primary_nav_rejects_probe(tmp_path: Path) -> None:
    nav = (
        tmp_path
        / "apps/empery_control_center/src/features/shell/NavPrimary.tsx"
    )
    nav.parent.mkdir(parents=True)
    nav.write_text(
        "/* eic:ui:probe_bad */\nexport function NavPrimary() { return null; }\n",
        encoding="utf-8",
    )
    svc = tmp_path / "services" / "probe_bad"
    svc.mkdir(parents=True)
    (svc / "manifest.json").write_text(
        '{"name":"probe_bad","version":"0.1.0","entry_point":"x","features":["probe"],'
        '"ui":{"required":false,"skip_reason":"probe","lab":true}}',
        encoding="utf-8",
    )
    status, detail = verify_primary_nav_ui_gate(tmp_path)
    assert status == "FAILED"
    assert "probe_bad" in detail
