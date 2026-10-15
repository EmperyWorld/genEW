"""Deterministic factory DoD gates for Hands Verifier (production path only)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_FAKE_SRC_RE = re.compile(
    r"(?m)^[ \t]*(?:class[ \t]+(?:_?FakeAI|_?FakeNervas|LocalDemoRunner|"
    r"InMemory[A-Za-z0-9_]+)\b|"
    r"(?:from[ \t]+\S+[ \t]+)?import[ \t]+[^\n]*\b(?:FakeAI|FakeNervas|demo_stub|"
    r"InMemory[A-Za-z0-9_]+|LocalDemoRunner)\b|"
    r"(?:FakeAI|FakeNervas|LocalDemoRunner|InMemory[A-Za-z0-9_]+)\s*\()"
)
_DEMO_STUB_ASSIGN_RE = re.compile(
    r"(?m)(?:^[ \t]*(?:demo_stub\s*=|DEMO_STUB\s*=|use_fake_ai\s*=\s*True|"
    r"USE_FAKE_AI\s*=\s*True|EIC_USE_FAKE_NERVAS\s*=\s*True)|"
    r"\b(?:run-demo|JobMode\.DEMO|DEMO_PASSED|LocalDemoRunner)\b)"
)
_LLM_PROFILES = frozenset({"companion_chat", "studio_job", "peer_http"})
_NERVAS_PEER_PROFILES = frozenset({"site_studio"})
_COMFY_PEER_PROFILES = frozenset({"image_studio", "video_studio", "music_forge"})
_STATEFUL_PROFILES = frozenset(
    {"companion_chat", "studio_job", "marketing", "generic"}
)


def _read_manifest(service_root: Path) -> dict[str, Any]:
    path = service_root / "manifest.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _compose_paths(workspace: Path, service_name: str) -> list[Path]:
    return [
        workspace / "deploy" / "services" / f"{service_name}.yml",
        workspace
        / ".cursor"
        / "orchestration"
        / "eic"
        / "deploy"
        / "services"
        / f"{service_name}.yml",
    ]


def scan_src_for_fakes(service_root: Path) -> list[str]:
    """Return relative paths under src/ that contain forbidden production stubs."""
    src = service_root / "src"
    hits: list[str] = []
    if not src.is_dir():
        return hits
    for path in src.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".py", ".pyi", ".md", ".json", ".yml", ".yaml"}:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if _FAKE_SRC_RE.search(text) or _DEMO_STUB_ASSIGN_RE.search(text):
            hits.append(str(path.relative_to(service_root)))
    return hits


def verify_compose_prod_flags(workspace: Path, service_name: str) -> tuple[str, str]:
    """Fail if deploy compose enables in-memory bus or auto-create tables."""
    notes: list[str] = []
    found_any = False
    for path in _compose_paths(workspace, service_name):
        if not path.is_file():
            continue
        found_any = True
        text = path.read_text(encoding="utf-8", errors="replace")
        rel = str(path.relative_to(workspace)) if path.is_relative_to(workspace) else str(path)
        lower = text.lower()
        if re.search(
            r"event_bus_allow_in_memory\s*:\s*[\"']?true[\"']?",
            lower,
        ):
            notes.append(f"{rel}: EVENT_BUS_ALLOW_IN_MEMORY=true")
        if re.search(
            r"auto_create_tables\s*:\s*[\"']?true[\"']?",
            lower,
        ):
            notes.append(f"{rel}: AUTO_CREATE_TABLES=true")
    if notes:
        return "FAILED", "Compose production flags:\n- " + "\n- ".join(notes)
    if found_any:
        return "PASSED", f"Compose prod flags OK for {service_name}"
    return "PASSED", f"No deploy compose fragment for {service_name} (skipped flags)"


def verify_register_symbol(service_root: Path) -> tuple[str, str]:
    main = service_root / "src" / "api" / "main.py"
    if not main.is_file():
        return "FAILED", "Missing src/api/main.py"
    text = main.read_text(encoding="utf-8", errors="replace")
    if "def register(" not in text and "async def register(" not in text:
        return "FAILED", "src/api/main.py missing register(...) for discovery"
    return "PASSED", "register() present in src/api/main.py"


def verify_stateful_migrations(
    service_root: Path,
    *,
    scaffold_profile: str | None = None,
    manifest: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Require alembic/ when profile or manifest implies durable state."""
    manifest = manifest if manifest is not None else _read_manifest(service_root)
    deps = [str(d).lower() for d in (manifest.get("dependencies") or [])]
    features = [str(f).lower() for f in (manifest.get("features") or [])]
    profile = (scaffold_profile or "").strip().lower()
    needs = (
        profile in _STATEFUL_PROFILES
        or any("postgres" in d or "database" in d for d in deps)
        or any(f in {"chat_store", "job_store", "postgres"} for f in features)
        or (service_root / "alembic").is_dir()
    )
    if not needs:
        return "PASSED", "Stateful migrations not required"
    alembic = service_root / "alembic"
    if not alembic.is_dir():
        return "FAILED", "Stateful service missing alembic/"
    versions = alembic / "versions"
    if not versions.is_dir() or not any(versions.glob("*.py")):
        return "FAILED", "alembic/versions missing migration scripts"
    return "PASSED", "Alembic present for stateful service"


