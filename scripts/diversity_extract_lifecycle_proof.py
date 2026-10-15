#!/usr/bin/env python3
"""Diversity + extract + user_created delete proof (filesystem; optional live deny).

Uses a temporary workspace for scaffold/extract side-effects so the repo tree
stays clean. Assembly selection reads the real repo recipes/atom_catalog.

  python3 scripts/diversity_extract_lifecycle_proof.py
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _fail(msg: str) -> int:
    print(f"FAILED: {msg}")
    return 1


def _mirror_recipe_tree(dest: Path) -> None:
    """Copy recipe + reference packs needed for extract into temp workspace."""
    for rel in (
        ".cursor/orchestration/recipes",
        ".cursor/agents",
        ".cursor/skills",
        "reference/eliteew/packs",
        "core/integration/nervas.py",
    ):
        src = ROOT / rel
        out = dest / rel
        if src.is_dir():
            shutil.copytree(src, out, dirs_exist_ok=True)
        elif src.is_file():
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, out)


def main() -> int:
    sys.path.insert(0, str(ROOT))
    from core.logging import configure_logging
    from services.empery_intelligence_core.config import ServiceConfig
    from services.empery_intelligence_core.src.integration.extract_adapt import (
        extract_from_catalog_entry,
    )
    from services.empery_intelligence_core.src.integration.orchestration_paths import (
        EicOrchestrationPaths,
    )
    from services.empery_intelligence_core.src.integration.recipe_catalog import (
        atom_catalog_entry,
        resolve_assembly_selection,
    )
    from services.empery_intelligence_core.src.integration.service_factory_lifecycle import (
        assert_delete_allowed,
        lifecycle_delete_meta,
        teardown_service_files,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold import (
        ServiceScaffoldAction,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        design_ui_block,
    )

    cfg = ServiceConfig(workspace_root=str(ROOT))
    paths = EicOrchestrationPaths.from_config(cfg, cwd=ROOT)
    log = configure_logging("diversity_proof")

    print("1) assembly profile matrix (repo recipes)")
    cases = [
        (
            "notes_lite",
            "create_service notes_lite блокнот longread editor",
            "editor_local",
            ("notes_crud", "doc_editor"),
        ),
        (
            "ops_metrics",
            "create_service ops_metrics llm dashboard метрики jtbd board",
            "ops_dashboard",
            ("ops_dashboard",),
        ),
        (
            "sprint_board",
            "create_service sprint_board kanban задач board",
            "task_board",
            ("task_board",),
        ),
        (
            "market_research",
            "create_service market_research маркетинг отчёт nervas",
            "research_report",
            ("research_report",),
        ),
    ]
    for name, intent, profile, roots in cases:
        sel = resolve_assembly_selection(paths, service_name=name, intent=intent)
        if sel.scaffold_profile != profile:
            return _fail(f"{name}: profile={sel.scaffold_profile} want={profile}")
        if not any(any(r in er for r in roots) for er in sel.extract_roots):
            return _fail(f"{name}: extract_roots={sel.extract_roots} want any of {roots}")
        print(f"  {name}: {profile} ok extract={sel.extract_roots[:3]}")

    with tempfile.TemporaryDirectory(prefix="empery_diversity_") as tmp:
        work = Path(tmp)
        print(f"2) extract_adapt in temp workspace {work}")
        _mirror_recipe_tree(work)
        # Minimal app/service trees for extract targets
        (work / "apps/empery_desktop/atoms").mkdir(parents=True, exist_ok=True)
        (work / "services").mkdir(parents=True, exist_ok=True)
        (work / "core/integration").mkdir(parents=True, exist_ok=True)
        if not (work / "core/integration/nervas.py").is_file():
            (work / "core/integration/nervas.py").write_text(
                '"""Nervas port stub for extract path."""\n',
                encoding="utf-8",
            )

        tmp_cfg = ServiceConfig(workspace_root=str(work))
        tmp_paths = EicOrchestrationPaths.from_config(tmp_cfg, cwd=work)
        for pack, svc in (("ops_dashboard", "ops_metrics"), ("notes_crud", "notes_lite")):
            entry = atom_catalog_entry(tmp_paths, pack)
            if not entry:
                return _fail(f"atom_catalog missing {pack}")
            result = extract_from_catalog_entry(
                workspace=work, entry=entry, service_name=svc
            )
            if not result.ok:
                return _fail(f"extract {pack}: {result.error}")
            print(f"  extract {pack}: files={len(result.written)}")

        print("3) provenance + create→delete throwaway (temp)")
        name = "audit_del_capsule"
        design = design_ui_block(name, ui_profile="ops_dashboard")
        life = design.get("lifecycle") or {}
        if life.get("user_created") is not True:
            return _fail("design_ui_block missing user_created")
        if not life.get("created_by") or not life.get("created_at"):
            return _fail(f"design_ui_block missing created_by/at: {life}")

        designs = work / ".cursor" / "orchestration" / "designs"
        designs.mkdir(parents=True, exist_ok=True)
        (designs / f"{name}_design.json").write_text(
            json.dumps(design, indent=2) + "\n", encoding="utf-8"
        )

        scaffold = ServiceScaffoldAction(work, log)
        scaffold.scaffold(
            name,
            port=8099,
            domain_hint="ops dashboard metrics",
            scaffold_profile="ops_dashboard",
        )
        if not (work / "services" / name / "manifest.json").is_file():
            return _fail("scaffold did not write service")
        manifest = json.loads(
            (work / "services" / name / "manifest.json").read_text(encoding="utf-8")
        )
        feats = manifest.get("features") or []
        if "user_created" not in feats:
            return _fail(f"manifest missing user_created feature: {feats}")

        meta = lifecycle_delete_meta(work, name)
        if not meta.get("deletable"):
            return _fail(f"throwaway not deletable: {meta}")
        assert_delete_allowed(work, name)
        torn = teardown_service_files(work, name)
        if not torn.get("ok"):
            return _fail(f"teardown failed: {torn}")
        if (work / "services" / name).exists():
            return _fail("service tree still present after teardown")
        print(f"  throwaway {name} scaffold+teardown ok")

    print("4) deny delete ai_chat (repo filesystem gate)")
    try:
        assert_delete_allowed(ROOT, "ai_chat")
        return _fail("ai_chat delete was allowed")
    except ValueError as exc:
        print(f"  ai_chat denied: {exc}")

    print("5) live lifecycle-meta ai_chat (optional)")
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:8007/api/v1/factory/services/ai_chat/lifecycle-meta",
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            live = json.loads(resp.read().decode("utf-8"))
        if live.get("deletable") is not False or live.get("seed_product") is not True:
            return _fail(f"live meta unexpected: {live}")
        print(f"  live meta ok: {live}")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"  live meta skipped ({exc})")

    print("diversity_extract_lifecycle_proof PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
