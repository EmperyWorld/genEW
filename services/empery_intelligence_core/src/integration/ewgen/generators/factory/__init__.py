"""
EWGen Factory Kernel — unified ComponentSpec and durable FactoryRun orchestration.
"""

from .generator_adapter import (
    CallableFactoryGenerator,
    FactoryGeneratorAdapter,
    ModuleGeneratorAdapter,
)
from .intake import (
    FactoryIntakeOutcome,
    IntakeClarification,
    IntakeInterpretation,
    IntakeParseError,
    IntakeService,
    LlamaIntakeInterpreter,
    RuleBasedIntakeInterpreter,
    get_intake_service,
    reset_intake_service,
)
from .llama_client import LlamaClient, get_llama_client
from .pipeline import PipelineOrchestrator, get_pipeline_orchestrator, reset_pipeline_orchestrator
from .pipeline_context import (
    ContextGatherResult,
    DeployResult,
    PipelineArtifacts,
    RegisterResult,
    ResolvedDependency,
)
from .register import FactoryRegisterService, RegisterService
from .deploy import DeployService, FactoryDeployService
from .context import CatalogContextGatheringService, ContextGatheringService
from .context_knowledge import ContextSnippet, ContextWindow, ImpactLevel
from .context_pruner import ContextPruner
from .dependency_graph import DependencyEdge, DependencyGraph, EdgeKind
from .graph_impact import NodeImpactProfile, analyze_graph_impact, select_nodes_within_budget
from .knowledge_injection import build_context_window, build_semantic_context_window, estimate_tokens
from .scavenger_context import (
    ContextKnowledgeService,
    ScavengerContextKnowledgeService,
)
from .catalog import FactoryCatalog, get_factory_catalog, reset_factory_catalog
from .orchestrator import FactoryOrchestrator, get_factory_orchestrator
from .repair import build_repair_prompt, format_verification_errors
from .spec import (
    ComponentSpec,
    DeploymentTarget,
    FactoryModuleType,
    VerificationPolicy,
)
from .state import FactoryRunEvent, FactoryRunRecord, FactoryRunStage
from .verification import VerificationReport, VerificationService, get_verification_service

__all__ = [
    "CallableFactoryGenerator",
    "CatalogContextGatheringService",
    "ComponentSpec",
    "ContextGatherResult",
    "ContextGatheringService",
    "ContextKnowledgeService",
    "ContextSnippet",
    "ContextWindow",
    "NodeImpactProfile",
    "ContextPruner",
    "DependencyEdge",
    "DependencyGraph",
    "EdgeKind",
    "ImpactLevel",
    "DeployResult",
    "DeployService",
    "DeploymentTarget",
    "FactoryCatalog",
    "FactoryDeployService",
    "FactoryGeneratorAdapter",
    "FactoryIntakeOutcome",
    "FactoryModuleType",
    "FactoryOrchestrator",
    "FactoryRegisterService",
    "FactoryRunEvent",
    "FactoryRunRecord",
    "FactoryRunStage",
    "IntakeClarification",
    "IntakeInterpretation",
    "IntakeParseError",
    "IntakeService",
    "LlamaClient",
    "LlamaIntakeInterpreter",
    "ModuleGeneratorAdapter",
    "PipelineArtifacts",
    "PipelineOrchestrator",
    "RegisterResult",
    "RegisterService",
    "ResolvedDependency",
    "RuleBasedIntakeInterpreter",
    "ScavengerContextKnowledgeService",
    "VerificationPolicy",
    "VerificationReport",
    "VerificationService",
    "build_context_window",
    "analyze_graph_impact",
    "build_semantic_context_window",
    "select_nodes_within_budget",
    "build_repair_prompt",
    "estimate_tokens",
    "format_verification_errors",
    "get_factory_catalog",
    "get_factory_orchestrator",
    "get_intake_service",
    "get_llama_client",
    "get_pipeline_orchestrator",
    "get_verification_service",
    "reset_factory_catalog",
    "reset_intake_service",
    "reset_pipeline_orchestrator",
]
