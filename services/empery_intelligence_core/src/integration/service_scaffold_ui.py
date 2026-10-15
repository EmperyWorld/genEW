"""Deterministic ECC product UI + BFF scaffold (service-ui U1–U9)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from services.empery_intelligence_core.src.integration.service_scaffold import (
    _entity_name_from_hint,
    _route_slug,
)

_STUB_PHRASES = ("coming soon", "todo ui", "placeholder ui", "not implemented")


def ui_feature_kebab(service_name: str) -> str:
    return service_name.replace("_", "-")


def ui_paths_key(service_name: str) -> str:
    parts = service_name.split("_")
    return "ops" + "".join(p[:1].upper() + p[1:] for p in parts if p)


def ui_nav_key(service_name: str) -> str:
    parts = service_name.split("_")
    if not parts:
        return "service"
    return parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:])


def ui_camel_client(service_name: str) -> str:
    parts = service_name.split("_")
    return parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:] if p) + "Client"


def ui_pascal(service_name: str) -> str:
    return "".join(p[:1].upper() + p[1:] for p in service_name.split("_") if p)


def ui_route(service_name: str) -> str:
    return f"/ops/{ui_feature_kebab(service_name)}"


def ui_bff_prefix(service_name: str) -> str:
    return f"/api/v1/{ui_feature_kebab(service_name)}"


def ui_i18n_ns(service_name: str) -> str:
    return ui_nav_key(service_name)


def manifest_ui_block(
    service_name: str,
    *,
    required: bool = True,
    skip_reason: str | None = None,
    lab: bool = False,
) -> dict[str, Any]:
    """Canonical ``manifest.json`` ``ui`` contract (P4.3 SoT)."""
    if not required:
        return {
            "required": False,
            "skip_reason": skip_reason
            or "infra/probe — no ECC product UI required",
            "feature_key": service_name,
            "route": None,
            "nav_label_key": None,
            "bff_prefix": None,
            "lab": lab,
        }
    return {
        "required": True,
        "skip_reason": None,
        "feature_key": service_name,
        "route": ui_route(service_name),
        "nav_label_key": f"nav.{ui_nav_key(service_name)}",
        "bff_prefix": ui_bff_prefix(service_name),
        "lab": lab,
    }


def write_manifest_ui(
    workspace: Path,
    service_name: str,
    *,
    required: bool = True,
    skip_reason: str | None = None,
    lab: bool = False,
) -> Path | None:
    """Upsert ``ui`` into ``services/{name}/manifest.json`` when the file exists."""
    path = workspace / "services" / service_name / "manifest.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    data["ui"] = manifest_ui_block(
        service_name,
        required=required,
        skip_reason=skip_reason,
        lab=lab,
    )
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return path


def _parse_ui_required(ui: dict[str, Any] | None) -> tuple[bool, str | None] | None:
    """Return (required, skip_reason) from a ui dict, or None if unusable."""
    if not isinstance(ui, dict):
        return None
    required = ui.get("required", True)
    if required is False:
        reason = ui.get("skip_reason")
        if isinstance(reason, str) and reason.strip():
            return False, reason.strip()
        return True, None  # invalid opt-out → still required
    return True, None


def resolve_entity_route_slug(service_name: str, domain_hint: str | None = None) -> str:
    """Match generic_domain scaffold route slug (e.g. bloknot-items)."""
    entity = _entity_name_from_hint(domain_hint or service_name)
    return _route_slug(entity)


def design_ui_block(
    service_name: str,
    *,
    domain_hint: str | None = None,
    required: bool = True,
    skip_reason: str | None = None,
    ui_profile: str | None = None,
) -> dict[str, Any]:
    feature = ui_feature_kebab(service_name)
    nav = ui_nav_key(service_name)
    route_slug = resolve_entity_route_slug(service_name, domain_hint)
    profile = (ui_profile or "generic").strip().lower()
    # Peer / Desktop-only profiles: no ECC CRUD screens.
    if not required:
        peer_screens: dict[str, list[str]] = {
            "music_forge": ["generate", "job_poll", "audio"],
            "image_studio": ["generate", "job_poll"],
            "video_studio": ["generate", "job_poll", "videos"],
            "site_studio": ["preview"],
            "presentation_ai": ["presentations", "history", "style_chat"],
        }
        peer_slugs = {
            "music_forge": "audio",
            "image_studio": "images",
            "video_studio": "videos",
            "site_studio": "preview",
            "presentation_ai": "presentations",
        }
        return {
            "service_name": service_name,
            "lifecycle": _lifecycle_provenance(),
            "ui": {
                "required": False,
                "feature_key": service_name,
                "route": None,
                "nav_label_key": None,
                "bff_prefix": None,
                "screens": peer_screens.get(profile, []),
                "auth": "require_auth",
                "skip_reason": skip_reason
                or "infra/probe — no ECC product UI required",
                "peer_route_slug": peer_slugs.get(profile),
                "feature_dir": feature,
                "profile": profile,
                "user_created": True,
            },
        }
    screens = ["item_list", "item_create"]
    if profile in {"companion_chat", "peer_http"}:
        screens = ["chat_transcript", "message_compose"]
        route_slug = "messages"
    elif profile == "studio_job":
        screens = ["job_create", "job_list"]
        route_slug = "jobs"
    elif profile == "ops_dashboard":
        screens = ["metric_list", "metric_detail"]
        route_slug = "metrics"
    elif profile == "task_board":
        screens = ["board", "task_detail"]
        route_slug = "tasks"
    elif profile == "research_report":
        screens = ["report_list", "report_detail"]
        route_slug = "reports"
    return {
        "service_name": service_name,
        "lifecycle": _lifecycle_provenance(),
        "ui": {
            "required": required,
            "feature_key": service_name,
            "route": ui_route(service_name),
            "nav_label_key": f"nav.{nav}",
            "bff_prefix": ui_bff_prefix(service_name),
            "screens": screens,
            "auth": "require_auth",
            "skip_reason": skip_reason,
            "peer_route_slug": route_slug,
            "feature_dir": feature,
            "profile": profile,
            "user_created": True,
        },
    }


def _lifecycle_provenance() -> dict[str, Any]:
    from datetime import datetime, timezone

    return {
        "user_created": True,
        "created_by": "genesis",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def read_ui_required(workspace: Path, service_name: str) -> tuple[bool, str | None]:
    """Return (required, skip_reason). Manifest ``ui`` is SoT; design is fallback.

    Default required=True when neither declares an honest opt-out.
    """
    root = workspace.resolve()
    manifest_path = root / "services" / service_name / "manifest.json"
    if manifest_path.is_file():
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = None
        if isinstance(data, dict) and isinstance(data.get("ui"), dict):
            parsed = _parse_ui_required(data["ui"])
            if parsed is not None:
                return parsed

    path = (
        root
        / ".cursor"
        / "orchestration"
        / "designs"
        / f"{service_name}_design.json"
    )
    if not path.is_file():
        return True, None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return True, None
    ui = data.get("ui") if isinstance(data, dict) else None
    parsed = _parse_ui_required(ui if isinstance(ui, dict) else None)
    if parsed is not None:
        return parsed
    return True, None


class ServiceUiScaffoldAction:
    """Write ECC feature + BFF + nav/i18n/paths for a scaffolded peer service."""

    def __init__(self, workspace_root: Path) -> None:
        self._root = workspace_root.resolve()

    def already_has_ui(self, service_name: str) -> bool:
        feature = ui_feature_kebab(service_name)
        page = (
            self._root
            / "apps"
            / "empery_control_center"
            / "src"
            / "features"
            / feature
            / f"{ui_pascal(service_name)}Page.tsx"
        )
        routes = (
            self._root
            / "services"
            / "empery_control_center_api"
            / "src"
            / "api"
            / f"routes_{service_name}.py"
        )
        return page.is_file() and routes.is_file()

    def scaffold_ui(
        self,
        service_name: str,
        *,
        port: int,
        domain_hint: str | None = None,
        required: bool = True,
        skip_reason: str | None = None,
        ui_profile: str | None = None,
    ) -> dict[str, Any]:
        if not required:
            design_path = self._write_design_json(
                service_name,
                domain_hint=domain_hint,
                required=False,
                skip_reason=skip_reason or "infra probe — no operator workflow",
                ui_profile=ui_profile,
            )
            written = [str(design_path)]
            man = write_manifest_ui(
                self._root,
                service_name,
                required=False,
                skip_reason=skip_reason or "infra probe — no operator workflow",
                lab=True,
            )
            if man is not None:
                written.append(str(man))
            return {
                "service_name": service_name,
                "skipped": True,
                "written": written,
            }

        written: list[str] = []
        hint = domain_hint or service_name
        profile = (ui_profile or "generic").strip().lower()
        route_slug = resolve_entity_route_slug(service_name, hint)
        feature = ui_feature_kebab(service_name)
        pascal = ui_pascal(service_name)
        camel_client = ui_camel_client(service_name)
        paths_key = ui_paths_key(service_name)
        nav_key = ui_nav_key(service_name)
        i18n_ns = ui_i18n_ns(service_name)
        env_key = f"{service_name.upper()}_API_BASE"
        default_base = f"http://{service_name}:{port}"
        bff_slug = feature  # /api/v1/{bff_slug}/…

        from services.empery_intelligence_core.src.integration.service_scaffold_ui_profiles import (
            companion_ui_bundle,
            ops_dashboard_ui_bundle,
            research_report_ui_bundle,
            studio_ui_bundle,
            task_board_ui_bundle,
        )

        profile_bundle: dict[str, Any] | None = None
        if profile in {"companion_chat", "peer_http"}:
            profile_bundle = companion_ui_bundle(
                service_name,
                pascal=pascal,
                camel_client=camel_client,
                i18n_ns=i18n_ns,
                bff_slug=bff_slug,
                env_key=env_key,
                default_base=default_base,
            )
            route_slug = "messages"
        elif profile == "studio_job":
            profile_bundle = studio_ui_bundle(
                service_name,
                pascal=pascal,
                camel_client=camel_client,
                i18n_ns=i18n_ns,
                bff_slug=bff_slug,
                env_key=env_key,
                default_base=default_base,
            )
            route_slug = "jobs"
        elif profile == "ops_dashboard":
            profile_bundle = ops_dashboard_ui_bundle(
                service_name,
                pascal=pascal,
                camel_client=camel_client,
                i18n_ns=i18n_ns,
                bff_slug=bff_slug,
                env_key=env_key,
                default_base=default_base,
            )
            route_slug = "metrics"
        elif profile == "task_board":
            profile_bundle = task_board_ui_bundle(
                service_name,
                pascal=pascal,
                camel_client=camel_client,
                i18n_ns=i18n_ns,
                bff_slug=bff_slug,
                env_key=env_key,
                default_base=default_base,
            )
            route_slug = "tasks"
        elif profile == "research_report":
            profile_bundle = research_report_ui_bundle(
                service_name,
                pascal=pascal,
                camel_client=camel_client,
                i18n_ns=i18n_ns,
                bff_slug=bff_slug,
                env_key=env_key,
                default_base=default_base,
            )
            route_slug = "reports"

        # --- frontend feature ---
        feat_dir = (
            self._root
            / "apps"
            / "empery_control_center"
            / "src"
            / "features"
            / feature
        )
        feat_dir.mkdir(parents=True, exist_ok=True)
        client_file = (
            self._root
            / "apps"
            / "empery_control_center"
            / "src"
            / "api"
            / f"{_client_filename(camel_client)}.ts"
        )
        if profile_bundle:
            files = {
                feat_dir / f"{pascal}Page.tsx": str(profile_bundle["page"]),
                feat_dir / f"use{pascal}Session.ts": str(profile_bundle["hook"]),
                feat_dir / "index.ts": (
                    f'export {{ {pascal}Page }} from "./{pascal}Page";\n'
                ),
                client_file: str(profile_bundle["client"]),
            }
        else:
            files = {
                feat_dir / f"{pascal}Page.tsx": _page_tsx(
                    service_name, pascal, camel_client, i18n_ns
                ),
                feat_dir / f"use{pascal}Session.ts": _hook_ts(
                    service_name, pascal, camel_client, i18n_ns
                ),
                feat_dir / "index.ts": (
                    f'export {{ {pascal}Page }} from "./{pascal}Page";\n'
                ),
                client_file: _client_ts(camel_client, bff_slug),
            }
        for path, content in files.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            written.append(str(path))

        written.append(
            self._patch_api_index(camel_client, _client_filename(camel_client))
        )
        written.append(
            self._patch_paths(paths_key, ui_route(service_name), service_name)
        )
        written.append(
            self._patch_routes_index(service_name, feature, pascal, paths_key)
        )
        written.append(
            self._patch_nav(service_name, paths_key, nav_key)
        )
        written.extend(
            self._patch_i18n(
                service_name,
                nav_key,
                i18n_ns,
                pascal,
                profile_copy=profile_bundle,
            )
        )

        # --- BFF ---
        ecc_api = self._root / "services" / "empery_control_center_api"
        if profile_bundle:
            bff_files = {
                ecc_api
                / "src"
                / "api"
                / f"routes_{service_name}.py": str(profile_bundle["bff_routes"]),
                ecc_api
                / "src"
                / "integration"
                / f"{service_name}_client.py": str(profile_bundle["bff_client"]),
                ecc_api
                / "src"
                / "core"
                / f"{service_name}_bff_use_cases.py": str(
                    profile_bundle["bff_use_cases"]
                ),
                ecc_api
                / "src"
                / "data"
                / f"{service_name}_schemas.py": str(profile_bundle["bff_schemas"]),
            }
        else:
            bff_files = {
                ecc_api
                / "src"
                / "api"
                / f"routes_{service_name}.py": _bff_routes(
                    service_name, bff_slug, route_slug
                ),
                ecc_api
                / "src"
                / "integration"
                / f"{service_name}_client.py": _bff_client(
                    service_name, route_slug, env_key, default_base
                ),
                ecc_api
                / "src"
                / "core"
                / f"{service_name}_bff_use_cases.py": _bff_use_cases(service_name),
                ecc_api
                / "src"
                / "data"
                / f"{service_name}_schemas.py": _bff_schemas(service_name),
            }
        for path, content in bff_files.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            written.append(str(path))

        written.append(
            self._patch_ecc_config(service_name, env_key, default_base)
        )
        written.append(
            self._patch_ecc_main(service_name, env_key, default_base)
        )
        written.append(
            self._patch_compose_ecc_env(service_name, env_key, default_base)
        )

        design_path = self._write_design_json(
            service_name,
            domain_hint=hint,
            required=True,
            skip_reason=None,
            ui_profile=profile,
        )
        written.append(str(design_path))
        man = write_manifest_ui(self._root, service_name, required=True)
        if man is not None:
            written.append(str(man))

        return {
            "service_name": service_name,
            "skipped": False,
            "written": written,
            "route": ui_route(service_name),
            "bff_prefix": ui_bff_prefix(service_name),
            "feature": feature,
            "ui_profile": profile,
        }

    def _write_design_json(
        self,
        service_name: str,
        *,
        domain_hint: str | None,
        required: bool,
        skip_reason: str | None,
        ui_profile: str | None = None,
    ) -> Path:
        designs = self._root / ".cursor" / "orchestration" / "designs"
        designs.mkdir(parents=True, exist_ok=True)
        path = designs / f"{service_name}_design.json"
        payload = design_ui_block(
            service_name,
            domain_hint=domain_hint,
            required=required,
            skip_reason=skip_reason,
            ui_profile=ui_profile,
        )
        if path.is_file():
            try:
                existing = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(existing, dict):
                    existing["ui"] = payload["ui"]
                    existing.setdefault("service_name", service_name)
                    existing.setdefault("lifecycle", {"user_created": True})
                    lifecycle = existing.get("lifecycle")
                    if isinstance(lifecycle, dict):
                        lifecycle.setdefault("user_created", True)
                    else:
                        existing["lifecycle"] = {"user_created": True}
                    if ui_profile:
                        assembly = existing.get("assembly")
                        if not isinstance(assembly, dict):
                            assembly = {}
                        assembly["scaffold_profile"] = ui_profile
                        assembly["forbid_generic_crud"] = ui_profile != "generic"
                        existing["assembly"] = assembly
                    payload = existing
            except json.JSONDecodeError:
                pass
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        return path

    def _ensure_ecc_skeleton(self) -> None:
        """Minimal ECC trees so UI scaffold works in tmp workspaces/tests."""
        paths_ts = (
            self._root
            / "apps/empery_control_center/src/routes/paths.ts"
        )
        if not paths_ts.is_file():
            paths_ts.parent.mkdir(parents=True, exist_ok=True)
            paths_ts.write_text(
                "export const PATHS = {\n  ops: \"/ops\",\n} as const;\n",
                encoding="utf-8",
            )
        routes_tsx = (
            self._root
            / "apps/empery_control_center/src/routes/index.tsx"
        )
        if not routes_tsx.is_file():
            routes_tsx.parent.mkdir(parents=True, exist_ok=True)
            routes_tsx.write_text(
                'import { Route, Routes } from "react-router-dom";\n'
                "export function AppRoutes() {\n"
                "  return (\n"
                "    <Routes>\n"
                '      <Route path="ops/autonomous" '
                "element={<AutonomousPage />} />\n"
                "    </Routes>\n"
                "  );\n"
                "}\n",
                encoding="utf-8",
            )
        nav = (
            self._root
            / "apps/empery_control_center/src/features/shell/NavPrimary.tsx"
        )
        if not nav.is_file():
            nav.parent.mkdir(parents=True, exist_ok=True)
            nav.write_text(
                'import { LayoutGrid } from "lucide-react";\n'
                'import { PATHS } from "@/routes/paths";\n'
                "export function NavPrimary() {\n"
                "  const links = [\n"
                "    { to: PATHS.ops, label: \"ops\", icon: LayoutGrid },\n"
                "  ];\n"
                "  return <nav>{links.length}</nav>;\n"
                "}\n",
                encoding="utf-8",
            )
        for lang in ("en", "ru"):
            locale = (
                self._root
                / "apps/empery_control_center/src/i18n/locales"
                / lang
                / "common.json"
            )
            if not locale.is_file():
                locale.parent.mkdir(parents=True, exist_ok=True)
                locale.write_text('{"nav": {}}\n', encoding="utf-8")
        api_index = (
            self._root / "apps/empery_control_center/src/api/index.ts"
        )
        if not api_index.is_file():
            api_index.parent.mkdir(parents=True, exist_ok=True)
            api_index.write_text(
                'export { eccFetch } from "./http";\n', encoding="utf-8"
            )
        cfg = self._root / "services/empery_control_center_api/config.py"
        if not cfg.is_file():
            cfg.parent.mkdir(parents=True, exist_ok=True)
            cfg.write_text(
                'from pydantic import BaseModel, Field\n\n'
                "class ServiceConfig(BaseModel):\n"
                "    require_auth: bool = Field(default=False)\n"
                "\n"
                "def get_config() -> ServiceConfig:\n"
                "    return ServiceConfig(\n"
                "        require_auth=False,\n"
                "    )\n",
                encoding="utf-8",
            )
        main = (
            self._root
            / "services/empery_control_center_api/src/api/main.py"
        )
        if not main.is_file():
            main.parent.mkdir(parents=True, exist_ok=True)
            main.write_text(
                "def _wire_dependencies(container, config):\n"
                "    wire_eic_gateway(container)\n"
                "\n"
                "def create_app():\n"
                "    app = type(\"App\", (), {})()\n"
                "    app.include_router = lambda *a, **k: None\n"
                "    app.include_router(identity_router, prefix=\"/api/v1\")\n"
                "    return app\n",
                encoding="utf-8",
            )

    def _patch_api_index(self, camel_client: str, filename: str) -> str:
        self._ensure_ecc_skeleton()
        path = (
            self._root
            / "apps"
            / "empery_control_center"
            / "src"
            / "api"
            / "index.ts"
        )
        marker = f"// eic:ui:{filename}"
        text = path.read_text(encoding="utf-8") if path.is_file() else ""
        if marker in text:
            return str(path)
        block = (
            f"{marker}\n"
            f'export {{ {camel_client} }} from "./{filename}";\n'
        )
        path.write_text(text.rstrip() + "\n" + block, encoding="utf-8")
        return str(path)

    def _patch_paths(self, paths_key: str, route: str, service_name: str) -> str:
        self._ensure_ecc_skeleton()
        path = (
            self._root
            / "apps"
            / "empery_control_center"
            / "src"
            / "routes"
            / "paths.ts"
        )
        marker = f"  // eic:ui:{service_name}"
        text = path.read_text(encoding="utf-8")
        if marker in text or f"{paths_key}:" in text:
            return str(path)
        line = f'{marker}\n  {paths_key}: "{route}",\n'
        if "} as const;" in text:
            text = text.replace(
                "} as const;",
                f"{line}}} as const;",
                1,
            )
        else:
            text = text.rstrip() + "\n" + line
        path.write_text(text, encoding="utf-8")
        return str(path)

    def _patch_routes_index(
        self, service_name: str, feature: str, pascal: str, paths_key: str
    ) -> str:
        self._ensure_ecc_skeleton()
        path = (
            self._root
            / "apps"
            / "empery_control_center"
            / "src"
            / "routes"
            / "index.tsx"
        )
        marker = f"/* eic:ui:{service_name} */"
        text = path.read_text(encoding="utf-8")
        if marker in text:
            return str(path)
        import_line = (
            f'{marker}\nimport {{ {pascal}Page }} from "@/features/{feature}";\n'
        )
        if "from \"react-router-dom\"" in text:
            text = text.replace(
                'from "react-router-dom";\n',
                'from "react-router-dom";\n' + import_line,
                1,
            )
        else:
            text = import_line + text
        route_line = (
            f'          {marker}\n'
            f'          <Route path="ops/{feature}" '
            f"element={{<{pascal}Page />}} />\n"
        )
        anchor = (
            '<Route path="ops/autonomous" element={<AutonomousPage />} />\n'
        )
        if anchor in text:
            text = text.replace(anchor, anchor + route_line, 1)
        elif "</Routes>" in text:
            text = text.replace("</Routes>", route_line + "    </Routes>", 1)
        else:
            text = text + "\n" + route_line
        path.write_text(text, encoding="utf-8")
        return str(path)

    def _patch_nav(self, service_name: str, paths_key: str, nav_key: str) -> str:
        self._ensure_ecc_skeleton()
        path = (
            self._root
            / "apps"
            / "empery_control_center"
            / "src"
            / "features"
            / "shell"
            / "NavPrimary.tsx"
        )
        marker = f"/* eic:ui:{service_name} */"
        text = path.read_text(encoding="utf-8")
        if marker in text:
            return str(path)
        if "Notebook" not in text and "from \"lucide-react\"" in text:
            text = text.replace(
                "} from \"lucide-react\";",
                "  Notebook,\n} from \"lucide-react\";",
                1,
            )
        elif "Notebook" not in text:
            text = 'import { Notebook } from "lucide-react";\n' + text
        entry = (
            f"    {marker}\n"
            f"    {{ to: PATHS.{paths_key}, label: t(\"nav.{nav_key}\"), "
            f"icon: Notebook }},\n"
        )
        # Insert before the closing of the links array (first `  ];` after links).
        links_idx = text.find("const links")
        close_arr = text.find("\n  ];", links_idx if links_idx >= 0 else 0)
        if close_arr >= 0:
            text = text[:close_arr] + "\n" + entry + text[close_arr:]
        elif "const links = [" in text:
            text = text.replace(
                "const links = [",
                "const links = [\n" + entry,
                1,
            )
        else:
            text = text + "\n" + entry
        path.write_text(text, encoding="utf-8")
        return str(path)

    def _patch_i18n(
        self,
        service_name: str,
        nav_key: str,
        i18n_ns: str,
        pascal: str,
        *,
        profile_copy: dict[str, Any] | None = None,
    ) -> list[str]:
        self._ensure_ecc_skeleton()
        written: list[str] = []
        titles = {
            "en": {
                "nav": pascal.replace("_", " "),
                "title": f"{pascal.replace('_', ' ')}",
                "listTitle": "Items",
                "create": "Create",
                "namePlaceholder": "Name",
                "empty": "No items yet — create the first one.",
                "loadError": "Failed to load items.",
                "createError": "Failed to create item.",
            },
            "ru": {
                "nav": pascal.replace("_", " "),
                "title": f"{pascal.replace('_', ' ')}",
                "listTitle": "Элементы",
                "create": "Создать",
                "namePlaceholder": "Название",
                "empty": "Пока пусто — создайте первый элемент.",
                "loadError": "Не удалось загрузить список.",
                "createError": "Не удалось создать элемент.",
            },
        }
        if profile_copy:
            en = profile_copy.get("i18n_en")
            ru = profile_copy.get("i18n_ru")
            if isinstance(en, dict):
                titles["en"].update({str(k): str(v) for k, v in en.items()})
                titles["en"]["nav"] = str(en.get("title") or titles["en"]["nav"])
            if isinstance(ru, dict):
                titles["ru"].update({str(k): str(v) for k, v in ru.items()})
                titles["ru"]["nav"] = str(ru.get("title") or titles["ru"]["nav"])
        if service_name == "bloknot":
            titles["en"]["nav"] = "Notebook"
            titles["en"]["title"] = "Notebook"
            titles["ru"]["nav"] = "Блокнот"
            titles["ru"]["title"] = "Блокнот"
        if service_name == "dashboard":
            titles["en"]["nav"] = "Dashboard"
            titles["en"]["title"] = "Dashboard"
            titles["ru"]["nav"] = "Дашборд"
            titles["ru"]["title"] = "Дашборд"
        if service_name == "ai_chat":
            titles["en"]["nav"] = "AI Chat"
            titles["en"]["title"] = "AI Chat"
            titles["ru"]["nav"] = "AI Chat"
            titles["ru"]["title"] = "AI Chat"

        for lang, copy in titles.items():
            path = (
                self._root
                / "apps"
                / "empery_control_center"
                / "src"
                / "i18n"
                / "locales"
                / lang
                / "common.json"
            )
            data = json.loads(path.read_text(encoding="utf-8"))
            nav = data.setdefault("nav", {})
            nav[nav_key] = copy["nav"]
            ns_body: dict[str, Any] = {
                k: v
                for k, v in copy.items()
                if k not in {"nav", "loadError", "createError"}
            }
            ns_body["errors"] = {
                "load": copy.get("loadError", "Failed to load."),
                "create": copy.get("createError", "Failed to create."),
            }
            data[i18n_ns] = ns_body
            path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            written.append(str(path))
        return written

    def _patch_ecc_config(
        self, service_name: str, env_key: str, default_base: str
    ) -> str:
        self._ensure_ecc_skeleton()
        path = (
            self._root / "services" / "empery_control_center_api" / "config.py"
        )
        text = path.read_text(encoding="utf-8")
        field_name = f"{service_name}_api_base"
        marker = f"# eic:ui-field:{service_name}"
        if marker not in text and f"{field_name}:" not in text:
            field_block = (
                f"    {marker}\n"
                f"    {field_name}: str = Field(\n"
                f'        default="{default_base}",\n'
                f'        description="HTTP base for {service_name} BFF '
                f'({env_key})",\n'
                f"    )\n"
            )
            if "    require_auth:" in text:
                text = text.replace(
                    "    require_auth:",
                    field_block + "    require_auth:",
                    1,
                )
            else:
                text = text.rstrip() + "\n" + field_block

        cfg_marker = f"# eic:ui-cfg:{service_name}"
        if cfg_marker not in text:
            cfg_line = (
                f"        {cfg_marker}\n"
                f"        {field_name}=_env(\"{env_key}\", \"{default_base}\")\n"
                f"        .strip()\n"
                f"        .rstrip(\"/\"),\n"
            )
            if "        require_auth=" in text:
                text = text.replace(
                    "        require_auth=",
                    cfg_line + "        require_auth=",
                    1,
                )
            elif "return ServiceConfig(" in text:
                text = text.replace(
                    "return ServiceConfig(",
                    "return ServiceConfig(\n" + cfg_line,
                    1,
                )
            else:
                text = text.rstrip() + "\n" + cfg_line
        path.write_text(text, encoding="utf-8")
        return str(path)

    def _patch_ecc_main(
        self, service_name: str, env_key: str, default_base: str
    ) -> str:
        del env_key, default_base
        self._ensure_ecc_skeleton()
        path = (
            self._root
            / "services"
            / "empery_control_center_api"
            / "src"
            / "api"
            / "main.py"
        )
        text = path.read_text(encoding="utf-8")
        pascal = ui_pascal(service_name)
        client_cls = f"{pascal}Client"
        uc_cls = f"Ecc{pascal}BffUseCases"
        import_marker = f"# eic:ui-import:{service_name}"
        if import_marker not in text:
            imports = (
                f"{import_marker}\n"
                f"from services.empery_control_center_api.src.api.routes_{service_name} import (\n"
                f"    router as {service_name}_router,\n"
                f")\n"
                f"from services.empery_control_center_api.src.core.{service_name}_bff_use_cases import (\n"
                f"    {uc_cls},\n"
                f")\n"
                f"from services.empery_control_center_api.src.integration.{service_name}_client import (\n"
                f"    {client_cls},\n"
                f")\n"
            )
            identity_import = (
                "from services.empery_control_center_api.src.api.routes_identity import ("
            )
            if identity_import in text:
                text = text.replace(
                    identity_import,
                    imports + identity_import,
                    1,
                )
            else:
                text = imports + text

        wire_marker = f"# eic:ui-wire:{service_name}"
        if wire_marker not in text:
            wire = (
                f"    {wire_marker}\n"
                f"    container.register(\n"
                f'        "{service_name}_client",\n'
                f"        lambda c, cfg=config: {client_cls}(\n"
                f"            base_url=cfg.{service_name}_api_base,\n"
                f'            logger=c.resolve("logger"),\n'
                f"        ),\n"
                f"    )\n"
                f"    container.register(\n"
                f'        "ecc_{service_name}_bff_use_cases",\n'
                f"        lambda c: {uc_cls}(c),\n"
                f"    )\n"
            )
            if "wire_eic_gateway(container)" in text:
                text = text.replace(
                    "    wire_eic_gateway(container)",
                    wire + "\n    wire_eic_gateway(container)",
                    1,
                )
            else:
                text = text + "\n" + wire

        mount_marker = f"# eic:ui-mount:{service_name}"
        if mount_marker not in text:
            mount = (
                f"    {mount_marker}\n"
                f"    app.include_router({service_name}_router, prefix=\"/api/v1\")\n"
            )
            identity_mount = (
                '    app.include_router(identity_router, prefix="/api/v1")\n'
            )
            if identity_mount in text:
                text = text.replace(
                    identity_mount,
                    identity_mount + mount,
                    1,
                )
            else:
                text = text + "\n" + mount
        path.write_text(text, encoding="utf-8")
        return str(path)

    def _patch_compose_ecc_env(
        self, service_name: str, env_key: str, default_base: str
    ) -> str:
        """Upsert peer API base — compose.yml may be RO in EIC; fall back to JSON."""
        # Always persist to writable orchestration overlay (U9 evidence).
        dyn = (
            self._root
            / ".cursor"
            / "orchestration"
            / "eic"
            / "dynamic_bff_env.json"
        )
        dyn.parent.mkdir(parents=True, exist_ok=True)
        data: dict[str, str] = {}
        if dyn.is_file():
            try:
                raw = json.loads(dyn.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    data = {str(k): str(v) for k, v in raw.items()}
            except json.JSONDecodeError:
                data = {}
        data[env_key] = default_base
        dyn.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

        path = self._root / "compose.yml"
        if not path.is_file():
            return str(dyn)
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            return str(dyn)
        marker = f"      # eic:ui-env:{service_name}"
        line = f"{marker}\n      {env_key}: ${{{env_key}:-{default_base}}}\n"
        if marker in text or f"{env_key}:" in text:
            return str(dyn)
        anchor = "      AI_CHAT_API_BASE:"
        idx = text.find(anchor)
        if idx >= 0:
            eol = text.find("\n", idx)
            text = text[: eol + 1] + line + text[eol + 1 :]
        else:
            anchor2 = "      ECC_SERVICE_HEALTH_BASES:"
            idx2 = text.find(anchor2)
            if idx2 >= 0:
                eol = text.find("\n", idx2)
                text = text[: eol + 1] + line + text[eol + 1 :]
        try:
            path.write_text(text, encoding="utf-8")
        except OSError:
            # EIC mounts compose.yml :ro — config.py defaults still apply.
            return str(dyn)
        return str(path)


def verify_service_ui(
    workspace: Path, service_name: str
) -> tuple[str, str]:
    """Return (PASSED|FAILED|SKIPPED, details) for service-ui U1–U9 filesystem gates."""
    root = workspace.resolve()
    required, skip_reason = read_ui_required(root, service_name)
    if not required:
        return (
            "SKIPPED",
            f"ui.required=false ({skip_reason})",
        )

    feature = ui_feature_kebab(service_name)
    pascal = ui_pascal(service_name)
    camel_client = ui_camel_client(service_name)
    client_name = _client_filename(camel_client)
    paths_key = ui_paths_key(service_name)
    nav_key = ui_nav_key(service_name)
    missing: list[str] = []

    checks: list[tuple[str, Path]] = [
        (
            "U1 feature page",
            root
            / "apps/empery_control_center/src/features"
            / feature
            / f"{pascal}Page.tsx",
        ),
        (
            "U3 client",
            root / "apps/empery_control_center/src/api" / f"{client_name}.ts",
        ),
        (
            "U4 BFF routes",
            root
            / "services/empery_control_center_api/src/api"
            / f"routes_{service_name}.py",
        ),
    ]
    for label, path in checks:
        if not path.is_file():
            missing.append(f"{label}: {path.relative_to(root)}")

    paths_ts = root / "apps/empery_control_center/src/routes/paths.ts"
    if paths_ts.is_file():
        ptext = paths_ts.read_text(encoding="utf-8")
        if paths_key not in ptext and ui_route(service_name) not in ptext:
            missing.append(f"U5 PATHS missing {paths_key}")
    else:
        missing.append("U5 paths.ts missing")

    routes_tsx = root / "apps/empery_control_center/src/routes/index.tsx"
    if routes_tsx.is_file():
        rtext = routes_tsx.read_text(encoding="utf-8")
        if feature not in rtext and f"{pascal}Page" not in rtext:
            missing.append(f"U5 route missing for {feature}")
    else:
        missing.append("U5 routes/index.tsx missing")

    nav = root / "apps/empery_control_center/src/features/shell/NavPrimary.tsx"
    if nav.is_file():
        ntext = nav.read_text(encoding="utf-8")
        if paths_key not in ntext and f"nav.{nav_key}" not in ntext:
            missing.append(f"U6 NavPrimary missing {paths_key}")
    else:
        missing.append("U6 NavPrimary missing")

    for lang in ("en", "ru"):
        locale = (
            root
            / "apps/empery_control_center/src/i18n/locales"
            / lang
            / "common.json"
        )
        if not locale.is_file():
            missing.append(f"U7 {lang}/common.json missing")
            continue
        try:
            data = json.loads(locale.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            missing.append(f"U7 {lang}/common.json invalid JSON")
            continue
        nav_obj = data.get("nav") or {}
        if nav_key not in nav_obj:
            missing.append(f"U7 nav.{nav_key} missing in {lang}")
        if ui_i18n_ns(service_name) not in data:
            missing.append(f"U7 {ui_i18n_ns(service_name)} page keys missing in {lang}")

    cfg = root / "services/empery_control_center_api/config.py"
    if cfg.is_file():
        ctext = cfg.read_text(encoding="utf-8")
        if f"{service_name}_api_base" not in ctext:
            missing.append(f"U9 config {service_name}_api_base missing")
    else:
        missing.append("U9 ECC config.py missing")

    page = (
        root
        / "apps/empery_control_center/src/features"
        / feature
        / f"{pascal}Page.tsx"
    )
    if page.is_file():
        body = page.read_text(encoding="utf-8").lower()
        if any(p in body for p in _STUB_PHRASES):
            missing.append("U2 stub phrases in page (Coming soon / TODO UI)")

    if missing:
        return "FAILED", "UI gate missing:\n- " + "\n- ".join(missing)
    return (
        "PASSED",
        f"UI OK: feature={feature} route={ui_route(service_name)} "
        f"bff={ui_bff_prefix(service_name)}",
    )


def teardown_ecc_ui_surfaces(workspace: Path, service_name: str) -> dict[str, Any]:
    """Remove ECC product UI + BFF surfaces for one service (Hands teardown)."""
    import re
    import shutil

    root = workspace.resolve()
    name = (service_name or "").strip()
    if not name:
        return {"ok": False, "removed": [], "errors": ["empty service_name"]}
    removed: list[str] = []
    errors: list[str] = []
    feature = ui_feature_kebab(name)
    pascal = ui_pascal(name)
    paths_key = ui_paths_key(name)
    nav_key = ui_nav_key(name)
    camel = ui_camel_client(name)
    client_file = _client_filename(camel)
    ns = ui_i18n_ns(name)

    def _rm(path: Path) -> None:
        try:
            if path.is_file():
                path.unlink()
                removed.append(str(path.relative_to(root)))
            elif path.is_dir():
                shutil.rmtree(path)
                removed.append(str(path.relative_to(root)))
        except OSError as exc:
            errors.append(f"{path}: {exc}")

    def _rewrite(path: Path, new_text: str, old_text: str) -> None:
        if new_text == old_text:
            return
        path.write_text(new_text, encoding="utf-8")
        removed.append(str(path.relative_to(root)))

    def _strip_lines_with_marker(
        text: str, *, marker: str, consume_following: int | None = None
    ) -> str:
        """Drop marker line and optionally N following lines, or until blank/`# eic`."""
        lines = text.splitlines(keepends=True)
        out: list[str] = []
        i = 0
        while i < len(lines):
            if marker in lines[i]:
                i += 1
                if consume_following is not None:
                    i += consume_following
                else:
                    while i < len(lines):
                        line = lines[i]
                        stripped = line.strip()
                        if not stripped:
                            i += 1
                            break
                        if stripped.startswith("# eic:") or stripped.startswith(
                            "/* eic:"
                        ):
                            break
                        if stripped.startswith("// eic:"):
                            break
                        i += 1
                continue
            out.append(lines[i])
            i += 1
        return "".join(out)

    # Dedicated BFF / feature files
    for rel in (
        f"services/empery_control_center_api/src/api/routes_{name}.py",
        f"services/empery_control_center_api/src/core/{name}_bff_use_cases.py",
        f"services/empery_control_center_api/src/integration/{name}_client.py",
        f"services/empery_control_center_api/src/data/{name}_schemas.py",
        f"apps/empery_control_center/src/api/{client_file}.ts",
        f"apps/empery_control_center/src/features/{feature}",
    ):
        _rm(root / rel)

    # api/index.ts export block
    api_index = root / "apps/empery_control_center/src/api/index.ts"
    if api_index.is_file():
        old = api_index.read_text(encoding="utf-8")
        new = _strip_lines_with_marker(old, marker=f"// eic:ui:{client_file}")
        # Also drop any leftover export of this client
        new = re.sub(
            rf'^export \{{ {re.escape(camel)} \}} from "\./{re.escape(client_file)}";\n?',
            "",
            new,
            flags=re.M,
        )
        _rewrite(api_index, new, old)

    paths_ts = root / "apps/empery_control_center/src/routes/paths.ts"
    if paths_ts.is_file():
        old = paths_ts.read_text(encoding="utf-8")
        new = _strip_lines_with_marker(
            old, marker=f"// eic:ui:{name}", consume_following=1
        )
        new = re.sub(
            rf'^\s*{re.escape(paths_key)}:\s*"[^"]*",\s*\n',
            "",
            new,
            flags=re.M,
        )
        _rewrite(paths_ts, new, old)

    routes_tsx = root / "apps/empery_control_center/src/routes/index.tsx"
    if routes_tsx.is_file():
        old = routes_tsx.read_text(encoding="utf-8")
        new = old
        # Import line
        new = re.sub(
            rf'/\* eic:ui:{re.escape(name)} \*/\nimport \{{ {re.escape(pascal)}Page \}} from "@/features/{re.escape(feature)}";\n?',
            "",
            new,
        )
        # Route element
        new = re.sub(
            rf'\s*/\* eic:ui:{re.escape(name)} \*/\n\s*<Route path="ops/{re.escape(feature)}" '
            rf"element=\{{<{re.escape(pascal)}Page />\}} />\n?",
            "\n",
            new,
        )
        _rewrite(routes_tsx, new, old)

    nav = root / "apps/empery_control_center/src/features/shell/NavPrimary.tsx"
    if nav.is_file():
        old = nav.read_text(encoding="utf-8")
        new = re.sub(
            rf'\s*/\* eic:ui:{re.escape(name)} \*/\n\s*\{{ to: PATHS\.{re.escape(paths_key)}, '
            rf'label: t\("nav\.{re.escape(nav_key)}"\), icon: [^}}]+\}},\n?',
            "\n",
            old,
        )
        _rewrite(nav, new, old)

    for lang in ("en", "ru"):
        locale = (
            root
            / "apps/empery_control_center/src/i18n/locales"
            / lang
            / "common.json"
        )
        if not locale.is_file():
            continue
        try:
            data = json.loads(locale.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            errors.append(f"i18n {lang}: invalid JSON")
            continue
        changed = False
        nav_obj = data.get("nav")
        if isinstance(nav_obj, dict) and nav_key in nav_obj:
            nav_obj.pop(nav_key, None)
            changed = True
        if ns in data:
            data.pop(ns, None)
            changed = True
        if changed:
            locale.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            removed.append(str(locale.relative_to(root)))

    main_py = root / "services/empery_control_center_api/src/api/main.py"
    if main_py.is_file():
        old = main_py.read_text(encoding="utf-8")
        # Import block is always marker + 3 from-imports (9 lines). Do NOT
        # consume-until-blank: the last Hands import sits flush against
        # platform imports (routes_identity / ServiceHealthProber / …).
        new = _strip_lines_with_marker(
            old, marker=f"# eic:ui-import:{name}", consume_following=9
        )
        new = _strip_lines_with_marker(new, marker=f"# eic:ui-wire:{name}")
        new = _strip_lines_with_marker(
            new, marker=f"# eic:ui-mount:{name}", consume_following=1
        )
        _rewrite(main_py, new, old)

    cfg = root / "services/empery_control_center_api/config.py"
    if cfg.is_file():
        old = cfg.read_text(encoding="utf-8")
        # Field block is marker + 4 lines (assignment / default / description / )).
        # Avoid Field([...]*?), — nested description=(...), matches too far.
        new = _strip_lines_with_marker(
            old, marker=f"# eic:ui-field:{name}", consume_following=4
        )
        # Cfg block: marker + _env / .strip / .rstrip
        new = _strip_lines_with_marker(
            new, marker=f"# eic:ui-cfg:{name}", consume_following=3
        )
        # Orphan chained strip left by older partial teardowns
        new = re.sub(
            r"(rstrip\(\"/\"\),)\n(\s*\.strip\(\)\n\s*\.rstrip\(\"/\"\),)+",
            r"\1\n",
            new,
        )
        _rewrite(cfg, new, old)

    return {"ok": not errors, "service_name": name, "removed": removed, "errors": errors}


def _client_filename(camel_client: str) -> str:
    # bloknotClient -> bloknotClient (file bloknotClient.ts)
    return camel_client[0].lower() + camel_client[1:] if camel_client else "client"


def _page_tsx(
    service_name: str, pascal: str, camel_client: str, i18n_ns: str
) -> str:
    hook = f"use{pascal}Session"
    return f'''import {{ FormEvent, useState }} from "react";
import {{ useTranslation }} from "react-i18next";
import {{ Button }} from "@/components/Button";
import {{ ErrorBanner }} from "@/components/ErrorBanner";
import {{ Panel }} from "@/components/Panel";
import {{ SkeletonPulse }} from "@/components/SkeletonPulse";
import {{ RequireAuth }} from "@/features/auth/RequireAuth";
import {{ {hook} }} from "./{hook}";

function {pascal}PageInner() {{
  const {{ t }} = useTranslation();
  const session = {hook}();
  const [name, setName] = useState("");

  async function onCreate(event: FormEvent) {{
    event.preventDefault();
    const ok = await session.createItem(name);
    if (ok) setName("");
  }}

  return (
    <div className="flex h-full min-h-0 flex-col gap-px bg-line">
      <Panel
        title={{t("{i18n_ns}.title")}}
        className="min-h-0 w-full rounded-none border-0 bg-field"
        flush
      >
        <div className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
          {{session.error ? (
            <ErrorBanner
              message={{session.error}}
              onDismiss={{() => void session.reload()}}
            />
          ) : null}}
          <form
            onSubmit={{(e) => void onCreate(e)}}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-display text-xs text-ink-muted">
                {{t("{i18n_ns}.namePlaceholder")}}
              </span>
              <input
                value={{name}}
                onChange={{(e) => setName(e.target.value)}}
                className="rounded-md border border-line bg-field px-2.5 py-1.5 font-body text-sm text-ink outline-none focus:border-signal"
                maxLength={{200}}
                disabled={{session.creating}}
              />
            </label>
            <Button type="submit" disabled={{session.creating || !name.trim()}}>
              {{t("{i18n_ns}.create")}}
            </Button>
          </form>
          <div>
            <h3 className="mb-2 font-display text-xs font-semibold tracking-wide text-ink-muted">
              {{t("{i18n_ns}.listTitle")}}
            </h3>
            {{session.loading ? (
              <SkeletonPulse rows={{4}} />
            ) : session.items.length === 0 ? (
              <p className="font-body text-sm text-ink-muted">
                {{t("{i18n_ns}.empty")}}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {{session.items.map((item) => (
                  <li
                    key={{item.id}}
                    className="min-w-0 break-words rounded-md border border-line bg-panel px-3 py-2"
                  >
                    <div className="font-body text-sm text-ink">{{item.name}}</div>
                    <div className="font-mono text-[11px] text-ink-muted">
                      {{item.id}}
                    </div>
                  </li>
                ))}}
              </ul>
            )}}
          </div>
        </div>
      </Panel>
    </div>
  );
}}

export function {pascal}Page() {{
  return (
    <RequireAuth>
      <{pascal}PageInner />
    </RequireAuth>
  );
}}
'''


def _hook_ts(
    service_name: str, pascal: str, camel_client: str, i18n_ns: str
) -> str:
    client_file = _client_filename(camel_client)
    return f'''import {{ useCallback, useEffect, useState }} from "react";
import {{ useTranslation }} from "react-i18next";
import {{ EccApiError }} from "@/api/http";
import {{
  {camel_client},
  type DomainItem,
}} from "@/api/{client_file}";

export function use{pascal}Session() {{
  const {{ t }} = useTranslation();
  const [items, setItems] = useState<DomainItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {{
    setLoading(true);
    setError(null);
    try {{
      const res = await {camel_client}.listItems();
      setItems(res.items);
    }} catch (err) {{
      const msg =
        err instanceof EccApiError
          ? err.message
          : t("{i18n_ns}.errors.load");
      setError(msg);
    }} finally {{
      setLoading(false);
    }}
  }}, [t]);

  useEffect(() => {{
    void reload();
  }}, [reload]);

  async function createItem(name: string): Promise<boolean> {{
    const trimmed = name.trim();
    if (!trimmed) return false;
    setCreating(true);
    setError(null);
    try {{
      await {camel_client}.createItem(trimmed);
      await reload();
      return true;
    }} catch (err) {{
      const msg =
        err instanceof EccApiError
          ? err.message
          : t("{i18n_ns}.errors.create");
      setError(msg);
      return false;
    }} finally {{
      setCreating(false);
    }}
  }}

  return {{ items, loading, creating, error, reload, createItem }};
}}
'''


def _client_ts(camel_client: str, bff_slug: str) -> str:
    return f'''import {{ eccFetch }} from "@/api/http";

export interface DomainItem {{
  id: string;
  name: string;
  attributes?: Record<string, unknown>;
  created_at: string;
}}

export interface DomainItemListResponse {{
  items: DomainItem[];
  count: number;
}}

export const {camel_client} = {{
  listItems(limit?: number): Promise<DomainItemListResponse> {{
    return eccFetch<DomainItemListResponse>("/{bff_slug}/items", {{
      query: {{ limit }},
    }});
  }},

  createItem(
    name: string,
    attributes?: Record<string, unknown>,
  ): Promise<DomainItem> {{
    return eccFetch<DomainItem>("/{bff_slug}/items", {{
      method: "POST",
      body: {{ name, attributes: attributes ?? {{}} }},
    }});
  }},
}};
'''


def _bff_schemas(service_name: str) -> str:
    return f'''"""Pydantic contracts for ECC → {service_name} BFF."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EccDomainItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    attributes: dict[str, Any] = Field(default_factory=dict)


