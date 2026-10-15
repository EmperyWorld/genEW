"""Load `.cursor/agents` + `.cursor/skills` markdown as role prompt templates."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from core.errors import ServiceError, StandardizedErrorResponse

from services.empery_intelligence_core.src.core.reflexes.lifecycle import role_for_stage
from services.empery_intelligence_core.src.core.reflexes.models import (
    AgentRole,
    Intention,
    LoopStage,
    RolePromptBundle,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)

_FRONTMATTER_RE = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n?", re.DOTALL)

AGENT_FILES: dict[AgentRole, str] = {
    AgentRole.ARCHITECT: "architect.md",
    AgentRole.IMPLEMENTER: "implementer.md",
    AgentRole.VERIFIER: "verifier.md",
    AgentRole.REFACTORER: "refactorer.md",
}

SKILL_FOR_STAGE: dict[LoopStage, str] = {
    LoopStage.PLAN: "plan",
    LoopStage.IMPLEMENT: "implement",
    LoopStage.VERIFY: "verify",
    LoopStage.FIX: "implement",
}

RULES_DIGEST = (
    "Follow architecture-core.mdc, module-contract.mdc, dependency-injection.mdc, "
    "service-ui.mdc. "
    "No hardcoded cross-service imports; use ServiceContainer. "
    "Boundary errors via StandardizedErrorResponse / ServiceError. "
    "ASSEMBLY LAW: prefer recipes under .cursor/orchestration/recipes/ and "
    "parts under reference/eliteew/ — copy/adapt into Empery anatomy; do NOT "
    "invent whole modules from scratch when a recipe/corpus exists. "
    "Never modify EliteEW in place; never import reference/ at runtime. "
    "Hands scaffold_profile must follow Assembly contract "
    "(health_probe|studio_job|companion_chat|ops_dashboard|task_board|"
    "research_report|editor_local|peer_http|…); "
    "forbid inventing DomainItem CRUD when forbid_generic_crud is true. "
    "PROFILE LAW: do NOT default to companion_chat unless the intention "
    "clearly requests conversational chat/companion/чат; strong product words "
    "(dashboard, блокнот, kanban, research, studio, справочник) win over bare "
    "llm/ai. When nervas_llm_peer co-selects with a product pack, keep the "
    "product UI profile (ops_dashboard|editor_local|task_board|research_report|"
    "studio_job) — never let peer_http steal the scaffold. "
    "UI LAW: ui.profile must match scaffold_profile — Hands emit EliteEW-quality "
    "ECC pages + desktop mounts (CompanionSlim / studio chrome), never item CRUD "
    "forms for chat/studio intents. Read pack UI extracts first. "
    "Product host is apps/empery_desktop (window mounts); ECC remains ops/autonomy. "
    "Create-service is incomplete without full ECC product UI + BFF "
    "(feature, client, routes, nav, RU+EN i18n) unless ui.required=false "
    "with written skip_reason. Map/health alone is NOT done. "
    "When the module is a user-facing app, also register a desktop catalog entry "
    "(desktop_shell /api/v1/catalog/apps) and a window mount stub in empery_desktop. "
    "ATOM EXTRACT: when product packs match, emit eic_actions op extract_adapt "
    "(source_glob under reference/eliteew|reference/ewgen or core/, dest under services/|apps/) — "
    "forbid_scratch_when_recipe (no LLM-only invent). Corpus sync from EliteEW uses "
    "mode=corpus into reference/eliteew only; never write EliteEW. "
    "EWGEN FACTORY (Assembler): zip under workspace → ewgen_analyze | ewgen_prepare | "
    "ewgen_cluster_extract (component groups → reference/ or atoms) | ewgen_component_factory. "
    "Emit structured eic_actions JSON when writing files "
    "(write_file|scaffold|extract_adapt|ewgen_analyze|ewgen_cluster_extract|run_command)."
)


def strip_frontmatter(text: str) -> str:
    return _FRONTMATTER_RE.sub("", text, count=1).strip()


class PromptTemplateLoader:
    """Filesystem prompt loader — markdown is content, not Cursor runtime."""

    def __init__(self, paths: EicOrchestrationPaths) -> None:
        self._paths = paths

    def _read(self, path: Path) -> str:
        if not path.is_file():
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_LOOP_ERROR",
                    message=f"Prompt template not found: {path}",
                    details={"path": str(path)},
                ),
                http_status=500,
            )
        return strip_frontmatter(path.read_text(encoding="utf-8"))

    def load_agent(self, role: AgentRole) -> tuple[str, Path]:
        filename = AGENT_FILES[role]
        path = self._paths.agents_root / filename
        return self._read(path), path

    def load_skill(self, skill_name: str) -> tuple[str, Path]:
        path = self._paths.skills_root / skill_name / "SKILL.md"
        return self._read(path), path

    def build(
        self,
        role: AgentRole,
        intention: Intention,
        *,
        include_evolve_addendum: bool = False,
    ) -> RolePromptBundle:
        system_prompt, agent_path = self.load_agent(role)
        stage = intention.checkpoint.stage
        skill_name = SKILL_FOR_STAGE.get(stage, "plan")
        skill_addendum, skill_path = self.load_skill(skill_name)
        template_paths = [str(agent_path), str(skill_path)]

        if include_evolve_addendum:
            evolve_body, evolve_path = self.load_skill("evolve")
            skill_addendum = f"{skill_addendum}\n\n---\n\n{evolve_body}"
            template_paths.append(str(evolve_path))

        # Genesis / evolve implement: load create-service-ui checklist into prompt.
        if role == AgentRole.IMPLEMENTER and intention.service_name:
            from services.empery_intelligence_core.src.integration.service_scaffold import (
                is_create_service_intention,
            )

            if is_create_service_intention(
                intent=intention.intent,
                service_name=intention.service_name,
                kind=intention.kind.value if intention.kind else None,
            ):
                try:
                    ui_body, ui_path = self.load_skill("create-service-ui")
                    skill_addendum = (
                        f"{skill_addendum}\n\n---\n\n## create-service-ui\n\n{ui_body}"
                    )
                    template_paths.append(str(ui_path))
                except ServiceError:
                    pass

        # Assembly recipes — Architect, Implementer, and Verifier (DoD checklist).
        if role in {
            AgentRole.ARCHITECT,
            AgentRole.IMPLEMENTER,
            AgentRole.VERIFIER,
        }:
            from services.empery_intelligence_core.src.integration.recipe_catalog import (
                load_recipe_catalog_digest,
            )

            design_path = None
            if intention.checkpoint and intention.checkpoint.design_path:
                design_path = intention.checkpoint.design_path
            recipe_digest, recipe_paths = load_recipe_catalog_digest(
                self._paths,
                service_name=intention.service_name,
                intent=intention.intent,
                design_path=design_path,
                explicit_packs=list(
                    (intention.metadata or {}).get("recipe_packs") or []
                )
                or None,
                explicit_profile=(intention.metadata or {}).get("scaffold_profile"),
            )
            if recipe_digest:
                skill_addendum = (
                    f"{skill_addendum}\n\n---\n\n"
                    f"## Assembly recipes (mandatory)\n\n{recipe_digest}"
                )
                template_paths.extend(recipe_paths)

        memory_context = (intention.metadata or {}).get("_memory_context")
        if isinstance(memory_context, str) and memory_context.strip():
            skill_addendum = (
                f"{skill_addendum}\n\n---\n\n{memory_context.strip()}"
            )

        selected = (intention.metadata or {}).get("selected_option")
        if isinstance(selected, dict) and selected.get("id"):
            from services.empery_intelligence_core.src.integration.evolve_propose import (
                format_selected_option_prompt,
            )

            skill_addendum = (
                f"{skill_addendum}\n\n---\n\n"
                f"{format_selected_option_prompt(selected)}"
            )

        user_payload = json.dumps(
            {
                "intention_id": str(intention.id),
                "kind": intention.kind.value,
                "intent": intention.intent,
                "service_name": intention.service_name,
                "features": intention.features,
                "checkpoint": intention.checkpoint.model_dump(mode="json"),
                "metadata": intention.metadata,
            },
            default=str,
            indent=2,
        )
        digest_src = "|".join(
            [
                system_prompt,
                skill_addendum,
                RULES_DIGEST,
                *template_paths,
            ]
        )
        prompt_hash = hashlib.sha256(digest_src.encode("utf-8")).hexdigest()[:16]
        return RolePromptBundle(
            role=role,
            system_prompt=system_prompt,
            skill_addendum=skill_addendum,
            rules_digest=RULES_DIGEST,
            user_payload=user_payload,
            template_paths=template_paths,
            prompt_hash=prompt_hash,
        )

    def role_for_intention(self, intention: Intention) -> AgentRole:
        role = role_for_stage(intention.checkpoint.stage)
        if role is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_LOOP_ERROR",
                    message=f"No role for stage {intention.checkpoint.stage.value}",
                    details={"stage": intention.checkpoint.stage.value},
                ),
                http_status=500,
            )
        return role
