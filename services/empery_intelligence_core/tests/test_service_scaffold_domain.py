"""Domain-aware ServiceScaffoldAction template tests."""

from __future__ import annotations

import json
from pathlib import Path

from core.logging import configure_logging
from services.empery_intelligence_core.src.integration.service_scaffold import (
    ServiceScaffoldAction,
    _entity_name_from_hint,
    _is_marketing_domain,
)


def test_entity_name_from_hint_inventory() -> None:
    assert _entity_name_from_hint("inventory") == "InventoryItem"


def test_entity_name_from_hint_task_canonical() -> None:
    from services.empery_intelligence_core.src.integration.service_scaffold import (
        resolve_domain_hint_for_profile,
    )

    assert _entity_name_from_hint("task") == "Task"
    assert resolve_domain_hint_for_profile("task_board", "long kanban intent") == "task"


def test_scaffold_task_board_uses_tasks_route(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts").mkdir(
        parents=True
    )
    (tmp_path / "apps" / "empery_control_center" / "src").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("scaffold_task_board"))
    action.scaffold(
        "board_svc",
        features=["health", "task_board"],
        domain_hint="Create a kanban task board with a very long intention string",
        scaffold_profile="task_board",
    )
    root = tmp_path / "services" / "board_svc"
    routes = (root / "src" / "api" / "routes.py").read_text(encoding="utf-8")
    schemas = (root / "src" / "data" / "schemas.py").read_text(encoding="utf-8")
    mount = (
        tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts" / "board_svc.tsx"
    ).read_text(encoding="utf-8")
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    assert "/tasks" in routes
    assert "TaskCreate" in schemas
    assert "title" in schemas
    assert "/api/v1/tasks" in mount
    assert "task_board" in manifest["features"]
    assert not any(len(str(f)) > 80 for f in manifest["features"])


def test_scaffold_ops_dashboard_uses_metrics_route(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts").mkdir(
        parents=True
    )
    (tmp_path / "apps" / "empery_control_center" / "src").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("scaffold_ops"))
    action.scaffold(
        "ops_svc",
        features=["health", "ops_dashboard"],
        domain_hint="Create llm dashboard метрики jtbd with a long intention",
        scaffold_profile="ops_dashboard",
    )
    root = tmp_path / "services" / "ops_svc"
    routes = (root / "src" / "api" / "routes.py").read_text(encoding="utf-8")
    schemas = (root / "src" / "data" / "schemas.py").read_text(encoding="utf-8")
    mount = (
        tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts" / "ops_svc.tsx"
    ).read_text(encoding="utf-8")
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    assert "/metrics" in routes
    assert "MetricCreate" in schemas
    assert "label" in schemas and "metrics" in schemas
    assert "/api/v1/metrics" in mount
    assert "ops_dashboard" in manifest["features"]


def test_scaffold_research_report_uses_reports_route(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts").mkdir(
        parents=True
    )
    (tmp_path / "apps" / "empery_control_center" / "src").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("scaffold_research"))
    action.scaffold(
        "research_svc",
        features=["health", "research_report"],
        domain_hint="create_service market_research маркетинг отчёт nervas summary",
        scaffold_profile="research_report",
    )
    root = tmp_path / "services" / "research_svc"
    routes = (root / "src" / "api" / "routes.py").read_text(encoding="utf-8")
    schemas = (root / "src" / "data" / "schemas.py").read_text(encoding="utf-8")
    mount = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / "research_svc.tsx"
    ).read_text(encoding="utf-8")
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    assert "/reports" in routes
    assert "ReportCreate" in schemas
    assert "topic" in schemas and "reports" in schemas
    assert "/api/v1/reports" in mount
    assert "research_report" in manifest["features"]


def test_scaffold_site_studio_uses_preview_route(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts").mkdir(
        parents=True
    )
    (tmp_path / "apps" / "empery_control_center" / "src").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("scaffold_site"))
    action.scaffold(
        "site_svc",
        features=["health", "site_studio"],
        domain_hint="create_service site_lab user site studio preview",
        scaffold_profile="site_studio",
    )
    root = tmp_path / "services" / "site_svc"
    routes = (root / "src" / "api" / "routes.py").read_text(encoding="utf-8")
    mount = (
        tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts" / "site_svc.tsx"
    ).read_text(encoding="utf-8")
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    assert "/preview" in routes
    assert "/api/v1/preview" in mount
    assert manifest["ui"]["required"] is False
    assert "site_preview" in manifest["features"]
    assert (root / "src" / "integration" / "nervas_client.py").is_file()


def test_scaffold_image_studio_uses_generate_route(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts").mkdir(
        parents=True
    )
    (tmp_path / "apps" / "empery_control_center" / "src").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("scaffold_image"))
    action.scaffold(
        "image_svc",
        features=["health", "text_to_image"],
        domain_hint="create_service image_lab text-to-image studio",
        scaffold_profile="image_studio",
    )
    root = tmp_path / "services" / "image_svc"
    routes = (root / "src" / "api" / "routes.py").read_text(encoding="utf-8")
    mount = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / "image_svc.tsx"
    ).read_text(encoding="utf-8")
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    assert "/generate" in routes
    assert "/api/v1/generate" in mount
    assert "/api/v1/jobs" in mount
    assert manifest["ui"]["required"] is False
    assert "text_to_image" in manifest["features"]
    assert (root / "src" / "integration" / "comfy_client.py").is_file()
    assert (root / "workflows" / "text_to_image.json").is_file()


