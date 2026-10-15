"""Headless Plan → Implement → Verify cycle runner (no Cursor Task API)."""

from __future__ import annotations

import json
import logging
import re
import uuid
from pathlib import Path
from typing import Any

from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event, EventBus
from core.integration.nervas import NervasProvider
from core.logging import log_event
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.core.engine.contracts import (
    EngineCyclePhaseResult,
    EngineCycleStartRequest,
    EngineCycleStatus,
    IntentionSource,
    RoleName,
    RolePromptLoader,
)
from services.empery_intelligence_core.src.core.engine.role_executor import RoleExecutor


class HeadlessExecutionEngine:
    """Runs sequential role phases against Nervas using markdown prompt templates."""

    def __init__(
        self,
        nervas: NervasProvider,
        prompt_loader: RolePromptLoader,
        intention_source: IntentionSource,
        event_bus: EventBus,
        config: ServiceConfig,
        logger: logging.Logger,
    ) -> None:
        self._nervas = nervas
        self._loader = prompt_loader
        self._intentions = intention_source
        self._bus = event_bus
        self._config = config
        self._logger = logger
        self._executor = RoleExecutor(nervas, logger)
        self._cycles: dict[str, EngineCycleStatus] = {}

    def get_status(self, cycle_id: str) -> EngineCycleStatus:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_ENGINE_GONE",
                message=(
                    "Headless engine is permanently retired. "
                    "Use Autonomous intentions + Hands VerifierPort."
                ),
                details={"cycle_id": cycle_id, "replacement": "/api/v1/autonomous/intentions"},
            ),
            http_status=410,
        )

    async def start_cycle(self, request: EngineCycleStartRequest) -> EngineCycleStatus:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_ENGINE_GONE",
                message=(
                    "Headless engine is permanently retired. "
                    "Use Autonomous intentions + Hands VerifierPort."
                ),
                details={
                    "intention_id": request.intention_id,
                    "replacement": "/api/v1/autonomous/intentions",
                },
            ),
            http_status=410,
        )

    async def _legacy_start_cycle_disabled(
        self, request: EngineCycleStartRequest
    ) -> EngineCycleStatus:
        """Retained only as dead reference — never call. Soft-PASS removed."""
        handle = await self._intentions.get(request.intention_id)
        cycle_id = str(uuid.uuid4())
        status = EngineCycleStatus(
            cycle_id=cycle_id,
            intention_id=handle.intention_id,
            state="running",
            phases=[],
            verify_status="PENDING",
        )
        self._cycles[cycle_id] = status
        await self._bus.publish(
            Event(
                name="engine.cycle.started",
                payload={
                    "cycle_id": cycle_id,
                    "intention_id": handle.intention_id,
                },
            )
        )
        log_event(
            self._logger,
            event="engine.cycle.started",
            message="Headless cycle started",
            cycle_id=cycle_id,
            intention_id=handle.intention_id,
        )

        phases: list[EngineCyclePhaseResult] = []
        design_text = ""
        design_paths: list[str] = []
        verify_status: str | None = "PENDING"
        allow_writes = (
            request.allow_service_writes or self._config.engine_allow_service_writes
        )

        try:
            roles = list(request.roles) or [
                RoleName.ARCHITECT,
                RoleName.IMPLEMENTER,
                RoleName.VERIFIER,
            ]

            if RoleName.ARCHITECT in roles:
                phase, design_text, design_paths = await self._run_architect(handle)
                phases.append(phase)
                await self._publish_phase(cycle_id, phase)

            if RoleName.IMPLEMENTER in roles:
                phase = await self._run_implementer(
                    handle,
                    design_text=design_text,
                    allow_service_writes=allow_writes,
                )
                phases.append(phase)
                await self._publish_phase(cycle_id, phase)

            if RoleName.VERIFIER in roles:
                phase, verify_status = await self._run_verifier(
                    handle,
                    design_text=design_text,
                )
                phases.append(phase)
                await self._publish_phase(cycle_id, phase)

            if (
                verify_status == "FAILED"
                and RoleName.REFACTORER in roles
            ):
                refactor = await self._run_refactorer(handle, design_text=design_text)
                phases.append(refactor)
                await self._publish_phase(cycle_id, refactor)
                phase, verify_status = await self._run_verifier(
                    handle,
                    design_text=design_text,
                )
                phases.append(phase)
                await self._publish_phase(cycle_id, phase)

            state = "passed" if verify_status == "PASSED" else "failed"
            # Fail-closed: PENDING / unknown never mint PASSED.
            if verify_status not in {"PASSED", "FAILED"}:
                state = "failed"
                verify_status = "FAILED"

            final = EngineCycleStatus(
                cycle_id=cycle_id,
                intention_id=handle.intention_id,
                state=state,  # type: ignore[arg-type]
                phases=phases,
                verify_status=verify_status,  # type: ignore[arg-type]
            )
            self._cycles[cycle_id] = final
            await self._intentions.mark_complete(
                handle.intention_id,
                {
                    "cycle_id": cycle_id,
                    "verify_status": verify_status,
                    "design_paths": design_paths,
                },
            )
            await self._bus.publish(
                Event(
                    name="engine.cycle.completed",
                    payload={
                        "cycle_id": cycle_id,
                        "verify_status": verify_status,
                        "state": state,
                    },
                )
            )
            return final
        except ServiceError as exc:
            failed = EngineCycleStatus(
                cycle_id=cycle_id,
                intention_id=handle.intention_id,
                state="failed",
                phases=phases,
                verify_status="FAILED",
                error=exc.response,
            )
            self._cycles[cycle_id] = failed
            await self._intentions.mark_failed(handle.intention_id, exc.response)
            await self._bus.publish(
                Event(
                    name="engine.cycle.completed",
                    payload={
                        "cycle_id": cycle_id,
                        "verify_status": "FAILED",
                        "state": "failed",
                        "error_code": exc.response.error_code,
                    },
                )
            )
            return failed
        except Exception as exc:  # noqa: BLE001
            error = StandardizedErrorResponse(
                error_code="ENGINE_CYCLE_FAILED",
                message="Headless cycle failed unexpectedly",
                details={"reason": str(exc)},
            )
            failed = EngineCycleStatus(
                cycle_id=cycle_id,
                intention_id=handle.intention_id,
                state="failed",
                phases=phases,
                verify_status="FAILED",
                error=error,
            )
            self._cycles[cycle_id] = failed
            await self._intentions.mark_failed(handle.intention_id, error)
            await self._bus.publish(
                Event(
                    name="engine.cycle.completed",
                    payload={
                        "cycle_id": cycle_id,
                        "verify_status": "FAILED",
                        "state": "failed",
                        "error_code": error.error_code,
                    },
                )
            )
            return failed

    async def _publish_phase(
        self, cycle_id: str, phase: EngineCyclePhaseResult
    ) -> None:
        await self._bus.publish(
            Event(
                name="engine.cycle.phase.completed",
                payload={
                    "cycle_id": cycle_id,
                    "role": phase.role.value,
                    "status": phase.status,
                },
            )
        )

    async def _run_architect(
        self, handle: Any
    ) -> tuple[EngineCyclePhaseResult, str, list[str]]:
        agent = self._loader.load_agent(RoleName.ARCHITECT)
        skill = self._loader.load_skill("plan")
        system = self._executor.combine_prompts(agent, skill)
        self._executor.log_role(
            RoleName.ARCHITECT, [agent.source_path, skill.source_path]
        )
        context = json.dumps(handle.payload, default=str) if handle.payload else None
        plan = await self._executor.plan(
            system=system,
            intention=handle.summary,
            context=context,
        )
        root = Path(self._config.workspace_root)
        designs = root / ".cursor" / "orchestration" / "designs"
        designs.mkdir(parents=True, exist_ok=True)
        slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", handle.intention_id)[:64]
        md_path = designs / f"{slug}_design.md"
        json_path = designs / f"{slug}_design.json"
        md_body = (
            f"# Design: {handle.summary}\n\n"
            f"{plan.summary}\n\n"
            + "\n".join(
                f"- **{s.id}** ({s.role}): {s.title}"
                + (f" — {s.acceptance}" if s.acceptance else "")
                for s in plan.steps
            )
            + "\n"
        )
        md_path.write_text(md_body, encoding="utf-8")
        json_path.write_text(
            json.dumps(plan.model_dump(mode="json"), indent=2) + "\n",
            encoding="utf-8",
        )
        paths = [str(md_path), str(json_path)]
        phase = EngineCyclePhaseResult(
            role=RoleName.ARCHITECT,
            status="ok",
            output_summary=plan.summary,
            artifact_paths=paths,
            raw={"steps": [s.model_dump() for s in plan.steps]},
        )
        return phase, md_body, paths

    async def _run_implementer(
        self,
        handle: Any,
        *,
        design_text: str,
        allow_service_writes: bool,
    ) -> EngineCyclePhaseResult:
        agent = self._loader.load_agent(RoleName.IMPLEMENTER)
        skill = self._loader.load_skill("implement")
        system = self._executor.combine_prompts(agent, skill)
        self._executor.log_role(
            RoleName.IMPLEMENTER, [agent.source_path, skill.source_path]
        )
        prompt = (
            "Produce a structured implementation proposal as JSON with keys "
            "`files` (list of {path, content, action}) and `summary`. "
            f"allow_service_writes={allow_service_writes}. "
            "Prefer writing under .cursor/orchestration/reports/ unless "
            "service writes are allowed."
        )
        result = await self._executor.reason(
            system=system,
            question=prompt,
            context=design_text or handle.summary,
        )
        root = Path(self._config.workspace_root)
        reports = root / ".cursor" / "orchestration" / "reports"
        reports.mkdir(parents=True, exist_ok=True)
        slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", handle.intention_id)[:64]
        out_path = reports / f"{slug}_implement.md"
        out_path.write_text(
            f"# Implement proposal\n\n{result.answer}\n",
            encoding="utf-8",
        )
        return EngineCyclePhaseResult(
            role=RoleName.IMPLEMENTER,
            status="ok",
            output_summary=result.answer[:500],
            artifact_paths=[str(out_path)],
            raw={"reasoning_trace": result.reasoning_trace},
        )

    async def _run_verifier(
        self,
        handle: Any,
        *,
        design_text: str,
    ) -> tuple[EngineCyclePhaseResult, str]:
        agent = self._loader.load_agent(RoleName.VERIFIER)
        skill = self._loader.load_skill("verify")
        system = self._executor.combine_prompts(agent, skill)
        self._executor.log_role(
            RoleName.VERIFIER, [agent.source_path, skill.source_path]
        )
        result = await self._executor.reason(
            system=system,
            question=(
                "Verify the implementation against the design. "
                "End your answer with exactly PASSED or FAILED."
            ),
            context=design_text or handle.summary,
        )
        verify_status = "FAILED"
        if "PASSED" in result.answer.upper() and "FAILED" not in result.answer.upper():
            verify_status = "PASSED"
        elif "FAILED" in result.answer.upper():
            verify_status = "FAILED"
        # No keyword / ambiguous → FAILED (never soft-PASS)

        root = Path(self._config.workspace_root)
        reports = root / ".cursor" / "orchestration" / "reports"
        reports.mkdir(parents=True, exist_ok=True)
        slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", handle.intention_id)[:64]
        out_path = reports / f"{slug}_verify.md"
        out_path.write_text(
            f"# Verify\n\nStatus: {verify_status}\n\n{result.answer}\n",
            encoding="utf-8",
        )
        phase = EngineCyclePhaseResult(
            role=RoleName.VERIFIER,
            status="ok" if verify_status == "PASSED" else "failed",
            output_summary=verify_status,
            artifact_paths=[str(out_path)],
            raw={"answer": result.answer},
        )
        return phase, verify_status

    async def _run_refactorer(
        self,
        handle: Any,
        *,
        design_text: str,
    ) -> EngineCyclePhaseResult:
        agent = self._loader.load_agent(RoleName.REFACTORER)
        system = agent.body
        self._executor.log_role(RoleName.REFACTORER, [agent.source_path])
        result = await self._executor.reason(
            system=system,
            question="Propose minimal refactorer fixes for verify failures.",
            context=design_text or handle.summary,
        )
        return EngineCyclePhaseResult(
            role=RoleName.REFACTORER,
            status="ok",
            output_summary=result.answer[:500],
            artifact_paths=[],
            raw={"answer": result.answer},
        )
