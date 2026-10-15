"""
Pipeline stage context — handoff payload between factory pipeline stages.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


from .context_knowledge import ContextWindow


class ResolvedDependency(BaseModel):
    """A dependency id resolved against a local catalog."""

    dependency_id: str
    catalog: str
    module_id: str = ""
    summary: str = ""


class ContextGatherResult(BaseModel):
    resolved_dependencies: List[ResolvedDependency] = Field(default_factory=list)
    missing_dependencies: List[str] = Field(default_factory=list)
    inferred_dependencies: List[str] = Field(default_factory=list)
    effective_dependencies: List[str] = Field(default_factory=list)
    workspace_path: str = ""
    context_window: Optional[ContextWindow] = None


class DeployResult(BaseModel):
    module_id: str
    target: str
    workspace: str = ""
    details: Dict[str, Any] = Field(default_factory=dict)


class RegisterResult(BaseModel):
    module_id: str
    catalog_path: str
    registered: bool = False
    factory_catalog_registered: bool = False
    set_registered: Optional[bool] = None
    set_sync_error: Optional[str] = None


class PipelineArtifacts(BaseModel):
    """Mutable pipeline state passed across stages for rollback."""

    workspace_path: str = ""
    module_id: str = ""
    resolved_dependencies: List[ResolvedDependency] = Field(default_factory=list)
    context_window: Optional[ContextWindow] = None
    deploy_result: Optional[DeployResult] = None
    register_result: Optional[RegisterResult] = None
    deployed: bool = False
    registered: bool = False
