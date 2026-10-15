"""
ComponentSpec — versioned contract for autonomous factory production runs.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


SPEC_VERSION = "1.0"


class FactoryModuleType(str, Enum):
    """Target module kind for generation or import."""

    CRUD = "crud"
    DASHBOARD = "dashboard"
    KANBAN = "kanban"
    CHAT = "chat"
    REPORT = "report"
    PRESENTATION = "presentation"
    IMPORTED = "imported"


class VerificationPolicy(str, Enum):
    """How strictly generated artifacts must pass gates before deploy."""

    STRICT = "strict"
    LAX = "lax"


class DeploymentTarget(str, Enum):
    """Where a verified component should be deployed."""

    LOCAL = "local"
    PODMAN = "podman"
    REMOTE = "remote"


class ComponentSpec(BaseModel):
    """
    Unified specification for a single factory production run.

    Future stages (context, generation, verify, deploy) consume this document
    as the source of truth for the run.
    """

    spec_version: str = Field(
        default=SPEC_VERSION,
        description="Schema version for forward-compatible parsing",
    )
    intent: str = Field(
        ...,
        min_length=1,
        description="Raw user or agent prompt describing the desired component",
    )
    module_type: Optional[FactoryModuleType] = Field(
        default=None,
        description="Optional module kind; may be inferred during INTAKE",
    )
    dependencies: List[str] = Field(
        default_factory=list,
        description="Existing modules or catalog ids to scavenge for context",
    )
    field_hints: List[str] = Field(
        default_factory=list,
        description="Entity field names inferred from natural-language intent",
    )
    verification_policy: VerificationPolicy = Field(
        default=VerificationPolicy.LAX,
        description="Verification strictness applied after generation",
    )
    deployment_target: DeploymentTarget = Field(
        default=DeploymentTarget.LOCAL,
        description="Deployment destination once verification passes",
    )
    repair_feedback: Optional[str] = Field(
        default=None,
        description="Verification error context for self-healing regeneration",
    )

    model_config = {"extra": "forbid"}
