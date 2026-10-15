"""Constrained workspace tools — Hands of the Empery Reflex System."""

from __future__ import annotations

import logging
import re
import shlex
import subprocess
from pathlib import Path
from typing import Any

from core.errors import ServiceError, StandardizedErrorResponse
from core.logging import log_event

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.core.reflexes.models import AgentRole
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.service_scaffold import (
    ServiceScaffoldAction,
    is_create_service_intention,
)

# Rich UI profiles always re-emit EliteEW templates (never leave DomainItem CRUD).
_FORCE_UI_PROFILES = frozenset(
    {
        "companion_chat",
        "studio_job",
        "peer_http",
        "ops_dashboard",
        "task_board",
        "research_report",
        "editor_local",
    }
)


def _force_profile_ui(profile: str | None) -> bool:
    return bool(profile and profile.strip().lower() in _FORCE_UI_PROFILES)


# Allowlisted relative roots (workspace-relative).
_ALLOW_PREFIXES = (
    "services/",
    ".cursor/orchestration/designs/",
    ".cursor/orchestration/reports/",
    ".cursor/orchestration/jobs/",
    ".cursor/orchestration/eic/",
    ".cursor/orchestration/recipes/",
    ".cursor/orchestration/assembly/",
    "deploy/services/",
    "deploy/postgres/dynamic/",
    ".cursor/orchestration/eic/evolve_proposals/",
    "compose.reflex.yml",
    ".cursor/orchestration/eic/compose.reflex.yml",
    # ECC product UI (service-ui U1–U9) — Hands must write feature/BFF wiring
    "apps/empery_control_center/src/features/",
    "apps/empery_control_center/src/api/",
    "apps/empery_control_center/src/routes/",
    "apps/empery_control_center/src/i18n/locales/",
    # Product desktop host (window mounts / shell adapters)
    "apps/empery_desktop/src/",
    # EliteEW extract corpus — read/list only (writes denied in _apply_write)
    "reference/",
)

# Domain paths LLM must not write under config_driven assembly.
# Defaults; overridden/extended by freeze_list.yaml deny_llm_writes when present.
_CONFIG_DRIVEN_DENY_PREFIXES = (
    "services/",
    "deploy/services/",
    "apps/empery_control_center/src/features/",
    "apps/empery_control_center/src/api/",
    "apps/empery_control_center/src/routes/",
    "apps/empery_desktop/src/shell/mounts/",
    "apps/empery_desktop/src/shell/registry",
)


def _load_config_driven_deny_prefixes(workspace: Path | None = None) -> tuple[str, ...]:
    """Merge hardcoded deny prefixes with freeze_list.yaml deny_llm_writes."""
    prefixes = list(_CONFIG_DRIVEN_DENY_PREFIXES)
    roots: list[Path] = []
    if workspace is not None:
        roots.append(workspace)
    # workspace_tools.py → …/src/integration → repo = parents[4]
    roots.append(Path(__file__).resolve().parents[4])
    for root in roots:
        path = (
            root
            / ".cursor"
            / "orchestration"
            / "assembly"
            / "freeze_list.yaml"
        )
        if not path.is_file():
            continue
        try:
            import yaml  # type: ignore

            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            for key in ("deny_llm_writes", "scaffold_owned_immutable"):
                for item in data.get(key) or []:
                    if isinstance(item, str) and item.strip():
                        prefixes.append(item.split("*")[0])
        except Exception:
            continue
        break
    seen: set[str] = set()
    out: list[str] = []
    for p in prefixes:
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return tuple(out)

_READ_ONLY_PREFIXES = (
    "reference/",
)

_DENY_NAME_FRAGMENTS = (
    ".env",
    "credentials",
    "secrets",
    "id_rsa",
    ".pem",
    "kubeconfig",
)

# Compose command allowlist (argv after binary).
_COMPOSE_BINARIES = ("podman-compose", "podman", "docker-compose", "docker")
_SAFE_COMPOSE_ACTIONS = frozenset({"up", "ps", "config", "images", "logs"})


