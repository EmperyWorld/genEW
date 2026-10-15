"""Genesis requires snake_case service_name — no unnamed_service fallback."""

from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

import pytest

from core.errors import ServiceError
from services.empery_intelligence_core.src.core.reflexes.models import IntentionKind
from services.empery_intelligence_core.src.data.schemas import IntentionEnqueueRequest
from services.empery_intelligence_core.src.integration.service_scaffold import (
    requires_named_service,
    validate_genesis_service_name,
)
from services.empery_intelligence_core.tests.conftest import make_container


def test_requires_named_for_create_and_evolve() -> None:
    assert requires_named_service(intent="create_service billing", kind="plan")
    assert requires_named_service(intent="создай сервис уведомлений", kind=None)
    assert requires_named_service(intent="tune existing module", kind="evolve")
    assert not requires_named_service(intent="search memory atoms", kind="plan")


def test_validate_rejects_empty_and_unnamed() -> None:
    with pytest.raises(ValueError, match="required"):
        validate_genesis_service_name(None)
    with pytest.raises(ValueError, match="required"):
        validate_genesis_service_name("  ")
    with pytest.raises(ValueError, match="reserved"):
        validate_genesis_service_name("unnamed_service")
    with pytest.raises(ValueError, match="invalid"):
        validate_genesis_service_name("Bad-Name")
    assert validate_genesis_service_name("recipe_probe_svc") == "recipe_probe_svc"


def test_enqueue_rejects_null_service_name_on_genesis(tmp_path: Path) -> None:
    container, _bus, _cfg = make_container(tmp_path)
    uc = container.resolve("eic_reflexes_use_cases")

    async def _run() -> None:
        with pytest.raises(ServiceError) as exc_info:
            await uc.enqueue(
                IntentionEnqueueRequest(
                    intent="create_service genesis probe without name",
                    kind=IntentionKind.EVOLVE,
                    service_name=None,
                )
            )
        err = exc_info.value
        assert err.http_status == 422
        assert err.response.error_code == "EIC_VALIDATION_ERROR"
        assert "service_name" in err.response.message.lower()

    asyncio.run(_run())


def test_enqueue_accepts_named_genesis(tmp_path: Path) -> None:
    container, _bus, _cfg = make_container(tmp_path)
    uc = container.resolve("eic_reflexes_use_cases")
    name = f"probe_{uuid4().hex[:8]}"

    async def _run() -> None:
        resp = await uc.enqueue(
            IntentionEnqueueRequest(
                intent="create_service named genesis probe",
                kind=IntentionKind.EVOLVE,
                service_name=name,
            )
        )
        assert resp.intention.service_name == name

    asyncio.run(_run())