def test_scaffold_video_studio_uses_generate_route(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts").mkdir(
        parents=True
    )
    (tmp_path / "apps" / "empery_control_center" / "src").mkdir(parents=True)
    # Living workflow source for scaffold copy
    wf_src = (
        Path.cwd()
        / "services"
        / "video_studio"
        / "workflows"
        / "image_to_video.json"
    )
    if wf_src.is_file():
        (tmp_path / "services" / "video_studio" / "workflows").mkdir(
            parents=True, exist_ok=True
        )
        (tmp_path / "services" / "video_studio" / "workflows" / "image_to_video.json").write_text(
            wf_src.read_text(encoding="utf-8"), encoding="utf-8"
        )
    action = ServiceScaffoldAction(tmp_path, configure_logging("scaffold_video"))
    action.scaffold(
        "video_svc",
        features=["health", "image_to_video"],
        domain_hint="create_service video_lab image-to-video wan studio",
        scaffold_profile="video_studio",
    )
    root = tmp_path / "services" / "video_svc"
    routes = (root / "src" / "api" / "routes.py").read_text(encoding="utf-8")
    mount = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / "video_svc.tsx"
    ).read_text(encoding="utf-8")
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    assert "Form(" in routes or "UploadFile" in routes
    assert "/generate" in routes
    assert "/videos" in routes
    assert "/api/v1/generate" in mount
    assert "FormData" in mount
    assert "/api/v1/jobs" in mount
    assert "/api/v1/videos" in mount
    assert manifest["ui"]["required"] is False
    assert "image_to_video" in manifest["features"]
    assert (root / "src" / "integration" / "comfy_client.py").is_file()
    assert (root / "workflows" / "image_to_video.json").is_file()


def test_scaffold_music_forge_uses_generate_route(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts").mkdir(
        parents=True
    )
    (tmp_path / "apps" / "empery_control_center" / "src").mkdir(parents=True)
    wf_src = (
        Path.cwd()
        / "services"
        / "music_forge"
        / "workflows"
        / "text_to_music.json"
    )
    if wf_src.is_file():
        (tmp_path / "services" / "music_forge" / "workflows").mkdir(
            parents=True, exist_ok=True
        )
        (tmp_path / "services" / "music_forge" / "workflows" / "text_to_music.json").write_text(
            wf_src.read_text(encoding="utf-8"), encoding="utf-8"
        )
    action = ServiceScaffoldAction(tmp_path, configure_logging("scaffold_music"))
    out = action.scaffold(
        "music_svc",
        features=["health", "text_to_music"],
        domain_hint="create_service music_lab text-to-music ace-step",
        scaffold_profile="music_forge",
    )
    root = tmp_path / "services" / "music_svc"
    routes = (root / "src" / "api" / "routes.py").read_text(encoding="utf-8")
    mount = (
        tmp_path
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / "music_svc.tsx"
    ).read_text(encoding="utf-8")
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    compose = (tmp_path / "deploy" / "services" / "music_svc.yml").read_text(
        encoding="utf-8"
    )
    assert out["scaffold_profile"] == "music_forge"
    assert "/generate" in routes
    assert "/audio" in routes
    assert "/api/v1/generate" in mount
    assert "/api/v1/jobs" in mount
    assert "/api/v1/audio" in mount
    assert manifest["ui"]["required"] is False
    assert manifest["dependencies"] == []
    assert "text_to_music" in manifest["features"]
    assert (root / "src" / "integration" / "comfy_client.py").is_file()
    assert (root / "workflows" / "text_to_music.json").is_file()
    assert "COMFY_BASE_URL" in compose
    assert "redis" in compose
    assert "workflows" in compose
    assert "postgres" not in compose


def test_is_marketing_domain() -> None:
    assert _is_marketing_domain("marketing_engine")
    assert not _is_marketing_domain("inventory_service")


def test_scaffold_marketing_domain(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("scaffold_marketing"))
    action.scaffold(
        "promo_marketing_svc",
        features=["health"],
        domain_hint="marketing",
    )
    root = tmp_path / "services" / "promo_marketing_svc"
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    routes = (root / "src" / "api" / "routes.py").read_text(encoding="utf-8")
    repo = (root / "src" / "data" / "repository.py").read_text(encoding="utf-8")
    src_blob = "\n".join(
        (root / "src" / p).read_text(encoding="utf-8")
        for p in [
            "data/repository.py",
            "data/orm.py",
            "api/main.py",
        ]
    )
    assert "marketing.campaign.created" in manifest["publishes"]
    assert "postgres" in manifest["features"]
    assert "/campaigns" in routes
    assert "/creatives" in routes
    assert "/segments" in routes
    assert "MarketingRepository" in repo
    assert "InMemory" not in src_blob
    assert (root / "alembic" / "versions" / "0001_create_marketing_tables.py").is_file()
    assert not (root / "tests" / "test_items.py").exists()


def test_scaffold_generic_inventory_domain(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("scaffold_inventory"))
    action.scaffold(
        "inventory_service",
        features=["health"],
        domain_hint="inventory",
    )
    root = tmp_path / "services" / "inventory_service"
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    routes = (root / "src" / "api" / "routes.py").read_text(encoding="utf-8")
    models = (root / "src" / "core" / "models.py").read_text(encoding="utf-8")
    repo = (root / "src" / "data" / "repository.py").read_text(encoding="utf-8")
    src_blob = "\n".join(
        (root / "src" / p).read_text(encoding="utf-8")
        for p in [
            "data/repository.py",
            "data/orm.py",
            "api/main.py",
        ]
    )
    assert manifest["publishes"] == ["inventory.inventory_item.created"]
    assert "postgres" in manifest["features"]
    assert "InventoryItem" in models
    assert "/inventory-items" in routes
    assert "InventoryItemRepository" in repo
    assert "InMemory" not in src_blob
    assert (
        root / "alembic" / "versions" / "0001_create_inventory_items.py"
    ).is_file()
    assert (root / "tests" / "test_domain.py").is_file()