def verify_profile_peers(
    service_root: Path,
    *,
    scaffold_profile: str | None = None,
    manifest: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Require Nervas + identity wiring for LLM/auth profiles."""
    profile = (scaffold_profile or "").strip().lower()
    if profile in _COMFY_PEER_PROFILES:
        notes: list[str] = []
        comfy = service_root / "src" / "integration" / "comfy_client.py"
        if not comfy.is_file():
            notes.append("missing src/integration/comfy_client.py")
        if profile == "video_studio":
            workflow_json = service_root / "workflows" / "image_to_video.json"
            missing_label = "workflows/image_to_video.json"
        elif profile == "music_forge":
            workflow_json = service_root / "workflows" / "text_to_music.json"
            missing_label = "workflows/text_to_music.json"
        else:
            workflow_json = service_root / "workflows" / "text_to_image.json"
            missing_label = "workflows/text_to_image.json"
        workflow_py = service_root / "src" / "integration" / "workflow.py"
        if not workflow_json.is_file() and not workflow_py.is_file():
            notes.append(f"missing {missing_label} or workflow.py")
        if notes:
            return "FAILED", "Profile peer wiring:\n- " + "\n- ".join(notes)
        return "PASSED", f"Comfy peer wired for profile={profile}"
    if profile not in _LLM_PROFILES and profile not in _NERVAS_PEER_PROFILES:
        return "PASSED", f"Profile {profile or 'unset'} does not require Nervas/identity gate"
    manifest = manifest if manifest is not None else _read_manifest(service_root)
    deps = [str(d).lower() for d in (manifest.get("dependencies") or [])]
    notes: list[str] = []
    nervas = service_root / "src" / "integration" / "nervas_client.py"
    if not nervas.is_file():
        notes.append("missing src/integration/nervas_client.py")
    if not any("empery_intelligence_core" in d or "eic" in d for d in deps):
        notes.append("manifest.dependencies missing empery_intelligence_core")
    if profile in _LLM_PROFILES:
        identity = service_root / "src" / "integration" / "identity_adapter.py"
        if not identity.is_file():
            notes.append("missing src/integration/identity_adapter.py")
        if not any("identity" in d for d in deps):
            notes.append("manifest.dependencies missing identity_service")
    if notes:
        return "FAILED", "Profile peer wiring:\n- " + "\n- ".join(notes)
    return "PASSED", f"Nervas+identity wired for profile={profile}"


def verify_manifest_ui(service_root: Path) -> tuple[str, str]:
    """Require honest ``manifest.json`` ``ui`` block (P4.3 SoT)."""
    manifest = _read_manifest(service_root)
    if not manifest:
        return "FAILED", "manifest.json missing or unreadable"
    ui = manifest.get("ui")
    if not isinstance(ui, dict):
        return "FAILED", "manifest.ui missing — ECC/Desktop SoT must live on the capsule"
    required = ui.get("required", True)
    if required is False:
        reason = ui.get("skip_reason")
        if not (isinstance(reason, str) and reason.strip()):
            return "FAILED", "manifest.ui.required=false needs non-null skip_reason"
        return "PASSED", "manifest.ui opt-out with skip_reason"
    for key in ("feature_key", "route", "nav_label_key", "bff_prefix"):
        if not ui.get(key):
            return (
                "FAILED",
                f"manifest.ui.{key} required when ui.required is true",
            )
    return "PASSED", "manifest.ui product contract present"


_NAV_EIC_UI_RE = re.compile(r"eic:ui:([a-z][a-z0-9_]*)")


def verify_primary_nav_ui_gate(workspace: Path) -> tuple[str, str]:
    """Primary NavPrimary markers must map to ui.required=true (or ui.lab)."""
    nav = (
        workspace
        / "apps"
        / "empery_control_center"
        / "src"
        / "features"
        / "shell"
        / "NavPrimary.tsx"
    )
    if not nav.is_file():
        return "PASSED", "NavPrimary.tsx absent (skip nav gate)"
    text = nav.read_text(encoding="utf-8", errors="replace")
    names = sorted(set(_NAV_EIC_UI_RE.findall(text)))
    if not names:
        return "PASSED", "No eic:ui markers in NavPrimary"
    bad: list[str] = []
    for name in names:
        svc_root = workspace / "services" / name
        if not svc_root.is_dir():
            # Stale nav marker for a removed capsule — treat as hard fail to keep Nav honest.
            bad.append(f"{name}: missing services/{name}/ (stale NavPrimary marker)")
            continue
        manifest = _read_manifest(svc_root)
        ui = manifest.get("ui") if manifest else None
        if not isinstance(ui, dict):
            bad.append(f"{name}: missing manifest.ui")
            continue
        if ui.get("required") is True:
            continue
        if ui.get("lab") is True:
            bad.append(
                f"{name}: ui.lab=true must not appear in primary NavPrimary "
                "(deep-link / Labs only)"
            )
            continue
        bad.append(
            f"{name}: ui.required=false in primary nav "
            f"(skip_reason={ui.get('skip_reason')!r})"
        )
    if bad:
        return "FAILED", "Primary nav ⇒ ui.required:\n- " + "\n- ".join(bad)
    return "PASSED", f"Primary nav ui gate OK ({len(names)} product entries)"


def normalize_verify_status(status: str | None) -> str:
    """Map raw status to Hands-allowed values; DEMO_PASSED → FAILED.

    Intermediate UNKNOWN is allowed during parsing; agent_loop coerces
    terminal verify to PASSED|FAILED (P11).
    """
    raw = (status or "UNKNOWN").strip().upper()
    if raw in {"DEMO_PASSED", "DEMO_FAILED", "STUB_PASSED"}:
        return "FAILED"
    if raw in {"PASSED", "FAILED", "UNKNOWN"}:
        return raw
    return "UNKNOWN"


def verify_factory_gates(
    workspace: Path,
    service_name: str,
    *,
    scaffold_profile: str | None = None,
) -> tuple[str, str]:
    """
    Run production-path factory gates.

    Returns (PASSED|FAILED, detail markdown).
    """
    root = workspace / "services" / service_name
    if not root.is_dir():
        return "FAILED", f"Missing services/{service_name}/"

    blocks: list[str] = []
    ok = True
    manifest = _read_manifest(root)

    fake_hits = scan_src_for_fakes(root)
    if fake_hits:
        ok = False
        blocks.append(
            "FAILED Fake/demo in src/:\n- " + "\n- ".join(fake_hits[:20])
        )
    else:
        blocks.append("PASSED no FakeAI/FakeNervas/demo_stub/InMemory* in src/")

    reg_status, reg_detail = verify_register_symbol(root)
    blocks.append(f"{reg_status} {reg_detail}")
    if reg_status == "FAILED":
        ok = False

    compose_status, compose_detail = verify_compose_prod_flags(workspace, service_name)
    blocks.append(f"{compose_status} {compose_detail}")
    if compose_status == "FAILED":
        ok = False

    mig_status, mig_detail = verify_stateful_migrations(
        root, scaffold_profile=scaffold_profile, manifest=manifest
    )
    blocks.append(f"{mig_status} {mig_detail}")
    if mig_status == "FAILED":
        ok = False

    peer_status, peer_detail = verify_profile_peers(
        root, scaffold_profile=scaffold_profile, manifest=manifest
    )
    blocks.append(f"{peer_status} {peer_detail}")
    if peer_status == "FAILED":
        ok = False

    ui_status, ui_detail = verify_manifest_ui(root)
    blocks.append(f"{ui_status} {ui_detail}")
    if ui_status == "FAILED":
        ok = False

    nav_status, nav_detail = verify_primary_nav_ui_gate(workspace)
    blocks.append(f"{nav_status} {nav_detail}")
    if nav_status == "FAILED":
        ok = False

    status = "PASSED" if ok else "FAILED"
    return status, "Factory DoD:\n" + "\n".join(f"- {b}" for b in blocks)
