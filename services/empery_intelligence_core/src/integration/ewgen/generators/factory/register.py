"""
RegisterService — persist completed factory modules to local catalogs.
"""

from __future__ import annotations

import logging
from typing import Optional, Protocol, runtime_checkable

from .catalog import FactoryCatalog, get_factory_catalog
from .obligations import ObligationId, ObligationViolation
from .pipeline_context import PipelineArtifacts, RegisterResult
from .spec import ComponentSpec, DeploymentTarget

logger = logging.getLogger(__name__)


@runtime_checkable
class RegisterService(Protocol):
    def register(
        self,
        run_id: str,
        spec: ComponentSpec,
        artifacts: PipelineArtifacts,
    ) -> RegisterResult:
        ...

    def unregister(self, artifacts: PipelineArtifacts) -> None:
        ...


class FactoryRegisterService:
    """Register modules in factory-catalog.json and SET inventory when required."""

    def __init__(self, catalog: Optional[FactoryCatalog] = None):
        self._catalog = catalog or get_factory_catalog()

    def register(
        self,
        run_id: str,
        spec: ComponentSpec,
        artifacts: PipelineArtifacts,
    ) -> RegisterResult:
        module_id = artifacts.module_id
        if not module_id:
            raise ValueError("module_id is required for registration")

        entry = {
            "moduleId": module_id,
            "runId": run_id,
            "intent": spec.intent,
            "moduleType": spec.module_type.value if spec.module_type else None,
            "deploymentTarget": spec.deployment_target.value,
            "dependencies": spec.dependencies,
            "fieldHints": spec.field_hints,
            "status": "registered",
        }
        if artifacts.deploy_result is not None:
            entry["deployTarget"] = artifacts.deploy_result.target
            entry["deployMode"] = artifacts.deploy_result.details.get("mode")

        set_registered: Optional[bool] = None
        set_sync_error: Optional[str] = None
        if spec.deployment_target == DeploymentTarget.PODMAN:
            set_registered, set_sync_error = self._register_set_inventory(
                module_id,
                spec,
                run_id,
            )
            if not set_registered:
                raise ObligationViolation(
                    ObligationId.SET_REGISTERED,
                    set_sync_error or "SET inventory registration failed",
                    details={
                        "module_id": module_id,
                        "run_id": run_id,
                    },
                )

        self._catalog.upsert_module(entry)

        registered = True
        logger.info(
            "[factory-pipeline] registered run_id=%s module_id=%s set=%s",
            run_id,
            module_id,
            set_registered,
        )
        return RegisterResult(
            module_id=module_id,
            catalog_path=str(self._catalog.path),
            registered=registered,
            factory_catalog_registered=True,
            set_registered=set_registered,
            set_sync_error=set_sync_error,
        )

    def unregister(self, artifacts: PipelineArtifacts) -> None:
        if not artifacts.registered or not artifacts.module_id:
            return
        removed = self._catalog.remove_module(artifacts.module_id)
        if removed:
            logger.info(
                "[factory-pipeline] catalog_rollback module_id=%s",
                artifacts.module_id,
            )

    def _register_set_inventory(
        self,
        module_id: str,
        spec: ComponentSpec,
        run_id: str,
    ) -> tuple[bool, Optional[str]]:
        try:
            from generators.set.inventory import get_set_inventory  # noqa: PLC0415
            from generators.set.registry_sync import sync_runtime_registry  # noqa: PLC0415

            inventory = get_set_inventory()
            inventory.upsert_module(
                {
                    "moduleId": module_id,
                    "moduleName": module_id.replace("-", " ").title(),
                    "status": "enabled",
                    "source": "factory-pipeline",
                    "factoryRunId": run_id,
                    "moduleType": spec.module_type.value if spec.module_type else None,
                }
            )
            sync_runtime_registry(inventory.list_modules())
            return True, None
        except Exception as error:  # noqa: BLE001
            message = f"SET inventory registration failed: {error}"
            logger.warning(
                "[factory-pipeline] set_inventory_register_failed module_id=%s error=%s",
                module_id,
                error,
            )
            return False, message
