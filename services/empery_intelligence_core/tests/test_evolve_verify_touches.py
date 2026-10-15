"""Evolve verify gate selection from selected_option.touches + UI-surface intent."""

from __future__ import annotations

import json
from pathlib import Path

from services.empery_intelligence_core.src.integration.evolve_propose import (
    EvolveOption,
    ensure_ui_desktop_touches,
)
from services.empery_intelligence_core.src.integration.evolve_verify_touches import (
    evolve_touch_gates,
    is_ui_surface_intent,
)


def test_evolve_touch_gates_empty_metadata() -> None:
    assert evolve_touch_gates({}) == {
        "factory": False,
        "ui": False,
        "desktop": False,
    }


def test_evolve_touch_gates_ui_and_desktop() -> None:
    gates = evolve_touch_gates(
        {"selected_option": {"id": "a", "touches": ["ui", "desktop"]}}
    )
    assert gates["ui"] is True
    assert gates["desktop"] is True
    assert gates["factory"] is False


def test_evolve_touch_gates_factory_areas() -> None:
    for touch in ("api", "manifest", "db", "events", "deploy"):
        gates = evolve_touch_gates(
            {"selected_option": {"id": "x", "touches": [touch]}}
        )
        assert gates["factory"] is True, touch


def test_evolve_touch_gates_capsule_forces_factory() -> None:
    """W3: capsule present ⇒ factory scan even with empty touches."""
    gates = evolve_touch_gates(
        {"selected_option": {"id": "a", "touches": []}},
        capsule_present=True,
        ui_required=False,
        mount_present=False,
    )
    assert gates["factory"] is True
    assert gates["ui"] is False
    assert gates["desktop"] is False


def test_evolve_touch_gates_ui_required_forces_surfaces(tmp_path: Path) -> None:
    svc = "demo_svc"
    (tmp_path / "services" / svc).mkdir(parents=True)
    (tmp_path / "services" / svc / "manifest.json").write_text(
        json.dumps({"name": svc, "ui": {"required": True}}),
        encoding="utf-8",
    )
    gates = evolve_touch_gates(
        {"selected_option": {"id": "a", "touches": ["api"]}},
        workspace=tmp_path,
        service_name=svc,
    )
    assert gates["factory"] is True
    assert gates["ui"] is True
    assert gates["desktop"] is True


def test_evolve_touch_gates_mixed_product_evolve() -> None:
    gates = evolve_touch_gates(
        {
            "selected_option": {
                "id": "full",
                "touches": ["api", "ui", "desktop", "deploy"],
            }
        }
    )
    assert gates == {"factory": True, "ui": True, "desktop": True}


def test_evolve_touch_gates_ignores_invalid_selected_option() -> None:
    assert evolve_touch_gates({"selected_option": "not-a-dict"})["ui"] is False
    assert evolve_touch_gates({"selected_option": {"touches": "api"}})["factory"] is False


def test_is_ui_surface_intent_markers() -> None:
    assert is_ui_surface_intent(
        "Добавить JTBD исследования внутри кабинета, дополнительной вкладкой"
    )
    assert is_ui_surface_intent("improve UI interface")
    assert is_ui_surface_intent("add a research tab")
    assert not is_ui_surface_intent("harden EventBus publishes and alembic only")
    assert not is_ui_surface_intent("circuit breaker for api")


def test_ui_surface_intent_forces_ui_desktop_despite_api_events_pick() -> None:
    """The marketing_cabinet failure mode: events/api pick, tab ask in intent."""
    gates = evolve_touch_gates(
        {
            "selected_option": {
                "id": "event_driven_insights",
                "title": "JTBD Insight Analytics Engine",
                "touches": ["events", "api"],
            }
        },
        intent=(
            "Добавить JTBD исследования внутри кабинета , "
            "дополнительной вкладкой внутри приложения. и улучшить UI интерфейс"
        ),
    )
    assert gates["factory"] is True
    assert gates["ui"] is True
    assert gates["desktop"] is True


def test_ensure_ui_desktop_touches_rewrites_api_only_options() -> None:
    intent = "Добавить JTBD вкладку и улучшить UI"
    opts = [
        EvolveOption(
            id="a",
            title="Events pipeline",
            delta_summary="Emit bus events",
            risk="high",
            touches=["events", "api"],
        ),
        EvolveOption(
            id="b",
            title="DB jobs table",
            delta_summary="Add jobs table",
            risk="medium",
            touches=["db", "api"],
        ),
    ]
    fixed = ensure_ui_desktop_touches(intent, opts)
    for opt in fixed:
        assert "ui" in opt.touches
        assert "desktop" in opt.touches
    plain = ensure_ui_desktop_touches("harden redis EventBus only", opts)
    assert plain[0].touches == ["events", "api"]
