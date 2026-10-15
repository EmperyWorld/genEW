"""Assembly recipe catalog loader."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.prompt_templates import (
    PromptTemplateLoader,
    RULES_DIGEST,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    load_recipe_catalog_digest,
)
from services.empery_intelligence_core.src.core.reflexes.models import (
    AgentRole,
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopCheckpoint,
    LoopStage,
)
from datetime import datetime, timezone
from uuid import uuid4


def test_load_recipe_index_from_repo() -> None:
    root = Path.cwd()
    cfg = ServiceConfig(
        orchestration_root=str(root / ".cursor" / "orchestration"),
        workspace_root=str(root),
        agents_root=str(root / ".cursor" / "agents"),
        skills_root=str(root / ".cursor" / "skills"),
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=root)
    digest, used = load_recipe_catalog_digest(
        paths, service_name="desktop_shell", intent="build desktop host"
    )
    assert "Recipe catalog" in digest or "INDEX" in digest
    assert any(p.endswith("INDEX.md") for p in used)
    assert any("desktop_shell_kernel" in p for p in used)


def test_prompt_includes_assembly_law_and_recipes() -> None:
    root = Path.cwd()
    cfg = ServiceConfig(
        orchestration_root=str(root / ".cursor" / "orchestration"),
        workspace_root=str(root),
        agents_root=str(root / ".cursor" / "agents"),
        skills_root=str(root / ".cursor" / "skills"),
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=root)
    loader = PromptTemplateLoader(paths)
    now = datetime.now(timezone.utc)
    intention = Intention(
        id=uuid4(),
        kind=IntentionKind.EVOLVE,
        status=IntentionStatus.RUNNING,
        intent="create desktop notes app",
        service_name="notes_lite",
        checkpoint=LoopCheckpoint(stage=LoopStage.IMPLEMENT, updated_at=now),
        created_at=now,
        updated_at=now,
    )
    bundle = loader.build(AgentRole.IMPLEMENTER, intention)
    assert "ASSEMBLY LAW" in RULES_DIGEST
    assert "UI LAW" in RULES_DIGEST
    assert "Assembly recipes" in bundle.skill_addendum
    assert "reference/eliteew" in RULES_DIGEST

    verify_intention = Intention(
        id=uuid4(),
        kind=IntentionKind.EVOLVE,
        status=IntentionStatus.RUNNING,
        intent="create_service recipe_probe_svc with anatomy",
        service_name="recipe_probe_svc",
        checkpoint=LoopCheckpoint(stage=LoopStage.VERIFY, updated_at=now),
        created_at=now,
        updated_at=now,
    )
    verify_bundle = loader.build(AgentRole.VERIFIER, verify_intention)
    assert "Assembly recipes" in verify_bundle.skill_addendum
    assert "verify_gates" in verify_bundle.skill_addendum or any(
        "verify_gates" in p for p in verify_bundle.template_paths
    )


def test_recipe_digest_attaches_source_when_present(tmp_path: Path) -> None:
    orch = tmp_path / ".cursor" / "orchestration" / "recipes"
    orch.mkdir(parents=True)
    (orch / "INDEX.md").write_text("# Index\n", encoding="utf-8")
    (orch / "studios.md").write_text("# Studios pack\n", encoding="utf-8")
    src_dir = tmp_path / "reference" / "eliteew" / "packs" / "studios"
    src_dir.mkdir(parents=True)
    (src_dir / "SOURCE.md").write_text(
        "# SOURCE\nRead apps/foo first\n", encoding="utf-8"
    )
    cfg = ServiceConfig(
        orchestration_root=str(tmp_path / ".cursor" / "orchestration"),
        workspace_root=str(tmp_path),
        agents_root=str(tmp_path / ".cursor" / "agents"),
        skills_root=str(tmp_path / ".cursor" / "skills"),
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    digest, used = load_recipe_catalog_digest(
        paths, service_name=None, intent="text-to-image studio"
    )
    assert "Extract SOURCE" in digest
    assert any(p.endswith("SOURCE.md") for p in used)