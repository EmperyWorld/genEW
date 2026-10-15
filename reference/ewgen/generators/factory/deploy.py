"""
DeployService — move verified factory artifacts to runtime targets.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Optional, Protocol, runtime_checkable

from .artifacts import get_run_workspace, workspace_exists
from .intent_naming import derive_module_slug_from_intent
from .pipeline_context import DeployResult, PipelineArtifacts
from .spec import ComponentSpec, DeploymentTarget, FactoryModuleType

logger = logging.getLogger(__name__)

MODULE_TYPE_TEMPLATE_IDS: dict[FactoryModuleType, str] = {
    FactoryModuleType.CRUD: "crud-module",
    FactoryModuleType.DASHBOARD: "dashboard-module",
    FactoryModuleType.KANBAN: "kanban-module",
    FactoryModuleType.CHAT: "chat-module",
    FactoryModuleType.REPORT: "report-module",
    FactoryModuleType.PRESENTATION: "presentation-module",
}


@runtime_checkable
class DeployService(Protocol):
    def deploy(
        self,
        run_id: str,
        spec: ComponentSpec,
        artifacts: PipelineArtifacts,
    ) -> DeployResult:
        ...


class FactoryDeployService:
    """Deploy verified factory workspaces to LOCAL or SET/Podman runtime."""

    def deploy(
        self,
        run_id: str,
        spec: ComponentSpec,
        artifacts: PipelineArtifacts,
    ) -> DeployResult:
        module_id = artifacts.module_id or _derive_module_id(spec)
        workspace = get_run_workspace(run_id)
        if not workspace_exists(run_id):
            raise FileNotFoundError(f"Factory workspace missing for run {run_id}")

        target = spec.deployment_target
        if target == DeploymentTarget.LOCAL:
            result = DeployResult(
                module_id=module_id,
                target=target.value,
                workspace=str(workspace),
                details={"mode": "local-workspace"},
            )
            logger.info(
                "[factory-pipeline] deploy_local run_id=%s module_id=%s",
                run_id,
                module_id,
            )
            return result

        if target == DeploymentTarget.PODMAN:
            return self._deploy_podman(run_id, spec, module_id, workspace)

        raise ValueError(f"Unsupported deployment target: {target.value}")

    def rollback(self, artifacts: PipelineArtifacts) -> None:
        """Remove partial SET runtime module if deploy reached runtime copy."""
        if not artifacts.deployed or not artifacts.module_id:
            return
        if artifacts.deploy_result and artifacts.deploy_result.target != DeploymentTarget.PODMAN.value:
            return

        details = (artifacts.deploy_result.details if artifacts.deploy_result else {}) or {}
        module_root = details.get("moduleRoot")
        if module_root:
            path = Path(str(module_root))
            if path.is_dir():
                shutil.rmtree(path)
                logger.info(
                    "[factory-pipeline] deploy_rollback module_id=%s path=%s",
                    artifacts.module_id,
                    path,
                )

    def _deploy_podman(
        self,
        run_id: str,
        spec: ComponentSpec,
        module_id: str,
        workspace: Path,
    ) -> DeployResult:
        template_id = None
        if spec.module_type is not None:
            template_id = MODULE_TYPE_TEMPLATE_IDS.get(spec.module_type)

        if template_id:
            try:
                from generators.set.template_catalog import get_set_template  # noqa: PLC0415
                from generators.set.template_install import (  # noqa: PLC0415
                    install_from_ewgen_template,
                )

                template = get_set_template(template_id)
                if template and template.get("available"):
                    install_result = install_from_ewgen_template(
                        template_id,
                        module_name=module_id.replace("-", " ").title(),
                        overwrite=True,
                        restart_backend=False,
                        build_frontend=False,
                    )
                    return DeployResult(
                        module_id=str(install_result.get("moduleId") or module_id),
                        target=DeploymentTarget.PODMAN.value,
                        workspace=str(workspace),
                        details={
                            "mode": "set-template",
                            "templateId": template_id,
                            "install": install_result,
                        },
                    )
            except Exception as error:  # noqa: BLE001 — fall through to workspace copy
                logger.warning(
                    "[factory-pipeline] set_template_deploy_failed run_id=%s error=%s",
                    run_id,
                    error,
                )

        return self._copy_workspace_to_set_runtime(module_id, workspace, run_id)

    def _copy_workspace_to_set_runtime(
        self,
        module_id: str,
        workspace: Path,
        run_id: str,
    ) -> DeployResult:
        from generators.set.bootstrap import bootstrap_set_runtime  # noqa: PLC0415
        from generators.set.paths import runtime_modules_root  # noqa: PLC0415

        bootstrap_set_runtime()
        module_root = runtime_modules_root() / module_id
        if module_root.exists():
            shutil.rmtree(module_root)
        shutil.copytree(
            workspace,
            module_root,
            ignore=shutil.ignore_patterns("__pycache__", "node_modules", ".git"),
        )
        logger.info(
            "[factory-pipeline] deploy_workspace_copy run_id=%s module_id=%s",
            run_id,
            module_id,
        )
        return DeployResult(
            module_id=module_id,
            target=DeploymentTarget.PODMAN.value,
            workspace=str(workspace),
            details={"mode": "workspace-copy", "moduleRoot": str(module_root)},
        )


def _derive_module_id(spec: ComponentSpec) -> str:
    return derive_module_slug_from_intent(spec.intent) or "factory-module"