class EccDomainItemView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    name: str
    attributes: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class EccDomainItemListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    items: list[EccDomainItemView]
    count: int
'''


def _bff_client(service_name: str, route_slug: str, env_key: str, default_base: str) -> str:
    pascal = ui_pascal(service_name)
    err = service_name.upper()[:12]
    return f'''"""HTTP adapter for {service_name} — no peer package imports."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_control_center_api.src.integration.identity_client import (
    strip_bearer_token,
)


def _unavailable(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="{err}_UNAVAILABLE",
            message="{service_name} service is not available",
            details={{"reason": reason}},
        ),
        http_status=503,
    )


class {pascal}Client:
    def __init__(
        self,
        *,
        base_url: str,
        logger: logging.Logger,
        timeout_seconds: float = 10.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._logger = logger
        self._timeout_seconds = timeout_seconds

    async def list_items(
        self,
        authorization: str | None,
        *,
        limit: int = 50,
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{{self._base_url}}/api/v1/{route_slug}"
        return await self._json("GET", url, token, params={{"limit": limit}})

    async def create_item(
        self,
        authorization: str | None,
        *,
        name: str,
        attributes: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{{self._base_url}}/api/v1/{route_slug}"
        return await self._json(
            "POST",
            url,
            token,
            json={{"name": name, "attributes": attributes or {{}}}},
        )

    async def _json(
        self,
        method: str,
        url: str,
        token: str | None,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers: dict[str, str] = {{}}
        if token:
            headers["Authorization"] = f"Bearer {{token}}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.request(
                    method, url, headers=headers, params=params, json=json
                )
        except httpx.HTTPError as exc:
            raise _unavailable(f"{service_name} HTTP error: {{exc}}") from exc
        if response.status_code >= 400:
            try:
                body = response.json()
            except Exception:  # noqa: BLE001
                body = {{"message": response.text}}
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code=body.get("error_code", "ECC_PEER_PROXY_FAILED"),
                    message=body.get("message", "{service_name} proxy failed"),
                    details=body.get("details") or {{"status": response.status_code}},
                ),
                http_status=response.status_code,
            )
        return response.json()
'''


def _bff_use_cases(service_name: str) -> str:
    pascal = ui_pascal(service_name)
    return f'''"""ECC BFF use cases for {service_name}."""

from __future__ import annotations

from typing import Any

from core.container import ServiceContainer
from services.empery_control_center_api.src.data.{service_name}_schemas import (
    EccDomainItemCreate,
    EccDomainItemListResponse,
    EccDomainItemView,
)


class Ecc{pascal}BffUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _client(self) -> Any:
        return self._container.resolve("{service_name}_client")

    async def list_items(
        self,
        authorization: str | None,
        *,
        limit: int = 50,
    ) -> EccDomainItemListResponse:
        raw = await self._client().list_items(authorization, limit=limit)
        return EccDomainItemListResponse.model_validate(raw)

    async def create_item(
        self,
        authorization: str | None,
        payload: EccDomainItemCreate,
    ) -> EccDomainItemView:
        raw = await self._client().create_item(
            authorization,
            name=payload.name,
            attributes=payload.attributes,
        )
        return EccDomainItemView.model_validate(raw)
'''


def _bff_routes(service_name: str, bff_slug: str, route_slug: str) -> str:
    pascal = ui_pascal(service_name)
    return f'''"""ECC BFF routes — proxy list/create to {service_name} ({route_slug})."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.empery_control_center_api.src.core.{service_name}_bff_use_cases import (
    Ecc{pascal}BffUseCases,
)
from services.empery_control_center_api.src.data.{service_name}_schemas import (
    EccDomainItemCreate,
    EccDomainItemListResponse,
    EccDomainItemView,
)

router = APIRouter(prefix="/{bff_slug}", tags=["{bff_slug}"])


def _uc(request: Request) -> Ecc{pascal}BffUseCases:
    return request.app.state.container.resolve("ecc_{service_name}_bff_use_cases")


@router.get("/items", response_model=EccDomainItemListResponse)
async def list_items(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> EccDomainItemListResponse:
    return await _uc(request).list_items(
        request.headers.get("Authorization"),
        limit=limit,
    )


@router.post("/items", response_model=EccDomainItemView, status_code=201)
async def create_item(
    payload: EccDomainItemCreate,
    request: Request,
) -> EccDomainItemView:
    return await _uc(request).create_item(
        request.headers.get("Authorization"),
        payload,
    )
'''
