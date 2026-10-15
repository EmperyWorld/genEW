"""Headless Agent Loop — Plan → Implement → Verify via LLM role prompts."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any, Literal, TypeVar
from uuid import UUID

from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event, EventBus
from core.logging import log_event

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.core.reflexes import events as ev
from services.empery_intelligence_core.src.core.reflexes.lifecycle import (
    entry_stage_for,
    role_for_stage,
    should_skip_plan,
)
from services.empery_intelligence_core.src.core.reflexes.models import (
    AgentRole,
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopStage,
    RoleTurnRecord,
)
from services.empery_intelligence_core.src.data.intention_store import IntentionStore
from services.empery_intelligence_core.src.integration.prompt_templates import (
    PromptTemplateLoader,
)
from services.empery_intelligence_core.src.integration.service_scaffold import (
    is_viable_design_markdown,
)

_EIC_ACTIONS_RE = re.compile(
    r"```(?:json)?\s*(\{.*?\})\s*```",
    re.DOTALL | re.IGNORECASE,
)
_BARE_EIC_ACTIONS_RE = re.compile(
    r"\{\s*\"eic_actions\"\s*:\s*\[.*?\]\s*(?:,\s*\"verify_status\"\s*:\s*\"[^\"]+\")?\s*\}",
    re.DOTALL,
)
_TOOL_CALL_RE = re.compile(
    r"tool_call\s*\(\s*([a-zA-Z_][\w]*)\s*,\s*(\{.*?\})\s*\)",
    re.DOTALL,
)
# Qwen3: <tool_call>\n{"name": "...", "arguments": {...}}\n</tool_call>
_QWEN_TOOL_CALL_RE = re.compile(
    r"<tool_call>\s*(\{.*?\})\s*</tool_call>",
    re.DOTALL | re.IGNORECASE,
)
# Gemma 4: <|tool_call>call:name{key:value…}<tool_call|>
_GEMMA_TOOL_CALL_RE = re.compile(
    r"<\|tool_call>call:([A-Za-z_][\w]*)\{(.*?)}<tool_call\|>",
    re.DOTALL,
)
_GEMMA_STR_RE = re.compile(r"""<\|"\|>(.*?)<\|"\|>""", re.DOTALL)

_T = TypeVar("_T")


def _parse_gemma_arg_blob(blob: str) -> dict[str, Any]:
    """Parse Gemma format_argument blob: key:<|"|>str<|"|>,key:123,…"""
    out: dict[str, Any] = {}
    s = blob.strip()
    if not s:
        return out
    # Prefer JSON if the model emitted it inside braces.
    if s.startswith("{") and s.endswith("}"):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    i = 0
    n = len(s)
    while i < n:
        while i < n and (s[i].isspace() or s[i] == ","):
            i += 1
        if i >= n:
            break
        key_start = i
        while i < n and (s[i].isalnum() or s[i] in {"_", "-"}):
            i += 1
        key = s[key_start:i]
        while i < n and s[i].isspace():
            i += 1
        if i >= n or s[i] != ":":
            break
        i += 1
        while i < n and s[i].isspace():
            i += 1
        if i >= n:
            break
        if s.startswith('<|"|>', i):
            m = _GEMMA_STR_RE.match(s, i)
            if not m:
                break
            out[key] = m.group(1)
            i = m.end()
            continue
        if s[i] == "{":
            depth = 0
            j = i
            while j < n:
                if s[j] == "{":
                    depth += 1
                elif s[j] == "}":
                    depth -= 1
                    if depth == 0:
                        j += 1
                        break
                j += 1
            nested = s[i:j]
            try:
                out[key] = json.loads(nested)
            except json.JSONDecodeError:
                out[key] = _parse_gemma_arg_blob(nested.strip("{}"))
            i = j
            continue
        if s[i] == "[":
            depth = 0
            j = i
            while j < n:
                if s[j] == "[":
                    depth += 1
                elif s[j] == "]":
                    depth -= 1
                    if depth == 0:
                        j += 1
                        break
                j += 1
            try:
                out[key] = json.loads(s[i:j])
            except json.JSONDecodeError:
                out[key] = s[i:j]
            i = j
            continue
        if s.startswith("true", i) and (i + 4 >= n or not s[i + 4].isalnum()):
            out[key] = True
            i += 4
            continue
        if s.startswith("false", i) and (i + 5 >= n or not s[i + 5].isalnum()):
            out[key] = False
            i += 5
            continue
        if s.startswith("null", i) and (i + 4 >= n or not s[i + 4].isalnum()):
            out[key] = None
            i += 4
            continue
        # number or bare token until comma
        j = i
        while j < n and s[j] != ",":
            j += 1
        token = s[i:j].strip()
        try:
            if "." in token:
                out[key] = float(token)
            else:
                out[key] = int(token)
        except ValueError:
            out[key] = token
        i = j
    return out


def _actions_from_native_tool_markup(text: str) -> list[dict[str, Any]]:
    """Qwen XML + Gemma 4 native tool_call markup → eic action dicts."""
    found: list[dict[str, Any]] = []
    for match in _QWEN_TOOL_CALL_RE.finditer(text):
        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict):
            continue
        name = payload.get("name") or payload.get("op")
        args = payload.get("arguments") or payload.get("args") or {}
        if not isinstance(args, dict):
            args = {}
        if name:
            found.append({"op": str(name), **args})
    for match in _GEMMA_TOOL_CALL_RE.finditer(text):
        name, blob = match.group(1), match.group(2)
        args = _parse_gemma_arg_blob(blob)
        found.append({"op": name, **args})
    return found


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def accumulate_eic_action_stats(
    meta: dict[str, Any], action_stats: dict[str, Any] | None
) -> None:
    """Merge per-role workspace stats into intention metadata.

    Each role turn calls ``WorkspaceToolAdapter.reset_stats()``. Replacing
    ``eic_action_stats`` with the Verifier's all-zero snapshot wiped Implement
    ``extract_adapt`` counts while atom files remained on disk (P12 audit debt).
    """
    if not action_stats:
        return
    prior_stats = meta.get("eic_action_stats")
    prior_map = prior_stats if isinstance(prior_stats, dict) else {}
    merged_stats: dict[str, int] = {}
    for key in set(prior_map) | set(action_stats):
        merged_stats[key] = int(prior_map.get(key, 0) or 0) + int(
            action_stats.get(key, 0) or 0
        )
    if any(int(v or 0) for v in action_stats.values()) or any(
        int(v or 0) for v in prior_map.values()
    ):
        meta["eic_action_stats"] = merged_stats
    meta["eic_write_file_count"] = int(meta.get("eic_write_file_count", 0)) + int(
        action_stats.get("write_file", 0) or 0
    )
    meta["eic_scaffold_count"] = int(meta.get("eic_scaffold_count", 0)) + int(
        action_stats.get("scaffold", 0) or 0
    )
    meta["eic_extract_adapt_count"] = int(
        meta.get("eic_extract_adapt_count", 0)
    ) + int(action_stats.get("extract_adapt", 0) or 0)


def _assembly_tool_names_from_result(result: Any) -> list[str]:
    """Native emit_* names from Nervas raw tool_calls (empty if prose-only)."""
    from core.integration.assembly_contracts import (
        EMIT_BLUEPRINT_TOOL,
        EMIT_MANIFEST_TOOL,
    )

    allowed = {EMIT_BLUEPRINT_TOOL, EMIT_MANIFEST_TOOL}
    names: list[str] = []
    raw = getattr(result, "raw", None)
    if not isinstance(raw, dict):
        return names
    choices = raw.get("choices")
    messages: list[dict[str, Any]] = []
    if isinstance(choices, list):
        for choice in choices:
            if isinstance(choice, dict) and isinstance(choice.get("message"), dict):
                messages.append(choice["message"])
    if isinstance(raw.get("message"), dict):
        messages.append(raw["message"])
    for msg in messages:
        for tc in msg.get("tool_calls") or []:
            if not isinstance(tc, dict):
                continue
            fn = tc.get("function") if isinstance(tc.get("function"), dict) else tc
            name = str((fn or {}).get("name") or tc.get("name") or "").strip()
            if name in allowed and name not in names:
                names.append(name)
    return names


def _extract_text(result: Any) -> str:
    for attr in ("answer", "content", "summary"):
        val = getattr(result, attr, None)
        if isinstance(val, str) and val:
            return val
    message = getattr(result, "message", None)
    if message is not None:
        content = getattr(message, "content", None)
        if isinstance(content, str):
            return content
    # OpenAI-style tool_calls on message / raw
    tool_actions = _actions_from_tool_calls(result)
    if tool_actions:
        return json.dumps({"eic_actions": tool_actions})
    raw = getattr(result, "raw", None)
    if isinstance(raw, dict):
        if isinstance(raw.get("content"), str):
            return raw["content"]
        embedded = _actions_from_openai_dict(raw)
        if embedded:
            return json.dumps({"eic_actions": embedded})
    return str(result)


def _actions_from_tool_calls(result: Any) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for attr in ("tool_calls", "actions", "eic_actions"):
        raw = getattr(result, attr, None)
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, dict):
                    actions.append(_normalize_tool_dict(item))
                else:
                    name = getattr(item, "name", None) or getattr(item, "op", None)
                    args = getattr(item, "arguments", None) or getattr(
                        item, "args", None
                    )
                    if name:
                        payload = {"op": str(name)}
                        if isinstance(args, dict):
                            payload.update(args)
                        elif isinstance(args, str):
                            try:
                                parsed = json.loads(args)
                                if isinstance(parsed, dict):
                                    payload.update(parsed)
                            except json.JSONDecodeError:
                                payload["content"] = args
                        actions.append(payload)
    message = getattr(result, "message", None)
    if message is not None:
        actions.extend(_actions_from_tool_calls(message))
    return [a for a in actions if a]


def _actions_from_openai_dict(raw: dict[str, Any]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    choices = raw.get("choices")
    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            msg = choice.get("message") or {}
            if isinstance(msg, dict):
                for tc in msg.get("tool_calls") or []:
                    if isinstance(tc, dict):
                        actions.append(_normalize_tool_dict(tc))
    for tc in raw.get("tool_calls") or []:
        if isinstance(tc, dict):
            actions.append(_normalize_tool_dict(tc))
    return actions


def _normalize_tool_dict(item: dict[str, Any]) -> dict[str, Any]:
    if "op" in item or "type" in item or "eic_actions" in item:
        return item
    fn = item.get("function") if isinstance(item.get("function"), dict) else None
    name = item.get("name") or (fn or {}).get("name") or item.get("op")
    args_raw = item.get("arguments") or (fn or {}).get("arguments") or item.get("args")
    payload: dict[str, Any] = {"op": str(name or "write_file")}
    if isinstance(args_raw, dict):
        payload.update(args_raw)
    elif isinstance(args_raw, str) and args_raw.strip():
        try:
            parsed = json.loads(args_raw)
            if isinstance(parsed, dict):
                payload.update(parsed)
            else:
                payload["content"] = args_raw
        except json.JSONDecodeError:
            payload["content"] = args_raw
    for key in ("path", "content", "relative_path", "body", "service_name"):
        if key in item and key not in payload:
            payload[key] = item[key]
    return payload


def parse_eic_actions(text: str) -> tuple[list[dict[str, Any]], str | None]:
    """Parse fenced/bare JSON eic_actions, tool_call(), Qwen XML, Gemma native."""
    verify_status: str | None = None
    actions: list[dict[str, Any]] = []

    def _ingest_payload(payload: dict[str, Any]) -> None:
        nonlocal verify_status
        if isinstance(payload.get("eic_actions"), list):
            actions.extend(
                a for a in payload["eic_actions"] if isinstance(a, dict)
            )
        if payload.get("verify_status") in {"PASSED", "FAILED", "UNKNOWN"}:
            verify_status = payload["verify_status"]
        # Single action object
        if "op" in payload or "type" in payload:
            actions.append(payload)

    for match in _EIC_ACTIONS_RE.finditer(text):
        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            _ingest_payload(payload)

    if not actions:
        for match in _BARE_EIC_ACTIONS_RE.finditer(text):
            try:
                payload = json.loads(match.group(0))
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                _ingest_payload(payload)

    for match in _TOOL_CALL_RE.finditer(text):
        name, raw_args = match.group(1), match.group(2)
        try:
            args = json.loads(raw_args)
        except json.JSONDecodeError:
            continue
        if isinstance(args, dict):
            actions.append({"op": name, **args})

    for native in _actions_from_native_tool_markup(text):
        actions.append(native)

    if verify_status is None:
        upper = text.upper()
        # Ignore ABORTED / "will not issue" prose — deterministic gates decide.
        if re.search(r"\bPASSED\b", upper) and not re.search(r"\bFAILED\b", upper):
            verify_status = "PASSED"
        elif re.search(r"\bFAILED\b", upper) and not re.search(
            r"\bABORTED\b", upper
        ):
            verify_status = "FAILED"
    return actions, verify_status


def authoritative_verify_summary(
    status: str,
    *,
    anatomy_detail: str | None = None,
    live_detail: str | None = None,
    ui_detail: str | None = None,
    desktop_detail: str | None = None,
    factory_detail: str | None = None,
    delta_detail: str | None = None,
    contract_detail: str | None = None,
    gate_t_detail: str | None = None,
    gate_s_detail: str | None = None,
    gate_s_status: str | None = None,
    gate_s_violation: str | None = None,
    llm_narrative: str = "",
) -> tuple[str, str]:
    """Build report body + short role_summary where deterministic status wins."""
    from services.empery_intelligence_core.src.integration.service_factory_gates import (
        normalize_verify_status,
    )

    status = normalize_verify_status(status)
    blocks = [
        f"**Authoritative verify_status:** {status}",
        "",
        "Deterministic gates (anatomy / factory / Gate T / Gate C / UI / desktop / "
        "evolve delta / live / registry) override LLM prose. "
        "PASSED ⇔ Gate T ∧ Gate C ∧ Gate S when config_driven. "
        "FAILED S with T∧C PASSED still fails the job (authoritative). "
        "DEMO_PASSED is never accepted.",
    ]
    if anatomy_detail:
        blocks.extend(["", "## Deterministic anatomy", anatomy_detail.strip()])
    if factory_detail:
        blocks.extend(["", "## Factory DoD", factory_detail.strip()])
    if gate_t_detail:
        blocks.extend(["", "## Assembly Gate T (hash freeze)", gate_t_detail.strip()])
    if contract_detail:
        blocks.extend(["", "## Assembly Gate C (contract)", contract_detail.strip()])
    if gate_s_detail or gate_s_violation or gate_s_status == "FAILED":
        s_body = (gate_s_detail or "").strip()
        if gate_s_status == "FAILED" and gate_s_violation:
            s_body = (
                f"**violation:** {gate_s_violation.strip()}\n\n{s_body}"
                if s_body
                else f"**violation:** {gate_s_violation.strip()}"
            )
        elif gate_s_status == "FAILED" and s_body and "violation" not in s_body.lower():
            s_body = f"**violation:** {s_body}"
        if not s_body and gate_s_status == "FAILED":
            s_body = "**violation:** Gate S FAILED (no detail from judge/heuristic)"
        blocks.extend(["", "## Assembly Gate S (semantic judge)", s_body])
    if ui_detail:
        blocks.extend(["", "## Deterministic UI", ui_detail.strip()])
    if desktop_detail:
        blocks.extend(["", "## Deterministic desktop", desktop_detail.strip()])
    if delta_detail:
        blocks.extend(["", "## Evolve delta", delta_detail.strip()])
    if live_detail:
        blocks.extend(["", "## Live presence", live_detail.strip()])
    narrative = (llm_narrative or "").strip()
    if narrative:
        blocks.extend(
            [
                "",
                "## LLM narrative (non-authoritative)",
                narrative,
            ]
        )
    body = "\n".join(blocks).strip() + "\n"
    return body, f"verify_status={status}"


def _is_retryable_nervas_error(exc: ServiceError) -> bool:
    """True when Hands should pause (resume later) instead of hard-fail the job.

    llama.cpp ReadTimeout / ConnectError raise NERVAS_BACKEND_UNAVAILABLE with
    message \"Local llama.cpp backend unreachable\" — that must not archive as
    failed while the brain is only temporarily busy.
    """
    code = str(exc.response.error_code or "").upper()
    msg = str(exc.response.message or "").lower()
    details = str(exc.response.details or "").lower()
    if code == "NERVAS_BACKEND_UNAVAILABLE":
        return True
    if msg == "nervas_unavailable":
        return True
    if "unreachable" in msg and "llama" in msg:
        return True
    if code == "EIC_LOOP_ERROR" and (
        "nervas" in details or "llama" in details or "nervas" in msg
    ):
        return True
    return False


class HeadlessAgentLoop:
    """Orchestrates role turns with checkpoint persistence and resume."""

    def __init__(
        self,
        store: IntentionStore,
        prompts: PromptTemplateLoader,
        nervas: Any,
        workspace: Any,
        memory_hooks: Any,
        ecc_bridge: Any,
        event_bus: EventBus,
        config: ServiceConfig,
        logger: logging.Logger,
        context_pack: Any | None = None,
    ) -> None:
        self._store = store
        self._prompts = prompts
        self._nervas = nervas
        self._workspace = workspace
        self._memory = memory_hooks
        self._context_pack = context_pack
        self._ecc = ecc_bridge
        self._bus = event_bus
        self._config = config
        self._logger = logger
        self._pause_requested: set[UUID] = set()
        self._cancel_requested: set[UUID] = set()

    def request_pause(self, intention_id: UUID) -> None:
        self._pause_requested.add(intention_id)

    def request_cancel(self, intention_id: UUID) -> None:
        self._cancel_requested.add(intention_id)

    def _job_is_config_driven(self, service: str, intention: Any) -> bool:
        """True when Blueprint/design/profile require Configuration-Driven Assembly."""
        from core.integration.assembly_contracts import (
            is_config_driven_profile,
        )

        meta = dict(intention.metadata or {})
        profile = meta.get("scaffold_profile")
        if isinstance(profile, str) and is_config_driven_profile(profile):
            return True
        if meta.get("assembly_mode") == "config_driven":
            return True
        paths = getattr(self._workspace, "_paths", None)
        if paths is None:
            return False
        import json

        bp = paths.designs_root / f"{service}_blueprint.json"
        if bp.is_file():
            try:
                data = json.loads(bp.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    if data.get("assembly_mode") == "config_driven":
                        return True
                    if is_config_driven_profile(str(data.get("scaffold_profile") or "")):
                        return True
            except (OSError, json.JSONDecodeError):
                pass
        design = paths.designs_root / f"{service}_design.json"
        if design.is_file():
            try:
                data = json.loads(design.read_text(encoding="utf-8"))
                asm = data.get("assembly") if isinstance(data, dict) else None
                if isinstance(asm, dict):
                    if asm.get("assembly_mode") == "config_driven":
                        return True
                    if is_config_driven_profile(str(asm.get("scaffold_profile") or "")):
                        return True
            except (OSError, json.JSONDecodeError):
                pass
        # Intent heuristic for Create ops_dashboard before design exists.
        from services.empery_intelligence_core.src.integration.recipe_catalog import (
            resolve_assembly_selection,
        )

        try:
            sel = resolve_assembly_selection(
                paths,
                service_name=service,
                intent=intention.intent,
            )
            return is_config_driven_profile(sel.scaffold_profile)
        except Exception:
            return False

    async def _run_blocking(
        self,
        fn: Callable[..., _T],
        /,
        *args: Any,
        **kwargs: Any,
    ) -> _T:
        """Run sync workspace/deploy I/O off the asyncio event loop (P7.1)."""
        return await asyncio.to_thread(fn, *args, **kwargs)

    async def _run_blocking_timed(
        self,
        fn: Callable[..., _T],
        /,
        *args: Any,
        timeout_s: float,
        error_code: str,
        message: str,
        **kwargs: Any,
    ) -> _T:
        """Offload sync work with a hard budget — TimeoutError → ServiceError FAILED (P7.2)."""
        try:
            return await asyncio.wait_for(
                self._run_blocking(fn, *args, **kwargs),
                timeout=timeout_s,
            )
        except TimeoutError as exc:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code=error_code,
                    message=message,
                    details={"timeout_s": timeout_s},
                ),
                http_status=504,
            ) from exc

    async def _publish(self, name: str, payload: dict[str, Any]) -> None:
        await self._bus.publish(Event(name=name, payload=payload))
        mirror = ev.job_mirror_payload(name, payload)
        if mirror is not None:
            mapped = ev.INTENTION_TO_JOB[name]
            await self._bus.publish(Event(name=mapped, payload=mirror))
        if self._ecc is not None:
            try:
                await self._ecc.on_intention_event(name, payload)
            except Exception as exc:  # noqa: BLE001
                log_event(
                    self._logger,
                    event="eic.loop.bridge_error",
                    message="ECC bridge failed",
                    level=logging.WARNING,
                    error=str(exc),
                )

    async def _persist(self, intention: Intention) -> Intention:
        return await self._store.save(intention)

    async def _set_stage(
        self,
        intention: Intention,
        stage: LoopStage,
        *,
        role: AgentRole | None = None,
        **checkpoint_updates: Any,
    ) -> Intention:
        from_stage = intention.checkpoint.stage
        now = _utc_now()
        updates = {
            "stage": stage,
            "role": role if role is not None else role_for_stage(stage),
            "updated_at": now,
            **checkpoint_updates,
        }
        cp = intention.checkpoint.model_copy(update=updates)
        intention = intention.model_copy(
            update={"checkpoint": cp, "updated_at": now}
        )
        intention = await self._persist(intention)
        if from_stage != stage:
            await self._publish(
                ev.INTENTION_STAGE_CHANGED,
                {
                    "intention_id": str(intention.id),
                    "from_stage": from_stage.value,
                    "to_stage": stage.value,
                    "attempt": intention.checkpoint.attempt,
                    "ecc_job_id": str(intention.ecc_job_id)
                    if intention.ecc_job_id
                    else None,
                },
            )
        return intention

    async def _call_nervas(
        self,
        bundle: Any,
        *,
        role: AgentRole,
        tools: list[dict[str, Any]] | None = None,
    ) -> tuple[str, str | None, list[str]]:
        from core.integration.nervas import (
            NervasChatRequest,
            NervasGenerateRequest,
            NervasMessage,
            NervasReasonRequest,
        )

        system = (
            f"{bundle.system_prompt}\n\n{bundle.skill_addendum}\n\n"
            f"{bundle.rules_digest}"
        )
        # Prefer typed Nervas contracts; fall back to duck-typed adapters.
        content = ""
        provider = None
        tool_names: list[str] = []
        try:
            # Config-driven assembly: native tools + thinking on chat
            # (Arli pattern). Skip freeform-only reason when tools are set.
            if tools and hasattr(self._nervas, "chat"):
                req = NervasChatRequest(
                    messages=[
                        NervasMessage(role="system", content=system),
                        NervasMessage(role="user", content=bundle.user_payload),
                    ],
                    tools=tools,
                    tool_choice="auto",
                    enable_thinking=True,
                    preserve_thinking=True,
                    metadata={
                        "role": role.value,
                        "prompt_hash": bundle.prompt_hash,
                        "assembly_tools": True,
                    },
                )
                result = await self._nervas.chat(req)
                content = _extract_text(result)
                provider = getattr(result, "backend", None)
                tool_names = _assembly_tool_names_from_result(result)
            elif hasattr(self._nervas, "reason"):
                req = NervasReasonRequest(
                    question=bundle.user_payload,
                    context=f"role={role.value}",
                    system=system,
                    metadata={"role": role.value, "prompt_hash": bundle.prompt_hash},
                )
                result = await self._nervas.reason(req)
                content = _extract_text(result)
                provider = getattr(result, "backend", None) or getattr(
                    result, "model", None
                )
            elif hasattr(self._nervas, "chat"):
                req = NervasChatRequest(
                    messages=[
                        NervasMessage(role="system", content=system),
                        NervasMessage(role="user", content=bundle.user_payload),
                    ],
                    metadata={"role": role.value},
                )
                result = await self._nervas.chat(req)
                content = _extract_text(result)
                provider = getattr(result, "backend", None)
            elif hasattr(self._nervas, "generate"):
                req = NervasGenerateRequest(
                    prompt=bundle.user_payload,
                    system=system,
                )
                result = await self._nervas.generate(req)
                content = _extract_text(result)
                provider = getattr(result, "backend", None)
            else:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_LOOP_ERROR",
                        message="nervas_unavailable",
                        details={"reason": "no reason/chat/generate methods"},
                    ),
                    http_status=503,
                )
        except ServiceError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_LOOP_ERROR",
                    message="nervas_unavailable",
                    details={"reason": str(exc)},
                ),
                http_status=503,
            ) from exc
        return content, str(provider) if provider else None, tool_names

    async def run(self, intention: Intention) -> Intention:
        """Execute loop from current checkpoint until done / pause / fail."""
        if intention.status != IntentionStatus.RUNNING:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_INVALID_TRANSITION",
                    message="Loop requires running intention",
                    details={"status": intention.status.value},
                ),
                http_status=409,
            )

        # Advance from queued to entry stage (or resume mid-stage)
        stage = intention.checkpoint.stage
        if stage == LoopStage.QUEUED:
            stage = entry_stage_for(intention.kind)
            # Resume idempotency: skip plan if design already present
            if should_skip_plan(
                design_path=intention.checkpoint.design_path, stage=stage
            ):
                stage = LoopStage.IMPLEMENT
            intention = await self._set_stage(intention, stage)

        # If resuming at plan but design exists and kind is evolve, skip to implement
        if (
            intention.checkpoint.stage == LoopStage.PLAN
            and should_skip_plan(
                design_path=intention.checkpoint.design_path,
                stage=LoopStage.IMPLEMENT,
            )
            and intention.kind == IntentionKind.EVOLVE
        ):
            intention = await self._set_stage(intention, LoopStage.IMPLEMENT)

        while (
            intention.status == IntentionStatus.RUNNING
            and intention.checkpoint.stage != LoopStage.DONE
        ):
            if intention.id in self._cancel_requested:
                self._cancel_requested.discard(intention.id)
                return await self._store.cancel(intention.id)

            if intention.id in self._pause_requested:
                self._pause_requested.discard(intention.id)
                paused = await self._store.pause(intention.id, reason="pause_requested")
                await self._publish(
                    ev.INTENTION_PAUSED,
                    {
                        "intention_id": str(paused.id),
                        "reason": "pause_requested",
                        "stage": paused.checkpoint.stage.value,
                        "ecc_job_id": str(paused.ecc_job_id)
                        if paused.ecc_job_id
                        else None,
                    },
                )
                return paused

            stage = intention.checkpoint.stage
            role = role_for_stage(stage)
            if role is None:
                break

            try:
                intention = await self._run_role_turn(intention, role=role, stage=stage)
            except ServiceError as exc:
                if _is_retryable_nervas_error(exc):
                    paused = await self._store.pause(
                        intention.id, reason="nervas_unavailable"
                    )
                    await self._publish(
                        ev.INTENTION_PAUSED,
                        {
                            "intention_id": str(paused.id),
                            "reason": "nervas_unavailable",
                            "error_code": exc.response.error_code,
                            "stage": paused.checkpoint.stage.value,
                            "ecc_job_id": str(paused.ecc_job_id)
                            if paused.ecc_job_id
                            else None,
                        },
                    )
                    return paused
                failed = await self._store.fail(
                    intention.id, error_message=exc.response.message
                )
                await self._publish(
                    ev.INTENTION_FAILED,
                    {
                        "intention_id": str(failed.id),
                        "error_message": failed.error_message,
                        "stage": failed.checkpoint.stage.value,
                        "ecc_job_id": str(failed.ecc_job_id)
                        if failed.ecc_job_id
                        else None,
                    },
                )
                return failed

            intention = await self._advance_after_role(intention)

        if (
            intention.status == IntentionStatus.RUNNING
            and intention.checkpoint.stage == LoopStage.DONE
        ):
            done = await self._store.complete(
                intention.id,
                result_summary=intention.checkpoint.role_summary or "completed",
            )
            await self._publish(
                ev.INTENTION_COMPLETED,
                {
                    "intention_id": str(done.id),
                    "artifact_paths": list(done.checkpoint.artifact_paths),
                    "result_summary": done.result_summary,
                    "ecc_job_id": str(done.ecc_job_id) if done.ecc_job_id else None,
                },
            )
            return done
        return intention

    async def _run_role_turn(
        self,
        intention: Intention,
        *,
        role: AgentRole,
        stage: LoopStage,
    ) -> Intention:
        include_evolve = (
            intention.kind == IntentionKind.EVOLVE
            and stage == LoopStage.PLAN
            and not intention.history
        )
        # Inject memory atoms into prompt metadata (Architect/Implementer/Verifier).
        if self._context_pack is not None and role in {
            AgentRole.ARCHITECT,
            AgentRole.IMPLEMENTER,
            AgentRole.VERIFIER,
        }:
            try:
                pack = await self._context_pack.build_context(
                    query=intention.intent,
                    stage=stage.value,
                    service_name=intention.service_name,
                    limit=6,
                    token_budget=3500,
                )
                formatted = getattr(pack, "formatted_context", "") or ""
                if formatted.strip():
                    meta = dict(intention.metadata or {})
                    meta["_memory_context"] = formatted
                    intention = intention.model_copy(update={"metadata": meta})
            except Exception as exc:  # noqa: BLE001 — best-effort
                log_event(
                    self._logger,
                    event="eic.loop.memory_context_failed",
                    message="Context pack injection failed",
                    level=logging.WARNING,
                    error=str(exc)[:240],
                    intention_id=str(intention.id),
                )
        bundle = self._prompts.build(
            role, intention, include_evolve_addendum=include_evolve
        )
        # Checkpoint before LLM call
        intention = await self._set_stage(
            intention,
            stage,
            role=role,
        )
        await self._publish(
            ev.LOOP_ROLE_STARTED,
            {
                "intention_id": str(intention.id),
                "role": role.value,
                "stage": stage.value,
                "prompt_hash": bundle.prompt_hash,
            },
        )
        started = _utc_now()
        # Resolve service early so config_driven can attach assembly tools
        # before the Nervas call (Blueprint owns ids — Arli-style tool emit).
        from services.empery_intelligence_core.src.integration.service_scaffold import (
            is_create_service_intention,
            requires_named_service,
            validate_genesis_service_name,
        )

        need_named = requires_named_service(
            intent=intention.intent,
            kind=intention.kind.value if intention.kind else None,
        ) or is_create_service_intention(
            intent=intention.intent,
            service_name=intention.service_name,
            kind=intention.kind.value if intention.kind else None,
        )
        if need_named:
            try:
                service = validate_genesis_service_name(intention.service_name)
            except ValueError as exc:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_VALIDATION_ERROR",
                        message=str(exc),
                        details={"intention_id": str(intention.id)},
                    ),
                    http_status=422,
                ) from exc
        else:
            service = (intention.service_name or "").strip()
            if not service:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_VALIDATION_ERROR",
                        message=(
                            "service_name required for agent loop artifacts — "
                            "unnamed_service fallback removed"
                        ),
                        details={"intention_id": str(intention.id)},
                    ),
                    http_status=422,
                )

        config_driven = self._job_is_config_driven(service, intention)
        assembly_tools: list[dict[str, Any]] | None = None
        if config_driven and role in {AgentRole.ARCHITECT, AgentRole.IMPLEMENTER}:
            from core.integration.assembly_contracts import openai_assembly_tools

            assembly_tools = openai_assembly_tools(role=role.value) or None

        content, provider, tool_names = await self._call_nervas(
            bundle, role=role, tools=assembly_tools
        )
        actions, verify_status = parse_eic_actions(content)

        if hasattr(self._workspace, "reset_stats"):
            self._workspace.reset_stats()

        if config_driven and hasattr(self._workspace, "config_driven_active"):
            self._workspace.config_driven_active = True

        written: list[str] = []
        assembly_ran = False
        if (
            role == AgentRole.IMPLEMENTER
            and config_driven
            and service
            and hasattr(self._workspace, "persist_assembly_manifest")
            and hasattr(self._workspace, "run_config_driven_assembler")
        ):
            # Configuration-Driven: Manifest → Assembler first; LLM cannot own code.
            if hasattr(self._workspace, "ensure_blueprint_json"):
                bp_ensured = await self._run_blocking(
                    self._workspace.ensure_blueprint_json,
                    service,
                    intent=intention.intent,
                    require_config_driven=True,
                )
                if bp_ensured:
                    written.append(bp_ensured)
            mf_path = await self._run_blocking(
                self._workspace.persist_assembly_manifest,
                service,
                implementer_content=content,
            )
            if mf_path:
                written.append(mf_path)
            meta_in = dict(intention.metadata or {})
            meta_profile = meta_in.get("scaffold_profile")
            skip_extract = bool(meta_in.get("eic_skip_mechanical_extract"))
            if intention.kind == IntentionKind.EVOLVE and service:
                from services.empery_intelligence_core.src.integration.evolve_delta_gate import (
                    snapshot_evolve_baseline,
                )

                root = getattr(self._workspace, "_paths", None)
                ws_root = (
                    root.workspace_root.resolve() if root is not None else None
                )
                if ws_root is not None:
                    meta_in = snapshot_evolve_baseline(ws_root, service, meta_in)
                    intention = intention.model_copy(update={"metadata": meta_in})
            # So Assembler can stamp evolve mount + re-freeze before Gate T.
            meta_in = dict(intention.metadata or {})
            meta_in["intention_id"] = str(intention.id)
            meta_in["attempt"] = int(intention.checkpoint.attempt or 0)
            intention = intention.model_copy(update={"metadata": meta_in})
            assembled = await self._run_blocking(
                self._workspace.run_config_driven_assembler,
                service,
                intent=intention.intent,
                role=role,
                written_paths=written,
                scaffold_profile=(
                    meta_profile if isinstance(meta_profile, str) else None
                ),
                skip_mechanical_extract=skip_extract,
                kind=intention.kind.value if intention.kind else None,
                metadata=meta_in,
            )
            for path in assembled:
                if path not in written:
                    written.append(path)
            assembly_ran = True
            # Mirror Assembler progress → EventBus (skip steps already published live).
            from services.empery_intelligence_core.src.integration.assembler_progress import (
                unpublished_assembler_steps,
            )

            progress_steps = unpublished_assembler_steps(
                list(getattr(self._workspace, "last_assembly_progress", None) or [])
            )
            for step in progress_steps:
                await self._publish(
                    ev.ASSEMBLER_STEP,
                    {
                        "intention_id": intention.id,
                        "service_name": service,
                        "ecc_job_id": (intention.metadata or {}).get("ecc_job_id"),
                        **{k: v for k, v in step.items() if k != "intention_id"},
                    },
                )
            # Remaining eic_actions: orchestration-only (domain write → CRITICAL).
            extra = await self._run_blocking(
                self._workspace.apply_actions,
                actions,
                role=role,
                service_name=service,
            )
            for path in extra:
                if path not in written:
                    written.append(path)
        else:
            written = await self._run_blocking(
                self._workspace.apply_actions,
                actions,
                role=role,
                service_name=service,
            )

        design_path = intention.checkpoint.design_path
        report_path = intention.checkpoint.report_path
        artifacts = list(intention.checkpoint.artifact_paths)
        action_stats: dict[str, int] = {}
        if hasattr(self._workspace, "last_action_stats"):
            action_stats = dict(self._workspace.last_action_stats)

        if role == AgentRole.ARCHITECT:
            if not written:
                written = self._workspace.write_design(service, content, None)
            for path in written:
                if path.endswith("_design.md") or path.endswith("_design.json"):
                    design_path = path
                if path.endswith("_blueprint.json"):
                    design_path = design_path or path
                if path not in artifacts:
                    artifacts.append(path)
            if not is_viable_design_markdown(content):
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_DESIGN_NON_VIABLE",
                        message=(
                            "Architect produced a non-viable design "
                            "(meta-prose or missing structure); refusing plan-only success"
                        ),
                        details={
                            "service_name": service,
                            "content_preview": content[:240],
                        },
                    ),
                    http_status=422,
                )
            # Persist assembly block into design JSON (Hands evolve must not lose packs).
            if service and hasattr(self._workspace, "ensure_design_assembly_json"):
                asm_path = self._workspace.ensure_design_assembly_json(
                    service,
                    intent=intention.intent,
                    design_path=design_path,
                )
                if asm_path not in artifacts:
                    artifacts.append(asm_path)
                if asm_path not in written:
                    written.append(asm_path)
                if asm_path.endswith("_design.json"):
                    design_path = design_path or asm_path
            # Configuration-Driven: Blueprint.json is the structural SoT.
            if service and hasattr(self._workspace, "ensure_blueprint_json"):
                bp_path = self._workspace.ensure_blueprint_json(
                    service,
                    intent=intention.intent,
                    architect_content=content,
                    design_path=design_path,
                )
                if bp_path:
                    if bp_path not in artifacts:
                        artifacts.append(bp_path)
                    if bp_path not in written:
                        written.append(bp_path)
                    meta_bp = dict(intention.metadata or {})
                    if getattr(self._workspace, "last_assembly_meta", None):
                        meta_bp.update(dict(self._workspace.last_assembly_meta))
                    if meta_bp.get("scaffold_profile"):
                        intention = intention.model_copy(update={"metadata": meta_bp})
            if self._memory is not None:
                await self._memory.record_plan_decision(intention, content[:500])

        elif role == AgentRole.IMPLEMENTER:
            # Genesis fix: LLM prose often emits zero eic_actions — scaffold anyway.
            # Skip when Assembler already ran (config_driven path).
            if (
                not assembly_ran
                and getattr(self._config, "auto_scaffold_on_implement", True)
            ):
                if hasattr(self._workspace, "maybe_scaffold_for_intention"):
                    meta_in = dict(intention.metadata or {})
                    meta_profile = meta_in.get("scaffold_profile")
                    skip_extract = bool(meta_in.get("eic_skip_mechanical_extract"))
                    # Evolve delta gate: snapshot mount before mechanical writes.
                    if intention.kind == IntentionKind.EVOLVE and service:
                        from services.empery_intelligence_core.src.integration.evolve_delta_gate import (
                            snapshot_evolve_baseline,
                        )

                        root = getattr(self._workspace, "_paths", None)
                        ws_root = (
                            root.workspace_root.resolve()
                            if root is not None
                            else None
                        )
                        if ws_root is not None:
                            meta_in = snapshot_evolve_baseline(
                                ws_root, service, meta_in
                            )
                            intention = intention.model_copy(
                                update={"metadata": meta_in}
                            )
                    scaffolded = await self._run_blocking(
                        self._workspace.maybe_scaffold_for_intention,
                        intent=intention.intent,
                        service_name=service,
                        role=role,
                        written_paths=written,
                        scaffold_profile=(
                            meta_profile if isinstance(meta_profile, str) else None
                        ),
                        skip_mechanical_extract=skip_extract,
                        kind=(
                            intention.kind.value if intention.kind else None
                        ),
                        metadata=meta_in,
                    )
                    for path in scaffolded:
                        if path not in written:
                            written.append(path)
                    if getattr(self._workspace, "last_evolve_missing_capsule", None):
                        from services.empery_intelligence_core.src.integration.evolve_enqueue_gate import (
                            evolve_missing_capsule_message,
                        )

                        msg = evolve_missing_capsule_message(service)
                        meta_err = dict(intention.metadata or {})
                        meta_err["error_code"] = "EIC_EVOLVE_NO_CAPSULE"
                        meta_err["evolve_missing_capsule"] = msg
                        intention = intention.model_copy(update={"metadata": meta_err})
                        raise ServiceError(
                            StandardizedErrorResponse(
                                error_code="EIC_EVOLVE_NO_CAPSULE",
                                message=msg,
                                details={"service_name": service},
                            ),
                            http_status=422,
                        )
                    if hasattr(self._workspace, "last_action_stats"):
                        action_stats = dict(self._workspace.last_action_stats)
                    # Persist assembly metrics for ECC Autonomous job outcome UI.
                    if hasattr(self._workspace, "last_scaffold_meta"):
                        smeta = dict(self._workspace.last_scaffold_meta or {})
                        if smeta:
                            from services.empery_intelligence_core.src.integration.assembly_profiles import (
                                assembly_generic_refuse_message,
                                should_refuse_assembly_generic,
                            )

                            prior = dict(intention.metadata or {})
                            # Opt-in only — scaffold_profile=generic must not auto-allow
                            # when product language matched (P15 compose-not-invent).
                            allow_generic = prior.get("allow_generic") is True
                            meta_asm = dict(prior)
                            if smeta.get("scaffold_profile"):
                                meta_asm["scaffold_profile"] = smeta["scaffold_profile"]
                            packs = smeta.get("recipe_packs")
                            if isinstance(packs, list) and packs:
                                meta_asm["recipe_packs"] = packs
                            atom_n = smeta.get("eic_atom_file_count")
                            if atom_n is None and hasattr(
                                self._workspace, "count_service_atom_files"
                            ):
                                atom_n = self._workspace.count_service_atom_files(
                                    service
                                )
                            if atom_n is not None:
                                meta_asm["eic_atom_file_count"] = int(atom_n)
                            # Prefer this-job metrics over corpus size (atoms×635 trap).
                            if smeta.get("eic_atom_files_new") is not None:
                                meta_asm["eic_atom_files_new"] = int(
                                    smeta["eic_atom_files_new"]
                                )
                            if isinstance(smeta.get("eic_atom_files_wired"), list):
                                meta_asm["eic_atom_files_wired"] = list(
                                    smeta["eic_atom_files_wired"]
                                )
                            if isinstance(smeta.get("eic_atom_files_unwired"), list):
                                meta_asm["eic_atom_files_unwired"] = list(
                                    smeta["eic_atom_files_unwired"]
                                )
                            profile = str(smeta.get("scaffold_profile") or "").lower()
                            if should_refuse_assembly_generic(
                                scaffold_profile=profile,
                                intent=intention.intent,
                                service_name=service,
                                allow_generic=allow_generic,
                            ):
                                meta_asm["assembly_generic_refuse"] = True
                                meta_asm["error_code"] = "EIC_ASSEMBLY_GENERIC"
                                intention = intention.model_copy(
                                    update={"metadata": meta_asm}
                                )
                                raise ServiceError(
                                    StandardizedErrorResponse(
                                        error_code="EIC_ASSEMBLY_GENERIC",
                                        message=assembly_generic_refuse_message(),
                                        details={
                                            "service_name": service,
                                            "scaffold_profile": profile,
                                            "recipe_packs": packs
                                            if isinstance(packs, list)
                                            else [],
                                        },
                                    ),
                                    http_status=422,
                                )
                            intention = intention.model_copy(
                                update={"metadata": meta_asm}
                            )
            elif assembly_ran:
                # Assembler already scaffolded — still apply capsule/generic gates.
                if getattr(self._workspace, "last_evolve_missing_capsule", None):
                    from services.empery_intelligence_core.src.integration.evolve_enqueue_gate import (
                        evolve_missing_capsule_message,
                    )

                    msg = evolve_missing_capsule_message(service)
                    meta_err = dict(intention.metadata or {})
                    meta_err["error_code"] = "EIC_EVOLVE_NO_CAPSULE"
                    meta_err["evolve_missing_capsule"] = msg
                    intention = intention.model_copy(update={"metadata": meta_err})
                    raise ServiceError(
                        StandardizedErrorResponse(
                            error_code="EIC_EVOLVE_NO_CAPSULE",
                            message=msg,
                            details={"service_name": service},
                        ),
                        http_status=422,
                    )
                if hasattr(self._workspace, "last_action_stats"):
                    action_stats = dict(self._workspace.last_action_stats)
                smeta = dict(getattr(self._workspace, "last_scaffold_meta", None) or {})
                if smeta:
                    from services.empery_intelligence_core.src.integration.assembly_profiles import (
                        assembly_generic_refuse_message,
                        should_refuse_assembly_generic,
                    )

                    prior = dict(intention.metadata or {})
                    allow_generic = prior.get("allow_generic") is True
                    meta_asm = dict(prior)
                    if smeta.get("scaffold_profile"):
                        meta_asm["scaffold_profile"] = smeta["scaffold_profile"]
                    packs = smeta.get("recipe_packs")
                    if isinstance(packs, list) and packs:
                        meta_asm["recipe_packs"] = packs
                    if getattr(self._workspace, "last_assembly_meta", None):
                        meta_asm.update(dict(self._workspace.last_assembly_meta))
                    profile = str(smeta.get("scaffold_profile") or "").lower()
                    if should_refuse_assembly_generic(
                        scaffold_profile=profile,
                        intent=intention.intent,
                        service_name=service,
                        allow_generic=allow_generic,
                    ):
                        meta_asm["assembly_generic_refuse"] = True
                        meta_asm["error_code"] = "EIC_ASSEMBLY_GENERIC"
                        intention = intention.model_copy(update={"metadata": meta_asm})
                        raise ServiceError(
                            StandardizedErrorResponse(
                                error_code="EIC_ASSEMBLY_GENERIC",
                                message=assembly_generic_refuse_message(),
                                details={
                                    "service_name": service,
                                    "scaffold_profile": profile,
                                },
                            ),
                            http_status=422,
                        )
                    intention = intention.model_copy(update={"metadata": meta_asm})
            # Evolve delta: accumulate product write paths for verify-time gate.
            if intention.kind == IntentionKind.EVOLVE and written:
                from services.empery_intelligence_core.src.integration.evolve_delta_gate import (
                    accumulate_evolve_written_paths,
                )

                meta_delta = accumulate_evolve_written_paths(
                    dict(intention.metadata or {}),
                    written,
                )
                intention = intention.model_copy(update={"metadata": meta_delta})
            # Fail-closed: recipe-matched genesis must extract (no scratch invent).
            if hasattr(self._workspace, "forbid_scratch_violation"):
                violation = self._workspace.forbid_scratch_violation(
                    intent=intention.intent,
                    service_name=service,
                    action_stats=action_stats,
                )
                if violation:
                    meta_err = dict(intention.metadata or {})
                    meta_err["forbid_scratch_when_recipe"] = violation
                    intention = intention.model_copy(update={"metadata": meta_err})
                    raise ServiceError(
                        StandardizedErrorResponse(
                            error_code="EIC_FORBID_SCRATCH",
                            message=violation,
                            details={
                                "service_name": service,
                                "action_stats": action_stats,
                            },
                        ),
                        http_status=422,
                    )
            # Fail-closed: required Desktop UI refresh / product surfaces must succeed.
            surfaces = getattr(self._workspace, "last_product_surfaces", None)
            if (
                isinstance(surfaces, dict)
                and surfaces.get("ok") is False
                and getattr(self._config, "require_deploy_agent", True)
            ):
                meta_err = dict(intention.metadata)
                detail = surfaces.get("desktop_verify") or {}
                desktop_ref = surfaces.get("desktop_refresh") or {}
                ecc_ref = surfaces.get("ecc_ui_refresh") or {}
                bake_err = str(
                    desktop_ref.get("error")
                    or desktop_ref.get("reason")
                    or ecc_ref.get("error")
                    or ecc_ref.get("reason")
                    or (detail.get("detail") if isinstance(detail, dict) else detail)
                    or "product_surfaces_failed"
                )
                bake_out = str(
                    desktop_ref.get("output") or ecc_ref.get("output") or ""
                )[-1200:]
                meta_err["desktop_surfaces_ok"] = False
                meta_err["desktop_surfaces_error"] = bake_err[:800]
                if bake_out:
                    meta_err["ui_refresh_output"] = bake_out
                smeta_bake = dict(
                    getattr(self._workspace, "last_scaffold_meta", None) or {}
                )
                if smeta_bake.get("ui_refresh_error"):
                    meta_err["ui_refresh_error"] = str(smeta_bake["ui_refresh_error"])[
                        :800
                    ]
                if smeta_bake.get("ui_refresh_output"):
                    meta_err["ui_refresh_output"] = str(
                        smeta_bake["ui_refresh_output"]
                    )[-1200:]
                intention = intention.model_copy(update={"metadata": meta_err})
                content = (
                    f"{content}\n\n## Desktop surfaces (fail-closed)\n"
                    f"FAILED: ensure_product_surfaces did not succeed "
                    f"(Desktop refresh / verify).\n"
                    f"error={meta_err['desktop_surfaces_error']}\n"
                )
                if bake_out:
                    content += f"\n### deploy_agent output (truncated)\n```\n{bake_out}\n```\n"
            deploy_ok: bool | None = None
            if (
                getattr(self._config, "auto_deploy_on_implement", True)
                and self._config.engine_allow_service_writes
                and hasattr(self._workspace, "deploy_service")
                and service
                and any("services/" in p.replace("\\", "/") for p in written)
                and intention.metadata.get("desktop_surfaces_ok") is not False
            ):
                deploy_result = await self._run_blocking_timed(
                    self._workspace.deploy_service,
                    service,
                    timeout_s=float(
                        getattr(self._config, "deploy_blocking_budget_s", 180.0)
                    ),
                    error_code="EIC_DEPLOY_TIMEOUT",
                    message=(
                        "in-loop deploy_service exceeded blocking budget; "
                        "intention failed instead of stalling"
                    ),
                )
                deploy_ok = bool(deploy_result.get("ok"))
                req = deploy_result.get("deploy_request")
                if isinstance(req, str) and req not in artifacts:
                    artifacts.append(req)
                summary = deploy_result.get("summary")
                if isinstance(summary, str) and summary not in artifacts:
                    artifacts.append(summary)
                if hasattr(self._workspace, "last_action_stats"):
                    action_stats = dict(self._workspace.last_action_stats)
                # Fail closed: in-loop deploy is required for create_service genesis.
                if not deploy_ok and getattr(
                    self._config, "require_deploy_agent", True
                ):
                    meta_err = dict(intention.metadata)
                    meta_err["deploy_ok"] = False
                    meta_err["deploy_error"] = str(
                        deploy_result.get("error") or "deploy_failed"
                    )
                    intention = intention.model_copy(update={"metadata": meta_err})
            for path in written:
                if path not in artifacts:
                    artifacts.append(path)
            log_event(
                self._logger,
                event="eic.loop.implement_actions",
                message="Implementer workspace actions applied",
                intention_id=str(intention.id),
                service_name=service,
                write_file=action_stats.get("write_file", 0),
                scaffold=action_stats.get("scaffold", 0),
                deploy=action_stats.get("deploy", 0),
                deploy_ok=deploy_ok,
                desktop_surfaces_ok=intention.metadata.get("desktop_surfaces_ok"),
                paths=len(written),
            )
            if deploy_ok is False and getattr(
                self._config, "require_deploy_agent", True
            ):
                # Surface deploy failure into role outcome for fix loops / verify.
                content = (
                    f"{content}\n\n## Deploy (fail-closed)\n"
                    f"FAILED: in-loop deploy via empery_deploy_agent did not succeed.\n"
                    f"error={intention.metadata.get('deploy_error')}\n"
                )

        elif role == AgentRole.VERIFIER:
            from services.empery_intelligence_core.src.integration.service_factory_gates import (
                normalize_verify_status,
            )

            status: Literal["PASSED", "FAILED", "UNKNOWN"] = (  # type: ignore[assignment]
                normalize_verify_status(verify_status)  # type: ignore[assignment]
            )
            anatomy_detail: str | None = None
            live_detail: str | None = None
            ui_detail: str | None = None
            ui_status: str | None = None
            desktop_detail: str | None = None
            desktop_status: str | None = None
            factory_detail: str | None = None
            factory_status: str | None = None
            delta_detail: str | None = None
            delta_status: str | None = None
            contract_detail: str | None = None
            contract_status: str | None = None
            gate_t_detail: str | None = None
            gate_t_status: str | None = None
            gate_s_detail: str | None = None
            gate_s_status: str | None = None
            gate_s_payload: dict[str, Any] | None = None
            gate_s_violation: str | None = None
            live_status: str | None = None
            llm_narrative = content
            anatomy_status: str | None = None
            # Deterministic anatomy gate (genesis): filesystem truth when writes enabled.
            if service and hasattr(self._workspace, "verify_service_anatomy"):
                from services.empery_intelligence_core.src.integration.service_scaffold import (
                    is_create_service_intention,
                )

                anatomy_status, anatomy_detail = self._workspace.verify_service_anatomy(
                    service
                )
                intention_kind = (
                    intention.kind.value if intention.kind else None
                )
                expect_capsule = (
                    self._config.engine_allow_service_writes
                    and is_create_service_intention(
                        intent=intention.intent,
                        service_name=service,
                        kind=intention_kind,
                    )
                )
                from services.empery_intelligence_core.src.integration.evolve_verify_touches import (
                    evolve_touch_gates,
                )

                ws_root: Path | None = None
                try:
                    from pathlib import Path as _Path

                    root = getattr(self._workspace, "_paths", None)
                    if root is not None and getattr(root, "workspace_root", None):
                        ws_root = _Path(root.workspace_root).resolve()
                    elif hasattr(self._workspace, "workspace_root"):
                        ws_root = _Path(self._workspace.workspace_root).resolve()
                except Exception:  # noqa: BLE001
                    ws_root = None

                touch_gates = evolve_touch_gates(
                    intention.metadata or {},
                    intent=intention.intent,
                    workspace=ws_root,
                    service_name=service,
                )
                # Dedicated /verify runs full product gates (factory/ui/desktop).
                # Evolve uses selected_option.touches only (until delta gate lands).
                is_verify_kind = intention.kind == IntentionKind.VERIFY
                run_factory_gates = expect_capsule or touch_gates["factory"] or (
                    is_verify_kind and anatomy_status == "PASSED"
                )
                run_ui_gates = expect_capsule or touch_gates["ui"] or (
                    is_verify_kind and anatomy_status == "PASSED"
                )
                run_desktop_gates = expect_capsule or touch_gates["desktop"] or (
                    is_verify_kind and anatomy_status == "PASSED"
                )
                # Anatomy may fail-closed; may upgrade UNKNOWN→PASSED only.
                # Never upgrade LLM/FAILED→PASSED from anatomy alone (C6 stickiness kill).
                if anatomy_status == "FAILED":
                    status = "FAILED"
                elif (
                    expect_capsule
                    and anatomy_status == "PASSED"
                    and status == "UNKNOWN"
                ):
                    status = "PASSED"
                # Factory DoD when genesis expects a capsule or anatomy already exists.
                if hasattr(self._workspace, "verify_factory_gates") and run_factory_gates:
                    profile = (intention.metadata or {}).get("scaffold_profile")
                    if isinstance(profile, str):
                        scaffold_profile = profile
                    else:
                        scaffold_profile = None
                    factory_status, factory_detail = (
                        self._workspace.verify_factory_gates(
                            service, scaffold_profile=scaffold_profile
                        )
                    )
                    if factory_status == "FAILED":
                        status = "FAILED"
                # Assembly Auditor (Gate T/C/S) via VerifierPort — local or gRPC.
                if service and hasattr(self._workspace, "verify_assembly_gates"):
                    judge_raw: str | None = None
                    if self._nervas is not None:
                        from core.integration.nervas import (
                            NervasGenerateRequest,
                            NervasMessage,
                            NervasChatRequest,
                        )

                        prompt = (
                            "Compare operator Intent to Blueprint/Manifest structure. "
                            'Reply ONLY JSON: {"match": boolean, "reason": string, '
                            '"confidence": number}.\n'
                            f"Intent: {intention.intent[:800]}\n"
                            f"Service: {service}\n"
                        )
                        last_exc: Exception | None = None
                        for attempt in range(1, 4):
                            try:
                                if hasattr(self._nervas, "generate"):
                                    res = await self._nervas.generate(
                                        NervasGenerateRequest(
                                            prompt=prompt,
                                            system=(
                                                "You are Gate S assembly auditor. "
                                                "JSON only."
                                            ),
                                        )
                                    )
                                    judge_raw = _extract_text(res)
                                elif hasattr(self._nervas, "chat"):
                                    res = await self._nervas.chat(
                                        NervasChatRequest(
                                            messages=[
                                                NervasMessage(
                                                    role="system",
                                                    content="Gate S auditor. JSON only.",
                                                ),
                                                NervasMessage(
                                                    role="user", content=prompt
                                                ),
                                            ]
                                        )
                                    )
                                    judge_raw = _extract_text(res)
                                # Accept only parseable JSON with match key.
                                if judge_raw and re.search(
                                    r'\{\s*"match"\s*:', judge_raw
                                ):
                                    break
                                judge_raw = None
                                last_exc = ValueError("Gate S judge JSON missing match")
                            except Exception as exc:  # noqa: BLE001
                                last_exc = exc
                                judge_raw = None
                            if attempt < 3:
                                await asyncio.sleep(0.4 * attempt)
                        nervas_abstained = False
                        if judge_raw is None and last_exc is not None:
                            nervas_abstained = True
                            log_event(
                                self._logger,
                                event="eic.assembly.gate_s_nervas_failed",
                                message=(
                                    "Gate S Nervas judge failed after retries; "
                                    "abstaining (no heuristic mint PASS)"
                                ),
                                error=str(last_exc)[:300],
                                attempts=3,
                                level=logging.WARNING,
                            )
                    else:
                        nervas_abstained = False
                    asm_report = await self._run_blocking(
                        self._workspace.verify_assembly_gates,
                        service,
                        intent=intention.intent,
                        judge_raw=(
                            "__NERVAS_ABSTAINED__"
                            if nervas_abstained
                            else judge_raw
                        ),
                        nervas_abstained=nervas_abstained,
                    )
                    gate_t_status = asm_report.get("gate_t")
                    gate_t_detail = (asm_report.get("details") or {}).get("T")
                    contract_status = asm_report.get("gate_c")
                    contract_detail = (asm_report.get("details") or {}).get("C")
                    gate_s_status = asm_report.get("gate_s")
                    gate_s_detail = (asm_report.get("details") or {}).get("S")
                    gate_s_payload = asm_report.get("gate_s_payload") or {
                        "transport": asm_report.get("transport"),
                        "status": asm_report.get("status"),
                    }
                    if gate_s_status == "FAILED":
                        for v in asm_report.get("violations") or []:
                            if isinstance(v, dict) and v.get("gate") == "S":
                                gate_s_violation = str(
                                    v.get("message") or gate_s_detail or ""
                                )
                                break
                        if not gate_s_violation:
                            gate_s_violation = str(
                                (gate_s_payload or {}).get("reason")
                                or gate_s_detail
                                or "Gate S FAILED"
                            )
                    if gate_t_status == "FAILED" or contract_status == "FAILED":
                        status = "FAILED"
                    meta_s = dict(intention.metadata or {})
                    meta_s["assembly_gate_s"] = gate_s_payload
                    if gate_s_violation:
                        meta_s["assembly_gate_s_violation"] = gate_s_violation[:800]
                    meta_s["assembly_verifier"] = {
                        "transport": asm_report.get("transport"),
                        "status": asm_report.get("status"),
                        "gate_t": gate_t_status,
                        "gate_c": contract_status,
                        "gate_s": gate_s_status,
                    }
                    intention = intention.model_copy(update={"metadata": meta_s})
                else:
                    # Legacy fallback if verify_assembly_gates missing.
                    if service and hasattr(self._workspace, "verify_assembly_gate_t"):
                        gate_t_status, gate_t_detail = (
                            self._workspace.verify_assembly_gate_t(service)
                        )
                        if gate_t_status == "FAILED":
                            status = "FAILED"
                    if service and hasattr(self._workspace, "verify_assembly_contract"):
                        contract_status, contract_detail = (
                            self._workspace.verify_assembly_contract(service)
                        )
                        if contract_status == "FAILED":
                            status = "FAILED"
                    if service and hasattr(self._workspace, "verify_assembly_gate_s"):
                        gate_s_status, gate_s_detail, gate_s_payload = (
                            self._workspace.verify_assembly_gate_s(
                                service,
                                intent=intention.intent,
                                judge_raw=None,
                            )
                        )
                        meta_s = dict(intention.metadata or {})
                        meta_s["assembly_gate_s"] = gate_s_payload
                        intention = intention.model_copy(update={"metadata": meta_s})
                # service-ui gate: never force PASSED when ECC product UI is missing
                if run_ui_gates and hasattr(
                    self._workspace, "verify_service_ui"
                ):
                    ui_status, ui_detail = self._workspace.verify_service_ui(service)
                    if ui_status == "FAILED":
                        status = "FAILED"
                # desktop host gate: catalog + window mount required for product apps
                if run_desktop_gates and hasattr(
                    self._workspace, "verify_service_desktop"
                ):
                    desktop_status, desktop_detail = (
                        self._workspace.verify_service_desktop(service)
                    )
                    if desktop_status == "FAILED":
                        status = "FAILED"
                # Implement-time Desktop refresh failure is authoritative for genesis.
                if (
                    run_desktop_gates
                    and intention.metadata.get("desktop_surfaces_ok") is False
                ):
                    status = "FAILED"
                    err = intention.metadata.get("desktop_surfaces_error") or "unknown"
                    desktop_detail = (
                        f"Desktop surfaces fail-closed: {err}\n"
                        f"{desktop_detail or ''}"
                    ).strip()
                    desktop_status = "FAILED"
                # Evolve delta: UI-surface intents must change mount/ECC this job.
                if intention.kind == IntentionKind.EVOLVE:
                    from services.empery_intelligence_core.src.integration.evolve_delta_gate import (
                        verify_evolve_delta,
                    )

                    root = getattr(self._workspace, "_paths", None)
                    ws_root = (
                        root.workspace_root.resolve() if root is not None else None
                    )
                    if ws_root is not None:
                        delta_status, delta_detail = verify_evolve_delta(
                            ws_root,
                            service,
                            intent=intention.intent,
                            metadata=intention.metadata or {},
                            touch_gates=touch_gates,
                        )
                        if delta_status == "FAILED":
                            status = "FAILED"
                # Live presence: container health + registry (create_service only).
                # Never upgrade FAILED→PASSED from live alone (C6 — Gate T/C stickiness).
                if (
                    expect_capsule
                    and anatomy_status == "PASSED"
                    and factory_status != "FAILED"
                    and ui_status != "FAILED"
                    and desktop_status != "FAILED"
                    and delta_status != "FAILED"
                    and gate_t_status != "FAILED"
                    and contract_status != "FAILED"
                    and hasattr(self._workspace, "verify_live_presence")
                    and getattr(self._config, "require_deploy_agent", True)
                ):
                    live_status, live_detail = await self._run_blocking_timed(
                        self._workspace.verify_live_presence,
                        service,
                        timeout_s=float(
                            getattr(self._config, "live_verify_budget_s", 150.0)
                        ),
                        error_code="EIC_LIVE_VERIFY_TIMEOUT",
                        message=(
                            "verify_live_presence exceeded blocking budget; "
                            "intention failed instead of stalling"
                        ),
                    )
                    if live_status == "FAILED":
                        status = "FAILED"
                    elif live_status == "PASSED" and status == "UNKNOWN":
                        status = "PASSED"
                # Assembly law first: T∧C clear LLM FAILED stickiness (C6).
                from core.assembly.gates import (
                    apply_authoritative_assembly_gates,
                )

                status = apply_authoritative_assembly_gates(
                    status,
                    gate_t=gate_t_status,
                    gate_c=contract_status,
                    gate_s=gate_s_status,
                )
                # Product hard fails always win after assembly resolution.
                if (
                    anatomy_status == "FAILED"
                    or ui_status == "FAILED"
                    or desktop_status == "FAILED"
                    or factory_status == "FAILED"
                    or delta_status == "FAILED"
                    or live_status == "FAILED"
                    or gate_t_status == "FAILED"
                    or contract_status == "FAILED"
                    or gate_s_status == "FAILED"
                ):
                    status = "FAILED"
                # Phase 2: promote verified peer for next genesis when gates pass.
                if (
                    status == "PASSED"
                    and service
                    and hasattr(self._workspace, "promote_verified_peer")
                ):
                    try:
                        self._workspace.promote_verified_peer(service)
                    except Exception as exc:  # noqa: BLE001
                        log_event(
                            self._logger,
                            event="eic.factory.promote_verified_failed",
                            message="Live peer verify promotion failed (non-fatal)",
                            service_name=service,
                            error=str(exc)[:300],
                            level=logging.WARNING,
                        )
            if intention.kind != IntentionKind.VERIFY and self._config.allow_shell_pytest:
                code, out = await self._run_blocking(
                    self._workspace.run_pytest,
                    f"services/{service}/tests" if service else None,
                )
                if code != 0 and status == "UNKNOWN":
                    status = "FAILED"
                    llm_narrative = f"{llm_narrative}\n\npytest exit={code}\n{out}"
            # P11: terminal verify is always explicit PASSED|FAILED (never UNKNOWN).
            if status not in {"PASSED", "FAILED"}:
                status = "FAILED"
            content, role_summary_short = authoritative_verify_summary(
                status,
                anatomy_detail=anatomy_detail,
                live_detail=live_detail,
                ui_detail=ui_detail,
                desktop_detail=desktop_detail,
                factory_detail=factory_detail,
                delta_detail=delta_detail,
                contract_detail=contract_detail,
                gate_t_detail=gate_t_detail,
                gate_s_detail=gate_s_detail,
                gate_s_status=gate_s_status,
                gate_s_violation=gate_s_violation,
                llm_narrative=llm_narrative,
            )
            report_path = self._workspace.write_verify_report(
                service, content, status=status
            )
            if report_path not in artifacts:
                artifacts.append(report_path)
            verify_status = status
            if self._memory is not None:
                await self._memory.record_verify_report(
                    intention,
                    status=status,
                    summary=role_summary_short,
                )

        finished = _utc_now()
        meta = dict(intention.metadata)
        if assembly_tools:
            attached = [
                str(x)
                for x in (meta.get("assembly_tools_attached") or [])
                if isinstance(x, str)
            ]
            if role.value not in attached:
                attached.append(role.value)
            meta["assembly_tools_attached"] = attached
        if tool_names:
            calls = [
                str(x)
                for x in (meta.get("assembly_tool_calls") or [])
                if isinstance(x, str)
            ]
            for name in tool_names:
                if name not in calls:
                    calls.append(name)
            meta["assembly_tool_calls"] = calls
        if role == AgentRole.VERIFIER and verify_status:
            meta["verify_status"] = verify_status
        if action_stats:
            accumulate_eic_action_stats(meta, action_stats)
        turn = RoleTurnRecord(
            role=role,
            stage=stage,
            started_at=started,
            finished_at=finished,
            prompt_hash=bundle.prompt_hash,
            provider=provider,
            outcome="ok",
            summary=content[:500],
        )
        history = list(intention.history) + [turn]
        if role == AgentRole.VERIFIER and verify_status:
            summary_for_checkpoint = f"verify_status={verify_status}"
        else:
            summary_for_checkpoint = content[:500]
        cp = intention.checkpoint.model_copy(
            update={
                "design_path": design_path,
                "report_path": report_path,
                "artifact_paths": artifacts,
                "verify_status": verify_status
                if role == AgentRole.VERIFIER
                else intention.checkpoint.verify_status,
                "role_summary": summary_for_checkpoint,
                "updated_at": finished,
            }
        )
        intention = intention.model_copy(
            update={
                "checkpoint": cp,
                "history": history,
                "updated_at": finished,
                "metadata": meta,
            }
        )
        intention = await self._persist(intention)
        finish_summary = (
            summary_for_checkpoint
            if role == AgentRole.VERIFIER
            else content[:200]
        )
        await self._publish(
            ev.LOOP_ROLE_FINISHED,
            {
                "intention_id": str(intention.id),
                "role": role.value,
                "stage": stage.value,
                "outcome": "ok",
                "summary": finish_summary,
                "verify_status": verify_status
                if role == AgentRole.VERIFIER
                else None,
                "write_file_count": int(action_stats.get("write_file", 0)),
            },
        )
        return intention

    async def _advance_after_role(self, intention: Intention) -> Intention:
        stage = intention.checkpoint.stage
        kind = intention.kind
        verify = intention.checkpoint.verify_status

        if kind == IntentionKind.PLAN and stage == LoopStage.PLAN:
            # Safety net: never treat plan-only as genesis done when design is thin.
            design = intention.checkpoint.design_path
            if design:
                try:
                    from pathlib import Path

                    body = Path(design).read_text(encoding="utf-8")
                except OSError:
                    body = intention.checkpoint.role_summary or ""
                if not is_viable_design_markdown(body):
                    failed = await self._store.fail(
                        intention.id,
                        error_message="Non-viable design; plan-only completion blocked",
                    )
                    await self._publish(
                        ev.INTENTION_FAILED,
                        {
                            "intention_id": str(failed.id),
                            "error_message": failed.error_message,
                            "stage": failed.checkpoint.stage.value,
                            "ecc_job_id": str(failed.ecc_job_id)
                            if failed.ecc_job_id
                            else None,
                        },
                    )
                    return failed
            return await self._set_stage(intention, LoopStage.DONE)

        if kind == IntentionKind.IMPLEMENT and stage == LoopStage.IMPLEMENT:
            # Product honesty: implement never completes without verify gates.
            return await self._set_stage(intention, LoopStage.VERIFY)

        if kind == IntentionKind.IMPLEMENT and stage == LoopStage.VERIFY:
            if verify == "PASSED":
                return await self._set_stage(intention, LoopStage.DONE)
            if verify == "FAILED":
                return await self._enter_fix_or_fail(intention)
            return await self._enter_fix_or_fail(intention)

        if kind == IntentionKind.VERIFY and stage == LoopStage.VERIFY:
            if verify == "FAILED":
                return await self._fail_verify(intention)
            return await self._set_stage(intention, LoopStage.DONE)

        # evolve / fix chain
        if stage == LoopStage.PLAN:
            return await self._set_stage(intention, LoopStage.IMPLEMENT)
        if stage == LoopStage.IMPLEMENT:
            return await self._set_stage(intention, LoopStage.VERIFY)
        if stage == LoopStage.FIX:
            return await self._set_stage(intention, LoopStage.VERIFY)
        if stage == LoopStage.VERIFY:
            if verify == "PASSED":
                return await self._set_stage(intention, LoopStage.DONE)
            if verify == "FAILED":
                return await self._enter_fix_or_fail(intention)
            # UNKNOWN on resume → re-run verify next tick by staying; treat as fail soft
            return await self._enter_fix_or_fail(intention)
        return intention

    async def _enter_fix_or_fail(self, intention: Intention) -> Intention:
        attempt = intention.checkpoint.attempt
        if attempt < self._config.max_fix_loops:
            intention = await self._set_stage(
                intention,
                LoopStage.FIX,
                attempt=attempt + 1,
            )
            return await self._set_stage(intention, LoopStage.IMPLEMENT)
        failed = await self._store.fail(
            intention.id,
            error_message=f"max_fix_loops exceeded ({self._config.max_fix_loops})",
        )
        await self._publish(
            ev.INTENTION_FAILED,
            {
                "intention_id": str(failed.id),
                "error_message": failed.error_message,
                "stage": failed.checkpoint.stage.value,
                "ecc_job_id": str(failed.ecc_job_id) if failed.ecc_job_id else None,
            },
        )
        return failed

    async def _fail_verify(self, intention: Intention) -> Intention:
        failed = await self._store.fail(
            intention.id, error_message="verify FAILED"
        )
        await self._publish(
            ev.INTENTION_FAILED,
            {
                "intention_id": str(failed.id),
                "error_message": failed.error_message,
                "stage": failed.checkpoint.stage.value,
                "ecc_job_id": str(failed.ecc_job_id) if failed.ecc_job_id else None,
            },
        )
        return failed
