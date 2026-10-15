"""
PipelineOrchestrator — end-to-end factory lifecycle with obligation gates.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Dict, List, Optional

from .artifacts import cleanup_run_workspace, workspace_exists
from .context import CatalogContextGatheringService, ContextGatheringService
from .context_ranker import ContextRanker, get_context_ranker
from .dependency_resolver import DependencyResolver
from .dynamic_scavenger import DynamicScavenger, ScanBudget
from .scavenger_context import ScavengerContextKnowledgeService
from .deploy import DeployService, FactoryDeployService, _derive_module_id
from .generator_adapter import FactoryGeneratorAdapter, ModuleGeneratorAdapter
from .intake import IntakeParseError, IntakeService, get_intake_service
from .obligations import (
    ObligationId,
    ObligationViolation,
    RunObligationReport,
    assert_dependencies_resolved,
    assert_factory_catalog_registered,
    assert_runtime_deployed,
    assert_set_registered,
    build_terminal_obligation_report,
)
from .orchestrator import FactoryOrchestrator, get_factory_orchestrator
from .pipeline_context import ContextGatherResult, PipelineArtifacts, ResolvedDependency
from .preflight import run_preflight
from .register import FactoryRegisterService, RegisterService
from .spec import ComponentSpec
from .spec_defaults import apply_production_spec_defaults
from .state import FactoryRunEvent, FactoryRunRecord, FactoryRunStage
from .verification import VerificationService, get_verification_service
from .webhook_dispatch import dispatch_pipeline_webhook

logger = logging.getLogger(__name__)


class PipelineRunOutcome:
    """Agent-facing pipeline execution result."""

    def __init__(
        self,
        *,
        run_id: str,
        status: FactoryRunStage,
        parsed_spec: ComponentSpec,
        artifacts: PipelineArtifacts,
        next_steps: List[str],
        error: Optional[str] = None,
        obligation_report: Optional[RunObligationReport] = None,
        deployment_success: bool = False,
    ):
        self.run_id = run_id
        self.status = status
        self.parsed_spec = parsed_spec
        self.artifacts = artifacts
        self.next_steps = next_steps
        self.error = error
        self.obligation_report = obligation_report
        self.deployment_success = deployment_success


class PipelineOrchestrator:
    """
    Autonomous chain: intake → preflight → context → generate → verify → deploy → register.

    COMPLETED is emitted only when all run obligations for the ComponentSpec are met.
    """

    def __init__(
        self,
        orchestrator: Optional[FactoryOrchestrator] = None,
        *,
        intake_service: Optional[IntakeService] = None,
        context_service: Optional[ContextGatheringService] = None,
        generator: Optional[FactoryGeneratorAdapter] = None,
        verification_service: Optional[VerificationService] = None,
        deploy_service: Optional[DeployService] = None,
        register_service: Optional[RegisterService] = None,
        cleanup_on_failure: bool = True,
        context_knowledge: Optional[ScavengerContextKnowledgeService] = None,
        dependency_resolver: Optional[DependencyResolver] = None,
        dynamic_scavenger: Optional[DynamicScavenger] = None,
        context_ranker: Optional[ContextRanker] = None,
    ):
        self._orchestrator = orchestrator or get_factory_orchestrator()
        self._intake = intake_service or get_intake_service()
        self._context = context_service or CatalogContextGatheringService()
        self._context_knowledge = context_knowledge or ScavengerContextKnowledgeService()
        self._dependency_resolver = dependency_resolver or DependencyResolver()
        self._dynamic_scavenger = dynamic_scavenger or DynamicScavenger(
            knowledge_service=self._context_knowledge,
        )
        self._context_ranker = context_ranker or get_context_ranker()
        self._generator = generator or ModuleGeneratorAdapter()
        self._verification = verification_service or get_verification_service()
        self._deploy = deploy_service or FactoryDeployService()
        self._register = register_service or FactoryRegisterService()
        self._cleanup_on_failure = cleanup_on_failure

    def start_run(
        self,
        *,
        prompt: Optional[str] = None,
        spec: Optional[ComponentSpec] = None,
        max_retries: Optional[int] = None,
        allow_local_deploy: bool = False,
    ) -> FactoryRunRecord:
        if prompt and spec:
            raise ValueError("Provide either prompt or spec, not both")
        if prompt:
            parsed = self._intake.parse_prompt(prompt)
            resolved_spec = apply_production_spec_defaults(
                parsed.spec,
                allow_local_deploy=allow_local_deploy,
            )
            return self._orchestrator.start_run(resolved_spec, max_retries=max_retries)
        if spec is None:
            raise ValueError("Either prompt or spec is required")
        resolved_spec = apply_production_spec_defaults(
            spec,
            allow_local_deploy=allow_local_deploy,
        )
        return self._orchestrator.start_run(resolved_spec, max_retries=max_retries)

    def execute(
        self,
        run_id: str,
        *,
        auto_repair: bool = True,
        allow_local_deploy: bool = False,
    ) -> PipelineRunOutcome:
        record = self._orchestrator.get_run(run_id)
        spec = record.spec
        artifacts = PipelineArtifacts()
        context_result: Optional[ContextGatherResult] = None
        preflight_passed = False
        artifacts_generated = False
        verification_passed = False

        self._emit(
            run_id,
            FactoryRunStage.INTAKE,
            "pipeline_started",
            "Factory pipeline execution started",
            {"run_id": run_id, "deployment_target": spec.deployment_target.value},
        )

        try:
            run_preflight(spec, allow_local_deploy=allow_local_deploy)
            preflight_passed = True
            self._emit(
                run_id,
                FactoryRunStage.INTAKE,
                "preflight_passed",
                "Factory preflight checks passed",
                {"deployment_target": spec.deployment_target.value},
            )

            context_result = self._run_context_stage(run_id, spec, artifacts)
            artifacts.workspace_path = context_result.workspace_path
            artifacts.resolved_dependencies = context_result.resolved_dependencies
            artifacts.context_window = context_result.context_window
            assert_dependencies_resolved(spec, context_result)

            self._run_generation_stage(
                run_id,
                spec,
                context_window=context_result.context_window,
            )
            artifacts_generated = True
            record = self._orchestrator.get_run(run_id)

            record, report = self._orchestrator.run_verification(
                run_id,
                verification_service=self._verification,
                generator=self._generator if auto_repair else None,
                auto_repair=auto_repair,
            )
            if record.status == FactoryRunStage.FAILED:
                obligation_report = build_terminal_obligation_report(
                    spec,
                    allow_local_deploy=allow_local_deploy,
                    preflight_passed=preflight_passed,
                    context_result=context_result,
                    artifacts_generated=artifacts_generated,
                    verification_passed=False,
                    deploy_result=None,
                    register_result=None,
                )
                self._rollback(run_id, artifacts, record.error or report.summary)
                return self._outcome(
                    record,
                    artifacts,
                    error=record.error,
                    obligation_report=obligation_report,
                )
            verification_passed = True

            artifacts.module_id = _derive_module_id(record.spec)
            deploy_result = self._deploy.deploy(run_id, record.spec, artifacts)
            assert_runtime_deployed(
                record.spec,
                deploy_result,
                allow_local_deploy=allow_local_deploy,
            )
            artifacts.deploy_result = deploy_result
            artifacts.module_id = deploy_result.module_id
            artifacts.deployed = True
            self._emit(
                run_id,
                FactoryRunStage.DEPLOYING,
                "deployment_completed",
                f"Deployed module {deploy_result.module_id} to {deploy_result.target}",
                deploy_result.model_dump(mode="json"),
            )

            register_result = self._register.register(run_id, record.spec, artifacts)
            assert_factory_catalog_registered(register_result)
            assert_set_registered(record.spec, register_result)
            artifacts.register_result = register_result
            artifacts.registered = True
            self._emit(
                run_id,
                FactoryRunStage.DEPLOYING,
                "registration_completed",
                f"Registered module {register_result.module_id} in factory catalog",
                register_result.model_dump(mode="json"),
            )

            obligation_report = build_terminal_obligation_report(
                spec,
                allow_local_deploy=allow_local_deploy,
                preflight_passed=preflight_passed,
                context_result=context_result,
                artifacts_generated=artifacts_generated,
                verification_passed=verification_passed,
                deploy_result=deploy_result,
                register_result=register_result,
            )
            if not obligation_report.all_met:
                return self._fail_obligation(
                    run_id,
                    artifacts,
                    ObligationViolation(
                        ObligationId.RUNTIME_DEPLOYED,
                        f"Terminal obligations unmet: {', '.join(obligation_report.unmet)}",
                        details={"obligations": obligation_report.model_dump(mode="json")},
                    ),
                    obligation_report=obligation_report,
                )

            final = self._orchestrator.complete_run(
                run_id,
                message="Pipeline completed — all obligations satisfied",
            )
            self._emit(
                run_id,
                FactoryRunStage.COMPLETED,
                "pipeline_completed",
                "End-to-end factory pipeline finished successfully",
                {
                    "module_id": artifacts.module_id,
                    "deployment_success": obligation_report.deployment_success,
                    "obligations": obligation_report.model_dump(mode="json"),
                },
            )
            return self._outcome(
                final,
                artifacts,
                obligation_report=obligation_report,
                deployment_success=obligation_report.deployment_success,
            )

        except IntakeParseError:
            raise
        except ObligationViolation as error:
            obligation_report = build_terminal_obligation_report(
                spec,
                allow_local_deploy=allow_local_deploy,
                preflight_passed=preflight_passed,
                context_result=context_result,
                artifacts_generated=artifacts_generated,
                verification_passed=verification_passed,
                deploy_result=artifacts.deploy_result,
                register_result=artifacts.register_result,
            )
            return self._fail_obligation(
                run_id,
                artifacts,
                error,
                obligation_report=obligation_report,
            )
        except Exception as error:  # noqa: BLE001
            logger.exception("[factory-pipeline] execute_failed run_id=%s", run_id)
            record = self._orchestrator.get_run(run_id)
            if record.status not in {FactoryRunStage.FAILED, FactoryRunStage.COMPLETED}:
                record = self._orchestrator.fail_run(
                    run_id,
                    message=str(error),
                    details={"stage": "pipeline_execute"},
                )
            self._rollback(run_id, artifacts, str(error))
            return self._outcome(record, artifacts, error=str(error))

    def start_and_execute_async(
        self,
        *,
        prompt: Optional[str] = None,
        spec: Optional[ComponentSpec] = None,
        max_retries: Optional[int] = None,
        auto_repair: bool = True,
        allow_local_deploy: bool = False,
        webhook_url: Optional[str] = None,
    ) -> FactoryRunRecord:
        record = self.start_run(
            prompt=prompt,
            spec=spec,
            max_retries=max_retries,
            allow_local_deploy=allow_local_deploy,
        )

        def _worker() -> None:
            outcome: Optional[PipelineRunOutcome] = None
            try:
                outcome = self.execute(
                    record.run_id,
                    auto_repair=auto_repair,
                    allow_local_deploy=allow_local_deploy,
                )
            except IntakeParseError as error:
                self._orchestrator.fail_run(
                    record.run_id,
                    message=error.clarification.message,
                    details={"clarification": error.clarification.model_dump(mode="json")},
                )
            finally:
                if webhook_url:
                    final = self._orchestrator.get_run(record.run_id)
                    obligation_payload = None
                    if outcome and outcome.obligation_report:
                        obligation_payload = outcome.obligation_report.model_dump(mode="json")
                    dispatch_pipeline_webhook(
                        webhook_url,
                        run_id=record.run_id,
                        status=final.status.value,
                        deployment_success=(
                            outcome.deployment_success if outcome is not None else False
                        ),
                        error=final.error,
                        module_id=(
                            outcome.artifacts.module_id
                            if outcome and outcome.artifacts.module_id
                            else None
                        ),
                        obligations=obligation_payload,
                    )

        thread = threading.Thread(
            target=_worker,
            daemon=True,
            name=f"factory-pipeline-{record.run_id[:8]}",
        )
        thread.start()
        return record

    def _fail_obligation(
        self,
        run_id: str,
        artifacts: PipelineArtifacts,
        error: ObligationViolation,
        *,
        obligation_report: Optional[RunObligationReport] = None,
    ) -> PipelineRunOutcome:
        record = self._orchestrator.fail_run(
            run_id,
            message=error.message,
            details={
                "obligation": error.obligation.value,
                **error.details,
                "obligations": (
                    obligation_report.model_dump(mode="json") if obligation_report else None
                ),
            },
        )
        self._emit(
            run_id,
            FactoryRunStage.FAILED,
            "obligation_failed",
            error.message,
            {
                "obligation": error.obligation.value,
                "details": error.details,
            },
        )
        self._rollback(run_id, artifacts, error.message)
        return self._outcome(
            record,
            artifacts,
            error=error.message,
            obligation_report=obligation_report,
            deployment_success=False,
        )

    def _run_context_stage(
        self,
        run_id: str,
        spec: ComponentSpec,
        artifacts: PipelineArtifacts,
    ) -> ContextGatherResult:
        self._orchestrator.transition(
            run_id,
            FactoryRunStage.CONTEXT_GATHERING,
            message="Gathering dependency context from catalogs",
        )

        resolution = self._dependency_resolver.resolve(spec.intent, list(spec.dependencies))
        effective_deps = resolution.effective

        self._emit(
            run_id,
            FactoryRunStage.CONTEXT_GATHERING,
            "dependencies_inferred",
            f"Inferred {len(resolution.inferred)} hidden dependencies from prompt",
            {
                "declared": resolution.declared,
                "inferred": resolution.inferred,
                "effective": resolution.effective,
                "catalog_hits": resolution.catalog_hits,
            },
        )

        result = self._context.gather_dependencies(run_id, effective_deps)
        result = result.model_copy(
            update={
                "inferred_dependencies": resolution.inferred,
                "effective_dependencies": effective_deps,
            },
        )

        snippets = self._context_knowledge.fetch_for_dependencies(
            [item.dependency_id for item in result.resolved_dependencies],
        )
        resolved_ids = {item.dependency_id for item in result.resolved_dependencies}
        still_missing = [dep for dep in effective_deps if dep not in resolved_ids]

        for dep_id in still_missing:
            scan = self._dynamic_scavenger.targeted_search(dep_id, budget=ScanBudget())
            if not scan.found:
                continue
            snippets.extend(scan.snippets)
            result.resolved_dependencies.append(
                ResolvedDependency(
                    dependency_id=dep_id,
                    catalog=scan.catalog or "dynamic-scavenger",
                    module_id=dep_id,
                    summary=f"Discovered via {scan.reason}",
                ),
            )
            result.missing_dependencies = [
                item for item in result.missing_dependencies if item != dep_id
            ]
            self._emit(
                run_id,
                FactoryRunStage.CONTEXT_GATHERING,
                "dependency_auto_ingested",
                f"Dynamic scavenger resolved {dep_id}",
                {
                    "dependency_id": dep_id,
                    "snippets": len(scan.snippets),
                    "elapsed_seconds": scan.elapsed_seconds,
                    "files_scanned": scan.files_scanned,
                    "reason": scan.reason,
                },
            )

        direct_dependencies = [
            item.dependency_id for item in result.resolved_dependencies
        ] or effective_deps

        context_window = self._context_ranker.rank_and_pack(
            snippets,
            target_module=_target_module_from_spec(spec),
            direct_dependencies=direct_dependencies,
            module_type=spec.module_type.value if spec.module_type else None,
        )
        result = result.model_copy(update={"context_window": context_window})
        self._emit(
            run_id,
            FactoryRunStage.CONTEXT_GATHERING,
            "context_gathered",
            f"Resolved {len(result.resolved_dependencies)} dependencies; "
            f"packed {len(context_window.snippets)} context snippets "
            f"({context_window.token_count}/{context_window.token_budget} tokens)",
            {
                "resolved": [item.model_dump(mode="json") for item in result.resolved_dependencies],
                "missing": result.missing_dependencies,
                "inferred": result.inferred_dependencies,
                "effective": result.effective_dependencies,
                "context_window": context_window.model_dump(mode="json"),
            },
        )
        return result

    def _run_generation_stage(
        self,
        run_id: str,
        spec: ComponentSpec,
        *,
        context_window=None,
    ) -> None:
        self._orchestrator.transition(
            run_id,
            FactoryRunStage.GENERATING,
            message="Generating module artifacts",
        )
        self._generator.generate(run_id, spec, context_window=context_window)
        self._emit(
            run_id,
            FactoryRunStage.GENERATING,
            "generation_completed",
            "Module artifacts materialized in run workspace",
            {
                "workspace": artifacts_workspace(run_id),
                "context_snippets": len(context_window.snippets) if context_window else 0,
            },
        )

    def _rollback(self, run_id: str, artifacts: PipelineArtifacts, reason: str) -> None:
        self._emit(
            run_id,
            FactoryRunStage.FAILED,
            "pipeline_rollback",
            f"Pipeline rollback: {reason}",
            {
                "deployed": artifacts.deployed,
                "registered": artifacts.registered,
                "cleanup_workspace": self._cleanup_on_failure,
            },
        )
        if artifacts.registered:
            self._register.unregister(artifacts)
            artifacts.registered = False
        if artifacts.deployed:
            self._deploy.rollback(artifacts)
            artifacts.deployed = False
        if self._cleanup_on_failure and workspace_exists(run_id):
            cleanup_run_workspace(run_id)

    def _emit(
        self,
        run_id: str,
        stage: FactoryRunStage,
        event_type: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        self._orchestrator.append_run_event(
            run_id,
            FactoryRunEvent(
                stage=stage,
                event_type=event_type,
                message=message,
                details=details,
            ),
        )

    def _outcome(
        self,
        record: FactoryRunRecord,
        artifacts: PipelineArtifacts,
        *,
        error: Optional[str] = None,
        obligation_report: Optional[RunObligationReport] = None,
        deployment_success: bool = False,
    ) -> PipelineRunOutcome:
        run_id = record.run_id
        next_steps = [
            f"Poll GET /api/factory/runs/{run_id}?include_events=true for obligation timeline",
        ]
        if record.status == FactoryRunStage.COMPLETED and deployment_success:
            next_steps.extend(
                [
                    f"Module {artifacts.module_id} deployed and registered",
                    f"Inspect artifacts at {artifacts.workspace_path or 'data/factory-runs/' + run_id}",
                ]
            )
        elif record.status == FactoryRunStage.FAILED:
            unmet = obligation_report.unmet if obligation_report else []
            if unmet:
                next_steps.append(
                    f"Obligations unmet: {', '.join(unmet)} — fix root cause and start a new run",
                )
            else:
                next_steps.append(
                    "Review obligation_failed and pipeline_rollback events",
                )
        else:
            next_steps.append("Pipeline is still running — continue polling until terminal status")

        return PipelineRunOutcome(
            run_id=run_id,
            status=record.status,
            parsed_spec=record.spec,
            artifacts=artifacts,
            next_steps=next_steps,
            error=error or record.error,
            obligation_report=obligation_report,
            deployment_success=deployment_success,
        )


def artifacts_workspace(run_id: str) -> str:
    from .artifacts import get_run_workspace  # noqa: PLC0415

    return str(get_run_workspace(run_id))


def _target_module_from_spec(spec: ComponentSpec) -> str:
    from .intent_naming import module_name_from_intent  # noqa: PLC0415

    return module_name_from_intent(spec.intent)


_pipeline_instance: Optional[PipelineOrchestrator] = None


def get_pipeline_orchestrator(*, force_new: bool = False) -> PipelineOrchestrator:
    global _pipeline_instance
    if _pipeline_instance is None or force_new:
        _pipeline_instance = PipelineOrchestrator()
    return _pipeline_instance


def reset_pipeline_orchestrator() -> None:
    global _pipeline_instance
    from . import catalog as catalog_module  # noqa: PLC0415
    from . import intake as intake_module  # noqa: PLC0415
    from . import orchestrator as orchestrator_module  # noqa: PLC0415

    _pipeline_instance = None
    catalog_module.reset_factory_catalog()
    intake_module.reset_intake_service()
    orchestrator_module.reset_factory_orchestrator()
