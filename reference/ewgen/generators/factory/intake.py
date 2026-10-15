"""
IntakeService — natural language prompt to ComponentSpec and factory run trigger.
"""

from __future__ import annotations

import logging
import re
from typing import List, Optional, Protocol, runtime_checkable

from pydantic import BaseModel, Field, ValidationError

from .intake_prompts import build_intake_prompt
from .llama_client import LlamaClient, LlamaClientError, extract_json_object, get_llama_client
from .orchestrator import FactoryOrchestrator, get_factory_orchestrator
from .spec import (
    ComponentSpec,
    DeploymentTarget,
    FactoryModuleType,
    VerificationPolicy,
)
from .state import FactoryRunRecord, FactoryRunStage

logger = logging.getLogger(__name__)

MODULE_KEYWORDS: dict[str, FactoryModuleType] = {
    "crud": FactoryModuleType.CRUD,
    "dashboard": FactoryModuleType.DASHBOARD,
    "kanban": FactoryModuleType.KANBAN,
    "chat": FactoryModuleType.CHAT,
    "report": FactoryModuleType.REPORT,
    "presentation": FactoryModuleType.PRESENTATION,
}

GARBAGE_PROMPTS = frozenset({"hello", "hello world", "hi", "test"})


class IntakeClarification(BaseModel):
    message: str
    suggestions: List[str] = Field(default_factory=list)


class IntakeInterpretation(BaseModel):
    """Agent-facing parse metadata."""

    module_type: Optional[FactoryModuleType] = None
    dependencies: List[str] = Field(default_factory=list)
    field_hints: List[str] = Field(default_factory=list)
    source: str = "interpreter"
    notes: str = ""


class IntakeParseResult(BaseModel):
    spec: ComponentSpec
    interpretation: IntakeInterpretation


class FactoryIntakeOutcome(BaseModel):
    """Structured response for agent-to-agent handoff."""

    run_id: str
    status: FactoryRunStage
    parsed_spec: ComponentSpec
    interpretation: IntakeInterpretation
    next_steps: List[str] = Field(default_factory=list)


class IntakeParseError(Exception):
    """Prompt could not be mapped to a ComponentSpec."""

    def __init__(self, clarification: IntakeClarification):
        super().__init__(clarification.message)
        self.clarification = clarification


@runtime_checkable
class IntakeInterpreter(Protocol):
    def interpret(self, prompt: str) -> IntakeParseResult:
        ...


class RuleBasedIntakeInterpreter:
    """Deterministic interpreter for tests and LLM fallback."""

    def interpret(self, prompt: str) -> IntakeParseResult:
        cleaned = prompt.strip()
        lowered = cleaned.lower()

        if not cleaned or lowered in GARBAGE_PROMPTS or len(cleaned.split()) <= 2 and "crud" not in lowered:
            if lowered in GARBAGE_PROMPTS or cleaned.lower() == "hello world":
                raise IntakeParseError(
                    IntakeClarification(
                        message="Please specify which module type to build (CRUD, dashboard, kanban, etc.) and what it should do.",
                        suggestions=[
                            "Example: Create a CRUD module for invoices with date and amount fields",
                            "Example: Build a dashboard module that uses the user-service data",
                        ],
                    )
                )

        module_type: Optional[FactoryModuleType] = None
        for keyword, enum_value in MODULE_KEYWORDS.items():
            if re.search(rf"\b{keyword}\b", lowered):
                module_type = enum_value
                break

        dependencies: List[str] = []
        if "user-service" in lowered or "user service" in lowered:
            dependencies.append("user-service")

        field_hints: List[str] = []
        if "date" in lowered and "amount" in lowered:
            field_hints.extend(["date", "amount"])
        elif "date" in lowered:
            field_hints.append("date")
        elif "amount" in lowered:
            field_hints.append("amount")

        if module_type is None:
            raise IntakeParseError(
                IntakeClarification(
                    message="Could not determine module type from the prompt. Please specify CRUD, dashboard, or another supported module kind.",
                    suggestions=["Add explicit module type, e.g. 'Create a CRUD for …'"],
                )
            )

        spec = ComponentSpec(
            intent=cleaned,
            module_type=module_type,
            dependencies=dependencies,
            field_hints=field_hints,
        )
        return IntakeParseResult(
            spec=spec,
            interpretation=IntakeInterpretation(
                module_type=module_type,
                dependencies=dependencies,
                field_hints=field_hints,
                source="rules",
            ),
        )


