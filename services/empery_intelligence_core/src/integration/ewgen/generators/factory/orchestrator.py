"""
FactoryOrchestrator — stateful factory run lifecycle manager.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, Optional

from .generator_adapter import FactoryGeneratorAdapter
from .repair import build_repair_prompt
from .spec import ComponentSpec
from .state import (
    FactoryRunEvent,
    FactoryRunRecord,
    FactoryRunStage,
    TERMINAL_STAGES,
    can_transition,
    utc_now_iso,
)
from .store import (
    FactoryRunNotFoundError,
    FactoryRunStore,
    FactoryStoreError,
    FactoryTransitionError,
    build_run_record,
    get_factory_run_store,
)

logger = logging.getLogger(__name__)


class FactoryOrchestrator:
    """Creates and advances durable factory runs backed by Redis."""

    def __init__(self, store: FactoryRunStore):
        self._store = store

    def start_run(
        self,
        spec: ComponentSpec,
        *,
        max_retries: Optional[int] = None,
    ) -> FactoryRunRecord:
        run_id = str(uuid.uuid4())
        record = build_run_record(
            run_id,
            spec,
            status=FactoryRunStage.INTAKE,
            max_retries=max_retries,
        )
        event = FactoryRunEvent(
            stage=FactoryRunStage.INTAKE,
            event_type="run_created",
            message="Factory run created",
            details={
                "spec_version": spec.spec_version,
                "deployment_target": spec.deployment_target.value,
                "verification_policy": spec.verification_policy.value,
            },
        )
        self._store.create_run(record, event)
        logger.info(
            "[factory] run_created run_id=%s status=%s",
            run_id,
            FactoryRunStage.INTAKE.value,
        )
        return record

    def get_run(self, run_id: str) -> FactoryRunRecord:
        record = self._store.get_record(run_id)
        if record is None:
            raise FactoryRunNotFoundError(f"Factory run not found: {run_id}")
        return record

    def get_status(self, run_id: str) -> FactoryRunStage:
        raw = self._store.get_status(run_id)
        if raw is None:
            raise FactoryRunNotFoundError(f"Factory run not found: {run_id}")
        return FactoryRunStage(raw)

    def transition(
        self,
        run_id: str,
        to_stage: FactoryRunStage,
        *,
        message: str = "",
        details: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> FactoryRunRecord:
        record = self.get_run(run_id)
        from_stage = record.status

        if from_stage in TERMINAL_STAGES:
            raise FactoryTransitionError(
                f"Run {run_id} is terminal ({from_stage.value})",
                current_status=from_stage.value,
            )
        if not can_transition(from_stage, to_stage):
            raise FactoryTransitionError(
                f"Invalid transition {from_stage.value} -> {to_stage.value}",
                current_status=from_stage.value,
            )

        now = utc_now_iso()
        updated = record.model_copy(
            update={
                "status": to_stage,
                "updated_at": now,
                "error": error if to_stage == FactoryRunStage.FAILED else None,
            }
        )
        event_type = "stage_failed" if to_stage == FactoryRunStage.FAILED else "stage_transition"
        event = FactoryRunEvent(
            stage=to_stage,
            event_type=event_type,
            message=message or f"Transitioned to {to_stage.value}",
            details=details,
        )
        self._store.transition_run(
            run_id,
            expected_status=from_stage,
            new_status=to_stage,
            record=updated,
            event=event,
        )
        if to_stage in TERMINAL_STAGES:
            self._cleanup_context_transport(run_id)
        logger.info(
            "[factory] transition run_id=%s from=%s to=%s",
            run_id,
            from_stage.value,
            to_stage.value,
        )
        return updated

    def fail_run(
        self,
        run_id: str,
        *,
        message: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> FactoryRunRecord:
        record = self.get_run(run_id)
        if record.status == FactoryRunStage.FAILED:
            return record
        if record.status == FactoryRunStage.COMPLETED:
            raise FactoryTransitionError(
                f"Run {run_id} already completed",
                current_status=record.status.value,
            )
        if can_transition(record.status, FactoryRunStage.FAILED):
            return self.transition(
                run_id,
                FactoryRunStage.FAILED,
                message=message,
                details=details,
                error=message,
            )

        now = utc_now_iso()
        updated = record.model_copy(
            update={
                "status": FactoryRunStage.FAILED,
                "updated_at": now,
                "error": message,
            }
        )
        event = FactoryRunEvent(
            stage=FactoryRunStage.FAILED,
            event_type="stage_failed",
            message=message,
            details=details,
        )
        self._store.transition_run(
            run_id,
            expected_status=record.status,
            new_status=FactoryRunStage.FAILED,
            record=updated,
            event=event,
        )
        self._cleanup_context_transport(run_id)
        return updated

    def _cleanup_context_transport(self, run_id: str) -> None:
        """Remove context spill files when a run reaches a terminal state."""
        from .context_transport import cleanup_context_transport_artifacts  # noqa: PLC0415

        cleanup_context_transport_artifacts(run_id)

    def append_run_event(self, run_id: str, event: FactoryRunEvent) -> None:
        """Append a timeline event without changing run status."""
        self._store.append_event(run_id, event)

    def complete_run(self, run_id: str, *, message: str = "Run completed") -> FactoryRunRecord:
        """Mark a verified run as COMPLETED after deployment."""
        return self.transition(
            run_id,
            FactoryRunStage.COMPLETED,
            message=message,
        )

    def run_verification(
        self,
        run_id: str,
        *,
        verification_service: Optional[Any] = None,
        generator: Optional[FactoryGeneratorAdapter] = None,
        auto_repair: bool = False,
    ) -> tuple[FactoryRunRecord, Any]:
        """
        Execute verification gates with optional self-healing repair loop.

        On failure with ``auto_repair=True`` and a generator adapter, retries up
        to ``max_retries`` before transitioning to FAILED.
        """
        from .verification import get_verification_service  # noqa: PLC0415

        service = verification_service or get_verification_service()

        while True:
            _record, report = self._execute_verification_pass(
                run_id,
                verification_service=service,
            )

            if report.all_passed:
                updated = self.transition(
                    run_id,
                    FactoryRunStage.DEPLOYING,
                    message="Verification passed — ready for deployment",
                    details={"verification": report.model_dump(mode="json")},
                )
                return updated, report

            record = self.get_run(run_id)
            can_repair = (
                auto_repair
                and generator is not None
                and record.retry_count < record.max_retries
            )

            self.append_run_event(
                run_id,
                FactoryRunEvent(
                    stage=FactoryRunStage.VERIFYING,
                    event_type="verification_error",
                    message=report.summary,
                    details={
                        "retry_count": record.retry_count,
                        "max_retries": record.max_retries,
                        "verification": report.model_dump(mode="json"),
                    },
                ),
            )

            if not can_repair:
                updated = self.fail_run(
                    run_id,
                    message=report.summary,
                    details={
                        "verification": report.model_dump(mode="json"),
                        "retry_count": record.retry_count,
                        "max_retries": record.max_retries,
                        "exhausted": record.retry_count >= record.max_retries,
                    },
                )
                return updated, report

            record = self._trigger_repair(run_id, report, generator)
            logger.info(
                "[factory] repair_triggered run_id=%s retry=%s/%s",
                run_id,
                record.retry_count,
                record.max_retries,
            )

    def _execute_verification_pass(
        self,
        run_id: str,
        *,
        verification_service: Any,
    ) -> tuple[FactoryRunRecord, Any]:
        from .verification import VerificationReport  # noqa: PLC0415

        record = self.get_run(run_id)
        if record.status == FactoryRunStage.GENERATING:
            record = self.transition(
                run_id,
                FactoryRunStage.VERIFYING,
                message="Verification started",
            )
        elif record.status != FactoryRunStage.VERIFYING:
            raise FactoryTransitionError(
                f"Run {run_id} must be in GENERATING or VERIFYING to verify "
                f"(current: {record.status.value})",
                current_status=record.status.value,
            )

        report = verification_service.verify_run(
            run_id,
            policy=record.spec.verification_policy,
        )
        assert isinstance(report, VerificationReport)

        self.append_run_event(
            run_id,
            FactoryRunEvent(
                stage=FactoryRunStage.VERIFYING,
                event_type="verification_completed",
                message=report.summary,
                details=report.model_dump(mode="json"),
            ),
        )
        return self.get_run(run_id), report

    def _trigger_repair(
        self,
        run_id: str,
        report: Any,
        generator: FactoryGeneratorAdapter,
    ) -> FactoryRunRecord:
        record = self.get_run(run_id)
        repair_prompt = build_repair_prompt(record.spec, report)
        next_retry = record.retry_count + 1
        updated_spec = record.spec.model_copy(
            update={"repair_feedback": repair_prompt},
        )

        self.append_run_event(
            run_id,
            FactoryRunEvent(
                stage=FactoryRunStage.VERIFYING,
                event_type="repair_retry",
                message=f"Self-healing repair attempt {next_retry}/{record.max_retries}",
                details={
                    "retry_count": next_retry,
                    "max_retries": record.max_retries,
                    "repair_prompt": repair_prompt,
                },
            ),
        )

        patched = record.model_copy(
            update={
                "retry_count": next_retry,
                "spec": updated_spec,
                "updated_at": utc_now_iso(),
            }
        )
        self._store.patch_record(run_id, patched)

        self.transition(
            run_id,
            FactoryRunStage.GENERATING,
            message=f"Repair generation attempt {next_retry}",
            details={"retry_count": next_retry},
        )

        from .context_transport import cleanup_context_transport_artifacts  # noqa: PLC0415

        cleanup_context_transport_artifacts(run_id)

        generator.generate(run_id, updated_spec, retry_count=next_retry)
        return self.get_run(run_id)

    def get_timeline(self, run_id: str) -> list[FactoryRunEvent]:
        if self._store.get_status(run_id) is None:
            raise FactoryRunNotFoundError(f"Factory run not found: {run_id}")
        return self._store.get_events(run_id)


_orchestrator_instance: Optional[FactoryOrchestrator] = None


def get_factory_orchestrator(*, force_new: bool = False) -> FactoryOrchestrator:
    global _orchestrator_instance
    if _orchestrator_instance is not None and not force_new:
        return _orchestrator_instance
    store = get_factory_run_store(force_new=force_new)
    _orchestrator_instance = FactoryOrchestrator(store)
    return _orchestrator_instance


def reset_factory_orchestrator() -> None:
    """Test helper — clear cached singleton."""
    global _orchestrator_instance
    from . import store as store_module  # noqa: PLC0415
    from . import verification as verification_module  # noqa: PLC0415

    _orchestrator_instance = None
    store_module._store_instance = None
    verification_module._verification_service = None
