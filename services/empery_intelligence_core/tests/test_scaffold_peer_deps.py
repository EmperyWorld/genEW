"""Scaffold peer-dependency alignment (manifest ↔ compose)."""

from __future__ import annotations

from services.empery_intelligence_core.src.integration.service_scaffold import (
    compose_depends_for_profile,
    empery_peer_dependencies_for_profile,
)


def test_studio_profiles_have_no_empery_peer_deps() -> None:
    for profile in ("image_studio", "video_studio", "music_forge"):
        assert compose_depends_for_profile(profile) == ["redis"]
        assert empery_peer_dependencies_for_profile(profile) == []


def test_companion_and_task_board_declare_identity_and_eic() -> None:
    for profile in ("companion_chat", "task_board", "research_report", "ops_dashboard"):
        deps = empery_peer_dependencies_for_profile(profile)
        assert deps == ["empery_intelligence_core", "identity_service"]


def test_site_studio_depends_on_eic_only() -> None:
    assert empery_peer_dependencies_for_profile("site_studio") == [
        "empery_intelligence_core"
    ]
