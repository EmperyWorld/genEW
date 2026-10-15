"""Autonomous kind upgrade + design viability gates."""

from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

from services.empery_intelligence_core.src.core.reflexes.models import IntentionKind
from services.empery_intelligence_core.src.data.schemas import IntentionEnqueueRequest
from services.empery_intelligence_core.src.integration.service_scaffold import (
    is_viable_design_markdown,
    should_force_full_autonomous_loop,
)
from services.empery_intelligence_core.tests.conftest import make_container


def test_force_full_loop_for_missing_service(tmp_path: Path) -> None:
    assert should_force_full_autonomous_loop(
        kind="plan",
        intent="Создание лонгридов для телеграмм канала",
        service_name="generator_post_tg",
        workspace_root=tmp_path,
    )
    (tmp_path / "services" / "generator_post_tg").mkdir(parents=True)
    assert not should_force_full_autonomous_loop(
        kind="plan",
        intent="Документация существующего модуля",
        service_name="generator_post_tg",
        workspace_root=tmp_path,
    )


def test_force_full_loop_for_create_markers() -> None:
    assert should_force_full_autonomous_loop(
        kind="plan",
        intent="create_service billing_gateway with invoices",
        service_name=None,
        workspace_root=None,
    )
    assert should_force_full_autonomous_loop(
        kind="implement",
        intent="создай сервис уведомлений",
        service_name=None,
        workspace_root=None,
    )


def test_viable_design_rejects_meta_prose() -> None:
    junk = (
        "I will now read the required architectural rules and system blueprint "
        "to ensure the design aligns with Empery standards.\n\n"
        "```bash\ncat .cursor/rules/architecture-core.mdc\n```\n"
    )
    assert not is_viable_design_markdown(junk)
    good = (
        "# System Design Document: demo_svc\n\n"
        "## 1. Purpose\n\nDemo service for autonomous tests.\n\n"
        "## 2. Module Anatomy\n\n"
        "services/demo_svc/src/api|core|data|integration\n\n"
        "## 3. Manifest\n\n"
        '{"service_name": "demo_svc", "dependencies": []}\n'
    )
    assert is_viable_design_markdown(good)


def test_enqueue_upgrades_plan_to_evolve_for_new_service(tmp_path: Path) -> None:
    container, _bus, _cfg = make_container(tmp_path)
    uc = container.resolve("eic_reflexes_use_cases")

    async def _run() -> None:
        resp = await uc.enqueue(
            IntentionEnqueueRequest(
                intent="Создание лонгридов для телеграмм канала",
                kind=IntentionKind.PLAN,
                service_name=f"gen_tg_{uuid4().hex[:8]}",
            )
        )
        assert resp.intention.kind == IntentionKind.EVOLVE
        assert resp.intention.metadata.get("requested_kind") == "plan"
        assert resp.intention.metadata.get("resolved_kind") == "evolve"

    asyncio.run(_run())
