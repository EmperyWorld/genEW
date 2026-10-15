"""
Production defaults applied at pipeline entry (prompt → runnable spec).
"""

from __future__ import annotations

from .spec import ComponentSpec, DeploymentTarget


def apply_production_spec_defaults(
    spec: ComponentSpec,
    *,
    allow_local_deploy: bool,
) -> ComponentSpec:
    """
    Upgrade intake defaults for autonomous production runs.

    Rule-based and LLM intake leave ``deployment_target=local``; pipeline runs
    target SET/Podman unless explicit dry-run is requested.
    """
    if allow_local_deploy:
        return spec
    if spec.deployment_target == DeploymentTarget.LOCAL:
        return spec.model_copy(update={"deployment_target": DeploymentTarget.PODMAN})
    return spec
