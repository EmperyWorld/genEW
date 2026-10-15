"""Deterministic ServiceScaffoldAction — architecture-core anatomy without LLM tools."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from core.logging import log_event

_SERVICE_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{1,62}$")
_RESERVED_PORTS = {
    # Core Empery stack
    8001,
    8002,
    8003,
    8004,
    8005,
    8006,
    8007,
    8010,  # empery_deploy_agent — must never be reused
    8020,  # desktop_shell
    5173,
    5174,  # empery_desktop UI
    5432,
    6379,
    8080,
}
_PORT_FLOOR = 8021
_DOMAIN_STOP_WORDS = frozenset({"service", "engine", "svc", "system"})
_INFRA_COMPOSE_DEPS = frozenset({"redis", "postgres"})


def compose_depends_for_profile(scaffold_profile: str | None) -> list[str]:
    """Compose ``depends_on`` peers for a scaffold profile (incl. infra)."""
    profile = (scaffold_profile or "").strip().lower()
    if profile in {"image_studio", "video_studio", "music_forge"}:
        return ["redis"]
    if profile in {
        "companion_chat",
        "studio_job",
        "ops_dashboard",
        "task_board",
        "research_report",
    }:
        return [
            "redis",
            "postgres",
            "empery_intelligence_core",
            "identity_service",
        ]
    if profile in {"peer_http", "site_studio", "presentation_ai"}:
        return ["redis", "empery_intelligence_core"]
    if profile in {"marketing", "generic"}:
        return ["redis", "postgres"]
    return ["redis"]


def empery_peer_dependencies_for_profile(scaffold_profile: str | None) -> list[str]:
    """Hard Empery peer deps for ``manifest.dependencies`` (exclude redis/postgres)."""
    return [
        name
        for name in compose_depends_for_profile(scaffold_profile)
        if name not in _INFRA_COMPOSE_DEPS
    ]


def _normalize_hint(domain_hint: str) -> str:
    return re.sub(r"[^a-z0-9_]", "_", domain_hint.lower())


def _is_marketing_domain(domain_hint: str) -> bool:
    return "marketing" in _normalize_hint(domain_hint)


def _entity_name_from_hint(domain_hint: str) -> str:
    parts = [
        p
        for p in _normalize_hint(domain_hint).split("_")
        if p and p not in _DOMAIN_STOP_WORDS
    ]
    if not parts:
        return "DomainItem"
    # Product profile nouns — keep short names so routes are /tasks, /metrics, …
    _canonical = {
        "task": "Task",
        "metric": "Metric",
        "report": "Report",
        "note": "Note",
    }
    if len(parts) == 1 and parts[0] in _canonical:
        return _canonical[parts[0]]
    base = "".join(part.capitalize() for part in parts)
    if base.endswith("Item"):
        return base
    return f"{base}Item"


_PROFILE_DOMAIN_HINT = {
    "task_board": "task",
    "ops_dashboard": "metric",
    "research_report": "report",
    "editor_local": "note",
}


def resolve_domain_hint_for_profile(
    scaffold_profile: str | None, domain_hint: str
) -> str:
    """Map product profiles to short domain nouns (avoid full-intent entity names)."""
    profile = (scaffold_profile or "").strip().lower()
    if profile in _PROFILE_DOMAIN_HINT:
        return _PROFILE_DOMAIN_HINT[profile]
    return domain_hint



def _snake_case(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def _route_slug(name: str) -> str:
    slug = _snake_case(name).replace("_", "-")
    return slug if slug.endswith("s") else f"{slug}s"


def _event_prefix(domain_hint: str, service_name: str) -> str:
    parts = [
        p
        for p in _normalize_hint(domain_hint).split("_")
        if p and p not in _DOMAIN_STOP_WORDS
    ]
    if parts:
        return parts[0]
    return service_name.split("_")[0]


def _use_case_class_name(service_name: str) -> str:
    return "".join(part.capitalize() for part in service_name.split("_")) + "UseCases"


_CREATE_SERVICE_MARKERS = (
    "create_service",
    "create a service",
    "new service",
    "scaffold",
    "genesis",
    "standalone module",
    "birth",
    # Russian operator phrasing (translit + Cyrillic)
    "создать сервис",
    "создай сервис",
    "создание сервиса",
    "новый сервис",
    "создать модуль",
)


# Intention kinds that target an existing capsule — never treat as genesis.
_NON_CREATE_KINDS = frozenset({"evolve", "verify"})


def is_create_service_intention(
    *,
    intent: str,
    service_name: str | None,
    kind: str | None = None,
) -> bool:
    """Detect create_service / genesis intents that require scaffold fallback.

    Evolve/verify with a named service must NOT count as genesis — otherwise
    verify treats existing anatomy as expect_capsule and forces PASSED.
    """
    kind_l = (kind or "").strip().lower()
    if kind_l in _NON_CREATE_KINDS:
        return False
    text = f"{intent} {service_name or ''} {kind or ''}".lower()
    if any(m in text for m in _CREATE_SERVICE_MARKERS):
        return True
    if service_name and _SERVICE_NAME_RE.match(service_name):
        # Concrete service_name on create/implement (no kind) → scaffold fallback
        return True
    return False


def is_evolve_intention(*, kind: str | None = None) -> bool:
    """True when the intention is a product evolve of an existing service."""
    return (kind or "").strip().lower() == "evolve"


def requires_named_service(
    *,
    intent: str,
    kind: str | None = None,
) -> bool:
    """True when genesis/create/evolve must carry an explicit snake_case service_name."""
    text = f"{intent} {kind or ''}".lower()
    if any(m in text for m in _CREATE_SERVICE_MARKERS):
        return True
    kind_l = (kind or "").strip().lower()
    # Full evolve loop always targets a concrete module.
    return kind_l == "evolve"


def validate_genesis_service_name(service_name: str | None) -> str:
    """Return normalized snake_case name or raise ValueError."""
    raw = (service_name or "").strip()
    if not raw:
        raise ValueError(
            "service_name is required for create/evolve/genesis "
            "(snake_case, e.g. recipe_probe_svc) — unnamed_service is forbidden"
        )
    if raw == "unnamed_service":
        raise ValueError(
            "service_name 'unnamed_service' is reserved debris — "
            "provide a real snake_case module name"
        )
    if not _SERVICE_NAME_RE.match(raw):
        raise ValueError(
            f"invalid service_name '{raw}' — must match ^[a-z][a-z0-9_]{{1,62}}$"
        )
    return raw



def should_force_full_autonomous_loop(
    *,
    kind: str,
    intent: str,
    service_name: str | None,
    workspace_root: Path | None = None,
) -> bool:
    """
    Wizard/ECC often enqueue ``plan`` alone; for new services that must become
    a full plan→implement→verify (EVOLVE) loop, not a design-only completion.
    """
    kind_l = (kind or "").strip().lower()
    if kind_l not in {"plan", "implement"}:
        return False
    text = (intent or "").lower()
    if any(m in text for m in _CREATE_SERVICE_MARKERS):
        return True
    if not service_name or not _SERVICE_NAME_RE.match(service_name):
        return False
    if workspace_root is None:
        # Unknown tree → prefer full loop over silent plan-only "success"
        return True
    service_dir = Path(workspace_root) / "services" / service_name
    return not service_dir.is_dir()


def is_viable_design_markdown(content: str) -> bool:
    """Reject LLM meta-prose dumped as a fake System Design Document."""
    text = (content or "").strip()
    if len(text) < 160:
        return False
    lower = text.lower()
    meta_markers = (
        "i will now read",
        "i'll now read",
        "i need to read",
        "let me read",
        "```bash\ncat ",
        "```bash\r\ncat ",
    )
    # Meta-prose that only cats rules is never a design, even if long.
    if any(m in lower for m in meta_markers):
        return False
    has_structure = (
        "## " in text
        or "### " in text
        or "# design" in lower
        or "purpose" in lower
        or "anatomy" in lower
        or "manifest" in lower
        or '"service_name"' in lower
        or "scaffold profile" in lower
        or "scaffold_profile" in lower
        or "core logic" in lower
        or "assembly" in lower
    )
    return has_structure


def allocate_service_port(workspace_root: Path, service_name: str) -> int:
    """Pick a stable host/container port for a new service.

    Re-scaffold / ensure_product_surfaces must reuse the port already written
    into ``deploy/services/{name}.yml`` — a second fresh allocate was shifting
    ``dynamic_health_bases.json`` by +1 and failing deploy-agent health probes.
    """
    from services.empery_intelligence_core.src.integration.service_factory_peers import (
        resolve_service_port,
    )

    existing = resolve_service_port(workspace_root, service_name)
    if existing is not None:
        return existing

    used = set(_RESERVED_PORTS)
    deploy_dir = workspace_root / "deploy" / "services"
    if deploy_dir.is_dir():
        for path in deploy_dir.glob("*.yml"):
            text = path.read_text(encoding="utf-8")
            for match in re.finditer(r'"(\d{4,5})"', text):
                used.add(int(match.group(1)))
            for match in re.finditer(r":(\d{4,5})", text):
                used.add(int(match.group(1)))
    # Stable hash offset so re-scaffold keeps the same port when free
    seed = sum(ord(c) for c in service_name) % 50
    candidate = _PORT_FLOOR + seed
    while candidate in used:
        candidate += 1
        if candidate > 8999:
            candidate = _PORT_FLOOR
    return candidate


class ServiceScaffoldAction:
    """Write a minimal Empery service capsule + compose fragment + health base."""

    def __init__(
        self,
        workspace_root: Path,
        logger: logging.Logger,
    ) -> None:
        self._root = workspace_root.resolve()
        self._logger = logger

    def service_root(self, service_name: str) -> Path:
        return self._root / "services" / service_name

    def heal_corrupt_service_root(self, service_name: str) -> bool:
        """Unlink ``services/{name}`` when it is a file (LLM wrote capsule root).

        Returns True when a corrupt file was removed. Without this, mkdir under
        the path raises ENOTDIR and the worker pause-loops on Resume.
        """
        root = self.service_root(service_name)
        if root.exists() and root.is_file():
            root.unlink()
            log_event(
                self._logger,
                event="eic.scaffold.heal_file_as_capsule",
                message="Removed file masquerading as service capsule root",
                service_name=service_name,
                level=logging.WARNING,
            )
            return True
        return False

    def already_scaffolded(self, service_name: str) -> bool:
        root = self.service_root(service_name)
        if root.exists() and root.is_file():
            return False
        return (root / "manifest.json").is_file() and (root / "src" / "api" / "main.py").is_file()

    def scaffold(
        self,
        service_name: str,
        *,
        features: list[str] | None = None,
        port: int | None = None,
        domain_hint: str | None = None,
        scaffold_profile: str | None = None,
    ) -> dict[str, Any]:
        if not _SERVICE_NAME_RE.match(service_name):
            raise ValueError(f"Invalid service_name: {service_name}")

        feat = list(features or ["health", "reflex_scaffold"])
        if "health" not in feat:
            feat.insert(0, "health")
        if "user_created" not in feat:
            feat.append("user_created")
        assigned_port = port or allocate_service_port(self._root, service_name)
        root = self.service_root(service_name)
        written: list[str] = []
        # Capsule root itself may be a 0-byte file from write_file(services/{name}).
        self.heal_corrupt_service_root(service_name)

        dirs = [
            root / "src" / "api",
            root / "src" / "core",
            root / "src" / "data",
            root / "src" / "integration",
            root / "tests",
            root / "workflows",
        ]
        for d in dirs:
            # Hands LLM sometimes write_file's a path that should be a directory.
            if d.exists() and d.is_file():
                d.unlink()
            for parent in reversed(d.parents):
                if not parent.is_relative_to(root) and parent != root:
                    continue
                if parent.exists() and parent.is_file():
                    parent.unlink()
            d.mkdir(parents=True, exist_ok=True)
            init = d / "__init__.py"
            if d.name != "workflows" and not init.exists():
                init.write_text('"""Package."""\n', encoding="utf-8")
                written.append(str(init))

        for pkg in (root / "src", root / "tests", root):
            init = pkg / "__init__.py"
            if pkg == root:
                continue
            if not init.exists():
                init.write_text('"""Package."""\n', encoding="utf-8")
                written.append(str(init))

        resolved_profile = self._resolve_scaffold_profile(
            scaffold_profile,
            service_name=service_name,
            domain_hint=domain_hint or service_name,
        )
        hint = resolve_domain_hint_for_profile(
            resolved_profile, domain_hint or service_name
        )
        files = self._file_map(
            service_name,
            features=feat,
            port=assigned_port,
            domain_hint=hint,
            scaffold_profile=resolved_profile,
        )
        for rel, content in files.items():
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            written.append(str(path))

        compose_path = self._write_compose_fragment(
            service_name,
            assigned_port,
            scaffold_profile=resolved_profile,
        )
        written.append(str(compose_path))
        reflex_path = self._rewrite_compose_reflex()
        written.append(str(reflex_path))
        health_path = self._upsert_health_base(service_name, assigned_port)
        written.append(str(health_path))
        aligned = self._align_manifest_dependencies(service_name, resolved_profile)
        if aligned:
            written.append(aligned)

        ui_result = self.scaffold_ecc_ui(
            service_name,
            port=assigned_port,
            domain_hint=hint,
            ui_profile=resolved_profile,
        )
        written.extend(list(ui_result.get("written") or []))

        # Probe/shell: no Desktop. Product peers may set ui.required=false (ECC skip)
        # while still needing D1–D3 (site_studio preview journey).
        desktop_skip = resolved_profile in {"health_probe", "shell_host"}
        desktop_result = self.scaffold_desktop_host(
            service_name,
            domain_hint=domain_hint or service_name,
            skip=desktop_skip,
            ui_profile=resolved_profile,
            peer_port=assigned_port,
        )
        written.extend(list(desktop_result.get("written") or []))

        log_event(
            self._logger,
            event="eic.scaffold.completed",
            message="Service scaffold written",
            service_name=service_name,
            scaffold_profile=resolved_profile,
            port=assigned_port,
            files=len(written),
            ui_skipped=bool(ui_result.get("skipped")),
            desktop_skipped=bool(desktop_result.get("skipped")),
        )
        return {
            "service_name": service_name,
            "port": assigned_port,
            "written": written,
            "service_root": str(root),
            "compose_fragment": str(compose_path),
            "health_base": f"http://{service_name}:{assigned_port}",
            "ui": ui_result,
            "desktop": desktop_result,
            "scaffold_profile": resolved_profile,
        }

    def scaffold_ecc_ui(
        self,
        service_name: str,
        *,
        port: int | None = None,
        domain_hint: str | None = None,
        force: bool = False,
        ui_profile: str | None = None,
    ) -> dict[str, Any]:
        """Write ECC product UI + BFF (or skip when design/manifest opts out)."""
        from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
            ServiceUiScaffoldAction,
            read_ui_required,
        )

        assigned_port = port or allocate_service_port(self._root, service_name)
        profile = (ui_profile or "").strip().lower()
        # health_probe / shell_host are lab shells — not product Desktop apps.
        # editor_local (notes/doc_editor packs) still needs D1–D3 launch surfaces.
        if profile in {"health_probe", "shell_host"}:
            required = False
            skip_reason = (
                "Scaffold/probe module — not a product app; "
                "ECC/Desktop launch UI not required."
            )
        elif profile == "site_studio":
            required = False
            skip_reason = (
                "Backend peer API only; ECC product UI deferred — "
                "Desktop/API health is the readiness surface."
            )
        elif profile == "presentation_ai":
            required = False
            skip_reason = (
                "Backend peer API only; ECC product UI deferred — "
                "Desktop/API health is the readiness surface."
            )
        elif profile == "image_studio":
            required = False
            skip_reason = (
                "Backend peer API only; ECC product UI deferred — "
                "Desktop/API health is the readiness surface."
            )
        elif profile == "video_studio":
            required = False
            skip_reason = (
                "Backend peer API only; ECC product UI deferred — "
                "Desktop/API health is the readiness surface."
            )
        elif profile == "music_forge":
            required = False
            skip_reason = (
                "Backend peer API only; ECC product UI deferred — "
                "Desktop/API health is the readiness surface."
            )
        else:
            required, skip_reason = read_ui_required(self._root, service_name)
        ui = ServiceUiScaffoldAction(self._root)
        if ui.already_has_ui(service_name) and not force:
            return {
                "service_name": service_name,
                "skipped": False,
                "already": True,
                "written": [],
            }
        return ui.scaffold_ui(
            service_name,
            port=assigned_port,
            domain_hint=domain_hint or service_name,
            required=required,
            skip_reason=skip_reason,
            ui_profile=ui_profile,
        )

    def scaffold_desktop_host(
        self,
        service_name: str,
        *,
        domain_hint: str | None = None,
        skip: bool = False,
        force: bool = False,
        ui_profile: str | None = None,
        peer_port: int | None = None,
    ) -> dict[str, Any]:
        """Register desktop catalog + window mount (skipped for ui.required=false)."""
        from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
            ServiceDesktopScaffoldAction,
        )

        if skip:
            return {
                "service_name": service_name,
                "skipped": True,
                "written": [],
                "reason": "ui.required=false — no desktop mount",
            }
        desk = ServiceDesktopScaffoldAction(self._root, self._logger)
        if desk.already_has_desktop(service_name) and not force:
            return {
                "service_name": service_name,
                "skipped": False,
                "already": True,
                "written": [],
            }
        try:
            return desk.scaffold_desktop(
                service_name,
                domain_hint=domain_hint or service_name,
                ui_profile=ui_profile,
                peer_port=peer_port,
                force=force,
            )
        except (PermissionError, OSError) as exc:
            log_event(
                self._logger,
                event="eic.scaffold.desktop.fs_error",
                message="Desktop scaffold filesystem error",
                service_name=service_name,
                error=str(exc),
                level=logging.ERROR,
            )
            return {
                "service_name": service_name,
                "skipped": False,
                "ok": False,
                "written": [],
                "error": f"{type(exc).__name__}: {exc}",
            }

    def _resolve_scaffold_profile(
        self,
        scaffold_profile: str | None,
        *,
        service_name: str,
        domain_hint: str,
    ) -> str:
        from services.empery_intelligence_core.src.integration.assembly_profiles import (
            resolve_scaffold_profile,
        )

        profile = (scaffold_profile or "").strip().lower()
        if profile:
            return profile
        if _is_marketing_domain(domain_hint):
            return "marketing"
        return resolve_scaffold_profile(
            [],
            service_name=service_name,
            intent=domain_hint,
        )

    def _align_manifest_dependencies(
        self, service_name: str, scaffold_profile: str | None
    ) -> str | None:
        """Keep ``manifest.dependencies`` honest vs compose peer wiring."""
        path = self._root / "services" / service_name / "manifest.json"
        if not path.is_file():
            return None
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None
        if not isinstance(raw, dict):
            return None
        expected = empery_peer_dependencies_for_profile(scaffold_profile)
        current = [str(x) for x in (raw.get("dependencies") or [])]
        merged = list(dict.fromkeys([*current, *expected]))
        merged = [d for d in merged if d not in _INFRA_COMPOSE_DEPS]
        if merged == current:
            return None
        raw["dependencies"] = merged
        path.write_text(json.dumps(raw, indent=2) + "\n", encoding="utf-8")
        return str(path)

    def _write_compose_fragment(
        self,
        service_name: str,
        port: int,
        *,
        scaffold_profile: str | None = None,
    ) -> Path:
        deploy_dir = self._root / "deploy" / "services"
        deploy_dir.mkdir(parents=True, exist_ok=True)
        path = deploy_dir / f"{service_name}.yml"
        env_prefix = service_name.upper()
        env_port_key = f"{env_prefix}_PORT"
        profile = (scaffold_profile or "").strip().lower()
        depends = compose_depends_for_profile(profile)
        volumes_yaml = ""
        if profile in {"image_studio", "video_studio", "music_forge"}:
            extra_env = f"""
      COMFY_BASE_URL: ${{COMFY_BASE_URL:-http://host.containers.internal:31003}}
      {env_prefix}_CORS_ORIGINS: ${{{env_prefix}_CORS_ORIGINS:-http://127.0.0.1:5174,http://localhost:5174}}
"""
            volumes_yaml = f"""    volumes:
      - ./services/{service_name}/workflows:/app/services/{service_name}/workflows:ro,z
"""
        elif profile in {"peer_http", "site_studio", "presentation_ai"}:
            extra_env = """
      EIC_API_BASE: ${EIC_API_BASE:-http://empery_intelligence_core:8007}
"""
        elif profile in {
            "companion_chat",
            "studio_job",
            "ops_dashboard",
            "task_board",
            "research_report",
        }:
            extra_env = f"""
      EIC_API_BASE: ${{EIC_API_BASE:-http://empery_intelligence_core:8007}}
      IDENTITY_API_BASE: ${{IDENTITY_API_BASE:-http://identity_service:8003}}
      IDENTITY_MODE: ${{IDENTITY_MODE:-http}}
      {env_prefix}_DATABASE_URL: postgresql+psycopg://${{POSTGRES_USER:-eworld}}:${{POSTGRES_PASSWORD}}@postgres:5432/{service_name}
"""
        elif "postgres" in depends:
            extra_env = f"""
      {env_prefix}_DATABASE_URL: postgresql+psycopg://${{POSTGRES_USER:-eworld}}:${{POSTGRES_PASSWORD}}@postgres:5432/{service_name}
"""
        else:
            extra_env = ""
        depends_yaml = "\n".join(f"      - {d}" for d in depends)
        body = f"""# Auto-generated by Empery Reflex ServiceScaffoldAction — production path.
services:
  {service_name}:
    build:
      context: .
      dockerfile: deploy/docker/Dockerfile.python
      target: runtime
      args:
        SERVICE_APP: services.{service_name}.src.api.main:create_app
        SERVICE_PORT: "{port}"
    restart: unless-stopped
    user: "1000:1000"
    networks: [empery_net]
    ports:
      - "{port}:{port}"
    depends_on:
{depends_yaml}
{volumes_yaml}    environment:
      LOG_LEVEL: ${{LOG_LEVEL:-INFO}}
      EVENT_BUS_REDIS_URL: redis://redis:6379/0
      REDIS_URL: redis://redis:6379/0
      EVENT_BUS_ALLOW_IN_MEMORY: "false"
      AUTO_CREATE_TABLES: "false"
      PYTHONUNBUFFERED: "1"
      PORT: "{port}"
      {env_port_key}: "{port}"{extra_env}
"""
        path.write_text(body, encoding="utf-8")
        return path

    def _rewrite_compose_reflex(self) -> Path:
        """Merge deploy/services/*.yml into orchestration overlay for podman-compose -f."""
        deploy_dir = self._root / "deploy" / "services"
        out = (
            self._root
            / ".cursor"
            / "orchestration"
            / "eic"
            / "compose.reflex.yml"
        )
        out.parent.mkdir(parents=True, exist_ok=True)
        # Also mirror to repo-root compose.reflex.yml when writable (host/e2e).
        root_mirror = self._root / "compose.reflex.yml"
        chunks: list[str] = [
            "# Auto-generated Empery Reflex overlay — merged deploy/services/*.yml\n",
            "# Usage: podman-compose -f compose.yml -f compose.reflex.yml up -d --build <svc>\n",
            "# (also written under .cursor/orchestration/eic/compose.reflex.yml)\n",
            "services:\n",
        ]
        if deploy_dir.is_dir():
            for path in sorted(deploy_dir.glob("*.yml")):
                text = path.read_text(encoding="utf-8")
                # Strip top-level `services:` and keep indented service blocks
                lines = text.splitlines()
                in_services = False
                for line in lines:
                    if line.strip().startswith("#"):
                        continue
                    if line.startswith("services:"):
                        in_services = True
                        continue
                    if in_services:
                        chunks.append(line + "\n")
        body = "".join(chunks)
        out.write_text(body, encoding="utf-8")
        try:
            root_mirror.write_text(body, encoding="utf-8")
        except OSError:
            pass
        return out

    def _upsert_health_base(self, service_name: str, port: int) -> Path:
        path = (
            self._root
            / ".cursor"
            / "orchestration"
            / "eic"
            / "dynamic_health_bases.json"
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        data: dict[str, str] = {}
        if path.is_file():
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    data = {str(k): str(v) for k, v in raw.items()}
            except json.JSONDecodeError:
                data = {}
        data[service_name] = f"http://{service_name}:{port}"
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        return path

    def _file_map(
        self,
        service_name: str,
        *,
        features: list[str],
        port: int,
        domain_hint: str,
        scaffold_profile: str | None = None,
    ) -> dict[str, str]:
        from services.empery_intelligence_core.src.integration.service_scaffold_companion import (
            companion_chat_file_map,
        )
        from services.empery_intelligence_core.src.integration.service_scaffold_templates import (
            generic_domain_file_map,
            health_probe_file_map,
            marketing_file_map,
            peer_http_file_map,
            studio_job_file_map,
        )

        profile = self._resolve_scaffold_profile(
            scaffold_profile,
            service_name=service_name,
            domain_hint=domain_hint,
        )

        if profile == "marketing" or _is_marketing_domain(domain_hint):
            return marketing_file_map(
                self,
                service_name,
                features=features,
                port=port,
                domain_hint=domain_hint,
            )
        if profile in {"health_probe", "shell_host"}:
            return health_probe_file_map(
                self,
                service_name,
                features=features,
                port=port,
                domain_hint=domain_hint,
            )
        if profile == "studio_job":
            return studio_job_file_map(
                self,
                service_name,
                features=features,
                port=port,
                domain_hint=domain_hint,
            )
        if profile == "site_studio":
            from services.empery_intelligence_core.src.integration.service_scaffold_site_studio import (
                site_studio_file_map,
            )

            return site_studio_file_map(
                self,
                service_name,
                features=features,
                port=port,
                domain_hint=domain_hint,
            )
        if profile == "presentation_ai":
            from services.empery_intelligence_core.src.integration.service_scaffold_presentation_ai import (
                presentation_ai_file_map,
            )

            return presentation_ai_file_map(
                self,
                service_name,
                features=features,
                port=port,
                domain_hint=domain_hint,
            )
        if profile == "image_studio":
            from services.empery_intelligence_core.src.integration.service_scaffold_image_studio import (
                image_studio_file_map,
            )

            return image_studio_file_map(
                self,
                service_name,
                features=features,
                port=port,
                domain_hint=domain_hint,
            )
        if profile == "video_studio":
            from services.empery_intelligence_core.src.integration.service_scaffold_video_studio import (
                video_studio_file_map,
            )

            return video_studio_file_map(
                self,
                service_name,
                features=features,
                port=port,
                domain_hint=domain_hint,
            )
        if profile == "music_forge":
            from services.empery_intelligence_core.src.integration.service_scaffold_music_forge import (
                music_forge_file_map,
            )

            return music_forge_file_map(
                self,
                service_name,
                features=features,
                port=port,
                domain_hint=domain_hint,
            )
        if profile == "peer_http":
            return peer_http_file_map(
                self,
                service_name,
                features=features,
                port=port,
                domain_hint=domain_hint,
            )
        if profile == "companion_chat":
            return companion_chat_file_map(
                self,
                service_name,
                features=features,
                port=port,
                domain_hint=domain_hint,
            )
        if profile in {
            "ops_dashboard",
            "task_board",
            "research_report",
            "editor_local",
        }:
            return generic_domain_file_map(
                self,
                service_name,
                features=features,
                port=port,
                domain_hint=resolve_domain_hint_for_profile(profile, domain_hint),
            )
        return generic_domain_file_map(
            self,
            service_name,
            features=features,
            port=port,
            domain_hint=domain_hint,
        )

    def config_py(self, service_name: str, port: int, env_prefix: str) -> str:
        return f'''"""Environment-specific configuration for {service_name}."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _csv_env(key: str, default: str) -> list[str]:
    raw = os.environ.get(key, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


class ServiceConfig(BaseModel):
    """Immutable runtime configuration."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "{service_name}"
    host: str = "0.0.0.0"
    port: int = {port}
    log_level: str = "INFO"
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ],
    )


@lru_cache
def get_config() -> ServiceConfig:
    return ServiceConfig(
        host=_env("{env_prefix}_HOST", "0.0.0.0"),
        port=int(_env("{env_prefix}_PORT", _env("PORT", "{port}"))),
        log_level=_env("LOG_LEVEL", "INFO"),
        cors_origins=_csv_env(
            "{env_prefix}_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174,"
            "http://127.0.0.1:5173,http://localhost:5173",
        ),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
'''

    def main_py(
        self,
        *,
        service_name: str,
        port: int,
        env_prefix: str,
        use_case_class: str,
        repository_class: str,
        repository_key: str,
        description: str,
    ) -> str:
        return f'''"""FastAPI entry point and registry registration for {service_name}."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.responses import register_standard_error_handlers
from core.container import ServiceContainer
from core.event_bus import (
    EventBus,
    create_event_bus,
    ensure_event_bus_started,
    ensure_event_bus_stopped,
)
from core.logging import configure_logging, log_event
from core.registry import GlobalServiceRegistry, ServiceManifest
from services.{service_name}.config import ServiceConfig, get_config
from services.{service_name}.src.api.routes import router
from services.{service_name}.src.core.use_cases import {use_case_class}
from services.{service_name}.src.data.repository import {repository_class}


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def _make_event_bus() -> EventBus:
    """Prefer Redis bus in compose; in-memory only when Redis URL absent (local tests)."""
    try:
        return create_event_bus()
    except RuntimeError:
        return EventBus()


def _wire_dependencies(container: ServiceContainer, config: ServiceConfig) -> None:
    logger = configure_logging(config.service_name)
    container.register("logger", lambda _c: logger)
    container.register("config", lambda _c: config)
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: _make_event_bus())
    container.register("{repository_key}", lambda _c: {repository_class}())
    container.register(
        "service_use_cases",
        lambda c: {use_case_class}(c),
    )


def create_app(
    container: ServiceContainer | None = None,
    config: ServiceConfig | None = None,
) -> FastAPI:
    runtime_config = config or get_config()
    app_container = container or ServiceContainer()
    _wire_dependencies(app_container, runtime_config)
    manifest = load_manifest()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await ensure_event_bus_started(app.state.container.resolve("event_bus"))
        log_event(
            app.state.container.resolve("logger"),
            event="{service_name}.app.startup",
            message="{service_name} started",
            port=runtime_config.port,
        )
        try:
            yield
        finally:
            await ensure_event_bus_stopped(app.state.container.resolve("event_bus"))
            log_event(
                app.state.container.resolve("logger"),
                event="{service_name}.app.shutdown",
                message="{service_name} stopped",
            )

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="{description}",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    if getattr(runtime_config, "cors_origins", None):
        from fastapi.middleware.cors import CORSMiddleware

        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(runtime_config.cors_origins),
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    register_standard_error_handlers(
        app,
        service_prefix="{env_prefix[:8]}",
        service_name=runtime_config.service_name,
    )
    app.include_router(router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    """Register this service in the Global Service Registry."""
    registry.register(load_manifest(), create_app)
'''

    def health_test_py(self, service_name: str) -> str:
        return f'''"""Health smoke for {service_name}."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.{service_name}.src.api.main import create_app


def test_health_ok() -> None:
    with TestClient(create_app()) as client:
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["service"] == "{service_name}"
'''