class LlamaIntakeInterpreter:
    """LLM-backed intake interpreter via stack2-llama-chat."""

    def __init__(
        self,
        client: Optional[LlamaClient] = None,
        *,
        fallback: Optional[IntakeInterpreter] = None,
    ):
        self._client = client or get_llama_client()
        self._fallback = fallback or RuleBasedIntakeInterpreter()

    def interpret(self, prompt: str) -> IntakeParseResult:
        try:
            completion = self._client.complete(build_intake_prompt(prompt))
            payload = extract_json_object(completion)
            return _dict_to_result(prompt, payload, source="llama")
        except (LlamaClientError, ValueError, ValidationError, KeyError, TypeError) as error:
            logger.warning("[factory-intake] llama interpret failed: %s", error)
            return self._fallback.interpret(prompt)


def _dict_to_result(
    original_prompt: str,
    payload: dict,
    *,
    source: str,
) -> IntakeParseResult:
    clarification = payload.get("clarification")
    if isinstance(clarification, str) and clarification.strip():
        raise IntakeParseError(
            IntakeClarification(
                message=clarification.strip(),
                suggestions=[
                    "Provide module type (CRUD, dashboard, kanban, chat, report, presentation)",
                    "List entity fields and any dependencies to reuse",
                ],
            )
        )

    module_type: Optional[FactoryModuleType] = None
    raw_module_type = payload.get("module_type")
    if raw_module_type:
        try:
            module_type = FactoryModuleType(str(raw_module_type).lower())
        except ValueError as error:
            raise IntakeParseError(
                IntakeClarification(
                    message=f"Unsupported module_type: {raw_module_type}",
                )
            ) from error

    if module_type is None:
        raise IntakeParseError(
            IntakeClarification(
                message="Please specify which module type to build (CRUD, dashboard, kanban, etc.).",
            )
        )

    intent = str(payload.get("intent") or original_prompt).strip()
    dependencies = payload.get("dependencies") or []
    field_hints = payload.get("field_hints") or []
    if not isinstance(dependencies, list):
        dependencies = []
    if not isinstance(field_hints, list):
        field_hints = []

    try:
        verification_policy = VerificationPolicy(str(payload.get("verification_policy", "lax")))
    except ValueError:
        verification_policy = VerificationPolicy.LAX
    try:
        deployment_target = DeploymentTarget(str(payload.get("deployment_target", "local")))
    except ValueError:
        deployment_target = DeploymentTarget.LOCAL

    spec = ComponentSpec(
        intent=intent,
        module_type=module_type,
        dependencies=[str(item) for item in dependencies if str(item).strip()],
        field_hints=[str(item) for item in field_hints if str(item).strip()],
        verification_policy=verification_policy,
        deployment_target=deployment_target,
    )
    return IntakeParseResult(
        spec=spec,
        interpretation=IntakeInterpretation(
            module_type=module_type,
            dependencies=spec.dependencies,
            field_hints=spec.field_hints,
            source=source,
            notes="Parsed from natural-language intake",
        ),
    )


def _payload_to_result(
    original_prompt: str,
    payload: dict,
    *,
    source: str,
) -> IntakeParseResult:
    return _dict_to_result(original_prompt, payload, source=source)


class IntakeService:
    """Parse natural-language prompts and start factory runs."""

    def __init__(
        self,
        interpreter: Optional[IntakeInterpreter] = None,
        orchestrator: Optional[FactoryOrchestrator] = None,
    ):
        self._interpreter = interpreter or LlamaIntakeInterpreter()
        self._orchestrator = orchestrator

    def parse_prompt(self, prompt: str) -> IntakeParseResult:
        if not prompt or not prompt.strip():
            raise IntakeParseError(
                IntakeClarification(message="Prompt must not be empty."),
            )
        return self._interpreter.interpret(prompt.strip())

    def start_from_prompt(
        self,
        prompt: str,
        *,
        max_retries: Optional[int] = None,
    ) -> FactoryIntakeOutcome:
        parsed = self.parse_prompt(prompt)
        orchestrator = self._orchestrator or get_factory_orchestrator()
        record = orchestrator.start_run(parsed.spec, max_retries=max_retries)
        return _outcome_from_record(record, parsed.interpretation)


def _outcome_from_record(
    record: FactoryRunRecord,
    interpretation: IntakeInterpretation,
) -> FactoryIntakeOutcome:
    run_id = record.run_id
    return FactoryIntakeOutcome(
        run_id=run_id,
        status=record.status,
        parsed_spec=record.spec,
        interpretation=interpretation,
        next_steps=[
            f"Poll GET /api/factory/runs/{run_id}?include_events=true for obligation timeline",
            f"Start pipeline via POST /api/factory/pipeline/run with prompt or spec",
        ],
    )


_intake_service: Optional[IntakeService] = None


def get_intake_service(*, force_new: bool = False) -> IntakeService:
    global _intake_service
    if _intake_service is None or force_new:
        _intake_service = IntakeService()
    return _intake_service


def reset_intake_service() -> None:
    global _intake_service
    _intake_service = None
