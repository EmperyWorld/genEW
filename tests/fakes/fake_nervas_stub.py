"""Minimal FakeNervas-compatible stub used when nervas_provider is absent."""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _StubResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    answer: str = ""
    content: str = ""
    summary: str = ""
    backend: str = "fake"
    model: str | None = "fake-nervas-stub"
    raw: dict[str, Any] = Field(default_factory=dict)


class FakeNervasStub:
    """
    Deterministic Nervas-shaped stub for headless loop / CI.

    Returns structured ``eic_actions`` JSON blocks based on role hints in metadata
    or inferred from the system/user prompt text.
    """

    def __init__(self, *, scripted: list[str] | None = None) -> None:
        self._scripted = list(scripted or [])
        self._calls = 0

    async def health(self) -> Any:
        return type("H", (), {"ready": True, "backend": "fake", "detail": "stub"})()

    async def reason(self, request: Any) -> _StubResponse:
        return self._respond(request)

    async def chat(self, request: Any) -> Any:
        body = self._respond(request)
        return type(
            "Chat",
            (),
            {
                "message": type("M", (), {"role": "assistant", "content": body.answer})(),
                "backend": "fake",
                "model": "fake-nervas-stub",
                "raw": {},
            },
        )()

    async def plan(self, request: Any) -> Any:
        body = self._respond(request)
        return type(
            "Plan",
            (),
            {
                "summary": body.summary or body.answer[:200],
                "steps": [
                    type(
                        "S",
                        (),
                        {
                            "id": "1",
                            "title": "plan",
                            "role": "architect",
                            "acceptance": None,
                            "depends_on": [],
                        },
                    )()
                ],
                "backend": "fake",
                "model": "fake-nervas-stub",
                "raw": {"content": body.answer},
            },
        )()

    async def generate(self, request: Any) -> _StubResponse:
        return self._respond(request)

    def _respond(self, request: Any) -> _StubResponse:
        self._calls += 1
        if self._scripted:
            text = self._scripted.pop(0)
            return _StubResponse(answer=text, content=text, summary=text[:120])

        meta = getattr(request, "metadata", None) or {}
        if isinstance(meta, dict) and "eic_scripted_content" in meta:
            text = str(meta["eic_scripted_content"])
            return _StubResponse(answer=text, content=text, summary=text[:120])

        role = ""
        if isinstance(meta, dict) and meta.get("role"):
            role = str(meta["role"]).lower()
        context = str(getattr(request, "context", "") or "").lower()
        if not role and context.startswith("role="):
            role = context.split("=", 1)[1].strip()

        service = "demo_service"
        for attr in ("question", "context", "prompt", "intention"):
            raw = getattr(request, attr, None)
            if not isinstance(raw, str):
                continue
            try:
                payload = json.loads(raw)
                if isinstance(payload, dict) and payload.get("service_name"):
                    service = str(payload["service_name"])
                    break
            except Exception:  # noqa: BLE001
                continue

        if role in {"verifier", "verify"}:
            report = (
                f"# Verify\n\nPASSED\n\n```json\n"
                f'{{\n  "eic_actions": [\n'
                f'    {{"op": "write", "path": "reports/{service}_verify.md", '
                f'"content": "# Verify\\n\\nPASSED\\n"}}\n'
                f"  ],\n  \"verify_status\": \"PASSED\"\n}}\n```"
            )
            return _StubResponse(answer=report, content=report, summary="PASSED")

        if role in {"implementer", "implement", "fix"}:
            body = (
                f"Implemented scaffold for {service}.\n\n```json\n"
                f'{{\n  "eic_actions": [\n'
                f'    {{"op": "write", "path": "reports/proposal_{service}.py", '
                f'"content": "# stub implement\\n"}}\n'
                f"  ]\n}}\n```"
            )
            return _StubResponse(answer=body, content=body, summary="implemented")

        # Architect / plan default (also when role missing)
        design_md = (
            f"# System Design Document: {service}\n\n"
            f"## 1. Purpose\n\nAutonomous plan for intention.\n\n"
            f"## 2. Module Anatomy\n\n"
            f"services/{service}/src/api|core|data|integration\n\n"
            f"## 3. Manifest\n\n"
            f'{{"service_name": "{service}", "version": "0.1.0"}}\n'
        )
        design_json = json.dumps({"service_name": service, "version": "0.1.0"})
        body = (
            f"{design_md}\n```json\n"
            f'{{\n  "eic_actions": [\n'
            f'    {{"op": "write", "path": "designs/{service}_design.md", '
            f'"content": {json.dumps(design_md)}}},\n'
            f'    {{"op": "write", "path": "designs/{service}_design.json", '
            f'"content": {json.dumps(design_json)}}}\n'
            f"  ]\n}}\n```"
        )
        return _StubResponse(answer=body, content=body, summary=f"planned {service}")
