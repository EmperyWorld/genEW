"""
Run obligation model — contractual gates before terminal COMPLETED.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .pipeline_context import ContextGatherResult, DeployResult, RegisterResult
from .spec import ComponentSpec, DeploymentTarget


class ObligationId(str, Enum):
    """Required outcomes for a trustworthy factory run."""

    PREFLIGHT_PASSED = "preflight_passed"
    DEPENDENCIES_RESOLVED = "dependencies_resolved"
    ARTIFACTS_GENERATED = "artifacts_generated"
    VERIFICATION_PASSED = "verification_passed"
    RUNTIME_DEPLOYED = "runtime_deployed"
    FACTORY_CATALOG_REGISTERED = "factory_catalog_registered"
    SET_REGISTERED = "set_registered"


class ObligationViolation(Exception):
    """Raised when a pipeline stage cannot satisfy a run obligation."""

    def __init__(
        self,
        obligation: ObligationId,
        message: str,
        *,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.obligation = obligation
        self.message = message
        self.details = details or {}


class RunObligationStatus(BaseModel):
    obligation: ObligationId
    met: bool
    message: str = ""


class RunObligationReport(BaseModel):
    """Agent-facing obligation checklist for a factory run."""

    all_met: bool = False
    deployment_success: bool = False
    obligations: List[RunObligationStatus] = Field(default_factory=list)
    unmet: List[str] = Field(default_factory=list)

    @classmethod
    def from_statuses(cls, statuses: List[RunObligationStatus]) -> "RunObligationReport":
        unmet = [item.obligation.value for item in statuses if not item.met]
        all_met = len(unmet) == 0
        deployment_success = all_met and ObligationId.RUNTIME_DEPLOYED.value not in unmet
        return cls(
            all_met=all_met,
            deployment_success=deployment_success,
            obligations=statuses,
            unmet=unmet,
        )


def required_obligations_for_spec(
    spec: ComponentSpec,
    *,
    allow_local_deploy: bool,
) -> List[ObligationId]:
    required = [
        ObligationId.PREFLIGHT_PASSED,
        ObligationId.ARTIFACTS_GENERATED,
        ObligationId.VERIFICATION_PASSED,
        ObligationId.RUNTIME_DEPLOYED,
        ObligationId.FACTORY_CATALOG_REGISTERED,
    ]
    if spec.dependencies:
        required.insert(1, ObligationId.DEPENDENCIES_RESOLVED)
    if spec.deployment_target == DeploymentTarget.PODMAN:
        required.append(ObligationId.SET_REGISTERED)
    if allow_local_deploy and spec.deployment_target == DeploymentTarget.LOCAL:
        # Dry-run only — runtime_deployed means workspace materialized, not SET.
        pass
    return required


def assert_dependencies_resolved(
    spec: ComponentSpec,
    context_result: ContextGatherResult,
) -> None:
    effective = context_result.effective_dependencies or list(spec.dependencies)
    if not effective:
        return
    if context_result.missing_dependencies:
        raise ObligationViolation(
            ObligationId.DEPENDENCIES_RESOLVED,
            f"Unresolved dependencies: {', '.join(context_result.missing_dependencies)}",
            details={
                "missing": list(context_result.missing_dependencies),
                "declared": list(spec.dependencies),
                "inferred": list(context_result.inferred_dependencies),
                "effective": list(effective),
                "resolved": [
                    item.dependency_id for item in context_result.resolved_dependencies
                ],
            },
        )


def assert_runtime_deployed(
    spec: ComponentSpec,
    deploy_result: DeployResult,
    *,
    allow_local_deploy: bool,
) -> None:
    if spec.deployment_target == DeploymentTarget.REMOTE:
        raise ObligationViolation(
            ObligationId.RUNTIME_DEPLOYED,
            "deployment_target=remote is not implemented",
            details={"target": spec.deployment_target.value},
        )

    if spec.deployment_target == DeploymentTarget.LOCAL:
        if not allow_local_deploy:
            raise ObligationViolation(
                ObligationId.RUNTIME_DEPLOYED,
                "LOCAL deployment is disabled for production pipeline runs; "
                "set deployment_target=podman or allow_local_deploy=true for dry-run",
                details={"target": deploy_result.target, "mode": deploy_result.details.get("mode")},
            )
        mode = str(deploy_result.details.get("mode") or "")
        if mode != "local-workspace":
            raise ObligationViolation(
                ObligationId.RUNTIME_DEPLOYED,
                f"Unexpected LOCAL deploy mode: {mode or 'unknown'}",
                details={"deploy_result": deploy_result.model_dump(mode="json")},
            )
        return

    if spec.deployment_target == DeploymentTarget.PODMAN:
        mode = str(deploy_result.details.get("mode") or "")
        if mode not in {"set-template", "workspace-copy"}:
            raise ObligationViolation(
                ObligationId.RUNTIME_DEPLOYED,
                f"PODMAN deploy did not reach SET runtime (mode={mode or 'unknown'})",
                details={"deploy_result": deploy_result.model_dump(mode="json")},
            )


def assert_factory_catalog_registered(register_result: RegisterResult) -> None:
    if not register_result.registered or not register_result.factory_catalog_registered:
        raise ObligationViolation(
            ObligationId.FACTORY_CATALOG_REGISTERED,
            "Factory catalog registration failed",
            details={"register_result": register_result.model_dump(mode="json")},
        )


def assert_set_registered(
    spec: ComponentSpec,
    register_result: RegisterResult,
) -> None:
    if spec.deployment_target != DeploymentTarget.PODMAN:
        return
    if not register_result.set_registered:
        raise ObligationViolation(
            ObligationId.SET_REGISTERED,
            register_result.set_sync_error or "SET inventory registration failed",
            details={"register_result": register_result.model_dump(mode="json")},
        )


def build_terminal_obligation_report(
    spec: ComponentSpec,
    *,
    allow_local_deploy: bool,
    preflight_passed: bool,
    context_result: Optional[ContextGatherResult],
    artifacts_generated: bool,
    verification_passed: bool,
    deploy_result: Optional[DeployResult],
    register_result: Optional[RegisterResult],
) -> RunObligationReport:
    statuses: List[RunObligationStatus] = []

    statuses.append(
        RunObligationStatus(
            obligation=ObligationId.PREFLIGHT_PASSED,
            met=preflight_passed,
            message="" if preflight_passed else "Preflight checks failed",
        )
    )

    deps_met = True
    deps_message = ""
    effective_deps = (
        context_result.effective_dependencies
        if context_result and context_result.effective_dependencies
        else list(spec.dependencies)
    )
    if effective_deps:
        missing = context_result.missing_dependencies if context_result else effective_deps
        deps_met = bool(context_result) and not missing
        if not deps_met:
            deps_message = f"Unresolved: {', '.join(missing)}"
    statuses.append(
        RunObligationStatus(
            obligation=ObligationId.DEPENDENCIES_RESOLVED,
            met=deps_met if effective_deps else True,
            message=deps_message,
        )
    )

    statuses.append(
        RunObligationStatus(
            obligation=ObligationId.ARTIFACTS_GENERATED,
            met=artifacts_generated,
            message="" if artifacts_generated else "No artifacts materialized",
        )
    )

    statuses.append(
        RunObligationStatus(
            obligation=ObligationId.VERIFICATION_PASSED,
            met=verification_passed,
            message="" if verification_passed else "Verification gates failed",
        )
    )

    runtime_met = False
    runtime_message = ""
    if deploy_result is not None:
        try:
            assert_runtime_deployed(
                spec,
                deploy_result,
                allow_local_deploy=allow_local_deploy,
            )
            runtime_met = True
        except ObligationViolation as error:
            runtime_message = error.message
    else:
        runtime_message = "Deploy stage did not run"
    statuses.append(
        RunObligationStatus(
            obligation=ObligationId.RUNTIME_DEPLOYED,
            met=runtime_met,
            message=runtime_message,
        )
    )

    catalog_met = bool(
        register_result
        and register_result.registered
        and register_result.factory_catalog_registered
    )
    statuses.append(
        RunObligationStatus(
            obligation=ObligationId.FACTORY_CATALOG_REGISTERED,
            met=catalog_met,
            message="" if catalog_met else "Factory catalog not updated",
        )
    )

    set_met = True
    set_message = ""
    if spec.deployment_target == DeploymentTarget.PODMAN:
        set_met = bool(register_result and register_result.set_registered)
        if not set_met:
            set_message = (
                register_result.set_sync_error if register_result else "SET sync did not run"
            ) or "SET inventory not updated"
    statuses.append(
        RunObligationStatus(
            obligation=ObligationId.SET_REGISTERED,
            met=set_met,
            message=set_message,
        )
    )

    return RunObligationReport.from_statuses(statuses)