class WorkspaceToolAdapter:
    """Sandbox FS tools + optional Command Reflex for compose deploy."""

    def __init__(
        self,
        paths: EicOrchestrationPaths,
        config: ServiceConfig,
        logger: logging.Logger,
        *,
        assembler: Any | None = None,
        verifier: Any | None = None,
    ) -> None:
        self._paths = paths
        self._config = config
        self._logger = logger
        self._assembler = assembler
        self._verifier = verifier
        self._scaffold = ServiceScaffoldAction(paths.workspace_root, logger)
        self.last_action_stats: dict[str, int] = {
            "write_file": 0,
            "create_dir": 0,
            "read_file": 0,
            "list_dir": 0,
            "run_command": 0,
            "scaffold": 0,
            "deploy": 0,
            "extract_adapt": 0,
            "ewgen_analyze": 0,
            "ewgen_prepare": 0,
            "ewgen_cluster_extract": 0,
            "ewgen_component_factory": 0,
            "desktop_atom_write_file": 0,
        }
        self.last_product_surfaces: dict[str, Any] | None = None
        self.last_scaffold_meta: dict[str, Any] = {}
        # P15: product pack matched but mechanical extract produced nothing.
        self.last_extract_required_failed: bool = False
        # True product Evolve with no services/{name}/manifest — not scratch invent.
        self.last_evolve_missing_capsule: str | None = None
        # Configuration-Driven Assembly: when set, LLM domain writes are CRITICAL.
        self.config_driven_active: bool = False
        self.last_assembly_meta: dict[str, Any] = {}
        self.last_assembly_progress: list[dict[str, Any]] = []

    def reset_stats(self) -> None:
        for key in self.last_action_stats:
            self.last_action_stats[key] = 0
        self.last_scaffold_meta = {}
        self.last_extract_required_failed = False
        self.config_driven_active = False
        self.last_assembly_meta = {}
        self.last_evolve_missing_capsule = None

    def count_service_atom_files(self, service_name: str) -> int:
        """Count atom files under service + Desktop atom trees (corpus size)."""
        if not service_name:
            return 0
        root = self._workspace()
        total = 0
        for base in (
            root / "services" / service_name / "src" / "integration" / "atoms",
            root / "apps" / "empery_desktop" / "atoms" / service_name,
        ):
            if not base.is_dir():
                continue
            total += sum(1 for p in base.rglob("*") if p.is_file())
        return total

    def _stamp_atom_file_count(
        self,
        service_name: str,
        *,
        new_files: int | None = None,
        wired: list[str] | None = None,
        unwired: list[str] | None = None,
    ) -> int:
        """Stamp corpus count plus optional new/wired/unwired extract metrics."""
        n = self.count_service_atom_files(service_name)
        meta = dict(self.last_scaffold_meta or {})
        meta["eic_atom_file_count"] = n
        if new_files is not None:
            meta["eic_atom_files_new"] = int(new_files)
        if wired is not None:
            meta["eic_atom_files_wired"] = list(wired)
        if unwired is not None:
            meta["eic_atom_files_unwired"] = list(unwired)
        self.last_scaffold_meta = meta
        return n

    def _workspace(self) -> Path:
        return self._paths.workspace_root.resolve()

    def _is_denied(self, relative: str) -> bool:
        lowered = relative.lower().replace("\\", "/")
        name = Path(lowered).name
        if name.startswith(".env") or name == "env":
            return True
        return any(frag in lowered for frag in _DENY_NAME_FRAGMENTS)

    def _normalize_rel(self, rel: str) -> str:
        cleaned = rel.strip().lstrip("./")
        # Container cwd is /app — LLM sometimes prefixes app/ or /app/.
        if cleaned.startswith("/app/"):
            cleaned = cleaned[len("/app/") :]
        elif cleaned.startswith("app/"):
            cleaned = cleaned[len("app/") :]
        # Accept absolute-looking orchestration shortcuts
        if cleaned.startswith("designs/"):
            cleaned = f".cursor/orchestration/{cleaned}"
        elif cleaned.startswith("reports/"):
            cleaned = f".cursor/orchestration/{cleaned}"
        elif "/designs/" in cleaned and not cleaned.startswith("services/"):
            cleaned = f".cursor/orchestration/designs/{Path(cleaned).name}"
        elif "/reports/" in cleaned and not cleaned.startswith("services/"):
            cleaned = f".cursor/orchestration/reports/{Path(cleaned).name}"
        return cleaned.replace("\\", "/")

    def _is_allowlisted(self, relative: str) -> bool:
        if relative == "compose.reflex.yml":
            return True
        return any(relative == p.rstrip("/") or relative.startswith(p) for p in _ALLOW_PREFIXES)

    def _resolve_sandboxed(self, relative: str) -> Path:
        if self._is_denied(relative):
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_SANDBOX_DENIED",
                    message="Path denied by sandbox policy",
                    details={"path": relative},
                ),
                http_status=403,
            )
        if not self._is_allowlisted(relative):
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_SANDBOX_DENIED",
                    message="Path not in allowlist",
                    details={"path": relative, "allow": list(_ALLOW_PREFIXES)},
                ),
                http_status=403,
            )
        root = self._workspace()
        target = (root / relative).resolve()
        if not str(target).startswith(str(root)):
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_SANDBOX_DENIED",
                    message="Path escapes workspace root",
                    details={"path": relative},
                ),
                http_status=400,
            )
        return target

    def write_text(self, absolute: Path, content: str) -> str:
        # Heal file-as-directory ancestors (LLM wrote services/{name} as a file).
        self._heal_file_ancestors(absolute)
        absolute.parent.mkdir(parents=True, exist_ok=True)
        absolute.write_text(content, encoding="utf-8")
        return str(absolute)

    def _heal_file_ancestors(self, absolute: Path) -> None:
        """Unlink any file that blocks mkdir along absolute's parent chain."""
        workspace = self._workspace().resolve()
        try:
            absolute = absolute.resolve()
        except OSError:
            absolute = absolute.absolute()
        cur = absolute.parent
        while True:
            try:
                if not cur.is_relative_to(workspace):
                    break
            except (ValueError, AttributeError):
                break
            if cur == workspace:
                break
            if cur.exists() and cur.is_file():
                cur.unlink()
                log_event(
                    self._logger,
                    event="eic.workspace.heal_file_as_dir",
                    message="Removed file blocking directory path",
                    path=str(cur.relative_to(workspace)),
                    level=logging.WARNING,
                )
            if cur.parent == cur:
                break
            cur = cur.parent

    def create_dir(self, relative: str) -> str:
        rel = self._normalize_rel(relative).rstrip("/")
        target = self._resolve_sandboxed(rel)
        self._heal_file_ancestors(target / "_")
        if target.exists() and target.is_file():
            target.unlink()
        target.mkdir(parents=True, exist_ok=True)
        self.last_action_stats["create_dir"] += 1
        return str(target)

    def write_design(
        self, service_name: str, markdown: str, json_body: str | None = None
    ) -> list[str]:
        self._paths.designs_root.mkdir(parents=True, exist_ok=True)
        md_path = self._paths.designs_root / f"{service_name}_design.md"
        written = [self.write_text(md_path, markdown)]
        if json_body is not None:
            json_path = self._paths.designs_root / f"{service_name}_design.json"
            written.append(self.write_text(json_path, json_body))
        return written

    def ensure_design_assembly_json(
        self,
        service_name: str,
        *,
        intent: str | None = None,
        design_path: str | None = None,
    ) -> str:
        """Persist ``assembly`` into design JSON so evolve Hands keep pack/profile.

        Merges resolved selection into existing JSON without wiping LLM fields.
        """
        import json

        from core.integration.assembly_contracts import (
            is_config_driven_profile,
        )
        from services.empery_intelligence_core.src.integration.recipe_catalog import (
            resolve_assembly_selection,
        )

        self._paths.designs_root.mkdir(parents=True, exist_ok=True)
        json_path = self._paths.designs_root / f"{service_name}_design.json"
        data: dict[str, Any] = {}
        if json_path.is_file():
            try:
                loaded = json.loads(json_path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    data = loaded
            except (OSError, json.JSONDecodeError):
                data = {}

        selection = resolve_assembly_selection(
            self._paths,
            service_name=service_name,
            intent=intent or service_name,
            design_path=design_path,
        )
        existing_asm = (
            data.get("assembly") if isinstance(data.get("assembly"), dict) else {}
        )
        packs = list(existing_asm.get("recipe_packs") or selection.packs or [])
        profile = (
            existing_asm.get("scaffold_profile")
            or selection.scaffold_profile
            or "generic"
        )
        roots = list(
            existing_asm.get("extract_roots") or selection.extract_roots or []
        )
        data["service_name"] = service_name
        data["assembly"] = {
            "recipe_packs": packs,
            "scaffold_profile": profile,
            "forbid_generic_crud": bool(
                existing_asm.get("forbid_generic_crud", True)
            ),
            "extract_roots": roots,
            "assembly_mode": (
                existing_asm.get("assembly_mode")
                or (
                    "config_driven"
                    if is_config_driven_profile(str(profile))
                    else "legacy"
                )
            ),
        }
        # Heal delete-gate provenance on every assembly persist (create + evolve).
        lifecycle = data.get("lifecycle")
        if not isinstance(lifecycle, dict):
            lifecycle = {}
        lifecycle.setdefault("user_created", True)
        lifecycle.setdefault("created_by", lifecycle.get("created_by") or "genesis")
        data["lifecycle"] = lifecycle
        ui = data.get("ui")
        if isinstance(ui, dict):
            ui.setdefault("user_created", True)
            data["ui"] = ui
        return self.write_text(
            json_path, json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        )

    def ensure_blueprint_json(
        self,
        service_name: str,
        *,
        intent: str | None = None,
        architect_content: str | None = None,
        design_path: str | None = None,
        require_config_driven: bool = False,
    ) -> str:
        """Parse/persist Blueprint; merge packs into design.json assembly.

        Raises EIC_BLUEPRINT_INVALID when config_driven and Blueprint cannot validate.
        """
        import json

        from core.integration.assembly_contracts import (
            BlueprintContract,
            canonicalize_blueprint_endpoints,
            default_blueprint_for_profile,
            is_config_driven_profile,
            parse_blueprint_from_text,
            validate_blueprint,
        )
        from services.empery_intelligence_core.src.integration.recipe_catalog import (
            resolve_assembly_selection,
        )

        self._paths.designs_root.mkdir(parents=True, exist_ok=True)
        selection = resolve_assembly_selection(
            self._paths,
            service_name=service_name,
            intent=intent or service_name,
            design_path=design_path,
        )
        profile = (selection.scaffold_profile or "generic").lower()
        config_driven = is_config_driven_profile(profile) or require_config_driven

        blueprint: BlueprintContract | None = None
        if architect_content:
            blueprint = parse_blueprint_from_text(
                architect_content, service_name=service_name
            )

        # Prefer already-written blueprint file from eic_actions.
        bp_path = self._paths.designs_root / f"{service_name}_blueprint.json"
        if blueprint is None and bp_path.is_file():
            try:
                blueprint = validate_blueprint(
                    json.loads(bp_path.read_text(encoding="utf-8"))
                )
            except Exception:
                blueprint = None

        if blueprint is None and config_driven:
            # Heal: emit default Blueprint from selection profile.
            blueprint = default_blueprint_for_profile(
                profile,
                service_name=service_name,
                recipe_packs=list(selection.packs or []),
            )
            if blueprint is None:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_BLUEPRINT_INVALID",
                        message=(
                            "Architect did not emit a valid Blueprint.json "
                            "for config_driven assembly"
                        ),
                        details={
                            "service_name": service_name,
                            "scaffold_profile": profile,
                        },
                    ),
                    http_status=422,
                )

        if blueprint is None:
            # Legacy profiles: no Blueprint required.
            return ""

        # Align packs/profile from selection when Architect omitted them.
        if not blueprint.recipe_packs and selection.packs:
            blueprint = blueprint.model_copy(
                update={"recipe_packs": list(selection.packs)}
            )
        if not blueprint.scaffold_profile:
            blueprint = blueprint.model_copy(
                update={"scaffold_profile": profile}
            )
        if config_driven:
            blueprint = blueprint.model_copy(
                update={"assembly_mode": "config_driven"}
            )

        try:
            blueprint = validate_blueprint(blueprint)
        except Exception as exc:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_BLUEPRINT_INVALID",
                    message=f"Blueprint validation failed: {exc}",
                    details={"service_name": service_name},
                ),
                http_status=422,
            ) from exc

        # Collapse Architect drift (metrics/summary → /api/v1/metrics) onto
        # scaffold-real peer routes before persist.
        blueprint = canonicalize_blueprint_endpoints(blueprint)

        written = self.write_text(
            bp_path,
            json.dumps(blueprint.model_dump(mode="json"), indent=2, ensure_ascii=False)
            + "\n",
        )

        # Merge into design.json assembly (packs + mode from Blueprint).
        design_json = self._paths.designs_root / f"{service_name}_design.json"
        data: dict[str, Any] = {}
        if design_json.is_file():
            try:
                loaded = json.loads(design_json.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    data = loaded
            except (OSError, json.JSONDecodeError):
                data = {}
        asm = data.get("assembly") if isinstance(data.get("assembly"), dict) else {}
        data["service_name"] = service_name
        data["assembly"] = {
            **asm,
            "recipe_packs": blueprint.recipe_packs
            or list(asm.get("recipe_packs") or selection.packs or []),
            "scaffold_profile": blueprint.scaffold_profile
            or asm.get("scaffold_profile")
            or profile,
            "forbid_generic_crud": True,
            "extract_roots": list(
                asm.get("extract_roots") or selection.extract_roots or []
            ),
            "assembly_mode": blueprint.assembly_mode,
            "target_module": blueprint.target_module.value
            if hasattr(blueprint.target_module, "value")
            else str(blueprint.target_module),
            "blueprint_path": f".cursor/orchestration/designs/{service_name}_blueprint.json",
        }
        self.write_text(
            design_json, json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        )
        self.last_assembly_meta = {
            "blueprint_version": blueprint.version,
            "scaffold_profile": blueprint.scaffold_profile,
            "assembly_mode": blueprint.assembly_mode,
        }
        if blueprint.assembly_mode == "config_driven":
            self.config_driven_active = True
        return written

    def persist_assembly_manifest(
        self,
        service_name: str,
        *,
        implementer_content: str | None = None,
        manifest_data: dict[str, Any] | None = None,
    ) -> str:
        """Validate + write Manifest under eic/assembly/. Raises EIC_MANIFEST_INVALID."""
        import json

        from core.integration.assembly_contracts import (
            canonicalize_blueprint_endpoints,
            heal_manifest_data_sources,
            is_config_driven_profile,
            manifest_from_blueprint,
            parse_manifest_from_text,
            rebind_manifest_composition_from_blueprint,
            validate_blueprint,
            validate_manifest,
            validate_manifest_against_blueprint,
        )

        bp_path = self._paths.designs_root / f"{service_name}_blueprint.json"
        if not bp_path.is_file():
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MANIFEST_INVALID",
                    message="Cannot persist Manifest — Blueprint missing",
                    details={"service_name": service_name},
                ),
                http_status=422,
            )
        try:
            blueprint = validate_blueprint(
                json.loads(bp_path.read_text(encoding="utf-8"))
            )
        except Exception as exc:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_BLUEPRINT_INVALID",
                    message=f"Blueprint unreadable: {exc}",
                    details={"service_name": service_name},
                ),
                http_status=422,
            ) from exc
        # Re-canonicalize in case an older drifted blueprint is on disk.
        blueprint = canonicalize_blueprint_endpoints(blueprint)
        if blueprint.assembly_mode == "config_driven" or is_config_driven_profile(
            blueprint.scaffold_profile
        ):
            self.write_text(
                bp_path,
                json.dumps(
                    blueprint.model_dump(mode="json"), indent=2, ensure_ascii=False
                )
                + "\n",
            )

        manifest = None
        healed = False
        data_source_healed = False
        composition_rebound = False
        if manifest_data is not None:
            try:
                manifest = validate_manifest(manifest_data)
            except Exception:
                manifest = None
        if manifest is None and implementer_content:
            manifest = parse_manifest_from_text(implementer_content)

        # Already written by eic_actions?
        asm_dir = self._paths.eic_root / "assembly"
        asm_dir.mkdir(parents=True, exist_ok=True)
        mf_path = asm_dir / f"{service_name}_manifest.json"
        if manifest is None and mf_path.is_file():
            try:
                manifest = validate_manifest(
                    json.loads(mf_path.read_text(encoding="utf-8"))
                )
            except Exception:
                manifest = None

        # Mechanics heal: Blueprint → Manifest when LLM omitted JSON (Assembler path).
        if manifest is None and (
            blueprint.assembly_mode == "config_driven"
            or is_config_driven_profile(blueprint.scaffold_profile)
        ):
            manifest = manifest_from_blueprint(blueprint)
            healed = True
            log_event(
                self._logger,
                event="eic.assembly.manifest_healed_from_blueprint",
                message="Manifest derived from Blueprint (Implementer JSON missing)",
                service_name=service_name,
            )

        if manifest is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MANIFEST_INVALID",
                    message=(
                        "Implementer did not emit a valid AssemblyManifest JSON"
                    ),
                    details={"service_name": service_name},
                ),
                http_status=422,
            )

        try:
            validate_manifest_against_blueprint(manifest, blueprint)
        except ValueError as exc:
            # Config-driven contract repair (deterministic, not fuzzy):
            # 1) data_source → Blueprint allowlist
            # 2) composition → full Blueprint projection (ids owned by tree)
            if not (
                blueprint.assembly_mode == "config_driven"
                or is_config_driven_profile(blueprint.scaffold_profile)
            ):
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_MANIFEST_INVALID",
                        message=str(exc),
                        details={"service_name": service_name},
                    ),
                    http_status=422,
                ) from exc

            last_err: BaseException | None = exc
            healed_mf, did_heal = heal_manifest_data_sources(manifest, blueprint)
            if did_heal:
                manifest = healed_mf
                data_source_healed = True
                log_event(
                    self._logger,
                    event="eic.assembly.manifest_data_source_healed",
                    message=str(exc),
                    service_name=service_name,
                )
                try:
                    validate_manifest_against_blueprint(manifest, blueprint)
                    last_err = None
                except ValueError as exc2:
                    last_err = exc2

            if last_err is not None:
                rebound_mf, did_rebind = rebind_manifest_composition_from_blueprint(
                    manifest, blueprint
                )
                if did_rebind:
                    try:
                        validate_manifest_against_blueprint(rebound_mf, blueprint)
                        manifest = rebound_mf
                        composition_rebound = True
                        last_err = None
                        log_event(
                            self._logger,
                            event="eic.assembly.manifest_composition_rebound",
                            message=str(exc),
                            service_name=service_name,
                        )
                    except ValueError as exc3:
                        last_err = exc3
                if last_err is not None:
                    raise ServiceError(
                        StandardizedErrorResponse(
                            error_code="EIC_MANIFEST_INVALID",
                            message=str(last_err),
                            details={"service_name": service_name},
                        ),
                        http_status=422,
                    ) from last_err

        written = self.write_text(
            mf_path,
            json.dumps(manifest.model_dump(mode="json"), indent=2, ensure_ascii=False)
            + "\n",
        )
        if healed or data_source_healed or composition_rebound:
            self.last_assembly_meta = {
                **dict(self.last_assembly_meta or {}),
                "manifest_healed_from_blueprint": healed,
                "manifest_data_source_healed": data_source_healed,
                "manifest_composition_rebound": composition_rebound,
            }
        return written

    def run_config_driven_assembler(
        self,
        service_name: str,
        *,
        intent: str,
        role: AgentRole,
        written_paths: list[str],
        scaffold_profile: str | None = None,
        skip_mechanical_extract: bool = False,
        kind: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> list[str]:
        """Assembler v1: scaffold+extract, stamp, AST inject, tsc, ECC API reload."""
        import json
        import os as _os

        from core.integration.assembly_contracts import (
            validate_blueprint,
            validate_manifest,
        )
        from services.empery_intelligence_core.src.integration.assembler_factory import (
            build_assembler_port,
        )

        self.config_driven_active = True
        written: list[str] = []
        # Mechanical capsule first (Assembler owns scaffold — not LLM eic_actions).
        scaffolded = self.maybe_scaffold_for_intention(
            intent=intent,
            service_name=service_name,
            role=role,
            written_paths=written_paths,
            scaffold_profile=scaffold_profile,
            skip_mechanical_extract=skip_mechanical_extract,
            kind=kind,
            metadata=metadata,
        )
        written.extend(scaffolded)

        bp_path = self._paths.designs_root / f"{service_name}_blueprint.json"
        mf_path = self._paths.eic_root / "assembly" / f"{service_name}_manifest.json"
        blueprint = validate_blueprint(
            json.loads(bp_path.read_text(encoding="utf-8"))
        )
        manifest = validate_manifest(
            json.loads(mf_path.read_text(encoding="utf-8"))
        )
        # Fail-closed tsc when UI targets exist — unit tests pass run_tsc=False via
        # env EIC_ASSEMBLY_SKIP_TSC=1 only (explicit lab escape, not default).
        skip_tsc = _os.environ.get("EIC_ASSEMBLY_SKIP_TSC", "").strip() in {
            "1",
            "true",
            "yes",
        }
        run_tsc = not skip_tsc
        assembler = self._assembler or build_assembler_port(logger=self._logger)
        result = assembler.assemble_v1(
            self._workspace(),
            blueprint=blueprint,
            manifest=manifest,
            manifest_path=mf_path,
            logger=self._logger,
            run_tsc=run_tsc,
        )
        for path in result.get("written") or []:
            if path not in written:
                written.append(path)

        # Evolve Desktop-touch: stamp mount before Gate T freeze/preflight.
        # Assembler inject is often byte-identical; marker is mechanics-owned delivery
        # evidence (see evolve_delta_gate.stamp_evolve_mount_delivery).
        meta = dict(metadata or {})
        if (kind or "").strip().lower() == "evolve":
            from core.assembly.gates import write_assembly_freeze
            from services.empery_intelligence_core.src.integration.evolve_delta_gate import (
                mount_rel,
                stamp_evolve_mount_delivery,
            )
            from services.empery_intelligence_core.src.integration.evolve_verify_touches import (
                evolve_touch_gates,
            )

            touch = evolve_touch_gates(meta, intent=intent)
            if touch.get("desktop") or touch.get("ui"):
                intention_id = str(
                    meta.get("intention_id")
                    or meta.get("ecc_job_id")
                    or meta.get("job_id")
                    or service_name
                )
                attempt = int(meta.get("fix_attempt") or meta.get("attempt") or 0)
                bp_ver = (
                    str(meta.get("blueprint_version") or blueprint.version or "-")
                )
                if stamp_evolve_mount_delivery(
                    self._workspace(),
                    service_name,
                    intention_id=intention_id,
                    attempt=attempt,
                    blueprint_version=bp_ver,
                ):
                    mrel = mount_rel(service_name)
                    if mrel not in written:
                        written.append(mrel)
                    freeze_path = write_assembly_freeze(
                        self._workspace(), service_name
                    )
                    freeze_rel = str(
                        freeze_path.relative_to(self._workspace())
                    ).replace("\\", "/")
                    if freeze_rel not in written:
                        written.append(freeze_rel)
                    from core.assembly.artifact_bundle import (
                        artifact_bundle_rel,
                        write_artifact_bundle,
                    )

                    write_artifact_bundle(
                        self._workspace(),
                        service_name=service_name,
                        written_relpaths=written,
                        assembler_version=str(
                            (result.get("assembler_version") if isinstance(result, dict) else None)
                            or "v1"
                        ),
                        widget_count=int(
                            (result.get("widget_count") if isinstance(result, dict) else 0)
                            or 0
                        ),
                    )
                    brel = artifact_bundle_rel(service_name)
                    if brel not in written:
                        written.append(brel)
                    meta["eic_evolve_mount_stamped"] = True

        # Phase 4: Gate T∧C preflight before ECC reload / DeployHint path.
        # Fail-closed for config_driven — do not reload/deploy drifted Assembler output.
        # Lab escape: EIC_ASSEMBLY_SKIP_PREFLIGHT=1
        skip_preflight = _os.environ.get(
            "EIC_ASSEMBLY_SKIP_PREFLIGHT", ""
        ).strip().lower() in {"1", "true", "yes"}
        preflight: dict[str, Any] = {"skipped": True}
        if not skip_preflight:
            preflight = self.verify_assembly_gates(
                service_name,
                intent=intent,
                gate_t=True,
                gate_c=True,
                gate_s=False,
            )
            preflight["skipped"] = False
            if preflight.get("gate_t") == "FAILED" or preflight.get("gate_c") == "FAILED":
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_ASSEMBLY_PREFLIGHT_FAILED",
                        message=(
                            "Assembler preflight Gate T∧C failed — "
                            "refusing ECC reload / deploy path"
                        ),
                        details={
                            "service_name": service_name,
                            "gate_t": preflight.get("gate_t"),
                            "gate_c": preflight.get("gate_c"),
                            "details": preflight.get("details"),
                            "transport": preflight.get("transport"),
                        },
                    ),
                    http_status=422,
                )

        # B6: reload ECC API so stamped BFF routes appear in live OpenAPI.
        # Production path: require success whenever deploy_agent_url is configured
        # (Assembler DoD). Unit/lab: EIC_ASSEMBLY_SKIP_ECC_RELOAD=1.
        ecc_api_refresh: dict[str, Any] = {"skipped": True}
        agent_url = str(getattr(self._config, "deploy_agent_url", "") or "")
        skip_reload = _os.environ.get("EIC_ASSEMBLY_SKIP_ECC_RELOAD", "").strip() in {
            "1",
            "true",
            "yes",
        }
        if agent_url and not skip_reload:
            from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
                refresh_ecc_api,
            )

            required = True
            ecc_api_refresh = refresh_ecc_api(
                deploy_agent_url=agent_url,
                logger=self._logger,
                timeout_s=float(
                    getattr(self._config, "ui_rebuild_timeout_s", 300)
                ),
                required=required,
            )
            if (
                ecc_api_refresh.get("ok") is False
                and not ecc_api_refresh.get("skipped")
            ):
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_ECC_API_RELOAD_FAILED",
                        message="Assembler DoD: empery_control_center_api reload failed",
                        details=ecc_api_refresh,
                    ),
                    http_status=502,
                )

        self.last_assembly_meta = {
            **dict(self.last_assembly_meta or {}),
            "assembler_version": result.get("assembler_version") or "v1",
            "widget_count": result.get("widget_count"),
            "ecc_api_refresh": ecc_api_refresh,
            "targets": result.get("targets") or [],
            "run_tsc": run_tsc,
            "transport": result.get("transport") or "local",
            "preflight": {
                "skipped": preflight.get("skipped", True),
                "status": preflight.get("status"),
                "gate_t": preflight.get("gate_t"),
                "gate_c": preflight.get("gate_c"),
                "transport": preflight.get("transport"),
            },
        }
        if meta.get("eic_evolve_mount_stamped"):
            self.last_assembly_meta["eic_evolve_mount_stamped"] = True
        self.last_assembly_progress = list(
            result.get("progress")
            or getattr(assembler, "last_progress", None)
            or []
        )
        return written

    def verify_assembly_gates(
        self,
        service_name: str,
        *,
        intent: str = "",
        judge_raw: str | None = None,
        nervas_abstained: bool = False,
        gate_t: bool = True,
        gate_c: bool = True,
        gate_s: bool = True,
    ) -> dict[str, Any]:
        """Run Gate T/C/S via VerifierPort (local or gRPC)."""
        from services.empery_intelligence_core.src.integration.verifier_factory import (
            build_verifier_port,
        )

        if nervas_abstained and not judge_raw:
            judge_raw = "__NERVAS_ABSTAINED__"
        verifier = self._verifier or build_verifier_port(logger=self._logger)
        report = verifier.verify_assembly(
            self._workspace(),
            service_name,
            gate_t=gate_t,
            gate_c=gate_c,
            gate_s=gate_s,
            intent=intent,
            judge_raw=judge_raw,
            designs_root=self._paths.designs_root,
            eic_root=self._paths.eic_root,
        )
        self.last_assembly_meta = {
            **dict(self.last_assembly_meta or {}),
            "verifier_transport": report.get("transport"),
            "verifier_status": report.get("status"),
            "gate_t": report.get("gate_t"),
            "gate_c": report.get("gate_c"),
            "gate_s": report.get("gate_s"),
        }
        return report

    def verify_assembly_contract(
        self, service_name: str
    ) -> tuple[str, str]:
        """Gate C full — Blueprint ↔ Manifest ↔ runtime + slots/endpoints."""
        from core.assembly.gates import (
            verify_assembly_gate_c_full,
        )

        return verify_assembly_gate_c_full(
            self._workspace(),
            service_name,
            designs_root=self._paths.designs_root,
            eic_root=self._paths.eic_root,
        )

    def verify_assembly_gate_t(self, service_name: str) -> tuple[str, str]:
        """Gate T — hash freeze drift check."""
        from core.assembly.gates import (
            verify_assembly_gate_t,
        )

        return verify_assembly_gate_t(self._workspace(), service_name)

    def verify_assembly_gate_s(
        self,
        service_name: str,
        *,
        intent: str,
        nervas: Any | None = None,
        judge_raw: str | None = None,
        nervas_abstained: bool = False,
    ) -> tuple[str, str, dict[str, Any]]:
        """Gate S — semantic Intent↔Blueprint↔Manifest judge."""
        from core.assembly.gates import (
            verify_assembly_gate_s,
        )

        return verify_assembly_gate_s(
            intent=intent,
            workspace=self._workspace(),
            service_name=service_name,
            designs_root=self._paths.designs_root,
            eic_root=self._paths.eic_root,
            nervas=nervas,
            judge_raw=judge_raw,
            nervas_abstained=nervas_abstained,
        )

    def write_verify_report(
        self, service_name: str, body: str, *, status: str
    ) -> str:
        self._paths.reports_root.mkdir(parents=True, exist_ok=True)
        path = self._paths.reports_root / f"{service_name}_verify.md"
        header = f"# Verify Report: {service_name}\n\n**Status:** {status}\n\n"
        return self.write_text(path, header + body)

    def read_file(self, relative: str) -> str:
        rel = self._normalize_rel(relative)
        target = self._resolve_sandboxed(rel)
        if not target.is_file():
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_SANDBOX_DENIED",
                    message="File not found",
                    details={"path": rel},
                ),
                http_status=404,
            )
        self.last_action_stats["read_file"] += 1
        return target.read_text(encoding="utf-8")

    def list_dir(self, relative: str) -> list[str]:
        rel = self._normalize_rel(relative.rstrip("/") + "/")
        # list_dir allow: directory prefixes
        if not self._is_allowlisted(rel) and not any(
            rel.rstrip("/") == p.rstrip("/") for p in _ALLOW_PREFIXES
        ):
            # Allow listing parents of allowlisted trees
            if rel not in {
                "services/",
                "deploy/",
                ".cursor/",
                ".cursor/orchestration/",
                "reference/",
                "apps/",
            }:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_SANDBOX_DENIED",
                        message="list_dir path not allowlisted",
                        details={"path": rel},
                    ),
                    http_status=403,
                )
        root = self._workspace()
        target = (root / rel.rstrip("/")).resolve()
        if not str(target).startswith(str(root)):
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_SANDBOX_DENIED",
                    message="Path escapes workspace",
                    details={"path": rel},
                ),
                http_status=400,
            )
        if not target.is_dir():
            return []
        self.last_action_stats["list_dir"] += 1
        return sorted(p.name for p in target.iterdir())

    def apply_actions(
        self,
        actions: list[dict[str, Any]],
        *,
        role: AgentRole,
        service_name: str | None,
    ) -> list[str]:
        written: list[str] = []
        for action in actions:
            kind = str(
                action.get("op") or action.get("type") or action.get("name") or "write"
            ).strip().lower()
            if (
                self.config_driven_active
                and kind in {
                    "scaffold",
                    "scaffold_service",
                    "service_scaffold",
                    "extract_adapt",
                    "extract",
                    "adapt",
                    "ewgen_analyze",
                    "ewgen_prepare",
                    "ewgen_cluster_extract",
                    "ewgen_component_factory",
                    "ewgen_factory",
                }
            ):
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_CRITICAL_VIOLATION",
                        message=(
                            "config_driven assembly: LLM may not call "
                            f"{kind} — Assembler owns scaffold/extract"
                        ),
                        details={
                            "service_name": service_name,
                            "op": kind,
                        },
                    ),
                    http_status=403,
                )
            if kind in {"write", "write_file", "file_write"}:
                path = self._apply_write(action, role=role, service_name=service_name)
                if path:
                    written.append(path)
            elif kind in {"create_dir", "mkdir", "ensure_dir"}:
                rel = action.get("path") or action.get("relative_path")
                if isinstance(rel, str) and rel:
                    try:
                        written.append(self.create_dir(rel))
                    except ServiceError as exc:
                        log_event(
                            self._logger,
                            event="eic.workspace.create_dir_denied",
                            message=exc.response.message,
                            path=rel,
                            level=logging.WARNING,
                        )
            elif kind in {"read_file", "read"}:
                rel = action.get("path") or action.get("relative_path")
                if isinstance(rel, str) and rel:
                    try:
                        _ = self.read_file(rel)
                    except ServiceError:
                        pass
            elif kind in {"list_dir", "ls"}:
                rel = action.get("path") or action.get("relative_path") or "services/"
                if isinstance(rel, str):
                    try:
                        _ = self.list_dir(rel)
                    except ServiceError:
                        pass
            elif kind in {"run_command", "compose", "command_reflex", "shell"}:
                result = self.run_command_reflex(action)
                if result.get("ok") and result.get("summary"):
                    written.append(str(result["summary"]))
            elif kind in {"scaffold", "scaffold_service", "service_scaffold"}:
                name = (
                    action.get("service_name")
                    or service_name
                    or action.get("name")
                )
                if isinstance(name, str) and name:
                    result = self.scaffold_service(name, features=action.get("features"))
                    written.extend(result.get("written") or [])
            elif kind in {"extract_adapt", "extract", "adapt"}:
                result = self.extract_adapt_action(action, service_name=service_name)
                written.extend(result.get("written") or [])
            elif kind in {
                "ewgen_analyze",
                "ewgen_prepare",
                "ewgen_cluster_extract",
                "ewgen_component_factory",
                "ewgen_factory",
            }:
                result = self.ewgen_factory_action(
                    action, kind=kind, service_name=service_name
                )
                written.extend(result.get("written") or [])
                if result.get("summary"):
                    written.append(str(result["summary"]))
        return written

    def ewgen_factory_action(
        self,
        action: dict[str, Any],
        *,
        kind: str,
        service_name: str | None,
    ) -> dict[str, Any]:
        """Vendored EWGen: analyze / prepare / cluster-extract / component factory."""
        from services.empery_intelligence_core.src.integration.ewgen import bridge as ewgen

        ws = self._workspace()
        ewgen.configure_ewgen_data(ws)
        zip_rel = (
            action.get("zip_path")
            or action.get("archive")
            or action.get("path")
            or action.get("source")
        )
        zip_bytes: bytes | None = None
        if isinstance(zip_rel, str) and zip_rel.strip():
            rel = zip_rel.strip().replace("\\", "/")
            while rel.startswith("./"):
                rel = rel[2:]
            zpath = (ws / rel).resolve()
            try:
                zpath.relative_to(ws)
            except ValueError:
                return {"ok": False, "error": f"zip not found under workspace: {zip_rel}"}
            if not zpath.is_file():
                return {"ok": False, "error": f"zip not found under workspace: {zip_rel}"}
            zip_bytes = zpath.read_bytes()
        elif isinstance(action.get("zip_b64"), str) and action.get("zip_b64"):
            import base64

            try:
                zip_bytes = base64.b64decode(action["zip_b64"])
            except Exception as exc:  # noqa: BLE001
                return {"ok": False, "error": f"invalid zip_b64: {exc}"}

        op = kind.strip().lower()
        if op == "ewgen_analyze":
            if not zip_bytes:
                return {"ok": False, "error": "ewgen_analyze requires zip_path"}
            track = str(action.get("track") or "auto").strip().lower()
            if track in {"fe", "frontend", "importer", "seaker"}:
                result = ewgen.analyze_frontend_zip(zip_bytes)
            elif track in {"be", "backend", "scavenger", "python"}:
                result = ewgen.analyze_backend_zip(zip_bytes)
            else:
                result = {
                    "classify": ewgen.classify_archive(zip_bytes),
                    "frontend": ewgen.analyze_frontend_zip(zip_bytes),
                    "backend": ewgen.analyze_backend_zip(zip_bytes),
                }
            self.last_action_stats["ewgen_analyze"] += 1
            groups = []
            fe = result.get("frontend") if isinstance(result, dict) else None
            if isinstance(fe, dict):
                groups = fe.get("componentGroups") or []
            elif isinstance(result, dict):
                groups = result.get("componentGroups") or []
            summary = (
                f"ewgen_analyze groups={len(groups) if isinstance(groups, list) else 0}"
            )
            log_event(
                self._logger,
                event="eic.ewgen.analyze",
                message=summary,
                service_name=service_name,
            )
            return {"ok": True, "written": [], "summary": summary, "result": result}

        if op == "ewgen_prepare":
            if not zip_bytes:
                return {"ok": False, "error": "ewgen_prepare requires zip_path"}
            try:
                result = ewgen.prepare_ingest_zip(
                    zip_bytes,
                    workspace=ws,
                    rematerialize=bool(action.get("rematerialize")),
                    save_to_catalog=action.get("save_to_catalog", True) is not False,
                    source_ref=str(action.get("source_ref") or zip_rel or "empery.zip"),
                )
            except Exception as exc:  # noqa: BLE001 — boundary
                return {"ok": False, "error": str(exc)[:500]}
            self.last_action_stats["ewgen_prepare"] += 1
            bank_n = len(result.get("bankEntries") or [])
            summary = f"ewgen_prepare bankEntries={bank_n} success={result.get('success')}"
            log_event(
                self._logger,
                event="eic.ewgen.prepare",
                message=summary,
                service_name=service_name,
            )
            return {"ok": bool(result.get("success")), "written": [], "summary": summary, "result": result}

        if op == "ewgen_cluster_extract":
            if not zip_bytes:
                return {"ok": False, "error": "ewgen_cluster_extract requires zip_path"}
            dest = action.get("dest") or (
                f"reference/eliteew/packs/{service_name or 'imported'}/upstream_fe"
                if service_name
                else "reference/ewgen/extracted"
            )
            if not isinstance(dest, str) or not dest.strip():
                return {"ok": False, "error": "ewgen_cluster_extract requires dest"}
            groups = ewgen.cluster_component_groups_from_zip(zip_bytes)
            group_id = action.get("group_id") or action.get("component_group_id")
            if group_id:
                groups = [g for g in groups if str(g.get("id")) == str(group_id)]
            limit = int(action.get("limit") or 3)
            groups = groups[: max(1, limit)]
            written: list[str] = []
            for group in groups:
                label = (
                    str(group.get("moduleName") or group.get("displayLabel") or group.get("id") or "group")
                    .strip()
                    .replace(" ", "_")
                )
                dest_g = f"{dest.rstrip('/')}/{label}"
                one = ewgen.materialize_group_files_to_dest(
                    workspace=ws,
                    zip_bytes=zip_bytes,
                    group=group,
                    dest_rel=dest_g,
                    transforms=action.get("transforms")
                    or ["strip_reference_imports", "rewrite_service_token"],
                    service_name=service_name,
                )
                written.extend(one.get("written") or [])
            self.last_action_stats["ewgen_cluster_extract"] += 1
            self.last_action_stats["write_file"] += len(written)
            self.last_action_stats["extract_adapt"] += 1 if written else 0
            summary = f"ewgen_cluster_extract groups={len(groups)} files={len(written)}"
            log_event(
                self._logger,
                event="eic.ewgen.cluster_extract",
                message=summary,
                service_name=service_name,
                files=len(written),
            )
            return {"ok": bool(written), "written": written, "summary": summary}

        # ewgen_component_factory / ewgen_factory
        if not zip_bytes:
            return {"ok": False, "error": f"{op} requires zip_path"}
        name = str(
            action.get("project_name")
            or action.get("service_name")
            or service_name
            or "FactoryShell"
        ).strip()
        try:
            result = ewgen.run_component_factory(
                zip_bytes,
                workspace=ws,
                project_name=name,
                intent=str(action.get("intent") or ""),
                capabilities=action.get("capabilities")
                if isinstance(action.get("capabilities"), list)
                else None,
                use_llm=bool(action.get("use_llm")),
                allow_weak_contracts=action.get("allow_weak_contracts", True) is not False,
                register=bool(action.get("register")),
            )
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)[:500]}
        self.last_action_stats["ewgen_component_factory"] += 1
        summary = (
            f"ewgen_factory project={result.get('projectId')} "
            f"validated={((result.get('summary') or {}).get('validated'))}"
        )
        log_event(
            self._logger,
            event="eic.ewgen.component_factory",
            message=summary,
            service_name=service_name,
        )
        return {
            "ok": bool(result.get("success")),
            "written": [],
            "summary": summary,
            "result": result,
        }

    def extract_adapt_action(
        self,
        action: dict[str, Any],
        *,
        service_name: str | None,
    ) -> dict[str, Any]:
        source_glob = (
            action.get("source_glob")
            or action.get("source")
            or action.get("from")
            or ""
        )
        dest = action.get("dest") or action.get("destination") or action.get("to") or ""
        transforms = action.get("transforms") or action.get("transform") or []
        if isinstance(transforms, str):
            transforms = [transforms]
        mode = action.get("mode")
        name = service_name or action.get("service_name")
        if not isinstance(source_glob, str) or not source_glob.strip():
            return {"ok": False, "error": "extract_adapt requires source_glob", "written": []}
        if not isinstance(dest, str) or not dest.strip():
            return {"ok": False, "error": "extract_adapt requires dest", "written": []}

        # Fail-closed: extract_adapt requires AssemblerPort (no silent direct shim).
        assembler = self._assembler
        if assembler is None:
            try:
                from services.empery_intelligence_core.src.integration.assembler_factory import (
                    build_assembler_port,
                )

                assembler = build_assembler_port(logger=self._logger)
            except Exception as exc:  # noqa: BLE001
                log_event(
                    self._logger,
                    event="eic.extract_adapt.failed",
                    message="AssemblerPort unavailable for extract_adapt",
                    source_glob=source_glob,
                    dest=dest,
                    error=str(exc)[:300],
                    level=logging.ERROR,
                )
                return {
                    "ok": False,
                    "error": f"AssemblerPort required for extract_adapt: {exc}",
                    "written": [],
                    "transport": None,
                }

        if not hasattr(assembler, "extract_adapt"):
            return {
                "ok": False,
                "error": "AssemblerPort.extract_adapt missing — refuse direct shim",
                "written": [],
                "transport": None,
            }

        result = assembler.extract_adapt(
            self._workspace(),
            source_glob=source_glob,
            dest=dest,
            transforms=list(transforms) if isinstance(transforms, list) else [],
            service_name=name if isinstance(name, str) else None,
            mode=str(mode) if mode else None,
            logger=self._logger,
        )
        ok = bool(result.get("ok"))
        written = list(result.get("written") or [])
        if ok:
            self.last_action_stats["extract_adapt"] += 1
            self.last_action_stats["write_file"] += len(written)
        else:
            log_event(
                self._logger,
                event="eic.extract_adapt.failed",
                message=str(result.get("error") or "extract_adapt failed"),
                source_glob=source_glob,
                dest=dest,
                transport=result.get("transport"),
                level=logging.WARNING,
            )
        return {
            "ok": ok,
            "error": result.get("error"),
            "written": written,
            "mode": result.get("mode"),
            "transport": result.get("transport"),
        }

    def extract_atoms_for_intention(
        self,
        *,
        intent: str,
        service_name: str,
        scaffold_profile: str | None = None,
        kind: str | None = None,
    ) -> list[str]:
        """Mechanical extract from atom_catalog when product packs match."""
        from services.empery_intelligence_core.src.integration.extract_adapt import (
            extract_from_catalog_entry,
        )
        from services.empery_intelligence_core.src.integration.extract_wire import (
            MAX_DESKTOP_FE_ATOMS_PER_EXTRACT,
            list_desktop_fe_atoms,
            post_extract_wire_desktop_atoms,
        )
        from services.empery_intelligence_core.src.integration.recipe_catalog import (
            product_atom_entries_for_stems,
            resolve_assembly_selection,
        )

        selection = resolve_assembly_selection(
            self._paths,
            service_name=service_name,
            intent=intent,
            explicit_profile=scaffold_profile,
        )
        entries = product_atom_entries_for_stems(self._paths, selection.packs)
        if not entries:
            # Product packs without catalog entry: still try pack-dir extract roots
            from services.empery_intelligence_core.src.integration.assembly_profiles import (
                is_product_pack,
            )

            product = [p for p in selection.packs if is_product_pack(p)]
            if not product:
                return []
            # Synthetic entry from extract_roots
            for root in selection.extract_roots:
                if not root.startswith("reference/"):
                    continue
                entries.append(
                    {
                        "pack": product[0],
                        "extract_globs": [f"{root}/**"],
                        "empery_targets": [
                            f"services/{service_name}/",
                            "apps/empery_desktop/src/shell/mounts/",
                        ],
                        "transforms": ["strip_reference_imports", "rewrite_service_token"],
                    }
                )
            if not entries:
                return []
        written: list[str] = []
        errors: list[str] = []
        for entry in entries:
            result = extract_from_catalog_entry(
                workspace=self._workspace(),
                entry=entry,
                service_name=service_name,
            )
            if result.ok and result.written:
                self.last_action_stats["extract_adapt"] += 1
                self.last_action_stats["write_file"] += len(result.written)
                written.extend(result.written)
                log_event(
                    self._logger,
                    event="eic.extract_adapt.catalog",
                    message="Extracted atom pack into empery_targets",
                    service_name=service_name,
                    pack=entry.get("pack"),
                    files=len(result.written),
                )
                desktop_n = len(list_desktop_fe_atoms(written, service_name))
                if desktop_n >= MAX_DESKTOP_FE_ATOMS_PER_EXTRACT:
                    log_event(
                        self._logger,
                        event="eic.extract_adapt.truncated",
                        message=(
                            "Desktop FE atom extract capped — refuse silent dump "
                            f"(>{MAX_DESKTOP_FE_ATOMS_PER_EXTRACT} files)"
                        ),
                        service_name=service_name,
                        desktop_fe=desktop_n,
                        level=logging.WARNING,
                    )
                    break
            elif result.error:
                errors.append(str(result.error))
        if entries and not written:
            self.last_extract_required_failed = True
            log_event(
                self._logger,
                event="eic.extract_adapt.required_failed",
                message="Product packs matched but extract produced no files",
                service_name=service_name,
                errors=errors[:5],
                level=logging.ERROR,
            )
            return written

        wire_meta = post_extract_wire_desktop_atoms(
            self._workspace(),
            service_name,
            written,
            kind=kind,
        )
        if wire_meta.get("mount_patched"):
            mount_rel = (
                f"apps/empery_desktop/src/shell/mounts/{service_name}.tsx"
            )
            if mount_rel not in written:
                written.append(mount_rel)
            self.last_action_stats["write_file"] += 1
            log_event(
                self._logger,
                event="eic.extract_adapt.mount_wired",
                message="Patched Desktop mount to import presentational atom",
                service_name=service_name,
                wired=wire_meta.get("wired"),
            )
        new_n = int(wire_meta.get("new_desktop") or 0) + sum(
            1
            for p in written
            if f"services/{service_name}/src/integration/atoms/" in p.replace(
                "\\", "/"
            )
            and not p.endswith("ATOMS_PROVENANCE.md")
        )
        unwired = list(wire_meta.get("unwired") or [])
        if unwired and (kind or "").strip().lower() == "evolve":
            # Silent atom dump is not success — mark for forbid/delta gates.
            self.last_extract_required_failed = True
            log_event(
                self._logger,
                event="eic.extract_adapt.unwired",
                message="Desktop atoms extracted but not imported by mount",
                service_name=service_name,
                unwired=unwired[:12],
                truncated=bool(wire_meta.get("truncated")),
                level=logging.ERROR,
            )
        self._stamp_atom_file_count(
            service_name,
            new_files=new_n,
            wired=list(wire_meta.get("wired") or []),
            unwired=unwired,
        )
        return written

    def _apply_write(
        self,
        action: dict[str, Any],
        *,
        role: AgentRole,
        service_name: str | None,
    ) -> str | None:
        rel_raw = action.get("path") or action.get("relative_path")
        content = action.get("content") or action.get("body") or ""
        if not rel_raw or not isinstance(rel_raw, str):
            return None
        rel = self._normalize_rel(rel_raw)

        # Capsule root must be a directory — write_file(services/{name}) created the
        # ENOTDIR pause-loop (presentationai as 0-byte file).
        parts = [p for p in rel.split("/") if p]
        if len(parts) == 2 and parts[0] == "services":
            return self.create_dir(rel)

        # Configuration-Driven Assembly: LLM may not write domain/UI code.
        if self.config_driven_active:
            deny = _load_config_driven_deny_prefixes(self._workspace())
            if any(rel == p.rstrip("/") or rel.startswith(p) for p in deny):
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_CRITICAL_VIOLATION",
                        message=(
                            "config_driven assembly: write_file denied for domain path — "
                            "emit Manifest JSON only; Assembler owns code"
                        ),
                        details={"path": rel, "service_name": service_name},
                    ),
                    http_status=403,
                )

        # Legacy shortcuts designs/ reports/
        if rel.startswith(".cursor/orchestration/designs/") or rel.startswith(
            ".cursor/orchestration/reports/"
        ):
            try:
                target = self._resolve_sandboxed(rel)
            except ServiceError:
                # Fall back to basename under designs/reports roots
                name = Path(rel).name
                root = (
                    self._paths.designs_root
                    if "/designs/" in rel
                    else self._paths.reports_root
                )
                target = root / name
            path = self.write_text(target, str(content))
            self.last_action_stats["write_file"] += 1
            return path

        if any(rel == p.rstrip("/") or rel.startswith(p) for p in _READ_ONLY_PREFIXES):
            log_event(
                self._logger,
                event="eic.workspace.write_denied",
                message="Read-only corpus path",
                path=rel,
                level=logging.WARNING,
            )
            return None

        if (
            rel.startswith("services/")
            or rel.startswith("deploy/services/")
            or rel == "compose.reflex.yml"
            or rel.startswith("apps/empery_control_center/")
            or rel.startswith("apps/empery_desktop/")
        ):
            if role == AgentRole.IMPLEMENTER and self._config.engine_allow_service_writes:
                # Refuse silent Desktop atom corpus dumps via write_file.
                if "/atoms/" in rel.replace("\\", "/") and rel.endswith(
                    (".tsx", ".ts", ".css")
                ):
                    from services.empery_intelligence_core.src.integration.extract_wire import (
                        MAX_DESKTOP_FE_ATOMS_PER_EXTRACT,
                    )

                    atom_writes = int(
                        self.last_action_stats.get("desktop_atom_write_file") or 0
                    )
                    if atom_writes >= MAX_DESKTOP_FE_ATOMS_PER_EXTRACT:
                        log_event(
                            self._logger,
                            event="eic.workspace.atom_write_capped",
                            message=(
                                "Desktop FE atom write_file capped "
                                f"(>{MAX_DESKTOP_FE_ATOMS_PER_EXTRACT})"
                            ),
                            path=rel,
                            service_name=service_name,
                            level=logging.WARNING,
                        )
                        return None
                    self.last_action_stats["desktop_atom_write_file"] = atom_writes + 1
                try:
                    target = self._resolve_sandboxed(rel)
                    path = self.write_text(target, str(content))
                    self.last_action_stats["write_file"] += 1
                    return path
                except ServiceError as exc:
                    log_event(
                        self._logger,
                        event="eic.workspace.write_denied",
                        message=exc.response.message,
                        path=rel,
                        level=logging.WARNING,
                    )
                    return None
            safe_name = Path(rel).name
            target = self._paths.reports_root / f"proposal_{safe_name}"
            path = self.write_text(target, str(content))
            self.last_action_stats["write_file"] += 1
            log_event(
                self._logger,
                event="eic.workspace.service_write_redirected",
                message="Service/UI write redirected to reports",
                path=rel,
                service_name=service_name,
            )
            return path

        if rel.startswith(".cursor/orchestration/"):
            try:
                target = self._resolve_sandboxed(rel)
                path = self.write_text(target, str(content))
                self.last_action_stats["write_file"] += 1
                return path
            except ServiceError:
                return None

        # Unknown path — park under reports when implementer
        safe_name = Path(rel).name
        target = self._paths.reports_root / f"proposal_{safe_name}"
        path = self.write_text(target, str(content))
        self.last_action_stats["write_file"] += 1
        return path

    def scaffold_service(
        self,
        service_name: str,
        *,
        features: list[str] | None = None,
        force: bool = False,
        intent: str | None = None,
        scaffold_profile: str | None = None,
        bake_ui: bool = True,
    ) -> dict[str, Any]:
        if not self._config.engine_allow_service_writes:
            log_event(
                self._logger,
                event="eic.scaffold.blocked",
                message="engine_allow_service_writes=false",
                service_name=service_name,
                level=logging.WARNING,
            )
            return {"written": [], "blocked": True}
        profile = scaffold_profile
        selection_packs: list[str] = []
        if not profile:
            try:
                from services.empery_intelligence_core.src.integration.recipe_catalog import (
                    resolve_assembly_selection,
                )

                selection = resolve_assembly_selection(
                    self._paths,
                    service_name=service_name,
                    intent=intent or service_name,
                )
                profile = selection.scaffold_profile
                selection_packs = list(selection.packs)
            except Exception:  # noqa: BLE001
                profile = None
        else:
            try:
                from services.empery_intelligence_core.src.integration.recipe_catalog import (
                    resolve_assembly_selection,
                )

                selection = resolve_assembly_selection(
                    self._paths,
                    service_name=service_name,
                    intent=intent or service_name,
                )
                selection_packs = list(selection.packs)
            except Exception:  # noqa: BLE001
                selection_packs = []
        if self._scaffold.already_scaffolded(service_name) and not force:
            root = str(self._scaffold.service_root(service_name))
            written = [root]
            surface = self.ensure_product_surfaces(
                service_name,
                intent=intent or service_name,
                ui_profile=profile,
                bake_ui=bake_ui,
            )
            written.extend(list(surface.get("written") or []))
            self.last_action_stats["scaffold"] += 1
            self.last_action_stats["write_file"] += max(0, len(written) - 1)
            self.last_scaffold_meta = {
                "scaffold_profile": profile,
                "recipe_packs": selection_packs,
            }
            self._stamp_atom_file_count(service_name)
            return {
                "service_name": service_name,
                "written": written,
                "already_present": True,
                "ui": surface.get("ui"),
                "desktop": surface.get("desktop"),
                "desktop_verify": surface.get("desktop_verify"),
                "desktop_refresh": surface.get("desktop_refresh"),
                "ecc_ui_refresh": surface.get("ecc_ui_refresh"),
                "scaffold_profile": profile,
                "recipe_packs": selection_packs,
                "product_surfaces_ok": surface.get("ok"),
                "eic_atom_file_count": self.last_scaffold_meta.get(
                    "eic_atom_file_count", 0
                ),
            }
        result = self._scaffold.scaffold(
            service_name,
            features=features,
            scaffold_profile=profile,
            domain_hint=intent or service_name,
        )
        result = {
            **result,
            "scaffold_profile": profile or result.get("scaffold_profile"),
            "recipe_packs": selection_packs,
        }
        # Phase 2: provision DB overlay + peer env matrix for dependency-capable newborns.
        try:
            from services.empery_intelligence_core.src.integration.service_factory_peers import (
                after_scaffold_hooks,
            )

            hooks = after_scaffold_hooks(
                self._workspace(),
                service_name,
                port=result.get("port"),
                logger=self._logger,
                provision_db=True,
            )
            written_hooks = list(hooks.get("written") or [])
            result = {
                **result,
                "factory": hooks,
                "written": list(result.get("written") or []) + written_hooks,
            }
            if not hooks.get("ok"):
                log_event(
                    self._logger,
                    event="eic.scaffold.db_provision_required_failed",
                    message=(
                        "Database provision failed after scaffold — "
                        "Desktop product routes will 500 until CREATE DATABASE works"
                    ),
                    service_name=service_name,
                    error=str(hooks.get("error") or "")[:300],
                    level=logging.ERROR,
                )
                result["ok"] = False
                result["error"] = hooks.get("error") or "database provision failed"
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="eic.factory.after_scaffold_failed",
                message="Factory after-scaffold hooks failed (non-fatal)",
                service_name=service_name,
                error=str(exc)[:300],
                level=logging.WARNING,
            )
        self.last_action_stats["scaffold"] += 1
        self.last_action_stats["write_file"] += len(result.get("written") or [])
        self.last_scaffold_meta = {
            "scaffold_profile": result.get("scaffold_profile") or profile,
            "recipe_packs": list(result.get("recipe_packs") or selection_packs),
        }
        self._stamp_atom_file_count(service_name)
        # First genesis already wrote ECC/Desktop files; force_ui_refresh skips
        # re-emit. bake_ui=False defers Vite rebuild to end-of-turn coalesce
        # (maybe_scaffold) so extract/wire land before a single Desktop+ECC bake.
        surface = self.ensure_product_surfaces(
            service_name,
            intent=intent or service_name,
            ui_profile=result.get("scaffold_profile") or profile,
            force_ui_refresh=True,
            bake_ui=bake_ui,
        )
        written_extra = list(surface.get("written") or [])
        return {
            **result,
            "written": list(result.get("written") or []) + written_extra,
            "ui": surface.get("ui") or result.get("ui"),
            "desktop": surface.get("desktop") or result.get("desktop"),
            "desktop_verify": surface.get("desktop_verify"),
            "desktop_refresh": surface.get("desktop_refresh"),
            "ecc_ui_refresh": surface.get("ecc_ui_refresh"),
            "product_surfaces_ok": surface.get("ok"),
            "eic_atom_file_count": self.last_scaffold_meta.get(
                "eic_atom_file_count", 0
            ),
        }

    def _resolve_ui_profile(
        self,
        service_name: str,
        *,
        intent: str | None = None,
        ui_profile: str | None = None,
    ) -> str | None:
        """Prefer explicit profile, then recipe intent, then manifest features."""
        if ui_profile and str(ui_profile).strip():
            return str(ui_profile).strip().lower()
        meta = getattr(self, "last_scaffold_meta", None) or {}
        meta_profile = meta.get("scaffold_profile") if isinstance(meta, dict) else None
        if meta_profile and str(meta_profile).strip():
            return str(meta_profile).strip().lower()
        resolved: str | None = None
        try:
            from services.empery_intelligence_core.src.integration.recipe_catalog import (
                resolve_assembly_selection,
            )

            selection = resolve_assembly_selection(
                self._paths,
                service_name=service_name,
                intent=intent or service_name,
            )
            if selection.scaffold_profile:
                resolved = str(selection.scaffold_profile).strip().lower()
                if resolved != "generic":
                    return resolved
        except Exception:  # noqa: BLE001
            resolved = None
        manifest = self._workspace() / "services" / service_name / "manifest.json"
        try:
            import json

            raw = json.loads(manifest.read_text(encoding="utf-8"))
            feats = {str(f).lower() for f in (raw.get("features") or [])}
            for candidate in (
                "companion_chat",
                "studio_job",
                "site_studio",
                "image_studio",
                "video_studio",
                "music_forge",
                "peer_http",
                "ops_dashboard",
                "task_board",
                "research_report",
            ):
                if candidate in feats:
                    return candidate
        except Exception:  # noqa: BLE001
            pass
        return resolved

    def ensure_product_surfaces(
        self,
        service_name: str,
        *,
        intent: str | None = None,
        ui_profile: str | None = None,
        force_ui_refresh: bool = False,
        bake_ui: bool = True,
    ) -> dict[str, Any]:
        """Ensure ECC UI + desktop D1–D3; catch FS errors; early desktop verify.

        bake_ui=False writes mounts/features only — skip deploy-agent Vite rebuild
        so callers can coalesce one Desktop+ECC bake after extract/wire.
        """
        written: list[str] = []
        profile = self._resolve_ui_profile(
            service_name,
            intent=intent,
            ui_profile=ui_profile,
        )
        peer_port = None
        try:
            from services.empery_intelligence_core.src.integration.service_factory_peers import (
                resolve_service_port,
            )
            from services.empery_intelligence_core.src.integration.service_scaffold import (
                allocate_service_port,
            )

            # Prefer compose-assigned port; allocate only for brand-new capsules.
            peer_port = resolve_service_port(self._workspace(), service_name)
            if peer_port is None:
                peer_port = allocate_service_port(
                    self._workspace(), service_name
                )
        except Exception:  # noqa: BLE001
            peer_port = None
        # On post-genesis bake, files are already on disk — do not re-emit templates
        # (that would mark written and trigger a second full Vite build of ECC).
        rewrite = _force_profile_ui(profile) and not force_ui_refresh
        ui_result = self._scaffold.scaffold_ecc_ui(
            service_name,
            ui_profile=profile,
            port=peer_port,
            force=rewrite,
        )
        written.extend(list(ui_result.get("written") or []))
        # Product peers may skip ECC (ui.required=false) but still need Desktop D1–D3.
        desktop_skip = profile in {"health_probe", "shell_host"}
        desktop_result = self._scaffold.scaffold_desktop_host(
            service_name,
            skip=desktop_skip,
            ui_profile=profile,
            peer_port=peer_port,
            force=rewrite,
        )
        written.extend(list(desktop_result.get("written") or []))
        try:
            from services.empery_intelligence_core.src.integration.service_factory_peers import (
                upsert_peer_env_matrix,
            )

            peer_env = upsert_peer_env_matrix(
                self._workspace(),
                service_name,
                port=peer_port,
                logger=self._logger,
            )
            written.extend(list(peer_env.get("written") or []))
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="eic.scaffold.peer_env_upsert_error",
                message="Peer env / health base upsert failed",
                service_name=service_name,
                error=str(exc)[:300],
                level=logging.WARNING,
            )
        desktop_refresh: dict[str, Any] | None = None
        ecc_ui_refresh: dict[str, Any] | None = None
        deploy_agent_url = str(
            getattr(self._config, "deploy_agent_url", "") or ""
        )
        required_refresh = bool(
            getattr(self._config, "require_deploy_agent", True)
        ) and bool(deploy_agent_url.strip())
        refresh_required_failed = False
        # Heal legacy TS imports of atoms/{service} into mounts (broke Desktop bake).
        try:
            from services.empery_intelligence_core.src.integration.extract_wire import (
                sanitize_mount_atom_imports,
            )

            if sanitize_mount_atom_imports(self._workspace(), service_name):
                mount_rel = (
                    f"apps/empery_desktop/src/shell/mounts/{service_name}.tsx"
                )
                if mount_rel not in written:
                    written.append(mount_rel)
                log_event(
                    self._logger,
                    event="eic.scaffold.desktop.atom_imports_sanitized",
                    message="Stripped bake-breaking atom imports from Desktop mount",
                    service_name=service_name,
                )
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="eic.scaffold.desktop.atom_imports_sanitize_error",
                message="Mount atom-import sanitize failed",
                service_name=service_name,
                error=str(exc)[:300],
                level=logging.WARNING,
            )
        # Genesis: files already on disk (written=[]). Force-bake Desktop first
        # (launch DoD), then ECC so the ops route lands without manual rebuild.
        # bake_ui=False: file ensure only (coalesce rebuild to end of implement turn).
        refresh_desktop = (
            bake_ui
            and (not desktop_result.get("skipped"))
            and (bool(desktop_result.get("written")) or force_ui_refresh)
        )
        refresh_ecc = (
            bake_ui
            and (not ui_result.get("skipped"))
            and (bool(ui_result.get("written")) or force_ui_refresh)
        )
        if refresh_desktop:
            try:
                from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
                    refresh_desktop_ui,
                )

                desktop_refresh = refresh_desktop_ui(
                    deploy_agent_url=deploy_agent_url,
                    logger=self._logger,
                    timeout_s=float(
                        getattr(self._config, "ui_rebuild_timeout_s", 600)
                    ),
                    required=required_refresh,
                )
            except Exception as exc:  # noqa: BLE001
                desktop_refresh = {"ok": False, "error": str(exc)[:300]}
                log_event(
                    self._logger,
                    event="eic.scaffold.desktop.refresh_error",
                    message="Desktop UI refresh raised",
                    service_name=service_name,
                    error=str(exc)[:300],
                    level=logging.ERROR if required_refresh else logging.WARNING,
                )
            if (
                desktop_refresh
                and not desktop_refresh.get("ok")
                and required_refresh
            ):
                refresh_required_failed = True
                bake_err = str(
                    desktop_refresh.get("error")
                    or desktop_refresh.get("reason")
                    or "unknown"
                )[:800]
                bake_out = str(desktop_refresh.get("output") or "")[-1200:]
                self.last_scaffold_meta["ui_refresh_error"] = bake_err
                if bake_out:
                    self.last_scaffold_meta["ui_refresh_output"] = bake_out
                log_event(
                    self._logger,
                    event="eic.scaffold.desktop.refresh_required_failed",
                    message="Desktop UI refresh required but failed",
                    service_name=service_name,
                    error=bake_err[:400],
                    output_tail=bake_out[-400:] if bake_out else None,
                    level=logging.ERROR,
                )
        if refresh_ecc:
            try:
                from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
                    refresh_ecc_ui,
                )

                ecc_ui_refresh = refresh_ecc_ui(
                    deploy_agent_url=deploy_agent_url,
                    logger=self._logger,
                    timeout_s=float(
                        getattr(
                            self._config,
                            "ecc_ui_rebuild_timeout_s",
                            getattr(self._config, "ui_rebuild_timeout_s", 600),
                        )
                    ),
                    required=required_refresh,
                )
            except Exception as exc:  # noqa: BLE001
                ecc_ui_refresh = {"ok": False, "error": str(exc)[:300]}
                log_event(
                    self._logger,
                    event="eic.scaffold.ecc_ui.refresh_error",
                    message="ECC UI refresh raised",
                    service_name=service_name,
                    error=str(exc)[:300],
                    level=logging.ERROR if required_refresh else logging.WARNING,
                )
            if (
                ecc_ui_refresh
                and not ecc_ui_refresh.get("ok")
                and required_refresh
            ):
                refresh_required_failed = True
                bake_err = str(
                    ecc_ui_refresh.get("error")
                    or ecc_ui_refresh.get("reason")
                    or "unknown"
                )[:800]
                bake_out = str(ecc_ui_refresh.get("output") or "")[-1200:]
                self.last_scaffold_meta["ui_refresh_error"] = bake_err
                if bake_out:
                    self.last_scaffold_meta["ui_refresh_output"] = bake_out
                log_event(
                    self._logger,
                    event="eic.scaffold.ecc_ui.refresh_required_failed",
                    message="ECC UI refresh required but failed",
                    service_name=service_name,
                    error=bake_err[:400],
                    output_tail=bake_out[-400:] if bake_out else None,
                    level=logging.ERROR,
                )
        desktop_verify: tuple[str, str] | None = None
        if not ui_result.get("skipped"):
            desktop_verify = self.verify_service_desktop(service_name)
            if refresh_required_failed:
                err = str(
                    (desktop_refresh or {}).get("error")
                    or (desktop_refresh or {}).get("reason")
                    or (ecc_ui_refresh or {}).get("error")
                    or (ecc_ui_refresh or {}).get("reason")
                    or "ui_refresh_failed"
                )
                desktop_verify = (
                    "FAILED",
                    f"UI refresh required but failed: {err}\n"
                    + (desktop_verify[1] if desktop_verify else ""),
                )
            if desktop_verify[0] == "FAILED":
                log_event(
                    self._logger,
                    event="eic.scaffold.desktop.verify_failed",
                    message="Desktop gate FAILED after ensure_product_surfaces",
                    service_name=service_name,
                    detail=desktop_verify[1][:500],
                    level=logging.WARNING,
                )
            if desktop_result.get("error"):
                log_event(
                    self._logger,
                    event="eic.scaffold.desktop.error",
                    message="Desktop scaffold reported error",
                    service_name=service_name,
                    error=str(desktop_result.get("error"))[:400],
                    level=logging.ERROR,
                )
        ok = True
        if refresh_required_failed:
            ok = False
        if desktop_verify and desktop_verify[0] == "FAILED":
            ok = False
        if desktop_result.get("error"):
            ok = False
        result = {
            "service_name": service_name,
            "ok": ok,
            "written": written,
            "ui": ui_result,
            "desktop": desktop_result,
            "ui_profile": profile,
            "ecc_ui_refresh": ecc_ui_refresh,
            "desktop_refresh": desktop_refresh,
            "desktop_verify": {
                "status": desktop_verify[0] if desktop_verify else "SKIPPED",
                "detail": desktop_verify[1] if desktop_verify else "ui.required=false",
            },
        }
        self.last_product_surfaces = result
        return result

    def maybe_scaffold_for_intention(
        self,
        *,
        intent: str,
        service_name: str | None,
        role: AgentRole,
        written_paths: list[str],
        scaffold_profile: str | None = None,
        skip_mechanical_extract: bool = False,
        kind: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> list[str]:
        """Deterministic fallback when LLM emits no services/** writes.

        Genesis: scaffold capsule + surfaces + extract.
        Evolve: never invent a new capsule; only repair surfaces + extract on
        an already-scaffolded service.

        Autonomous Create defaults to kind=evolve for the full loop — that is
        still genesis when the capsule is missing and the intent is not a
        product Evolve pick (metadata.kind=evolve / evolve markers).
        """
        from services.empery_intelligence_core.src.integration.evolve_enqueue_gate import (
            looks_like_evolve_intent,
        )
        from services.empery_intelligence_core.src.integration.service_scaffold import (
            is_evolve_intention,
        )

        if role != AgentRole.IMPLEMENTER:
            return []
        if not service_name:
            return []
        if not self._config.engine_allow_service_writes:
            return []

        meta = dict(metadata or {})
        is_genesis = is_create_service_intention(
            intent=intent, service_name=service_name, kind=kind
        )
        is_evolve = is_evolve_intention(kind=kind)
        # File at services/{name} is not a capsule — heal before existence checks.
        healed_corrupt = self._scaffold.heal_corrupt_service_root(service_name)
        capsule_exists = self._scaffold.already_scaffolded(service_name)

        # kind=evolve + missing capsule: Create/full-loop scaffolds; product Evolve fails closed.
        if is_evolve and not capsule_exists:
            if looks_like_evolve_intent(intent, kind=kind, metadata=meta):
                if healed_corrupt:
                    # Never had anatomy — empty-file stub. Genesis instead of pause-loop.
                    is_genesis = True
                    log_event(
                        self._logger,
                        event="eic.scaffold.corrupt_root_genesis",
                        message=(
                            "Healed file-as-capsule; treating as Create genesis "
                            "instead of Evolve-without-capsule refuse"
                        ),
                        service_name=service_name,
                        level=logging.WARNING,
                    )
                else:
                    self.last_evolve_missing_capsule = service_name
                    log_event(
                        self._logger,
                        event="eic.scaffold.evolve_missing_capsule",
                        message=(
                            "Product Evolve refused — capsule missing; "
                            "use Create / create_service first"
                        ),
                        service_name=service_name,
                        level=logging.WARNING,
                    )
                    return []
            else:
                # Create UI / plan→evolve upgrade: mechanical genesis under evolve kind.
                is_genesis = True

        if not is_genesis and not is_evolve:
            return []

        written: list[str] = []
        profile = (scaffold_profile or "").strip().lower() or None

        if is_evolve and capsule_exists:
            from services.empery_intelligence_core.src.integration.evolve_delta_gate import (
                hits_product_ui_paths,
            )
            from services.empery_intelligence_core.src.integration.evolve_verify_touches import (
                is_ui_surface_intent,
            )

            ui_intent = is_ui_surface_intent(intent)
            prior_ui = hits_product_ui_paths(list(written_paths or []), service_name)
            # File ensure only — single Vite bake after extract/wire below.
            surface = self.ensure_product_surfaces(
                service_name,
                intent=intent,
                ui_profile=profile,
                force_ui_refresh=ui_intent or prior_ui,
                bake_ui=False,
            )
            written.extend(list(surface.get("written") or []))
        else:
            service_writes = [
                p
                for p in written_paths
                if f"/services/{service_name}/" in p.replace("\\", "/")
                or p.replace("\\", "/").endswith(f"/services/{service_name}")
                or f"services/{service_name}/" in p.replace("\\", "/")
            ]
            # Upgrade wrong profile (e.g. peer_http when companion was intended).
            force = False
            if profile and self._scaffold.already_scaffolded(service_name):
                manifest = (
                    self._workspace() / "services" / service_name / "manifest.json"
                )
                try:
                    import json

                    raw = json.loads(manifest.read_text(encoding="utf-8"))
                    feats = [str(f).lower() for f in (raw.get("features") or [])]
                except Exception:  # noqa: BLE001
                    feats = []
                if profile == "companion_chat" and "companion_chat" not in feats:
                    force = True
            if (
                not (service_writes and self._scaffold.already_scaffolded(service_name))
                or force
            ):
                result = self.scaffold_service(
                    service_name,
                    intent=intent,
                    scaffold_profile=profile,
                    force=force,
                    bake_ui=False,
                )
                written.extend(list(result.get("written") or []))
            else:
                # Always ensure ECC UI + desktop D1–D3 (repairs partial genesis).
                surface = self.ensure_product_surfaces(
                    service_name,
                    intent=intent,
                    ui_profile=profile,
                    bake_ui=False,
                )
                written.extend(list(surface.get("written") or []))

        # Mechanical atom extract when product recipe packs match.
        # P15 negative smoke may set skip_mechanical_extract (default off).
        if skip_mechanical_extract:
            log_event(
                self._logger,
                event="eic.extract_adapt.skipped_for_smoke",
                message=(
                    "Mechanical extract skipped "
                    "(eic_skip_mechanical_extract) — forbid_scratch must refuse"
                ),
                service_name=service_name,
                level=logging.WARNING,
            )
        else:
            extracted = self.extract_atoms_for_intention(
                intent=intent,
                service_name=service_name,
                scaffold_profile=profile,
                kind=kind,
            )
            written.extend(extracted)

        # One Desktop+ECC Vite bake per implement turn (after extract/wire).
        from services.empery_intelligence_core.src.integration.evolve_delta_gate import (
            hits_product_ui_paths,
        )
        from services.empery_intelligence_core.src.integration.evolve_verify_touches import (
            is_ui_surface_intent,
        )

        need_bake = (
            is_genesis
            or hits_product_ui_paths(written, service_name)
            or is_ui_surface_intent(intent)
        )
        if need_bake:
            surface = self.ensure_product_surfaces(
                service_name,
                intent=intent,
                ui_profile=profile,
                force_ui_refresh=True,
                bake_ui=True,
            )
            written.extend(list(surface.get("written") or []))
            log_event(
                self._logger,
                event="eic.scaffold.ui_refresh_coalesced",
                message="Single Desktop/ECC UI refresh after scaffold+extract",
                service_name=service_name,
                paths=len(written),
                is_genesis=is_genesis,
                is_evolve=is_evolve,
            )

        self._stamp_atom_file_count(service_name)
        return written

    def forbid_scratch_violation(
        self,
        *,
        intent: str,
        service_name: str | None,
        action_stats: dict[str, int],
    ) -> str | None:
        """Return error message if product pack matched but extract_adapt did not run."""
        if not service_name:
            return None
        # Misdiagnosing Evolve-without-capsule as scratch invent — agent_loop raises
        # EIC_EVOLVE_NO_CAPSULE instead.
        if self.last_evolve_missing_capsule:
            return None
        from services.empery_intelligence_core.src.integration.assembly_profiles import (
            is_product_pack,
        )
        from services.empery_intelligence_core.src.integration.recipe_catalog import (
            resolve_assembly_selection,
        )

        selection = resolve_assembly_selection(
            self._paths,
            service_name=service_name,
            intent=intent,
        )
        product = [p for p in selection.packs if is_product_pack(p)]
        if not product:
            return None
        extract_n = int(action_stats.get("extract_adapt") or 0)
        # Scaffold alone is NOT enough — product packs require mechanical extract.
        if extract_n >= 1 and not self.last_extract_required_failed:
            return None
        if not selection.extract_roots:
            return (
                "forbid_scratch_when_recipe: product pack(s) "
                f"{product} matched but extract_roots are empty "
                "(cannot compose atoms — fix recipe catalog / EliteEW pack)"
            )
        if self.last_extract_required_failed:
            return (
                "forbid_scratch_when_recipe: product pack(s) "
                f"{product} matched but extract/wire failed "
                "(unwired desktop atoms or empty extract — compose must land in mount)"
            )
        return (
            "forbid_scratch_when_recipe: product pack(s) "
            f"{product} matched with extract_roots but extract_adapt did not run "
            "(scaffold-only invent is forbidden — compose from atoms)"
        )

    def verify_service_anatomy(self, service_name: str) -> tuple[str, str]:
        """Return (PASSED|FAILED, details) for architecture-core anatomy."""
        root = self._workspace() / "services" / service_name
        required = [
            root / "manifest.json",
            root / "config.py",
            root / "src" / "api" / "main.py",
            root / "src" / "core",
            root / "src" / "data",
            root / "src" / "integration",
            root / "tests",
        ]
        missing = [str(p.relative_to(self._workspace())) for p in required if not p.exists()]
        if missing:
            return "FAILED", "Missing anatomy paths:\n- " + "\n- ".join(missing)
        from services.empery_intelligence_core.src.integration.service_factory_gates import (
            verify_register_symbol,
        )

        reg_status, reg_detail = verify_register_symbol(root)
        if reg_status == "FAILED":
            return "FAILED", reg_detail
        return "PASSED", f"Anatomy OK under services/{service_name}/ ({reg_detail})"

    def verify_factory_gates(
        self,
        service_name: str,
        *,
        scaffold_profile: str | None = None,
    ) -> tuple[str, str]:
        """Production-path factory DoD (FakeAI, compose flags, Alembic, peers)."""
        from services.empery_intelligence_core.src.integration.service_factory_gates import (
            verify_factory_gates,
        )

        return verify_factory_gates(
            self._workspace(),
            service_name,
            scaffold_profile=scaffold_profile,
        )

    def verify_service_ui(self, service_name: str) -> tuple[str, str]:
        """Return (PASSED|FAILED|SKIPPED, details) for service-ui U1–U9."""
        from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
            verify_service_ui,
        )

        return verify_service_ui(self._workspace(), service_name)

    def verify_service_desktop(self, service_name: str) -> tuple[str, str]:
        """Return (PASSED|FAILED|SKIPPED, details) for desktop mount + catalog."""
        from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
            verify_service_desktop,
        )

        return verify_service_desktop(self._workspace(), service_name)

    def verify_live_presence(self, service_name: str) -> tuple[str, str]:
        """Fail-closed live checks: deploy-agent health + ECC registry listing.

        Deploy-agent ``action=health`` owns retry/backoff (``DEPLOY_AGENT_HEALTH_*``);
        a single client call here is sufficient — do not duplicate a second wait loop.
        """
        import json
        import urllib.error
        import urllib.request

        notes: list[str] = []
        ok = True
        agent_url = str(getattr(self._config, "deploy_agent_url", "") or "")
        if agent_url:
            from services.empery_intelligence_core.src.integration.deploy_agent_client import (
                DeployAgentClient,
            )

            client = DeployAgentClient(
                agent_url,
                self._logger,
                timeout_s=float(getattr(self._config, "deploy_agent_timeout_s", 120)),
            )
            health = client.deploy(service_name, action="health")
            if health.get("ok"):
                notes.append(f"deploy_agent health: ok ({health.get('details')})")
            else:
                ok = False
                notes.append(
                    f"deploy_agent health: FAILED ({health.get('error') or health.get('output')})"
                )
            # Product ops_dashboard: /health alone is insufficient — Desktop
            # mounts call /api/v1/metrics (needs CREATE DATABASE + alembic).
            try:
                from services.empery_intelligence_core.src.integration.service_factory_peers import (
                    resolve_service_port,
                )

                manifest = (
                    self._workspace()
                    / "services"
                    / service_name
                    / "manifest.json"
                )
                feats: list[str] = []
                if manifest.is_file():
                    import json as _json

                    raw = _json.loads(manifest.read_text(encoding="utf-8"))
                    feats = [str(f).lower() for f in (raw.get("features") or [])]
                if "ops_dashboard" in feats or "metric" in feats:
                    port = resolve_service_port(self._workspace(), service_name)
                    if port:
                        metrics_url = (
                            f"http://{service_name}:{port}/api/v1/metrics?limit=1"
                        )
                        try:
                            with urllib.request.urlopen(
                                metrics_url, timeout=8
                            ) as resp:
                                code = int(getattr(resp, "status", 200))
                                if 200 <= code < 300:
                                    notes.append(
                                        f"product metrics: ok ({metrics_url})"
                                    )
                                else:
                                    ok = False
                                    notes.append(
                                        f"product metrics: HTTP {code} ({metrics_url})"
                                    )
                        except (urllib.error.URLError, TimeoutError, OSError) as exc:
                            ok = False
                            notes.append(
                                f"product metrics: FAILED ({exc}) — "
                                "likely missing CREATE DATABASE / alembic"
                            )
            except Exception as exc:  # noqa: BLE001
                notes.append(f"product metrics probe skipped: {exc}")
        else:
            notes.append("deploy_agent URL unset — skipped live health")

        # Local manifest discovery (always available; no auth).
        try:
            from core.registry import discover_manifest_names

            local_names = discover_manifest_names(
                self._workspace() / "services"
            )
            if service_name in local_names:
                notes.append(f"manifest discovery: {service_name} present")
            else:
                ok = False
                notes.append(
                    f"manifest discovery: {service_name} MISSING"
                )
        except Exception as exc:  # noqa: BLE001
            ok = False
            notes.append(f"manifest discovery failed: {exc}")

        # Soft: ECC /health/services (batch probes can exceed short timeouts).
        # Hard gates above are deploy_agent health + manifest discovery.
        health_url = str(
            getattr(self._config, "ecc_health_services_url", "")
            or "http://empery_control_center_api:8006/api/v1/health/services"
        )
        refresh_url = str(
            getattr(self._config, "ecc_registry_refresh_url", "") or ""
        )
        if refresh_url:
            try:
                req = urllib.request.Request(refresh_url, method="POST", data=b"")
                with urllib.request.urlopen(req, timeout=20) as resp:
                    resp.read(4096)
                notes.append("ECC registry refresh: ok")
            except Exception as exc:  # noqa: BLE001
                notes.append(f"ECC registry refresh soft-fail: {exc}")
        if health_url:
            try:
                with urllib.request.urlopen(health_url, timeout=60) as resp:
                    raw = resp.read().decode("utf-8", errors="replace")
                data = json.loads(raw) if raw else {}
                names: list[str] = []
                services = data.get("services") if isinstance(data, dict) else []
                if isinstance(services, list):
                    for item in services:
                        if isinstance(item, dict) and item.get("name"):
                            names.append(str(item["name"]))
                if service_name in names:
                    notes.append(f"ECC /health/services: {service_name} present")
                else:
                    notes.append(
                        f"ECC /health/services soft-miss: {service_name} "
                        f"not listed yet (have {names[:20]})"
                    )
            except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
                notes.append(f"ECC /health/services soft-fail: {exc}")
        status = "PASSED" if ok else "FAILED"
        return status, "\n".join(notes)

    def run_command_reflex(self, action: dict[str, Any]) -> dict[str, Any]:
        """Sandboxed podman-compose / health curl — no arbitrary shell."""
        if not getattr(self._config, "allow_compose_commands", False):
            return {
                "ok": False,
                "error": "EIC_ALLOW_COMPOSE_COMMANDS=false",
                "summary": None,
            }

        argv = action.get("argv") or action.get("args") or action.get("command")
        if isinstance(argv, str):
            argv = shlex.split(argv)
        if not isinstance(argv, list) or not argv:
            # Convenience: compose up for a service
            service = action.get("service") or action.get("service_name")
            if not service:
                return {"ok": False, "error": "missing argv/service", "summary": None}
            argv = self._default_compose_up_argv(str(service))

        argv = [str(x) for x in argv]
        if not self._is_safe_compose_argv(argv):
            log_event(
                self._logger,
                event="eic.command_reflex.denied",
                message="Command not allowlisted",
                argv=argv,
                level=logging.WARNING,
            )
            return {"ok": False, "error": "command_not_allowlisted", "summary": None}

        try:
            proc = subprocess.run(
                argv,
                cwd=str(self._workspace()),
                capture_output=True,
                text=True,
                timeout=float(getattr(self._config, "compose_command_timeout_s", 300)),
                check=False,
            )
            output = ((proc.stdout or "") + (proc.stderr or ""))[-8000:]
            self.last_action_stats["run_command"] += 1
            log_event(
                self._logger,
                event="eic.command_reflex.executed",
                message="Compose command finished",
                argv=argv,
                exit_code=proc.returncode,
            )
            summary = (
                self._workspace()
                / ".cursor"
                / "orchestration"
                / "reports"
                / f"command_reflex_{argv[-1] if argv else 'cmd'}.log"
            )
            try:
                summary.parent.mkdir(parents=True, exist_ok=True)
                summary.write_text(
                    f"argv={argv}\nexit={proc.returncode}\n\n{output}\n",
                    encoding="utf-8",
                )
            except OSError:
                summary = Path("command_reflex.log")
            return {
                "ok": proc.returncode == 0,
                "exit_code": proc.returncode,
                "output": output,
                "summary": str(summary),
            }
        except FileNotFoundError:
            return {
                "ok": False,
                "error": "compose_binary_not_found",
                "summary": None,
            }
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "summary": None}

    @staticmethod
    def _deploy_health_with_wait(client: Any, service_name: str) -> dict[str, Any]:
        """Probe live health via deploy-agent (agent owns retry/backoff timing)."""
        return client.deploy(service_name, action="health")

    def deploy_service(self, service_name: str) -> dict[str, Any]:
        """
        In-loop deploy via empery_deploy_agent (primary) — fail closed.

        Writes an audit record under jobs/deploy_audit/. Legacy pending_deploy/
        is only written when the agent is unavailable and require_deploy_agent
        is false (lab escape hatch — not the success path).
        """
        import json
        from datetime import datetime, timezone

        from services.empery_intelligence_core.src.integration.deploy_agent_client import (
            DeployAgentClient,
        )

        audit_dir = (
            self._workspace()
            / ".cursor"
            / "orchestration"
            / "jobs"
            / "deploy_audit"
        )
        audit_dir.mkdir(parents=True, exist_ok=True)
        audit_path = audit_dir / f"{service_name}.json"
        agent_url = str(getattr(self._config, "deploy_agent_url", "") or "")
        require_agent = bool(getattr(self._config, "require_deploy_agent", True))
        client = DeployAgentClient(
            agent_url,
            self._logger,
            timeout_s=float(getattr(self._config, "deploy_agent_timeout_s", 120)),
        )

        result: dict[str, Any]
        if client.configured:
            result = client.deploy(service_name, action="up")
            if result.get("ok"):
                health = self._deploy_health_with_wait(client, service_name)
                result["health"] = health
                if require_agent and not health.get("ok"):
                    result = {
                        **result,
                        "ok": False,
                        "error": (
                            "deploy_agent health failed after compose up: "
                            f"{health.get('error') or health.get('output') or 'unknown'}"
                        ),
                    }
                elif health.get("ok"):
                    self._refresh_ecc_registry()
                    try:
                        from services.empery_intelligence_core.src.integration.service_factory_peers import (
                            after_deploy_hooks,
                        )

                        health_ok = bool(health.get("ok")) if isinstance(health, dict) else None
                        promo = after_deploy_hooks(
                            self._workspace(),
                            service_name,
                            health_ok=health_ok,
                            logger=self._logger,
                        )
                        result["live_peer"] = promo
                        if isinstance(promo, dict) and not promo.get("ok", True):
                            db_err = ""
                            if isinstance(promo.get("database"), dict):
                                db_err = str(
                                    promo["database"].get("error") or ""
                                )
                            result = {
                                **result,
                                "ok": False,
                                "error": (
                                    "database provision failed after deploy: "
                                    f"{db_err or promo.get('error') or 'unknown'}"
                                ),
                            }
                    except Exception as exc:  # noqa: BLE001
                        log_event(
                            self._logger,
                            event="eic.factory.after_deploy_failed",
                            message="Factory after-deploy promotion failed (non-fatal)",
                            service_name=service_name,
                            error=str(exc)[:300],
                            level=logging.WARNING,
                        )
            elif require_agent:
                result = {
                    **result,
                    "ok": False,
                    "error": result.get("error") or "deploy_agent_failed",
                }
        elif require_agent:
            result = {
                "ok": False,
                "error": "EIC_DEPLOY_AGENT_URL unset (in-loop deploy required)",
                "service_name": service_name,
            }
        else:
            # Explicit lab escape: local command reflex only when agent not required.
            pending = (
                self._workspace()
                / ".cursor"
                / "orchestration"
                / "jobs"
                / "pending_deploy"
            )
            pending.mkdir(parents=True, exist_ok=True)
            pending_path = pending / f"{service_name}.json"
            pending_path.write_text(
                json.dumps(
                    {
                        "service_name": service_name,
                        "requested_at": datetime.now(timezone.utc).isoformat(),
                        "command": self._default_compose_up_argv(service_name),
                        "note": "pending_deploy is not the success path",
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            result = self.run_command_reflex(
                {"argv": self._default_compose_up_argv(service_name)}
            )
            result["deploy_request"] = str(pending_path)

        audit = {
            "service_name": service_name,
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "agent_url": agent_url,
            "ok": bool(result.get("ok")),
            "error": result.get("error"),
            "exit_code": result.get("exit_code"),
            "argv": result.get("argv"),
        }
        audit_path.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
        result["deploy_request"] = str(audit_path)
        result["summary"] = str(audit_path)
        if result.get("ok"):
            self.last_action_stats["deploy"] = (
                self.last_action_stats.get("deploy", 0) + 1
            )
        log_event(
            self._logger,
            event="eic.deploy_service.finished",
            message="In-loop deploy finished",
            service_name=service_name,
            ok=bool(result.get("ok")),
            error=result.get("error"),
            level=logging.INFO if result.get("ok") else logging.ERROR,
        )
        return result

    def promote_verified_peer(self, service_name: str) -> dict[str, Any]:
        """Mark service as verified live peer for the next genesis."""
        from services.empery_intelligence_core.src.integration.service_factory_peers import (
            after_verify_passed_hooks,
        )

        return after_verify_passed_hooks(
            self._workspace(), service_name, logger=self._logger
        )

    def set_service_enabled(
        self, service_name: str, *, enabled: bool
    ) -> dict[str, Any]:
        """Enable (compose up) or disable (compose stop) a non-spine service."""
        from services.empery_intelligence_core.src.integration.deploy_agent_client import (
            DeployAgentClient,
        )
        from services.empery_intelligence_core.src.integration.service_factory_lifecycle import (
            set_service_enabled_files,
        )

        files = set_service_enabled_files(
            self._workspace(),
            service_name,
            enabled=enabled,
            logger=self._logger,
        )
        agent_url = str(getattr(self._config, "deploy_agent_url", "") or "")
        client = DeployAgentClient(
            agent_url,
            self._logger,
            timeout_s=float(getattr(self._config, "deploy_agent_timeout_s", 120)),
        )
        deploy: dict[str, Any] = {"ok": False, "skipped": True}
        if client.configured:
            action = "up" if enabled else "stop"
            deploy = client.deploy(service_name, action=action)
            if deploy.get("ok") and enabled:
                self._refresh_ecc_registry()
        # Best-effort live catalog PATCH
        catalog_live = self._desktop_catalog_enabled(service_name, enabled=enabled)
        return {
            "ok": bool(files.get("ok"))
            and (deploy.get("ok") or deploy.get("skipped")),
            "service_name": service_name,
            "enabled": enabled,
            "files": files,
            "deploy": deploy,
            "catalog_live": catalog_live,
        }

    def teardown_service(self, service_name: str) -> dict[str, Any]:
        """Stop + allowlisted delete of service surfaces (non-spine)."""
        from services.empery_intelligence_core.src.integration.deploy_agent_client import (
            DeployAgentClient,
        )
        from services.empery_intelligence_core.src.integration.service_factory_lifecycle import (
            teardown_service_files,
        )

        agent_url = str(getattr(self._config, "deploy_agent_url", "") or "")
        client = DeployAgentClient(
            agent_url,
            self._logger,
            timeout_s=float(getattr(self._config, "deploy_agent_timeout_s", 120)),
        )
        stop: dict[str, Any] = {"ok": False, "skipped": True}
        if client.configured:
            stop = client.deploy(service_name, action="stop")
            # Missing compose service / already stopped is fine for ghost delete.
            if not stop.get("ok"):
                out = str(stop.get("output") or stop.get("error") or "")
                if "missing services" in out or "No such" in out or "no such" in out:
                    stop = {**stop, "ok": True, "skipped": True, "soft": True}
        files = teardown_service_files(
            self._workspace(), service_name, logger=self._logger
        )
        catalog_live = self._desktop_catalog_remove(service_name)
        self._refresh_ecc_registry()
        file_errors = list((files.get("hard_errors") or files.get("errors") or []))
        # Live catalog / stop are best-effort — filesystem teardown is the DoD.
        ok = bool(files.get("ok"))
        err_parts: list[str] = []
        if not ok:
            err_parts.extend(str(x) for x in file_errors)
        return {
            "ok": ok,
            "service_name": service_name,
            "stop": stop,
            "files": files,
            "catalog_live": catalog_live,
            "error": "; ".join(err_parts) if err_parts else None,
        }

    def _desktop_catalog_enabled(
        self, service_name: str, *, enabled: bool
    ) -> dict[str, Any]:
        import json
        import os
        import urllib.error
        import urllib.request

        base = (
            os.environ.get("DESKTOP_SHELL_API_BASE")
            or os.environ.get("EIC_DESKTOP_SHELL_API_BASE")
            or ""
        ).rstrip("/")
        if not base:
            return {"ok": False, "skipped": True}
        url = f"{base}/api/v1/catalog/apps/{service_name}"
        body = json.dumps({"enabled": enabled}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            method="PATCH",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            return {"ok": True, "body": raw[:500]}
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return {"ok": False, "error": str(exc)[:200]}

    def _desktop_catalog_remove(self, service_name: str) -> dict[str, Any]:
        import os
        import urllib.error
        import urllib.request

        base = (
            os.environ.get("DESKTOP_SHELL_API_BASE")
            or os.environ.get("EIC_DESKTOP_SHELL_API_BASE")
            or ""
        ).rstrip("/")
        if not base:
            return {"ok": False, "skipped": True}
        url = f"{base}/api/v1/catalog/apps/{service_name}"
        req = urllib.request.Request(url, method="DELETE")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            return {"ok": True, "body": raw[:500]}
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return {"ok": False, "error": str(exc)[:200]}

    def _refresh_ecc_registry(self) -> None:
        """Hot-register newly scaffolded services in ECC after deploy."""
        import urllib.error
        import urllib.request

        url = str(getattr(self._config, "ecc_registry_refresh_url", "") or "")
        if not url:
            return
        try:
            headers: dict[str, str] = {}
            mesh = str(getattr(self._config, "mesh_token", "") or "").strip()
            if mesh:
                headers["X-Empery-Mesh-Token"] = mesh
            req = urllib.request.Request(
                url, method="POST", data=b"", headers=headers
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp.read(4096)
            log_event(
                self._logger,
                event="eic.registry.refresh",
                message="ECC registry refresh requested after deploy",
                url=url,
            )
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            log_event(
                self._logger,
                event="eic.registry.refresh_failed",
                message="ECC registry refresh failed (non-fatal)",
                error=str(exc),
                level=logging.WARNING,
            )

    def _default_compose_up_argv(self, service_name: str) -> list[str]:
        orch_reflex = (
            self._workspace()
            / ".cursor"
            / "orchestration"
            / "eic"
            / "compose.reflex.yml"
        )
        root_reflex = self._workspace() / "compose.reflex.yml"
        argv = ["podman-compose", "-f", "compose.yml"]
        # Orchestration overlay is authoritative (root mirror may be stale).
        if orch_reflex.is_file():
            argv.extend(
                ["-f", str(orch_reflex.relative_to(self._workspace()))]
            )
        elif root_reflex.is_file():
            argv.extend(["-f", "compose.reflex.yml"])
        argv.extend(["up", "-d", "--build", "--no-deps", service_name])
        return argv

    def _is_safe_compose_argv(self, argv: list[str]) -> bool:
        if not argv:
            return False
        binary = Path(argv[0]).name
        if binary not in _COMPOSE_BINARIES:
            return False
        # podman compose … / docker compose …
        parts = list(argv)
        if binary in {"podman", "docker"}:
            if len(parts) < 2 or parts[1] != "compose":
                # Allow: podman ps (read-only)
                if binary == "podman" and len(parts) >= 2 and parts[1] == "ps":
                    return True
                # Allow health curl via curl binary? keep out of this path
                return False
            action_idx = 2
        else:
            action_idx = 1
        # Scan for dangerous tokens
        joined = " ".join(parts)
        if re.search(r"[;&|`$]|rm\s|curl\s+.*\|", joined):
            return False
        # Find primary action
        action = None
        for i in range(action_idx, len(parts)):
            tok = parts[i]
            if tok.startswith("-"):
                continue
            if tok in {"compose.yml", "compose.reflex.yml"} or tok.endswith(".yml"):
                continue
            action = tok
            break
        if action is None:
            return False
        if action not in _SAFE_COMPOSE_ACTIONS:
            return False
        if action == "up":
            # Must include -d and a single service name (no bare `up` of whole stack)
            if "-d" not in parts and "--detach" not in parts:
                return False
            # Reject down/stop/kill
            if any(x in parts for x in ("down", "stop", "kill", "rm", "--volume", "-v")):
                return False
            # Last non-flag token should be service name
            service_tok = parts[-1]
            if service_tok.startswith("-") or service_tok.endswith(".yml"):
                return False
            if not re.match(r"^[a-z][a-z0-9_]{1,62}$", service_tok):
                return False
        if action == "logs":
            # logs must target one service, no follow forever without timeout handled by subprocess
            if parts[-1].startswith("-"):
                return False
        return True

    def run_pytest(self, path: str | None = None) -> tuple[int, str]:
        if not self._config.allow_shell_pytest:
            return 0, "pytest skipped (EIC_ALLOW_SHELL_PYTEST=false)"
        cmd = ["python", "-m", "pytest", "-q"]
        if path:
            cmd.append(path)
        try:
            proc = subprocess.run(
                cmd,
                cwd=str(self._paths.workspace_root),
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
            output = (proc.stdout or "") + (proc.stderr or "")
            return proc.returncode, output[-8000:]
        except Exception as exc:  # noqa: BLE001
            return 1, f"pytest failed to start: {exc}"
