"""Unit tests for evolve enqueue fail-closed gate helpers."""

from __future__ import annotations

from services.empery_intelligence_core.src.integration.evolve_enqueue_gate import (
    evolve_enqueue_violation,
    looks_like_evolve_intent,
)


def test_genesis_intent_without_selected_option_ok() -> None:
    """Create/genesis intents bypass the product-evolve pick gate."""
    metadata: dict = {}
    intent = "genesis: scaffold new service companion_chat"
    assert looks_like_evolve_intent(intent, kind="EVOLVE", metadata=metadata) is False
    assert evolve_enqueue_violation(metadata, intent=intent, kind="EVOLVE") is None


def test_product_evolve_without_pick_returns_error() -> None:
    metadata: dict = {}
    intent = "evolve service foo: improve API"
    assert looks_like_evolve_intent(intent, kind="EVOLVE", metadata=metadata) is True
    err = evolve_enqueue_violation(metadata, intent=intent, kind="EVOLVE")
    assert err is not None
    assert "selected_option" in err
    assert "evolve_skip_propose" in err


def test_evolve_with_selected_option_id_ok() -> None:
    metadata = {"selected_option": {"id": "opt-1"}}
    intent = "evolve service foo: improve API"
    assert evolve_enqueue_violation(metadata, intent=intent, kind="EVOLVE") is None


def test_evolve_with_selected_option_title_ok() -> None:
    metadata = {"selected_option": {"title": "Improve REST endpoints"}}
    intent = "evolve service foo: improve API"
    assert evolve_enqueue_violation(metadata, intent=intent, kind="EVOLVE") is None


def test_evolve_skip_propose_ok() -> None:
    metadata = {"evolve_skip_propose": True}
    intent = "evolve service foo: improve API"
    assert evolve_enqueue_violation(metadata, intent=intent, kind="EVOLVE") is None


def test_evolve_skip_propose_string_truthy_ok() -> None:
    metadata = {"evolve_skip_propose": "true"}
    intent = "evolve service foo: improve API"
    assert evolve_enqueue_violation(metadata, intent=intent, kind="EVOLVE") is None


def test_both_selected_option_and_skip_returns_error() -> None:
    metadata = {
        "selected_option": {"id": "opt-1"},
        "evolve_skip_propose": True,
    }
    intent = "evolve service foo: improve API"
    err = evolve_enqueue_violation(metadata, intent=intent, kind="EVOLVE")
    assert err is not None
    assert "not both" in err


def test_metadata_kind_evolve_without_pick_returns_error() -> None:
    metadata = {"kind": "evolve"}
    intent = "run autonomous loop for foo"
    assert looks_like_evolve_intent(intent, kind="EVOLVE", metadata=metadata) is True
    err = evolve_enqueue_violation(metadata, intent=intent, kind="EVOLVE")
    assert err is not None
    assert "selected_option" in err


def test_create_markers_false_even_when_kind_param_is_evolve() -> None:
    """Genesis/create wording must not be treated as product evolve."""
    intent = "genesis scaffold new service bar"
    metadata: dict = {}
    assert looks_like_evolve_intent(intent, kind="evolve", metadata=metadata) is False
    assert evolve_enqueue_violation(metadata, intent=intent, kind="evolve") is None


def test_evolve_missing_capsule_when_product_evolve(tmp_path) -> None:
    from pathlib import Path

    from services.empery_intelligence_core.src.integration.evolve_enqueue_gate import (
        evolve_missing_capsule_violation,
    )

    meta = {"kind": "evolve", "evolve_skip_propose": True}
    intent = "evolve service astromytant: add dashboard"
    err = evolve_missing_capsule_violation(
        workspace=tmp_path,
        service_name="astromytant",
        kind="evolve",
        intent=intent,
        metadata=meta,
    )
    assert err is not None
    assert "EIC_EVOLVE_NO_CAPSULE" in err

    svc = Path(tmp_path) / "services" / "astromytant"
    svc.mkdir(parents=True)
    (svc / "manifest.json").write_text("{}", encoding="utf-8")
    assert (
        evolve_missing_capsule_violation(
            workspace=tmp_path,
            service_name="astromytant",
            kind="evolve",
            intent=intent,
            metadata=meta,
        )
        is None
    )


def test_create_intent_missing_capsule_not_evolve_violation(tmp_path) -> None:
    from services.empery_intelligence_core.src.integration.evolve_enqueue_gate import (
        evolve_missing_capsule_violation,
    )

    assert (
        evolve_missing_capsule_violation(
            workspace=tmp_path,
            service_name="new_product",
            kind="evolve",
            intent="create_service astronomy chat with dashboard",
            metadata={},
        )
        is None
    )