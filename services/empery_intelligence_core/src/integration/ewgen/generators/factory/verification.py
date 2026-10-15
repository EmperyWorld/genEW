"""
VerificationService — lint, typecheck, and test execution for factory sandboxes.
"""

from __future__ import annotations

import logging
import os
import shutil
from enum import Enum
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field

from .artifacts import (
    PROJECT_ROOT,
    detect_artifact_stack,
    ensure_typescript_scaffold,
    get_run_workspace,
    has_python_tests,
    has_typescript_tests,
)
from .spec import VerificationPolicy
from .subprocess_runner import SubprocessResult, run_subprocess, truncate_output

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
DEFAULT_CHECK_TIMEOUT = float(os.getenv("EWGEN_FACTORY_VERIFY_CHECK_TIMEOUT", "120"))


class VerificationCheckStatus(str, Enum):
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"
    TIMEOUT = "timeout"


class VerificationCheckResult(BaseModel):
    name: str
    status: VerificationCheckStatus
    exit_code: int = 0
    stdout: str = ""
    stderr: str = ""
    duration_ms: float = 0.0
    timed_out: bool = False
    message: str = ""


class VerificationReport(BaseModel):
    run_id: str
    workspace: str
    stack: str
    policy: VerificationPolicy
    all_passed: bool
    checks: List[VerificationCheckResult] = Field(default_factory=list)
    summary: str = ""


