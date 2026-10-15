"""Deterministic desktop host scaffold — catalog entry + window mount stub."""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.logging import log_event

_SERVICE_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{1,62}$")
_REGISTRY_MARKER = "// eic:desktop-mount-registry"
# Timestamped factory smoke debris — catalog under lab/, not default Desktop launch.
_SMOKE_LAB_SERVICE_RE = re.compile(
    r"^(p4_golden_|p8_notes_|p15_refuse_)\d"
)


def is_smoke_lab_service(service_name: str) -> bool:
    """True for p4_golden_* / p8_notes_* / p15_refuse_* smoke capsules."""
    return bool(_SMOKE_LAB_SERVICE_RE.match((service_name or "").strip()))


def _title(service_name: str) -> str:
    return " ".join(part.capitalize() for part in service_name.split("_"))


def _pascal(service_name: str) -> str:
    return "".join(part.capitalize() for part in service_name.split("_"))


def verify_service_desktop(
    workspace: Path,
    service_name: str,
    *,
    ui_profile: str | None = None,
) -> tuple[str, str]:
    """Return (PASSED|FAILED|SKIPPED, details) for desktop host mount + catalog."""
    from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
        read_ui_required,
        ui_pascal,
    )

    root = workspace.resolve()
    required, skip_reason = read_ui_required(root, service_name)
    mount = (
        root
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service_name}.tsx"
    )
    # Desktop-first peers (site_studio) may set ui.required=false for ECC while
    # still shipping D1–D3. Only skip when there is no mount at all.
    if not required and not mount.is_file():
        return "SKIPPED", f"desktop skipped — ui.required=false ({skip_reason})"

    pascal = ui_pascal(service_name)
    missing: list[str] = []

    if not mount.is_file():
        missing.append(f"D1 mount: {mount.relative_to(root)}")

    registry = (
        root / "apps" / "empery_desktop" / "src" / "shell" / "mounts" / "registry.ts"
    )
    if not registry.is_file():
        missing.append("D2 mounts/registry.ts missing")
    else:
        text = registry.read_text(encoding="utf-8")
        if f"{service_name}: {pascal}Mount" not in text and f"{service_name}:" not in text:
            missing.append(f"D2 registry entry missing for {service_name}")
        if f'from "./{service_name}"' not in text:
            missing.append(f"D2 registry import missing for {service_name}")

    catalog = (
        root
        / ".cursor"
        / "orchestration"
        / "eic"
        / "desktop_catalog"
        / f"{service_name}.json"
    )
    lab_catalog = (
        root
        / ".cursor"
        / "orchestration"
        / "eic"
        / "desktop_catalog"
        / "lab"
        / f"{service_name}.json"
    )
    # P10: smoke lab capsules keep D3 under lab/ (not launch catalog).
    if not catalog.is_file() and lab_catalog.is_file() and is_smoke_lab_service(
        service_name
    ):
        catalog = lab_catalog
    if not catalog.is_file():
        missing.append(f"D3 catalog overlay: {catalog.relative_to(root)}")
    else:
        try:
            data = json.loads(catalog.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            missing.append(f"D3 catalog invalid JSON: {catalog.name}")
        else:
            if data.get("app_id") != service_name:
                missing.append("D3 catalog app_id mismatch")
            if data.get("app_component") != service_name:
                missing.append("D3 catalog app_component mismatch")

    if missing:
        return "FAILED", "Desktop gate missing:\n- " + "\n- ".join(missing)

    if mount.is_file():
        mount_text = mount.read_text(encoding="utf-8")
        if "Scaffolded desktop mount" in mount_text:
            return (
                "FAILED",
                "Desktop gate missing:\n- D1 mount is scaffold stub — "
                "replace with real UI or profile mount",
            )
        quality = _d1_content_quality(mount_text, ui_profile=ui_profile)
        if quality:
            return "FAILED", f"Desktop D1 content quality:\n- {quality}"

    return (
        "PASSED",
        f"Desktop OK: mount={service_name}.tsx catalog={service_name}.json",
    )


def _infer_mount_profile(mount_text: str, ui_profile: str | None) -> str:
    if ui_profile and ui_profile.strip():
        return ui_profile.strip().lower()
    lower = mount_text.lower()
    if "/api/v1/messages" in lower:
        return "companion_chat"
    if "/api/v1/preview" in lower:
        return "site_studio"
    if "/api/v1/presentations" in lower:
        return "presentation_ai"
    if "/api/v1/videos" in lower and "/api/v1/generate" in lower:
        return "video_studio"
    if "/api/v1/images" in lower and "/api/v1/generate" in lower:
        return "image_studio"
    if "/api/v1/audio" in lower and "/api/v1/generate" in lower:
        return "music_forge"
    if "/api/v1/jobs" in lower or "/api/v1/generate" in lower:
        return "studio_job"
    if "/api/v1/health" in lower or "/health" in lower:
        return "generic"
    return "generic"


def _d1_content_quality(mount_text: str, *, ui_profile: str | None) -> str | None:
    """Fail thin/health-only mounts for product profiles."""
    profile = _infer_mount_profile(mount_text, ui_profile)
    if profile in {"generic", "health_probe"}:
        if "peerApiBase" not in mount_text and "peer_api" not in mount_text.lower():
            return "generic mount must use peerApiBase (or document probe skip)"
        return None
    if profile in {"companion_chat", "peer_http"}:
        if "peerApiBase" not in mount_text:
            return "companion_chat mount must import peerApiBase"
        if "/api/v1/messages" not in mount_text:
            return "companion_chat mount must call /api/v1/messages"
        # Health-only companion is not acceptable
        if "/api/v1/messages" not in mount_text and "/health" in mount_text:
            return "companion_chat must not be health-only"
        return None
    if profile == "studio_job":
        if "peerApiBase" not in mount_text:
            return "studio_job mount must import peerApiBase"
        has_jobs = "/api/v1/jobs" in mount_text or "/api/v1/generate" in mount_text
        if not has_jobs:
            return "studio_job mount must call /api/v1/jobs or /api/v1/generate"
        # Fail pure health probe disguised as studio
        if has_jobs is False and "/health" in mount_text:
            return "studio_job must not be health-only"
        return None
    if profile == "site_studio":
        if "peerApiBase" not in mount_text:
            return "site_studio mount must import peerApiBase"
        if "/api/v1/preview" not in mount_text:
            return "site_studio mount must call /api/v1/preview"
        return None
    if profile == "presentation_ai":
        if "peerApiBase" not in mount_text:
            return "presentation_ai mount must import peerApiBase"
        if "/api/v1/presentations" not in mount_text:
            return "presentation_ai mount must call /api/v1/presentations"
        if "/api/v1/style/chat" not in mount_text:
            return "presentation_ai mount must call /api/v1/style/chat"
        return None
    if profile == "image_studio":
        if "peerApiBase" not in mount_text:
            return "image_studio mount must import peerApiBase"
        if "/api/v1/generate" not in mount_text:
            return "image_studio mount must call /api/v1/generate"
        if "/api/v1/jobs" not in mount_text:
            return "image_studio mount must poll /api/v1/jobs"
        return None
    if profile == "video_studio":
        if "peerApiBase" not in mount_text:
            return "video_studio mount must import peerApiBase"
        if "/api/v1/generate" not in mount_text:
            return "video_studio mount must call /api/v1/generate"
        if "/api/v1/jobs" not in mount_text:
            return "video_studio mount must poll /api/v1/jobs"
        if "/api/v1/videos" not in mount_text:
            return "video_studio mount must serve /api/v1/videos"
        return None
    if profile == "music_forge":
        if "peerApiBase" not in mount_text:
            return "music_forge mount must import peerApiBase"
        if "/api/v1/generate" not in mount_text:
            return "music_forge mount must call /api/v1/generate"
        if "/api/v1/jobs" not in mount_text:
            return "music_forge mount must poll /api/v1/jobs"
        if "/api/v1/audio" not in mount_text:
            return "music_forge mount must serve /api/v1/audio"
        return None
    if profile in {"ops_dashboard", "task_board", "research_report"}:
        if "peerApiBase" not in mount_text:
            return f"{profile} mount must import peerApiBase"
        if profile == "task_board" and "/api/v1/tasks" not in mount_text:
            return "task_board mount must call /api/v1/tasks"
        if profile == "ops_dashboard" and "/api/v1/metrics" not in mount_text:
            return "ops_dashboard mount must call /api/v1/metrics"
        if profile == "research_report" and "/api/v1/reports" not in mount_text:
            return "research_report mount must call /api/v1/reports"
        return None
    # shell_host / editor_local / marketing — require peerApiBase at minimum
    if "peerApiBase" not in mount_text and profile not in {"shell_host"}:
        return f"{profile} mount should use peerApiBase for live peer calls"
    return None


class ServiceDesktopScaffoldAction:
    """Wire a new service into empery_desktop + desktop_shell catalog."""

    def __init__(self, workspace_root: Path, logger: logging.Logger | None = None) -> None:
        self._root = workspace_root.resolve()
        self._logger = logger or logging.getLogger("eic.scaffold.desktop")

    def already_has_desktop(self, service_name: str) -> bool:
        mount = (
            self._root
            / "apps"
            / "empery_desktop"
            / "src"
            / "shell"
            / "mounts"
            / f"{service_name}.tsx"
        )
        catalog = (
            self._root
            / ".cursor"
            / "orchestration"
            / "eic"
            / "desktop_catalog"
            / f"{service_name}.json"
        )
        lab_catalog = (
            self._root
            / ".cursor"
            / "orchestration"
            / "eic"
            / "desktop_catalog"
            / "lab"
            / f"{service_name}.json"
        )
        return mount.is_file() and (catalog.is_file() or lab_catalog.is_file())

    def scaffold_desktop(
        self,
        service_name: str,
        *,
        domain_hint: str | None = None,
        title: str | None = None,
        description: str | None = None,
        register_live: bool = True,
        ui_profile: str | None = None,
        peer_port: int | None = None,
        force: bool = False,
    ) -> dict[str, Any]:
        if not _SERVICE_NAME_RE.match(service_name):
            raise ValueError(f"Invalid service_name: {service_name}")

        written: list[str] = []
        app_title = title or _title(domain_hint or service_name)
        # Prefer short launch titles (avoid dumping full intention into icon label).
        if len(app_title) > 40:
            app_title = _title(service_name)
        app_desc = description or f"Desktop mount for {service_name}"
        pascal = _pascal(service_name)
        profile = (ui_profile or "generic").strip().lower()
        lab_only = (
            profile in {"health_probe"}
            or service_name in {
                "recipe_probe_svc",
                "unnamed_service",
            }
            or is_smoke_lab_service(service_name)
        )

        mount_path = self._write_mount(
            service_name,
            pascal,
            app_title,
            ui_profile=profile,
            peer_port=peer_port,
            force=force,
        )
        written.append(str(mount_path))
        written.append(self._patch_registry(service_name, pascal))
        catalog_path = self._write_catalog_json(
            service_name,
            title=app_title,
            description=app_desc,
            lab_only=lab_only,
        )
        written.append(str(catalog_path))

        live: dict[str, Any] | None = None
        if register_live and not lab_only:
            live = self._register_live(
                service_name,
                title=app_title,
                description=app_desc,
            )

        log_event(
            self._logger,
            event="eic.scaffold.desktop.completed",
            message="Desktop host mount + catalog written",
            service_name=service_name,
            files=len(written),
            ui_profile=profile,
            live_registered=bool(live and live.get("ok")),
        )
        return {
            "service_name": service_name,
            "skipped": False,
            "written": written,
            "app_component": service_name,
            "catalog_path": str(catalog_path),
            "ui_profile": profile,
            "live": live,
        }

    def _mounts_dir(self) -> Path:
        path = self._root / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _write_mount(
        self,
        service_name: str,
        pascal: str,
        title: str,
        *,
        ui_profile: str = "generic",
        peer_port: int | None = None,
        force: bool = False,
    ) -> Path:
        path = self._mounts_dir() / f"{service_name}.tsx"
        if path.is_file() and not force:
            return path
        # Ensure registry skeleton exists in tmp workspaces
        self._ensure_desktop_skeleton()
        port = peer_port or 8035
        if ui_profile in {"companion_chat", "peer_http"}:
            content = _companion_mount_tsx(service_name, pascal, title, port)
        elif ui_profile == "studio_job":
            content = _studio_mount_tsx(service_name, pascal, title, port)
        elif ui_profile == "site_studio":
            content = _site_studio_mount_tsx(service_name, pascal, title, port)
        elif ui_profile == "presentation_ai":
            content = _presentation_ai_mount_tsx(service_name, pascal, title, port)
        elif ui_profile == "image_studio":
            content = _image_studio_mount_tsx(service_name, pascal, title, port)
        elif ui_profile == "video_studio":
            content = _video_studio_mount_tsx(service_name, pascal, title, port)
        elif ui_profile == "music_forge":
            content = _music_forge_mount_tsx(service_name, pascal, title, port)
        elif ui_profile == "task_board":
            content = _task_board_mount_tsx(service_name, pascal, title, port)
        elif ui_profile == "ops_dashboard":
            content = _ops_dashboard_mount_tsx(service_name, pascal, title, port)
        elif ui_profile == "research_report":
            content = _research_report_mount_tsx(service_name, pascal, title, port)
        else:
            content = _generic_mount_tsx(service_name, pascal, title, port)
        path.write_text(content, encoding="utf-8")
        return path

    def _ensure_desktop_skeleton(self) -> None:
        mounts = self._mounts_dir()
        registry = mounts / "registry.ts"
        if not registry.is_file():
            registry.write_text(
                'import type { ComponentType } from "react";\n'
                'import type { WindowState } from "@/shell/types";\n'
                "\n"
                "export type MountProps = { win: WindowState };\n"
                "export type AppMount = ComponentType<MountProps>;\n"
                "\n"
                "export const APP_MOUNTS: Record<string, AppMount> = {\n"
                f"  {_REGISTRY_MARKER}\n"
                "};\n",
                encoding="utf-8",
            )
        app_content = (
            self._root / "apps" / "empery_desktop" / "src" / "shell" / "appContent.tsx"
        )
        if not app_content.is_file():
            app_content.parent.mkdir(parents=True, exist_ok=True)
            app_content.write_text(
                'import type { WindowState } from "./types";\n'
                'import { APP_MOUNTS } from "./mounts/registry";\n'
                "export function AppWindowContent({ win }: { win: WindowState }) {\n"
                "  const Mount = win.appComponent ? APP_MOUNTS[win.appComponent] : undefined;\n"
                "  if (Mount) return <Mount win={win} />;\n"
                "  return <div>{win.title}</div>;\n"
                "}\n",
                encoding="utf-8",
            )
        types = self._root / "apps" / "empery_desktop" / "src" / "shell" / "types.ts"
        if not types.is_file():
            types.write_text(
                "export type WindowState = {\n"
                "  id: string;\n"
                "  title: string;\n"
                '  type: "folder" | "app";\n'
                "  appComponent?: string;\n"
                "  itemId: string;\n"
                "  position: { x: number; y: number };\n"
                "  size: { width: number; height: number };\n"
                "  isMinimized: boolean;\n"
                "  isMaximized: boolean;\n"
                "  zIndex: number;\n"
                "};\n",
                encoding="utf-8",
            )

    def _patch_registry(self, service_name: str, pascal: str) -> str:
        self._ensure_desktop_skeleton()
        path = self._mounts_dir() / "registry.ts"
        text = path.read_text(encoding="utf-8")
        import_line = (
            f'import {{ {pascal}Mount }} from "./{service_name}";\n'
        )
        entry_line = f"  {service_name}: {pascal}Mount,\n"

        if f'from "./{service_name}"' not in text:
            # Insert import after the last import block
            lines = text.splitlines(keepends=True)
            insert_at = 0
            for i, line in enumerate(lines):
                if line.startswith("import "):
                    insert_at = i + 1
            lines.insert(insert_at, import_line)
            text = "".join(lines)

        if f"{service_name}: {pascal}Mount" not in text:
            if _REGISTRY_MARKER in text:
                text = text.replace(
                    _REGISTRY_MARKER,
                    f"{entry_line}  {_REGISTRY_MARKER}",
                    1,
                )
            elif "export const APP_MOUNTS" in text and "};" in text:
                text = text.replace(
                    "};\n",
                    f"{entry_line}}};\n",
                    1,
                )
            else:
                text += (
                    "\nexport const APP_MOUNTS = {\n"
                    f"{entry_line}"
                    f"  {_REGISTRY_MARKER}\n"
                    "};\n"
                )

        path.write_text(text, encoding="utf-8")
        return str(path)

    def _write_catalog_json(
        self,
        service_name: str,
        *,
        title: str,
        description: str,
        lab_only: bool = False,
    ) -> Path:
        catalog_dir = (
            self._root
            / ".cursor"
            / "orchestration"
            / "eic"
            / "desktop_catalog"
        )
        if lab_only:
            catalog_dir = catalog_dir / "lab"
        catalog_dir.mkdir(parents=True, exist_ok=True)
        # Remove stale launch overlay if promoting to lab (or vice versa).
        launch_path = (
            self._root
            / ".cursor"
            / "orchestration"
            / "eic"
            / "desktop_catalog"
            / f"{service_name}.json"
        )
        lab_path = (
            self._root
            / ".cursor"
            / "orchestration"
            / "eic"
            / "desktop_catalog"
            / "lab"
            / f"{service_name}.json"
        )
        path = lab_path if lab_only else launch_path
        other = launch_path if lab_only else lab_path
        if other.is_file() and other != path:
            other.unlink()
        payload = {
            "app_id": service_name,
            "title": title,
            "app_component": service_name,
            "category": "lab" if lab_only else "apps",
            "description": description,
            "icon": None,
            "enabled": not lab_only,
            "user_created": True,
            "created_by": "genesis",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        return path

    def _register_live(
        self,
        service_name: str,
        *,
        title: str,
        description: str,
    ) -> dict[str, Any]:
        """Best-effort POST to running desktop_shell (no failure if down)."""
        import os

        base = (
            os.environ.get("DESKTOP_SHELL_API_BASE")
            or os.environ.get("EIC_DESKTOP_SHELL_API_BASE")
            or "http://desktop_shell:8020"
        ).rstrip("/")
        url = f"{base}/api/v1/catalog/apps"
        body = json.dumps(
            {
                "app_id": service_name,
                "title": title,
                "app_component": service_name,
                "category": "apps",
                "description": description,
                "user_created": True,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                raw = resp.read().decode("utf-8")
                return {"ok": True, "status": resp.status, "body": raw[:500]}
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return {"ok": False, "error": str(exc), "url": url}


def refresh_desktop_ui(
    *,
    deploy_agent_url: str,
    logger: logging.Logger,
    timeout_s: float = 600.0,
    required: bool = False,
) -> dict[str, Any]:
    """Recreate empery_desktop_ui container after D1–D3 scaffold (nginx baked dist)."""
    from services.empery_intelligence_core.src.integration.deploy_agent_client import (
        DeployAgentClient,
    )

    if not deploy_agent_url.strip():
        log_event(
            logger,
            event="eic.scaffold.desktop.refresh_skipped",
            message="Desktop UI refresh skipped — deploy agent URL unset",
            level=logging.ERROR if required else logging.WARNING,
        )
        return {"ok": False, "skipped": True, "reason": "deploy_agent_url unset"}

    client = DeployAgentClient(deploy_agent_url, logger, timeout_s=timeout_s)
    if not client.configured:
        log_event(
            logger,
            event="eic.scaffold.desktop.refresh_skipped",
            message="Desktop UI refresh skipped — deploy agent not configured",
            level=logging.ERROR if required else logging.WARNING,
        )
        return {"ok": False, "skipped": True, "reason": "deploy_agent_unconfigured"}

    result = client.deploy("empery_desktop_ui", action="rebuild")
    if result.get("ok"):
        log_event(
            logger,
            event="eic.scaffold.desktop.refresh_ok",
            message=(
                "Desktop UI rebuilt after scaffold "
                "(build + up --force-recreate --no-deps)"
            ),
            service_name="empery_desktop_ui",
        )
    else:
        log_event(
            logger,
            event="eic.scaffold.desktop.refresh_failed",
            message="Desktop UI refresh failed",
            service_name="empery_desktop_ui",
            error=str(result.get("error") or result.get("output") or "unknown")[:400],
            level=logging.ERROR if required else logging.WARNING,
        )
    return result


def refresh_ecc_ui(
    *,
    deploy_agent_url: str,
    logger: logging.Logger,
    timeout_s: float = 600.0,
    required: bool = False,
) -> dict[str, Any]:
    """Recreate empery_control_center_ui after ECC feature scaffold (baked Vite dist)."""
    from services.empery_intelligence_core.src.integration.deploy_agent_client import (
        DeployAgentClient,
    )

    if not deploy_agent_url.strip():
        log_event(
            logger,
            event="eic.scaffold.ecc_ui.refresh_skipped",
            message="ECC UI refresh skipped — deploy agent URL unset",
            level=logging.ERROR if required else logging.WARNING,
        )
        return {"ok": False, "skipped": True, "reason": "deploy_agent_url unset"}

    client = DeployAgentClient(deploy_agent_url, logger, timeout_s=timeout_s)
    if not client.configured:
        log_event(
            logger,
            event="eic.scaffold.ecc_ui.refresh_skipped",
            message="ECC UI refresh skipped — deploy agent not configured",
            level=logging.ERROR if required else logging.WARNING,
        )
        return {"ok": False, "skipped": True, "reason": "deploy_agent_unconfigured"}

    result = client.deploy("empery_control_center_ui", action="rebuild")
    if result.get("ok"):
        log_event(
            logger,
            event="eic.scaffold.ecc_ui.refresh_ok",
            message=(
                "ECC UI rebuilt after scaffold "
                "(build + up --force-recreate --no-deps)"
            ),
            service_name="empery_control_center_ui",
        )
    else:
        log_event(
            logger,
            event="eic.scaffold.ecc_ui.refresh_failed",
            message="ECC UI refresh failed",
            service_name="empery_control_center_ui",
            error=str(result.get("error") or result.get("output") or "unknown")[:400],
            level=logging.ERROR if required else logging.WARNING,
        )
    return result


def refresh_ecc_api(
    *,
    deploy_agent_url: str,
    logger: logging.Logger,
    timeout_s: float = 300.0,
    required: bool = False,
    ecc_api_base: str | None = None,
) -> dict[str, Any]:
    """Load stamped BFF routes into live ECC API.

    Prefer in-process hot reload (``POST /api/v1/ops/reload-bff-routes``) so
    WebSocket clients stay connected. Fall back to deploy_agent container
    restart only when hot reload fails.
    """
    import json
    import os
    import urllib.request

    from services.empery_intelligence_core.src.integration.deploy_agent_client import (
        DeployAgentClient,
    )

    base = (ecc_api_base or "").strip().rstrip("/")
    if not base:
        refresh_url = os.environ.get("EIC_ECC_REGISTRY_REFRESH_URL", "").strip()
        if refresh_url.endswith("/api/v1/registry/refresh"):
            base = refresh_url[: -len("/api/v1/registry/refresh")]
        elif refresh_url:
            base = refresh_url.rstrip("/")
        else:
            base = "http://empery_control_center_api:8006"

    # 1) Hot reload — no process kill.
    hot_url = f"{base}/api/v1/ops/reload-bff-routes"
    try:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        mesh = os.environ.get("EIC_MESH_TOKEN", "").strip() or os.environ.get(
            "EMPERY_MESH_TOKEN", ""
        ).strip()
        if mesh:
            headers["X-Empery-Mesh-Token"] = mesh
        req = urllib.request.Request(
            hot_url,
            data=b"{}",
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=min(60.0, float(timeout_s))) as resp:
            raw = resp.read().decode()
            body = json.loads(raw) if raw else {}
        if body.get("ok"):
            log_event(
                logger,
                event="eic.scaffold.ecc_api.refresh_ok",
                message="ECC API BFF hot-reloaded (no container restart)",
                service_name="empery_control_center_api",
                reload_mode="hot",
                mounted=len(body.get("mounted") or []),
            )
            return {
                "ok": True,
                "reload_mode": "hot",
                "mounted": body.get("mounted") or [],
                "errors": body.get("errors") or [],
            }
        hot_err = str(body.get("errors") or body)[:400]
    except Exception as exc:  # noqa: BLE001
        hot_err = str(exc)[:400]
        log_event(
            logger,
            event="eic.scaffold.ecc_api.hot_reload_failed",
            message="ECC BFF hot reload failed; falling back to restart",
            error=hot_err,
            level=logging.WARNING,
        )

    if not deploy_agent_url.strip():
        log_event(
            logger,
            event="eic.scaffold.ecc_api.refresh_skipped",
            message="ECC API refresh skipped — deploy agent URL unset",
            level=logging.ERROR if required else logging.WARNING,
        )
        return {
            "ok": False,
            "skipped": True,
            "reason": "deploy_agent_url unset",
            "hot_error": hot_err,
            "reload_mode": "none",
        }

    client = DeployAgentClient(deploy_agent_url, logger, timeout_s=timeout_s)
    if not client.configured:
        log_event(
            logger,
            event="eic.scaffold.ecc_api.refresh_skipped",
            message="ECC API refresh skipped — deploy agent not configured",
            level=logging.ERROR if required else logging.WARNING,
        )
        return {
            "ok": False,
            "skipped": True,
            "reason": "deploy_agent_unconfigured",
            "hot_error": hot_err,
            "reload_mode": "none",
        }

    result = client.deploy("empery_control_center_api", action="restart")
    result = dict(result)
    result["reload_mode"] = "restart"
    result["hot_error"] = hot_err
    if result.get("ok"):
        log_event(
            logger,
            event="eic.scaffold.ecc_api.refresh_ok",
            message="ECC API restarted after BFF stamp (hot reload failed)",
            service_name="empery_control_center_api",
            reload_mode="restart",
        )
    else:
        log_event(
            logger,
            event="eic.scaffold.ecc_api.refresh_failed",
            message="ECC API refresh failed",
            service_name="empery_control_center_api",
            error=str(result.get("error") or result.get("output") or "unknown")[:400],
            level=logging.ERROR if required else logging.WARNING,
        )
    return result


def maybe_rebuild_desktop_ui(
    *,
    deploy_agent_url: str,
    logger: logging.Logger,
    timeout_s: float = 600.0,
    required: bool = False,
) -> dict[str, Any]:
    """Deprecated alias — use refresh_desktop_ui."""
    return refresh_desktop_ui(
        deploy_agent_url=deploy_agent_url,
        logger=logger,
        timeout_s=timeout_s,
        required=required,
    )


def _generic_mount_tsx(
    service_name: str, pascal: str, title: str, port: int
) -> str:
    """Minimal live peer health mount for generic profile services."""
    return f'''/**
 * {title} desktop mount — live peer health surface.
 * Peer: /health on peerApiBase({port})
 */
import {{ useCallback, useEffect, useState }} from "react";
import {{ peerApiBase }} from "@/api/peerBase";
import type {{ MountProps }} from "./registry";

const PEER = peerApiBase({port});

type HealthPayload = {{
  status?: string;
  service?: string;
}};

async function fetchHealth(): Promise<HealthPayload> {{
  const paths = ["/health", "/api/v1/health"];
  let lastErr: Error | null = null;
  for (const path of paths) {{
    try {{
      const res = await fetch(`${{PEER}}${{path}}`);
      if (!res.ok) {{
        lastErr = new Error(`HTTP ${{res.status}} on ${{path}}`);
        continue;
      }}
      return (await res.json()) as HealthPayload;
    }} catch (err) {{
      lastErr = err instanceof Error ? err : new Error("fetch failed");
    }}
  }}
  throw lastErr ?? new Error("health unreachable");
}}

export function {pascal}Mount(_props: MountProps) {{
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {{
    setBusy(true);
    setError(null);
    try {{
      setHealth(await fetchHealth());
    }} catch (err) {{
      setHealth(null);
      setError(err instanceof Error ? err.message : "health check failed");
    }} finally {{
      setBusy(false);
    }}
  }}, []);

  useEffect(() => {{
    void reload();
  }}, [reload]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <header className="border-b border-white/10 pb-2">
        <p className="font-display text-ink">{title}</p>
        <p className="text-xs text-ink-muted">
          Peer service · :{port} · live health
        </p>
      </header>
      {{error ? (
        <p className="text-sm text-down" role="alert">{{error}}</p>
      ) : health ? (
        <div className="space-y-1 text-sm">
          <p className="text-ink">
            Status:{" "}
            <span className="font-mono text-signal">
              {{health.status ?? "unknown"}}
            </span>
          </p>
          {{health.service ? (
            <p className="text-xs text-ink-muted">Service: {{health.service}}</p>
          ) : null}}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">{{busy ? "Checking…" : "No data"}}</p>
      )}}
      <button
        type="button"
        disabled={{busy}}
        onClick={{() => void reload()}}
        className="self-start rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal hover:bg-signal/20 disabled:opacity-50"
      >
        {{busy ? "Retrying…" : "Retry health"}}
      </button>
    </div>
  );
}}
'''


def _companion_mount_tsx(
    service_name: str, pascal: str, title: str, port: int
) -> str:
    """EliteEW companion mount — assembly_lib slot + peer DI helpers."""
    return f'''/**
 * {title} desktop mount — EliteEW companion chrome adapted to Empery.
 * Peer: /api/v1/messages on peerApiBase({port}). Bearer when ECC token present.
 * Assembler injects Manifest into @assembler-slot widgets.
 */
import {{ useEffect, useState }} from "react";
import {{ getEccToken }} from "@/api/eccAuth";
import {{ peerApiBase }} from "@/api/peerBase";
import {{ BaseChatPanel, BaseComposer }} from "@/assembly_lib";
import type {{ MountProps }} from "./registry";

type ChatMessage = {{
  id: string;
  role: string;
  content: string;
  created_at: string;
}};

type NervasHealth = {{
  ready: boolean;
  backend?: string | null;
  detail?: string | null;
}};

const PEER = peerApiBase({port});

function authHeaders(): HeadersInit {{
  const headers: Record<string, string> = {{
    "Content-Type": "application/json",
  }};
  const token = getEccToken();
  if (token) headers.Authorization = `Bearer ${{token}}`;
  return headers;
}}

async function probeHealth(): Promise<NervasHealth> {{
  const res = await fetch(`${{PEER}}/api/v1/health`);
  if (!res.ok) return {{ ready: false, detail: `health ${{res.status}}` }};
  const body = (await res.json()) as {{ nervas?: NervasHealth }};
  return body.nervas ?? {{ ready: true, detail: "ok" }};
}}

async function listMessages(): Promise<ChatMessage[]> {{
  const res = await fetch(`${{PEER}}/api/v1/messages?limit=50`, {{
    headers: authHeaders(),
  }});
  if (!res.ok) throw new Error(`list failed HTTP ${{res.status}}`);
  const data = (await res.json()) as {{ messages?: ChatMessage[] }};
  return data.messages ?? [];
}}

async function sendMessage(content: string): Promise<void> {{
  const res = await fetch(`${{PEER}}/api/v1/messages`, {{
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({{ content }}),
  }});
  if (!res.ok) throw new Error(`send failed HTTP ${{res.status}}`);
}}

export function {pascal}Mount(_props: MountProps) {{
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [nervas, setNervas] = useState<NervasHealth | null>(null);
  const [tokenPresent, setTokenPresent] = useState(() => Boolean(getEccToken()));

  useEffect(() => {{
    void probeHealth()
      .then(setNervas)
      .catch((err) =>
        setNervas({{
          ready: false,
          detail: err instanceof Error ? err.message : "health failed",
        }}),
      );
  }}, []);

  useEffect(() => {{
    void listMessages()
      .then((msgs) => {{
        setTranscript(msgs);
        setStatus(null);
      }})
      .catch((err) =>
        setStatus(err instanceof Error ? err.message : "load failed"),
      );
  }}, [tokenPresent]);

  const onSend = async () => {{
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    setTokenPresent(Boolean(getEccToken()));
    setBusy(true);
    setStatus("Sending…");
    setMessage("");
    try {{
      await sendMessage(trimmed);
      setTranscript(await listMessages());
      setStatus("ok");
    }} catch (err) {{
      setStatus(err instanceof Error ? err.message : "send failed");
    }} finally {{
      setBusy(false);
    }}
  }};

  /** Assembly DI — Manifest ChatPanel binds messages={{chatMessages()}}. */
  function chatMessages() {{
    return transcript.map((m) => ({{
      id: m.id,
      role: m.role,
      content: m.content,
    }}));
  }}

  const nervasLabel = nervas
    ? nervas.ready
      ? `Nervas ready${{nervas.backend ? ` · ${{nervas.backend}}` : ""}}`
      : `Nervas not ready${{nervas.detail ? ` · ${{nervas.detail}}` : ""}}`
    : "Nervas probing…";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="border-b border-white/10 pb-2">
        <p className="font-display text-ink">{title}</p>
        <p className="text-xs text-ink-muted">
          Companion chat · peer :{port} · {{nervasLabel}}
          {{tokenPresent ? " · Bearer" : " · guest"}}
          {{status ? ` · ${{status}}` : ""}}
        </p>
      </header>
      <div
        className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
        data-assembly-data-source="/api/v1/messages"
      >
        {{/* @assembler-slot: widgets */}}
        <div data-assembler-slot="widgets" className="contents">
          <BaseChatPanel
            title="Transcript"
            emptyHint="Ask anything — replies come from living Nervas."
            messages={{chatMessages()}}
          />
          <BaseComposer
            title="Composer"
            placeholder="Ask the companion…"
            sendLabel="Send"
            value={{message}}
            busy={{busy}}
            onChange={{setMessage}}
            onSend={{() => void onSend()}}
          />
        </div>
        {{/* @assembler-slot-end: widgets */}}
      </div>
    </div>
  );
}}
'''


def _site_studio_mount_tsx(
    service_name: str, pascal: str, title: str, port: int
) -> str:
    """Site Studio preview mount — setup → generate → iframe review via /api/v1/preview."""
    return f'''/**
 * {title} desktop mount — site studio preview via living peer.
 * Peer: /api/v1/preview on peerApiBase({port})
 */
import {{ useCallback, useEffect, useState }} from "react";
import {{ peerApiBase }} from "@/api/peerBase";
import type {{ MountProps }} from "./registry";

type PreviewResponse = {{
  draft_id: string;
  title: string;
  topic: string;
  html: string;
  status?: string;
}};

const PEER = peerApiBase({port});

export function {pascal}Mount(_props: MountProps) {{
  const [topicTitle, setTopicTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [brief, setBrief] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [peer, setPeer] = useState("checking…");

  useEffect(() => {{
    void (async () => {{
      try {{
        const res = await fetch(`${{PEER}}/api/v1/health`);
        if (!res.ok) throw new Error(`health HTTP ${{res.status}}`);
        const data = (await res.json()) as {{
          nervas?: {{ ready?: boolean }};
        }};
        setPeer(data.nervas?.ready ? "Nervas ready" : "Nervas degraded");
      }} catch (err) {{
        setPeer(err instanceof Error ? err.message : "health failed");
      }}
    }})();
  }}, []);

  const onGenerate = useCallback(async () => {{
    const t = topicTitle.trim();
    const top = topic.trim();
    const b = brief.trim();
    if (!t || !top || !b) return;
    setBusy(true);
    setError(null);
    try {{
      const res = await fetch(`${{PEER}}/api/v1/preview`, {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{
          title: t,
          topic: top,
          brief: b,
          language: "en",
        }}),
      }});
      if (!res.ok) throw new Error(`preview HTTP ${{res.status}}`);
      const data = (await res.json()) as PreviewResponse;
      if (!data.html || !data.html.toLowerCase().includes("<html")) {{
        throw new Error("preview missing HTML document");
      }}
      setPreview(data);
    }} catch (err) {{
      setError(err instanceof Error ? err.message : "generate failed");
    }} finally {{
      setBusy(false);
    }}
  }}, [topicTitle, topic, brief]);

  return (
    <div className="flex h-full flex-col gap-3 p-4 text-ink">
      <header>
        <h2 className="font-body text-lg font-semibold">{title}</h2>
        <p className="text-xs text-ink-muted">
          Peer :{port} · /api/v1/preview · {{peer}}
        </p>
      </header>
      <div className="grid gap-2">
        <input
          value={{topicTitle}}
          onChange={{(e) => setTopicTitle(e.target.value)}}
          placeholder="Title"
          className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
        />
        <input
          value={{topic}}
          onChange={{(e) => setTopic(e.target.value)}}
          placeholder="Topic"
          className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
        />
        <textarea
          value={{brief}}
          onChange={{(e) => setBrief(e.target.value)}}
          placeholder="Brief"
          rows={{3}}
          className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={{() => void onGenerate()}}
          disabled={{busy || !topicTitle.trim() || !topic.trim() || !brief.trim()}}
          className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal disabled:opacity-50"
        >
          {{busy ? "Generating…" : "Generate preview"}}
        </button>
      </div>
      {{error ? <p className="text-sm text-red-400">{{error}}</p> : null}}
      {{preview ? (
        <iframe
          title="Site preview"
          sandbox=""
          srcDoc={{preview.html}}
          className="min-h-0 flex-1 rounded-md border border-white/10 bg-white"
        />
      ) : (
        <p className="text-sm text-ink-muted">No preview yet</p>
      )}}
    </div>
  );
}}
'''


def _presentation_ai_mount_tsx(
    service_name: str, pascal: str, title: str, port: int
) -> str:
    """Presentation AI mount — create → history → view + style chat."""
    return f'''/**
 * {title} desktop mount — presentation jobs via living peer (EWRP-shaped).
 * Peer: /api/v1/presentations + /api/v1/style/chat on peerApiBase({port})
 */
import {{ useCallback, useEffect, useState }} from "react";
import {{ peerApiBase }} from "@/api/peerBase";
import type {{ MountProps }} from "./registry";

type Slide = {{ title: string; bullets: string[] }};
type PresentationSummary = {{
  id: string;
  title: string;
  topic: string;
  status: string;
  num_slides: number;
  created_at: string;
}};
type PresentationDetail = PresentationSummary & {{
  style_brief?: string;
  slides: Slide[];
  error_message?: string | null;
}};

const PEER = peerApiBase({port});

export function {pascal}Mount(_props: MountProps) {{
  const [deckTitle, setDeckTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [styleBrief, setStyleBrief] = useState("");
  const [history, setHistory] = useState<PresentationSummary[]>([]);
  const [selected, setSelected] = useState<PresentationDetail | null>(null);
  const [styleInput, setStyleInput] = useState("");
  const [styleReply, setStyleReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [peer, setPeer] = useState("checking…");

  const refreshHistory = useCallback(async () => {{
    const res = await fetch(`${{PEER}}/api/v1/presentations`);
    if (!res.ok) throw new Error(`history HTTP ${{res.status}}`);
    setHistory((await res.json()) as PresentationSummary[]);
  }}, []);

  useEffect(() => {{
    void (async () => {{
      try {{
        const res = await fetch(`${{PEER}}/api/v1/health`);
        if (!res.ok) throw new Error(`health HTTP ${{res.status}}`);
        const data = (await res.json()) as {{ nervas?: {{ ready?: boolean }} }};
        setPeer(data.nervas?.ready ? "Nervas ready" : "Nervas degraded");
        await refreshHistory();
      }} catch (err) {{
        setPeer(err instanceof Error ? err.message : "health failed");
      }}
    }})();
  }}, [refreshHistory]);

  const onCreate = useCallback(async () => {{
    const t = deckTitle.trim();
    const top = topic.trim();
    if (!t || !top) return;
    setBusy(true);
    setError(null);
    try {{
      const res = await fetch(`${{PEER}}/api/v1/presentations`, {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{
          title: t,
          topic: top,
          style_brief: styleBrief.trim(),
          num_slides: 5,
          language: "ru",
        }}),
      }});
      if (!res.ok) throw new Error(`create HTTP ${{res.status}}`);
      const detail = (await res.json()) as PresentationDetail;
      setSelected(detail);
      await refreshHistory();
    }} catch (err) {{
      setError(err instanceof Error ? err.message : "create failed");
    }} finally {{
      setBusy(false);
    }}
  }}, [deckTitle, topic, styleBrief, refreshHistory]);

  const onOpen = useCallback(async (id: string) => {{
    setError(null);
    try {{
      const res = await fetch(`${{PEER}}/api/v1/presentations/${{id}}`);
      if (!res.ok) throw new Error(`detail HTTP ${{res.status}}`);
      setSelected((await res.json()) as PresentationDetail);
    }} catch (err) {{
      setError(err instanceof Error ? err.message : "open failed");
    }}
  }}, []);

  const onStyleChat = useCallback(async () => {{
    const text = styleInput.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {{
      const res = await fetch(`${{PEER}}/api/v1/style/chat`, {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{
          presentation_id: selected?.id,
          messages: [{{ role: "user", content: text }}],
        }}),
      }});
      if (!res.ok) throw new Error(`style chat HTTP ${{res.status}}`);
      const data = (await res.json()) as {{ message?: {{ content?: string }} }};
      setStyleReply(data.message?.content || "(empty)");
      setStyleInput("");
    }} catch (err) {{
      setError(err instanceof Error ? err.message : "style chat failed");
    }} finally {{
      setBusy(false);
    }}
  }}, [styleInput, selected?.id]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 text-ink">
      <header>
        <h2 className="font-body text-lg font-semibold">{{title}}</h2>
        <p className="text-xs text-ink-muted">
          Peer :{port} · /api/v1/presentations · {{peer}}
        </p>
      </header>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="grid gap-2">
          <input
            value={{deckTitle}}
            onChange={{(e) => setDeckTitle(e.target.value)}}
            placeholder="Title"
            className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
          />
          <input
            value={{topic}}
            onChange={{(e) => setTopic(e.target.value)}}
            placeholder="Topic"
            className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
          />
          <textarea
            value={{styleBrief}}
            onChange={{(e) => setStyleBrief(e.target.value)}}
            placeholder="Style brief"
            rows={{2}}
            className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={{() => void onCreate()}}
            disabled={{busy || !deckTitle.trim() || !topic.trim()}}
            className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal disabled:opacity-50"
          >
            {{busy ? "Generating…" : "Create presentation"}}
          </button>
          <div className="rounded-md border border-white/10 p-2">
            <p className="mb-1 text-xs text-ink-muted">History</p>
            <ul className="max-h-40 space-y-1 overflow-auto text-sm">
              {{history.length === 0 ? (
                <li className="text-ink-muted">No presentations yet</li>
              ) : (
                history.map((item) => (
                  <li key={{item.id}}>
                    <button
                      type="button"
                      className="text-left text-signal underline-offset-2 hover:underline"
                      onClick={{() => void onOpen(item.id)}}
                    >
                      {{item.title}} · {{item.status}}
                    </button>
                  </li>
                ))
              )}}
            </ul>
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-2">
          {{selected ? (
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-white/10 p-3">
              <h3 className="font-semibold">{{selected.title}}</h3>
              <p className="text-xs text-ink-muted">{{selected.topic}}</p>
              <ol className="mt-2 list-decimal space-y-2 pl-4 text-sm">
                {{(selected.slides || []).map((slide, idx) => (
                  <li key={{`${{slide.title}}-${{idx}}`}}>
                    <strong>{{slide.title}}</strong>
                    <ul className="list-disc pl-4 text-ink-muted">
                      {{(slide.bullets || []).map((b) => (
                        <li key={{b}}>{{b}}</li>
                      ))}}
                    </ul>
                  </li>
                ))}}
              </ol>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Select or create a presentation</p>
          )}}
          <div className="grid gap-2">
            <textarea
              value={{styleInput}}
              onChange={{(e) => setStyleInput(e.target.value)}}
              placeholder="Style chat…"
              rows={{2}}
              className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={{() => void onStyleChat()}}
              disabled={{busy || !styleInput.trim()}}
              className="rounded-md border border-white/20 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Ask style
            </button>
            {{styleReply ? (
              <p className="text-sm text-ink-muted">{{styleReply}}</p>
            ) : null}}
          </div>
        </div>
      </div>
      {{error ? <p className="text-sm text-red-400">{{error}}</p> : null}}
    </div>
  );
}}
'''


def _image_studio_mount_tsx(
    service_name: str, pascal: str, title: str, port: int
) -> str:
    """Image Studio mount — prompt → generate → poll job → display via /api/v1/images."""
    return f'''/**
 * {title} desktop mount — Comfy text-to-image via living peer.
 * Peer: /api/v1/generate on peerApiBase({port})
 */
import {{ useCallback, useEffect, useState }} from "react";
import {{ peerApiBase }} from "@/api/peerBase";
import type {{ MountProps }} from "./registry";

type JobStatus = {{
  prompt_id: string;
  status: "queued" | "running" | "completed" | "failed";
  error?: string | null;
  images?: Array<{{ filename: string; subfolder?: string; type?: string }}>;
}};

const PEER = peerApiBase({port});

async function pollJob(promptId: string): Promise<JobStatus> {{
  for (let i = 0; i < 60; i += 1) {{
    const res = await fetch(`${{PEER}}/api/v1/jobs/${{promptId}}`);
    if (!res.ok) throw new Error(`job HTTP ${{res.status}}`);
    const data = (await res.json()) as JobStatus;
    if (data.status === "completed" || data.status === "failed") {{
      return data;
    }}
    await new Promise((r) => setTimeout(r, 1500));
  }}
  throw new Error("job poll timeout");
}}

export function {pascal}Mount(_props: MountProps) {{
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [peer, setPeer] = useState("checking…");

  useEffect(() => {{
    void (async () => {{
      try {{
        const res = await fetch(`${{PEER}}/api/v1/health`);
        if (!res.ok) throw new Error(`health HTTP ${{res.status}}`);
        const data = (await res.json()) as {{
          comfy?: {{ reachable?: boolean; detail?: string }};
        }};
        setPeer(
          data.comfy?.reachable
            ? `Comfy ready${{data.comfy.detail ? ` · ${{data.comfy.detail}}` : ""}}`
            : "Comfy degraded",
        );
      }} catch (err) {{
        setPeer(err instanceof Error ? err.message : "health failed");
      }}
    }})();
  }}, []);

  const onGenerate = useCallback(async () => {{
    const text = prompt.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setImageUrl(null);
    try {{
      const res = await fetch(`${{PEER}}/api/v1/generate`, {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{ prompt: text, width: 1024, height: 1024 }}),
      }});
      if (!res.ok) throw new Error(`generate HTTP ${{res.status}}`);
      const queued = (await res.json()) as {{ prompt_id: string }};
      const job = await pollJob(queued.prompt_id);
      if (job.status === "failed") {{
        throw new Error(job.error || "generation failed");
      }}
      const img = job.images?.[0];
      if (!img?.filename) throw new Error("no image in job result");
      const params = new URLSearchParams({{ filename: img.filename }});
      if (img.subfolder) params.set("subfolder", img.subfolder);
      if (img.type) params.set("type", img.type);
      setImageUrl(`${{PEER}}/api/v1/images?${{params.toString()}}`);
    }} catch (err) {{
      setError(err instanceof Error ? err.message : "generate failed");
    }} finally {{
      setBusy(false);
    }}
  }}, [prompt]);

  return (
    <div className="flex h-full flex-col gap-3 p-4 text-ink">
      <header>
        <h2 className="font-body text-lg font-semibold">{title}</h2>
        <p className="text-xs text-ink-muted">
          Peer :{port} · /api/v1/generate · {{peer}}
        </p>
      </header>
      <textarea
        value={{prompt}}
        onChange={{(e) => setPrompt(e.target.value)}}
        placeholder="Describe the image…"
        rows={{4}}
        className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={{() => void onGenerate()}}
        disabled={{busy || !prompt.trim()}}
        className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal disabled:opacity-50"
      >
        {{busy ? "Generating…" : "Generate image"}}
      </button>
      {{error ? <p className="text-sm text-red-400">{{error}}</p> : null}}
      {{imageUrl ? (
        <img
          src={{imageUrl}}
          alt="Generated"
          className="max-h-[min(60vh,480px)] rounded-md border border-white/10 object-contain"
        />
      ) : (
        <p className="text-sm text-ink-muted">No image yet</p>
      )}}
    </div>
  );
}}
'''


def _music_forge_mount_tsx(
    service_name: str, pascal: str, title: str, port: int
) -> str:
    """Music Forge mount — prompt → generate → poll job → play via /api/v1/audio."""
    return f'''/**
 * {title} desktop mount — Comfy AceStep text-to-music via living peer.
 * Peer: /api/v1/generate on peerApiBase({port})
 */
import {{ useCallback, useEffect, useState }} from "react";
import {{ peerApiBase }} from "@/api/peerBase";
import type {{ MountProps }} from "./registry";

type JobStatus = {{
  prompt_id: string;
  status: "queued" | "running" | "completed" | "failed";
  error?: string | null;
  audio?: Array<{{ filename: string; subfolder?: string; type?: string }}>;
}};

const PEER = peerApiBase({port});

async function pollJob(promptId: string): Promise<JobStatus> {{
  for (let i = 0; i < 60; i += 1) {{
    const res = await fetch(`${{PEER}}/api/v1/jobs/${{promptId}}`);
    if (!res.ok) throw new Error(`job HTTP ${{res.status}}`);
    const data = (await res.json()) as JobStatus;
    if (data.status === "completed" || data.status === "failed") {{
      return data;
    }}
    await new Promise((r) => setTimeout(r, 2000));
  }}
  throw new Error("job poll timeout");
}}

export function {pascal}Mount(_props: MountProps) {{
  const [prompt, setPrompt] = useState("");
  const [instrumental, setInstrumental] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [peer, setPeer] = useState("checking…");

  useEffect(() => {{
    void (async () => {{
      try {{
        const res = await fetch(`${{PEER}}/api/v1/health`);
        if (!res.ok) throw new Error(`health HTTP ${{res.status}}`);
        const data = (await res.json()) as {{
          comfy?: {{ reachable?: boolean; detail?: string }};
        }};
        setPeer(
          data.comfy?.reachable
            ? `Comfy ready${{data.comfy.detail ? ` · ${{data.comfy.detail}}` : ""}}`
            : "Comfy degraded",
        );
      }} catch (err) {{
        setPeer(err instanceof Error ? err.message : "health failed");
      }}
    }})();
  }}, []);

  const onGenerate = useCallback(async () => {{
    const text = prompt.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setAudioUrl(null);
    try {{
      const res = await fetch(`${{PEER}}/api/v1/generate`, {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{ prompt: text, instrumental }}),
      }});
      if (!res.ok) throw new Error(`generate HTTP ${{res.status}}`);
      const queued = (await res.json()) as {{ prompt_id: string }};
      const job = await pollJob(queued.prompt_id);
      if (job.status === "failed") {{
        throw new Error(job.error || "generation failed");
      }}
      const track = job.audio?.[0];
      if (!track?.filename) throw new Error("no audio in job result");
      const params = new URLSearchParams({{ filename: track.filename }});
      if (track.subfolder) params.set("subfolder", track.subfolder);
      if (track.type) params.set("type", track.type);
      setAudioUrl(`${{PEER}}/api/v1/audio?${{params.toString()}}`);
    }} catch (err) {{
      setError(err instanceof Error ? err.message : "generate failed");
    }} finally {{
      setBusy(false);
    }}
  }}, [prompt, instrumental]);

  return (
    <div className="flex h-full flex-col gap-3 p-4 text-ink">
      <header>
        <h2 className="font-body text-lg font-semibold">{title}</h2>
        <p className="text-xs text-ink-muted">
          Peer :{port} · /api/v1/generate · {{peer}}
        </p>
      </header>
      <textarea
        value={{prompt}}
        onChange={{(e) => setPrompt(e.target.value)}}
        placeholder="Describe the music style…"
        rows={{4}}
        className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
      />
      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          checked={{instrumental}}
          onChange={{(e) => setInstrumental(e.target.checked)}}
        />
        Instrumental
      </label>
      <button
        type="button"
        onClick={{() => void onGenerate()}}
        disabled={{busy || !prompt.trim()}}
        className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal disabled:opacity-50"
      >
        {{busy ? "Generating…" : "Generate music"}}
      </button>
      {{error ? <p className="text-sm text-red-400">{{error}}</p> : null}}
      {{audioUrl ? (
        <audio controls src={{audioUrl}} className="w-full max-w-md">
          Your browser does not support audio playback.
        </audio>
      ) : (
        <p className="text-sm text-ink-muted">No audio yet</p>
      )}}
    </div>
  );
}}
'''


def _video_studio_mount_tsx(
    service_name: str, pascal: str, title: str, port: int
) -> str:
    """Video Studio mount — image + prompt → generate → poll job → play via /api/v1/videos."""
    return f'''/**
 * {title} desktop mount — Comfy Wan image-to-video via living peer.
 * Peer: multipart /api/v1/generate on peerApiBase({port})
 */
import {{ useCallback, useEffect, useRef, useState }} from "react";
import {{ peerApiBase }} from "@/api/peerBase";
import type {{ MountProps }} from "./registry";

type JobStatus = {{
  prompt_id: string;
  status: "queued" | "running" | "completed" | "failed";
  error?: string | null;
  videos?: Array<{{ filename: string; subfolder?: string; type?: string }}>;
}};

const PEER = peerApiBase({port});
const PLACEHOLDER_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

async function pollJob(promptId: string): Promise<JobStatus> {{
  for (let i = 0; i < 90; i += 1) {{
    const res = await fetch(`${{PEER}}/api/v1/jobs/${{promptId}}`);
    if (!res.ok) throw new Error(`job HTTP ${{res.status}}`);
    const data = (await res.json()) as JobStatus;
    if (data.status === "completed" || data.status === "failed") {{
      return data;
    }}
    await new Promise((r) => setTimeout(r, 2000));
  }}
  throw new Error("job poll timeout");
}}

export function {pascal}Mount(_props: MountProps) {{
  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [peer, setPeer] = useState("checking…");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {{
    void (async () => {{
      try {{
        const res = await fetch(`${{PEER}}/api/v1/health`);
        if (!res.ok) throw new Error(`health HTTP ${{res.status}}`);
        const data = (await res.json()) as {{
          comfy?: {{ reachable?: boolean; detail?: string }};
        }};
        setPeer(
          data.comfy?.reachable
            ? `Comfy ready${{data.comfy.detail ? ` · ${{data.comfy.detail}}` : ""}}`
            : "Comfy degraded",
        );
      }} catch (err) {{
        setPeer(err instanceof Error ? err.message : "health failed");
      }}
    }})();
  }}, []);

  const onGenerate = useCallback(async () => {{
    const text = prompt.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setVideoUrl(null);
    try {{
      const form = new FormData();
      form.append("prompt", text);
      const file =
        imageFile ??
        new File([PLACEHOLDER_PNG], "placeholder.png", {{ type: "image/png" }});
      form.append("image", file);
      const res = await fetch(`${{PEER}}/api/v1/generate`, {{
        method: "POST",
        body: form,
      }});
      if (!res.ok) throw new Error(`generate HTTP ${{res.status}}`);
      const queued = (await res.json()) as {{ prompt_id: string }};
      const job = await pollJob(queued.prompt_id);
      if (job.status === "failed") {{
        throw new Error(job.error || "generation failed");
      }}
      const vid = job.videos?.[0];
      if (!vid?.filename) throw new Error("no video in job result");
      const params = new URLSearchParams({{ filename: vid.filename }});
      if (vid.subfolder) params.set("subfolder", vid.subfolder);
      if (vid.type) params.set("type", vid.type);
      setVideoUrl(`${{PEER}}/api/v1/videos?${{params.toString()}}`);
    }} catch (err) {{
      setError(err instanceof Error ? err.message : "generate failed");
    }} finally {{
      setBusy(false);
    }}
  }}, [prompt, imageFile]);

  return (
    <div className="flex h-full flex-col gap-3 p-4 text-ink">
      <header>
        <h2 className="font-body text-lg font-semibold">{title}</h2>
        <p className="text-xs text-ink-muted">
          Peer :{port} · /api/v1/generate · {{peer}}
        </p>
      </header>
      <textarea
        value={{prompt}}
        onChange={{(e) => setPrompt(e.target.value)}}
        placeholder="Describe the motion…"
        rows={{3}}
        className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
      />
      <div className="flex items-center gap-2">
        <input
          ref={{fileRef}}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={{(e) => setImageFile(e.target.files?.[0] ?? null)}}
        />
        <button
          type="button"
          onClick={{() => fileRef.current?.click()}}
          className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-ink-muted"
        >
          {{imageFile ? imageFile.name : "Source image (optional)"}}
        </button>
      </div>
      <button
        type="button"
        onClick={{() => void onGenerate()}}
        disabled={{busy || !prompt.trim()}}
        className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal disabled:opacity-50"
      >
        {{busy ? "Generating…" : "Generate video"}}
      </button>
      {{error ? <p className="text-sm text-red-400">{{error}}</p> : null}}
      {{videoUrl ? (
        <video
          src={{videoUrl}}
          controls
          className="max-h-[min(60vh,480px)] rounded-md border border-white/10"
        />
      ) : (
        <p className="text-sm text-ink-muted">No video yet</p>
      )}}
    </div>
  );
}}
'''


def _studio_mount_tsx(
    service_name: str, pascal: str, title: str, port: int
) -> str:
    """EliteEW studio mount — assembly_lib slot + peer DI helpers."""
    return f'''/**
 * {title} desktop mount — EliteEW studio workflow chrome adapted to Empery.
 * Peer: /api/v1/jobs + /api/v1/generate on peerApiBase({port})
 * Assembler injects Manifest into @assembler-slot widgets.
 */
import {{ useEffect, useState }} from "react";
import {{ peerApiBase }} from "@/api/peerBase";
import {{ BaseJobForm, BaseJobList }} from "@/assembly_lib";
import type {{ MountProps }} from "./registry";

type StudioJob = {{
  id: string;
  prompt: string;
  status: string;
  result_url?: string | null;
  created_at: string;
}};

type PeerHealth = {{ ready: boolean; detail?: string | null }};

const PEER = peerApiBase({port});

export function {pascal}Mount(_props: MountProps) {{
  const [prompt, setPrompt] = useState("");
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [health, setHealth] = useState<PeerHealth | null>(null);

  const reload = async () => {{
    const res = await fetch(`${{PEER}}/api/v1/jobs?limit=50`);
    if (!res.ok) throw new Error(`list HTTP ${{res.status}}`);
    const data = (await res.json()) as {{ jobs?: StudioJob[] }};
    setJobs(data.jobs ?? []);
  }};

  useEffect(() => {{
    void fetch(`${{PEER}}/api/v1/health`)
      .then(async (res) => {{
        if (!res.ok) {{
          setHealth({{ ready: false, detail: `health ${{res.status}}` }});
          return;
        }}
        setHealth({{ ready: true, detail: "ok" }});
      }})
      .catch((err) =>
        setHealth({{
          ready: false,
          detail: err instanceof Error ? err.message : "health failed",
        }}),
      );
    void reload().catch((err) =>
      setStatus(err instanceof Error ? err.message : "load failed"),
    );
  }}, []);

  const onGenerate = async () => {{
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setStatus("Generating…");
    try {{
      let res = await fetch(`${{PEER}}/api/v1/generate`, {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{ prompt: text }}),
      }});
      if (res.status === 404) {{
        res = await fetch(`${{PEER}}/api/v1/jobs`, {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify({{ prompt: text }}),
        }});
      }}
      if (!res.ok) throw new Error(`generate HTTP ${{res.status}}`);
      setPrompt("");
      await reload();
      setStatus("ok");
    }} catch (err) {{
      setStatus(err instanceof Error ? err.message : "generate failed");
    }} finally {{
      setBusy(false);
    }}
  }};

  /** Assembly DI — Manifest JobList binds jobs={{studioJobs()}}. */
  function studioJobs() {{
    return jobs.map((j) => ({{
      id: j.id,
      prompt: j.prompt,
      status: j.status,
      result_url: j.result_url,
    }}));
  }}

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <header className="border-b border-white/10 pb-2">
        <p className="font-display text-ink">{title}</p>
        <p className="text-xs text-ink-muted">
          Studio generate · peer :{port} ·{{" "}}
          {{health?.ready ? "peer ready" : health?.detail ?? "probing…"}}
          {{status ? ` · ${{status}}` : ""}}
        </p>
      </header>
      <div
        className="flex min-h-0 flex-1 flex-col gap-3"
        data-assembly-data-source="/api/v1/jobs"
      >
        {{/* @assembler-slot: widgets */}}
        <div data-assembler-slot="widgets" className="contents">
          <BaseJobForm
            title="Generate"
            placeholder="Describe what to generate…"
            buttonLabel="Generate"
            value={{prompt}}
            busy={{busy}}
            onChange={{setPrompt}}
            onGenerate={{() => void onGenerate()}}
          />
          <BaseJobList
            title="Jobs"
            emptyHint="No jobs yet."
            jobs={{studioJobs()}}
          />
        </div>
        {{/* @assembler-slot-end: widgets */}}
      </div>
    </div>
  );
}}
'''


def _task_board_mount_tsx(
    service_name: str, pascal: str, title: str, port: int
) -> str:
    """Kanban-style task list mount — live peer /api/v1/tasks."""
    return f'''/**
 * {title} desktop mount — task board via living peer.
 * Peer: /api/v1/tasks on peerApiBase({port})
 */
import {{ useCallback, useEffect, useState }} from "react";
import {{ peerApiBase }} from "@/api/peerBase";
import type {{ MountProps }} from "./registry";

type BoardTask = {{
  id: string;
  title: string;
  status: string;
  column?: string | null;
}};

const PEER = peerApiBase({port});

export function {pascal}Mount(_props: MountProps) {{
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [titleInput, setTitleInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {{
    const res = await fetch(`${{PEER}}/api/v1/tasks?limit=50`);
    if (!res.ok) throw new Error(`list HTTP ${{res.status}}`);
    const data = (await res.json()) as {{ tasks?: BoardTask[] }};
    setTasks(data.tasks ?? []);
  }}, []);

  useEffect(() => {{
    void reload().catch((err) =>
      setError(err instanceof Error ? err.message : "load failed"),
    );
  }}, [reload]);

  const onCreate = async () => {{
    const text = titleInput.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {{
      const res = await fetch(`${{PEER}}/api/v1/tasks`, {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{ title: text, column: "todo" }}),
      }});
      if (!res.ok) throw new Error(`create HTTP ${{res.status}}`);
      setTitleInput("");
      await reload();
    }} catch (err) {{
      setError(err instanceof Error ? err.message : "create failed");
    }} finally {{
      setBusy(false);
    }}
  }};

  return (
    <div className="flex h-full flex-col gap-3 p-4 text-ink">
      <header>
        <h2 className="font-body text-lg font-semibold">{title}</h2>
        <p className="text-xs text-ink-muted">Peer :{port} · /api/v1/tasks</p>
      </header>
      <div className="flex gap-2">
        <input
          value={{titleInput}}
          onChange={{(e) => setTitleInput(e.currentTarget.value)}}
          onKeyDown={{(e) => {{
            if (e.key === "Enter") {{
              e.preventDefault();
              void onCreate();
            }}
          }}}}
          disabled={{busy}}
          placeholder="New task…"
          className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-signal/40"
        />
        <button
          type="button"
          onClick={{() => void onCreate()}}
          disabled={{busy || !titleInput.trim()}}
          className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal disabled:opacity-50"
        >
          {{busy ? "…" : "Add"}}
        </button>
      </div>
      {{error ? <p className="text-sm text-red-400">{{error}}</p> : null}}
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {{tasks.length === 0 ? (
          <li className="text-sm text-ink-muted">No tasks yet</li>
        ) : (
          tasks.map((t) => (
            <li
              key={{t.id}}
              className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm"
            >
              <p className="font-medium">{{t.title}}</p>
              <p className="text-[10px] uppercase text-ink-muted">
                {{t.status}}
                {{t.column ? ` · ${{t.column}}` : ""}}
              </p>
            </li>
          ))
        )}}
      </ul>
    </div>
  );
}}
'''


def _ops_dashboard_mount_tsx(
    service_name: str, pascal: str, title: str, port: int
) -> str:
    """Ops dashboard mount — assembly_lib shell + @assembler-slot for Manifest inject."""
    return f'''/**
 * {title} desktop mount — Configuration-Driven Assembly (Dashboard_Standard).
 * Peer metrics: peerApiBase({port})/api/v1/metrics
 * Slots filled by EIC Assembler from Manifest — do not hand-edit widgets.
 */
import {{ useCallback, useEffect, useState }} from "react";
import {{ peerApiBase }} from "@/api/peerBase";
import {{ BaseCard, BaseChart, BaseLayout }} from "@/assembly_lib";
import type {{ MountProps }} from "./registry";

type DashboardMetric = {{
  id: string;
  label: string;
  value: string;
  unit?: string | null;
}};

const PEER = peerApiBase({port});

export function {pascal}Mount(_props: MountProps) {{
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {{
    const res = await fetch(`${{PEER}}/api/v1/metrics?limit=50`);
    if (!res.ok) throw new Error(`list HTTP ${{res.status}}`);
    const data = (await res.json()) as {{ metrics?: DashboardMetric[] }};
    setMetrics(data.metrics ?? []);
  }}, []);

  useEffect(() => {{
    void reload().catch((err) =>
      setError(err instanceof Error ? err.message : "load failed"),
    );
  }}, [reload]);

  const onRefresh = async () => {{
    setBusy(true);
    setError(null);
    try {{
      await reload();
    }} catch (err) {{
      setError(err instanceof Error ? err.message : "refresh failed");
    }} finally {{
      setBusy(false);
    }}
  }};

  /** Assembler DI: Manifest data_source → living metrics array. */
  const metricField = (
    label: string,
    field: "value" | "unit" | "label",
  ): string => {{
    const hit =
      metrics.find((m) => m.label === label) ??
      metrics.find((m) => m.id === label) ??
      metrics[0];
    if (!hit) return busy ? "…" : "—";
    const raw = hit[field];
    return raw == null || raw === "" ? "—" : String(raw);
  }};
  const metricSeries = () =>
    metrics.slice(0, 12).map((m) => ({{
      label: m.label,
      value: Number.parseFloat(String(m.value)) || 0,
    }}));

  return (
    <BaseLayout
      title="{title}"
      subtitle={{`Peer :{port} · /api/v1/metrics`}}
      actions={{
        <button
          type="button"
          onClick={{() => void onRefresh()}}
          disabled={{busy}}
          className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal disabled:opacity-50"
        >
          {{busy ? "…" : "Refresh"}}
        </button>
      }}
    >
      {{error ? <p className="mb-2 text-sm text-red-400">{{error}}</p> : null}}
      <div className="grid grid-cols-2 gap-2" data-assembly-data-source="/api/v1/metrics">
        {{/* @assembler-slot: widgets */}}
        <div data-assembler-slot="widgets" className="contents">
          <BaseCard
            title={{metricField("Metrics", "label")}}
            value={{metricField("Metrics", "value")}}
            unit={{metricField("Metrics", "unit")}}
          />
          <BaseChart title="Trend" chartType="area_line" series={{metricSeries()}} />
        </div>
        {{/* @assembler-slot-end: widgets */}}
      </div>
    </BaseLayout>
  );
}}
'''


def _research_report_mount_tsx(
    service_name: str, pascal: str, title: str, port: int
) -> str:
    """Research reports mount — live peer /api/v1/reports."""
    return f'''/**
 * {title} desktop mount — research reports via living peer.
 * Peer: /api/v1/reports on peerApiBase({port})
 */
import {{ useCallback, useEffect, useState }} from "react";
import {{ peerApiBase }} from "@/api/peerBase";
import type {{ MountProps }} from "./registry";

type ResearchReport = {{
  id: string;
  topic: string;
  status: string;
  summary?: string | null;
}};

const PEER = peerApiBase({port});

export function {pascal}Mount(_props: MountProps) {{
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {{
    const res = await fetch(`${{PEER}}/api/v1/reports?limit=50`);
    if (!res.ok) throw new Error(`list HTTP ${{res.status}}`);
    const data = (await res.json()) as {{ reports?: ResearchReport[] }};
    setReports(data.reports ?? []);
  }}, []);

  useEffect(() => {{
    void reload().catch((err) =>
      setError(err instanceof Error ? err.message : "load failed"),
    );
  }}, [reload]);

  const onCreate = async () => {{
    const trimmed = topic.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {{
      const res = await fetch(`${{PEER}}/api/v1/reports`, {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{ topic: trimmed }}),
      }});
      if (!res.ok) throw new Error(`create HTTP ${{res.status}}`);
      setTopic("");
      await reload();
    }} catch (err) {{
      setError(err instanceof Error ? err.message : "create failed");
    }} finally {{
      setBusy(false);
    }}
  }};

  return (
    <div className="flex h-full flex-col gap-3 p-4 text-ink">
      <header>
        <h2 className="font-body text-lg font-semibold">{title}</h2>
        <p className="text-xs text-ink-muted">Peer :{port} · /api/v1/reports</p>
      </header>
      <form
        className="flex gap-2"
        onSubmit={{(e) => {{
          e.preventDefault();
          void onCreate();
        }}}}
      >
        <input
          value={{topic}}
          onChange={{(e) => setTopic(e.target.value)}}
          placeholder="Report topic"
          className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={{busy || !topic.trim()}}
          className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal disabled:opacity-50"
        >
          {{busy ? "…" : "Create"}}
        </button>
      </form>
      {{error ? <p className="text-sm text-red-400">{{error}}</p> : null}}
      <ul className="min-h-0 flex-1 space-y-2 overflow-auto">
        {{reports.length === 0 ? (
          <li className="text-sm text-ink-muted">No reports yet</li>
        ) : (
          reports.map((r) => (
            <li
              key={{r.id}}
              className="rounded-md border border-white/10 bg-black/20 px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-body text-sm font-medium">{{r.topic}}</p>
                <span className="font-mono text-[10px] uppercase text-ink-muted">
                  {{r.status}}
                </span>
              </div>
              {{r.summary ? (
                <p className="mt-1 text-xs text-ink-muted">{{r.summary}}</p>
              ) : null}}
            </li>
          ))
        )}}
      </ul>
    </div>
  );
}}
'''
