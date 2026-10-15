"""Evolve propose → pick contract — structured options via Nervas (production path)."""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from core.errors import ServiceError, StandardizedErrorResponse
from core.integration.nervas import NervasChatRequest, NervasMessage
from core.logging import log_event

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", re.DOTALL)
_SERVICE_RE = re.compile(r"^[a-z][a-z0-9_]{1,62}$")

TouchArea = Literal["api", "db", "ui", "events", "desktop", "manifest", "deploy"]


class EvolveOption(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    delta_summary: str = Field(min_length=1, max_length=4000)
    risk: Literal["low", "medium", "high"] = "medium"
    touches: list[TouchArea] = Field(default_factory=list)

    @field_validator("touches")
    @classmethod
    def _dedupe_touches(cls, value: list[TouchArea]) -> list[TouchArea]:
        seen: set[str] = set()
        out: list[TouchArea] = []
        for item in value:
            if item not in seen:
                seen.add(item)
                out.append(item)
        return out


class EvolveProposeRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    service_name: str = Field(min_length=2, max_length=63)
    intent: str = Field(min_length=1, max_length=20000)
    option_count: int = Field(default=3, ge=2, le=5)

    @field_validator("service_name")
    @classmethod
    def _svc(cls, value: str) -> str:
        if not _SERVICE_RE.fullmatch(value):
            raise ValueError("service_name must match ^[a-z][a-z0-9_]{1,62}$")
        return value


class EvolveProposeResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    proposal_id: str
    service_name: str
    intent: str
    options: list[EvolveOption]
    persisted_path: str | None = None
    backend: str | None = None


def _proposals_dir(workspace: Path) -> Path:
    path = workspace / ".cursor" / "orchestration" / "eic" / "evolve_proposals"
    path.mkdir(parents=True, exist_ok=True)
    return path


def format_selected_option_prompt(option: dict[str, Any] | EvolveOption) -> str:
    if isinstance(option, EvolveOption):
        data = option.model_dump()
    else:
        data = dict(option)
    touches = data.get("touches") or []
    return (
        "## Selected evolve option (operator pick — implement THIS delta)\n\n"
        f"- **id:** `{data.get('id')}`\n"
        f"- **title:** {data.get('title')}\n"
        f"- **risk:** {data.get('risk')}\n"
        f"- **touches:** {', '.join(touches) if touches else '(unspecified)'}\n"
        f"- **delta_summary:** {data.get('delta_summary')}\n\n"
        "Do not invent a competing scope. Freeform intent is context only; "
        "the selected option is authoritative for Architect → Implementer."
    )


def _extract_json_payload(text: str) -> Any:
    raw = text.strip()
    fence = _JSON_FENCE_RE.search(raw)
    if fence:
        raw = fence.group(1).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try to find first object/array
        for start_char, end_char in (("{", "}"), ("[", "]")):
            start = raw.find(start_char)
            end = raw.rfind(end_char)
            if start >= 0 and end > start:
                try:
                    return json.loads(raw[start : end + 1])
                except json.JSONDecodeError:
                    continue
    raise ValueError("Nervas response did not contain parseable JSON options")


def parse_evolve_options(payload: Any, *, option_count: int) -> list[EvolveOption]:
    items: list[Any]
    if isinstance(payload, dict):
        items = list(payload.get("options") or payload.get("variants") or [])
    elif isinstance(payload, list):
        items = payload
    else:
        raise ValueError("options payload must be object or array")
    if not items:
        raise ValueError("no options returned")
    options: list[EvolveOption] = []
    for idx, item in enumerate(items[:option_count]):
        if not isinstance(item, dict):
            continue
        oid = str(item.get("id") or f"opt_{idx + 1}")
        touches_raw = item.get("touches") or []
        touches: list[TouchArea] = []
        if isinstance(touches_raw, list):
            for t in touches_raw:
                tl = str(t).strip().lower()
                if tl in {
                    "api",
                    "db",
                    "ui",
                    "events",
                    "desktop",
                    "manifest",
                    "deploy",
                }:
                    touches.append(tl)  # type: ignore[arg-type]
        risk = str(item.get("risk") or "medium").lower()
        if risk not in {"low", "medium", "high"}:
            risk = "medium"
        options.append(
            EvolveOption(
                id=oid[:64],
                title=str(item.get("title") or f"Option {idx + 1}")[:200],
                delta_summary=str(
                    item.get("delta_summary")
                    or item.get("summary")
                    or item.get("description")
                    or ""
                )[:4000],
                risk=risk,  # type: ignore[arg-type]
                touches=touches,
            )
        )
    if len(options) < 2:
        raise ValueError("need at least 2 structured options")
    return options


def ensure_ui_desktop_touches(
    intent: str, options: list[EvolveOption]
) -> list[EvolveOption]:
    """When operator intent is UI-surface, every option must touch ui+desktop."""
    from services.empery_intelligence_core.src.integration.evolve_verify_touches import (
        is_ui_surface_intent,
    )

    if not is_ui_surface_intent(intent):
        return options
    out: list[EvolveOption] = []
    for opt in options:
        touches = list(opt.touches)
        if "ui" not in touches:
            touches.append("ui")
        if "desktop" not in touches:
            touches.append("desktop")
        out.append(opt.model_copy(update={"touches": touches}))
    return out


def _fallback_options(service_name: str, intent: str, *, n: int) -> list[EvolveOption]:
    """Deterministic offline options when Nervas unavailable (tests / degraded)."""
    base = [
        EvolveOption(
            id="opt_harden",
            title="Harden production gates",
            delta_summary=(
                f"For `{service_name}`: tighten identity gates, health/Nervas readiness, "
                f"and verify paths related to: {intent[:240]}"
            ),
            risk="low",
            touches=["api", "manifest"],
        ),
        EvolveOption(
            id="opt_ux",
            title="Operator UX delta",
            delta_summary=(
                f"Extend ECC/desktop surfaces for `{service_name}` so operators can "
                f"act on: {intent[:240]}"
            ),
            risk="medium",
            touches=["ui", "desktop", "api"],
        ),
        EvolveOption(
            id="opt_events",
            title="EventBus + persistence",
            delta_summary=(
                f"Add durable state / EventBus publishes for `{service_name}` covering: "
                f"{intent[:240]}"
            ),
            risk="high",
            touches=["db", "events", "api", "deploy"],
        ),
    ]
    return base[: max(2, min(n, len(base)))]


class EvolveProposeUseCases:
    def __init__(
        self,
        *,
        workspace: Path,
        nervas_use_cases: Any,
        logger: logging.Logger,
    ) -> None:
        self._workspace = workspace
        self._nervas = nervas_use_cases
        self._logger = logger

    def _service_exists(self, service_name: str) -> bool:
        root = self._workspace / "services" / service_name
        return (root / "manifest.json").is_file()

    async def propose(self, request: EvolveProposeRequest) -> EvolveProposeResponse:
        if not self._service_exists(request.service_name):
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_EVOLVE_SERVICE_MISSING",
                    message=(
                        f"services/{request.service_name}/ missing — use /plan "
                        "or create_service before evolve"
                    ),
                ),
                http_status=404,
            )
        proposal_id = str(uuid.uuid4())
        from services.empery_intelligence_core.src.integration.evolve_verify_touches import (
            is_ui_surface_intent,
        )

        ui_surface = is_ui_surface_intent(request.intent)
        system = (
            "You are Empery Architect proposing evolve options on the production path. "
            "Return ONLY JSON: {\"options\":[{\"id\",\"title\",\"delta_summary\","
            "\"risk\":\"low|medium|high\",\"touches\":[\"api\"|\"db\"|\"ui\"|\"events\""
            "|\"desktop\"|\"manifest\"|\"deploy\"]}]}. "
            f"Exactly {request.option_count} distinct options. No FakeAI, no demo stubs, "
            "no ack: echoes. Options must be implementable against Empery anatomy."
        )
        if ui_surface:
            system += (
                " Operator intent is a visible UI/Desktop delta (tab, JTBD screen, "
                "layout, interface). EVERY option MUST include touches ui and desktop "
                "— never propose api/events-only when the operator asked for a tab/UI."
            )
        user = (
            f"service_name={request.service_name}\n"
            f"operator_intent={request.intent}\n"
            "Propose concrete deltas that improve this existing service."
        )
        options: list[EvolveOption]
        backend: str | None = None
        try:
            chat = await self._nervas.chat(
                NervasChatRequest(
                    messages=[
                        NervasMessage(role="system", content=system),
                        NervasMessage(role="user", content=user),
                    ],
                    temperature=0.35,
                    max_tokens=1200,
                )
            )
            backend_raw = getattr(chat, "backend", None)
            backend = (
                str(backend_raw.value)
                if backend_raw is not None and hasattr(backend_raw, "value")
                else (str(backend_raw) if backend_raw is not None else None)
            )
            content = ""
            if getattr(chat, "message", None) is not None:
                content = str(chat.message.content or "")
            payload = _extract_json_payload(content)
            options = parse_evolve_options(payload, option_count=request.option_count)
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="eic.evolve.propose_fallback",
                message="Nervas propose failed; using deterministic options",
                service_name=request.service_name,
                error=str(exc)[:300],
                level=logging.WARNING,
            )
            options = _fallback_options(
                request.service_name, request.intent, n=request.option_count
            )
            backend = "fallback"

        options = ensure_ui_desktop_touches(request.intent, options)
        persisted = self._persist(
            proposal_id=proposal_id,
            service_name=request.service_name,
            intent=request.intent,
            options=options,
            backend=backend,
        )
        return EvolveProposeResponse(
            proposal_id=proposal_id,
            service_name=request.service_name,
            intent=request.intent,
            options=options,
            persisted_path=str(persisted),
            backend=backend,
        )

    def _persist(
        self,
        *,
        proposal_id: str,
        service_name: str,
        intent: str,
        options: list[EvolveOption],
        backend: str | None,
    ) -> Path:
        path = _proposals_dir(self._workspace) / f"{service_name}_{proposal_id}.json"
        body = {
            "proposal_id": proposal_id,
            "service_name": service_name,
            "intent": intent,
            "backend": backend,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "options": [o.model_dump() for o in options],
        }
        path.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
        return path