class VerificationService:
    """Executes quality gates against a factory run artifact workspace."""

    def __init__(
        self,
        *,
        project_root: Path = PROJECT_ROOT,
        check_timeout_seconds: float = DEFAULT_CHECK_TIMEOUT,
    ):
        self._project_root = project_root
        self._check_timeout_seconds = check_timeout_seconds
        self._bin_dir = project_root / "node_modules" / ".bin"

    def verify_run(
        self,
        run_id: str,
        policy: VerificationPolicy = VerificationPolicy.LAX,
    ) -> VerificationReport:
        workspace = get_run_workspace(run_id)
        if not workspace.is_dir():
            report = VerificationReport(
                run_id=run_id,
                workspace=str(workspace),
                stack="unknown",
                policy=policy,
                all_passed=False,
                checks=[
                    VerificationCheckResult(
                        name="workspace",
                        status=VerificationCheckStatus.FAILED,
                        message=f"Artifact workspace not found: {workspace}",
                    )
                ],
                summary="Artifact workspace not found",
            )
            return report
        return self.verify_workspace(workspace, run_id=run_id, policy=policy)

    def verify_workspace(
        self,
        workspace: Path,
        *,
        run_id: str,
        policy: VerificationPolicy = VerificationPolicy.LAX,
    ) -> VerificationReport:
        stack = detect_artifact_stack(workspace)
        checks: List[VerificationCheckResult] = []

        if stack == "typescript":
            ensure_typescript_scaffold(workspace, project_root=self._project_root)
            checks.extend(self._run_typescript_checks(workspace, policy))
        elif stack == "python":
            checks.extend(self._run_python_checks(workspace, policy))
        else:
            checks.append(
                VerificationCheckResult(
                    name="stack_detection",
                    status=VerificationCheckStatus.FAILED,
                    message="No TypeScript or Python artifacts found to verify",
                )
            )

        all_passed = all(
            check.status in {VerificationCheckStatus.PASSED, VerificationCheckStatus.SKIPPED}
            for check in checks
        )
        summary = "All verification checks passed"
        if not all_passed:
            failed = [
                check for check in checks
                if check.status in {VerificationCheckStatus.FAILED, VerificationCheckStatus.TIMEOUT}
            ]
            first = failed[0] if failed else checks[0]
            summary = first.message or first.stderr or first.stdout or "Verification failed"

        return VerificationReport(
            run_id=run_id,
            workspace=str(workspace.resolve()),
            stack=stack,
            policy=policy,
            all_passed=all_passed,
            checks=checks,
            summary=summary,
        )

    def _run_typescript_checks(
        self,
        workspace: Path,
        policy: VerificationPolicy,
    ) -> List[VerificationCheckResult]:
        checks: List[VerificationCheckResult] = []
        checks.append(self._run_lint(workspace))
        checks.append(self._run_typecheck(workspace))

        if has_typescript_tests(workspace):
            checks.append(self._run_jest(workspace))
        elif policy == VerificationPolicy.STRICT:
            checks.append(
                VerificationCheckResult(
                    name="test",
                    status=VerificationCheckStatus.FAILED,
                    message="Strict policy requires test files (*.test.ts / *.spec.ts)",
                )
            )
        else:
            checks.append(
                VerificationCheckResult(
                    name="test",
                    status=VerificationCheckStatus.SKIPPED,
                    message="No test files found",
                )
            )
        return checks

    def _run_python_checks(
        self,
        workspace: Path,
        policy: VerificationPolicy,
    ) -> List[VerificationCheckResult]:
        checks: List[VerificationCheckResult] = []
        if has_python_tests(workspace):
            checks.append(self._run_pytest(workspace))
        elif policy == VerificationPolicy.STRICT:
            checks.append(
                VerificationCheckResult(
                    name="test",
                    status=VerificationCheckStatus.FAILED,
                    message="Strict policy requires Python test files (test_*.py)",
                )
            )
        else:
            checks.append(
                VerificationCheckResult(
                    name="test",
                    status=VerificationCheckStatus.SKIPPED,
                    message="No Python test files found",
                )
            )
        return checks

    def _resolve_tool(self, name: str) -> Optional[str]:
        local = self._bin_dir / name
        if local.is_file():
            return str(local)
        resolved = shutil.which(name)
        return resolved

    def _result_from_subprocess(
        self,
        name: str,
        result: SubprocessResult,
        *,
        pass_on_zero: bool = True,
    ) -> VerificationCheckResult:
        if result.timed_out:
            return VerificationCheckResult(
                name=name,
                status=VerificationCheckStatus.TIMEOUT,
                exit_code=result.exit_code,
                stdout=truncate_output(result.stdout),
                stderr=truncate_output(result.stderr),
                duration_ms=result.duration_ms,
                timed_out=True,
                message=f"{name} timed out after {self._check_timeout_seconds}s",
            )

        passed = result.exit_code == 0 if pass_on_zero else False
        status = VerificationCheckStatus.PASSED if passed else VerificationCheckStatus.FAILED
        message = f"{name} passed" if passed else f"{name} failed (exit {result.exit_code})"
        combined = f"{result.stdout}\n{result.stderr}".strip()
        if not passed and not result.stderr and combined:
            message = combined.splitlines()[0][:500]

        return VerificationCheckResult(
            name=name,
            status=status,
            exit_code=result.exit_code,
            stdout=truncate_output(result.stdout),
            stderr=truncate_output(result.stderr),
            duration_ms=result.duration_ms,
            timed_out=False,
            message=message,
        )

    def _run_lint(self, workspace: Path) -> VerificationCheckResult:
        eslint_bin = self._resolve_tool("eslint")
        if not eslint_bin:
            return VerificationCheckResult(
                name="lint",
                status=VerificationCheckStatus.FAILED,
                message="eslint binary not found in project node_modules",
            )

        eslint_config = TEMPLATES_DIR / "eslint.config.mjs"
        src_dir = workspace / "src"
        if not src_dir.is_dir():
            return VerificationCheckResult(
                name="lint",
                status=VerificationCheckStatus.FAILED,
                message="src/ directory not found for lint",
            )

        result = run_subprocess(
            [
                eslint_bin,
                str(src_dir),
                "--config",
                str(eslint_config),
                "--max-warnings",
                "0",
                "--no-error-on-unmatched-pattern",
            ],
            cwd=str(workspace),
            timeout_seconds=self._check_timeout_seconds,
        )
        return self._result_from_subprocess("lint", result)

    def _run_typecheck(self, workspace: Path) -> VerificationCheckResult:
        tsc_bin = self._resolve_tool("tsc")
        if not tsc_bin:
            return VerificationCheckResult(
                name="typecheck",
                status=VerificationCheckStatus.FAILED,
                message="tsc binary not found in project node_modules",
            )

        tsconfig = workspace / "tsconfig.json"
        if not tsconfig.is_file():
            return VerificationCheckResult(
                name="typecheck",
                status=VerificationCheckStatus.FAILED,
                message="tsconfig.json not found for typecheck",
            )

        result = run_subprocess(
            [tsc_bin, "--noEmit", "-p", str(tsconfig)],
            cwd=str(workspace),
            timeout_seconds=self._check_timeout_seconds,
        )
        return self._result_from_subprocess("typecheck", result)

    def _run_jest(self, workspace: Path) -> VerificationCheckResult:
        jest_bin = self._resolve_tool("jest")
        if not jest_bin:
            return VerificationCheckResult(
                name="test",
                status=VerificationCheckStatus.FAILED,
                message="jest binary not found in project node_modules",
            )

        jest_config = workspace / "jest.config.cjs"
        result = run_subprocess(
            [jest_bin, "--config", str(jest_config), "--runInBand", "--ci"],
            cwd=str(self._project_root),
            timeout_seconds=self._check_timeout_seconds,
        )
        return self._result_from_subprocess("test", result)

    def _run_pytest(self, workspace: Path) -> VerificationCheckResult:
        pytest_bin = shutil.which("pytest") or shutil.which("python3")
        if not pytest_bin:
            return VerificationCheckResult(
                name="test",
                status=VerificationCheckStatus.FAILED,
                message="pytest/python3 not found on PATH",
            )

        command = (
            [pytest_bin, "-q"]
            if Path(pytest_bin).name.startswith("pytest")
            else [pytest_bin, "-m", "pytest", "-q"]
        )
        result = run_subprocess(
            command,
            cwd=str(workspace),
            timeout_seconds=self._check_timeout_seconds,
        )
        return self._result_from_subprocess("test", result)


_verification_service: Optional[VerificationService] = None


def get_verification_service(*, force_new: bool = False) -> VerificationService:
    global _verification_service
    if _verification_service is None or force_new:
        _verification_service = VerificationService()
    return _verification_service
