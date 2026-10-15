"""
Factory pipeline preflight — validate runtime prerequisites before generation.
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import List, Optional

from .obligations import ObligationId, ObligationViolation
from .spec import ComponentSpec, DeploymentTarget

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class PreflightCheckResult:
    def __init__(self, name: str, passed: bool, message: str = ""):
        self.name = name
        self.passed = passed
        self.message = message


def run_preflight(
    spec: ComponentSpec,
    *,
    project_root: Path = PROJECT_ROOT,
    allow_local_deploy: bool = False,
) -> List[PreflightCheckResult]:
    """
    Validate infrastructure before context/generation stages.

    Raises ObligationViolation when any required check fails.
    """
    checks: List[PreflightCheckResult] = []

    checks.append(_check_redis_configured())
    checks.append(_check_node_available())
    checks.append(_check_ts_worker_script(project_root))

    if spec.deployment_target == DeploymentTarget.LOCAL and not allow_local_deploy:
        checks.append(
            PreflightCheckResult(
                name="deployment_target",
                passed=False,
                message="LOCAL deployment is disabled; use deployment_target=podman",
            )
        )
    elif spec.deployment_target == DeploymentTarget.REMOTE:
        checks.append(
            PreflightCheckResult(
                name="deployment_target",
                passed=False,
                message="deployment_target=remote is not implemented",
            )
        )
    elif spec.deployment_target == DeploymentTarget.PODMAN:
        checks.append(_check_set_preflight(project_root))

    failed = [item for item in checks if not item.passed]
    if failed:
        messages = [f"{item.name}: {item.message}" for item in failed]
        raise ObligationViolation(
            ObligationId.PREFLIGHT_PASSED,
            "; ".join(messages),
            details={
                "checks": [
                    {"name": item.name, "passed": item.passed, "message": item.message}
                    for item in checks
                ],
            },
        )

    logger.info(
        "[factory-pipeline] preflight_passed target=%s checks=%d",
        spec.deployment_target.value,
        len(checks),
    )
    return checks


def _check_redis_configured() -> PreflightCheckResult:
    redis_url = os.getenv("EWGEN_REDIS_URL", "").strip()
    if not redis_url:
        return PreflightCheckResult(
            name="redis",
            passed=False,
            message="EWGEN_REDIS_URL is not configured",
        )
    return PreflightCheckResult(name="redis", passed=True)


def _check_node_available() -> PreflightCheckResult:
    node = shutil.which("node")
    if not node:
        return PreflightCheckResult(
            name="node",
            passed=False,
            message="node executable not found on PATH",
        )
    return PreflightCheckResult(name="node", passed=True)


def _check_ts_worker_script(project_root: Path) -> PreflightCheckResult:
    worker = (
        project_root
        / "src"
        / "services"
        / "generators"
        / "generatorWorker.ts"
    )
    if not worker.is_file():
        return PreflightCheckResult(
            name="ts_worker",
            passed=False,
            message=f"generatorWorker.ts missing at {worker}",
        )
    return PreflightCheckResult(name="ts_worker", passed=True)


def _check_set_preflight(project_root: Path) -> PreflightCheckResult:
    try:
        from generators.set.paths import runtime_modules_root  # noqa: PLC0415

        root = runtime_modules_root()
        if not root.parent.is_dir():
            return PreflightCheckResult(
                name="set_runtime",
                passed=False,
                message=f"SET runtime parent missing: {root.parent}",
            )
        return PreflightCheckResult(name="set_runtime", passed=True)
    except Exception as error:  # noqa: BLE001
        return PreflightCheckResult(
            name="set_runtime",
            passed=False,
            message=str(error),
        )
