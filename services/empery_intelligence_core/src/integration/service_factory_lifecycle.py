"""Hands lifecycle — enable / disable / delete for non-spine services."""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.logging import log_event

from services.empery_intelligence_core.src.integration.service_factory_peers import (
    eic_dir,
    live_peers_path,
    validate_service_name,
)

_SERVICE_RE = re.compile(r"^[a-z][a-z0-9_]{1,62}$")

SPINE_SERVICES = frozenset(
    {
        "postgres",
        "redis",
        "empery_intelligence_core",
        "empery_control_center",
        "empery_control_center_api",
        "empery_deploy_agent",
        "identity_service",
        "core_auth_service",
        "desktop_shell",
    }
)

SEED_PRODUCT_SERVICES = frozenset(
    {
        "ai_chat",
        "dedmoroz",
        "image_studio",
        "video_studio",
        "music_forge",
        "site_studio",
        "analytics_service",
        "task_orchestrator_service",
        "intelligence_service",
        "empery_intelligence_core",
        "identity_service",
        "desktop_shell",
        "empery_control_center",
        "empery_control_center_api",
    }
)


def assert_lifecycle_allowed(service_name: str) -> str:
    name = validate_service_name(service_name)
    if name in SPINE_SERVICES:
        raise ValueError(f"refusing lifecycle op on spine service: {name}")
    return name


def is_user_created_service(workspace: Path, service_name: str) -> bool:
    """True when Hands/operator created the capsule (explicit stamp or factory fingerprint).

    Seed/spine never qualify. Explicit ``user_created`` stamps win; otherwise any
    Hands surface (design, catalog, deploy overlay, or service manifest) counts so
    ECC delete is not blocked on older capsules that missed provenance.
    """
    name = validate_service_name(service_name)
    if name in SPINE_SERVICES or is_seed_product_service(name):
        return False

    designs = workspace / ".cursor" / "orchestration" / "designs"
    design_path = designs / f"{name}_design.json"
    if design_path.is_file():
        data = _read_json(design_path)
        lifecycle = data.get("lifecycle")
        if isinstance(lifecycle, dict) and lifecycle.get("user_created") is True:
            return True
        ui = data.get("ui")
        if isinstance(ui, dict) and ui.get("user_created") is True:
            return True
        # Design JSON itself is Hands output even if lifecycle stamp was omitted.
        return True
    if (designs / f"{name}_design.md").is_file():
        return True

    catalog_dir = eic_dir(workspace) / "desktop_catalog"
    for catalog_path in (
        catalog_dir / f"{name}.json",
        catalog_dir / "lab" / f"{name}.json",
    ):
        if catalog_path.is_file():
            data = _read_json(catalog_path)
            if data.get("user_created") is True:
                return True
            # Catalog overlay = Hands D3 write (legacy rows may omit the flag).
            return True

    deploy_yml = workspace / "deploy" / "services" / f"{name}.yml"
    if deploy_yml.is_file():
        return True

    manifest_path = workspace / "services" / name / "manifest.json"
    if manifest_path.is_file():
        data = _read_json(manifest_path)
        features = data.get("features")
        if isinstance(features, list) and "user_created" in features:
            return True
        # Hands scaffold always writes manifest; treat as factory capsule.
        return True
    return False


def is_seed_product_service(service_name: str) -> bool:
    return validate_service_name(service_name) in SEED_PRODUCT_SERVICES


def lifecycle_delete_meta(workspace: Path, service_name: str) -> dict[str, Any]:
    """Metadata for ECC delete affordance and ops audits."""
    name = assert_lifecycle_allowed(service_name)
    user_created = is_user_created_service(workspace, name)
    seed_product = is_seed_product_service(name)
    force = os.environ.get("EMPERY_FORCE_DELETE_NON_USER") == "1"
    # Non-spine / non-seed is always deletable (Hands, lab, or ghost after
    # partial teardown). Provenance is advisory for UI badges — missing stamps
    # must not block cleanup of leftover job rows / nav debris.
    deletable = name not in SPINE_SERVICES and (not seed_product or force)
    return {
        "service_name": name,
        "user_created": user_created,
        "seed_product": seed_product,
        "deletable": deletable,
        "force_delete_env": force,
        "ghost": not user_created and not seed_product,
    }


def assert_delete_allowed(workspace: Path, service_name: str) -> str:
    name = assert_lifecycle_allowed(service_name)
    if is_seed_product_service(name):
        if os.environ.get("EMPERY_FORCE_DELETE_NON_USER") == "1":
            return name
        raise ValueError(f"refusing delete of seed product service: {name}")
    # Hands / lab / ghost (capsule already gone): allow idempotent teardown.
    return name


def _purge_service_orchestration_artifacts(
    workspace: Path, service_name: str
) -> list[str]:
    """Drop intentions/jobs/audit/reports so Autonomous list loses the ghost."""
    name = validate_service_name(service_name)
    removed: list[str] = []
    orch = workspace / ".cursor" / "orchestration"

    def _rm(path: Path) -> None:
        try:
            if path.is_file():
                path.unlink()
                removed.append(str(path))
        except OSError:
            pass

    # Named audit / verify / evolve surfaces
    for path in (
        orch / "jobs" / "deploy_audit" / f"{name}.json",
        orch / "jobs" / "pending_deploy" / f"{name}.json",
        orch / "reports" / f"{name}_verify.md",
        orch / "reports" / f"{name}_verify.json",
    ):
        _rm(path)

    evolve = orch / "eic" / "evolve_proposals"
    if evolve.is_dir():
        for path in evolve.glob(f"{name}_*.json"):
            _rm(path)

    # Intention + ECC job JSON keyed by service_name (or intent text).
    for root in (
        orch / "eic" / "intentions",
        orch / "jobs",
    ):
        if not root.is_dir():
            continue
        for path in root.rglob("*.json"):
            if path.name.endswith(".tmp"):
                continue
            # deploy_audit/{name}.json already handled; skip directories
            if path.parent.name in {"deploy_audit", "pending_deploy"}:
                continue
            try:
                data = _read_json(path)
            except Exception:  # noqa: BLE001
                continue
            sn = str(data.get("service_name") or data.get("service") or "").strip()
            if sn == name:
                _rm(path)
                continue
            # Orphan jobs sometimes omit service_name but keep artifact paths.
            blob = json.dumps(data, ensure_ascii=False)
            needles = (
                f'"services/{name}"',
                f"services/{name}/",
                f"deploy_audit/{name}.json",
                f"{name}_verify.md",
                f"{name}_design.",
            )
            if sn == "" and any(n in blob for n in needles):
                _rm(path)

    # BFF env overlay leftovers
    bff = eic_dir(workspace) / "dynamic_bff_env.json"
    if bff.is_file():
        data = _read_json(bff)
        key = f"{name.upper()}_API_BASE"
        if key in data:
            data.pop(key, None)
            _write_json(bff, data)
            removed.append(str(bff))

    return removed


def _pascal(service_name: str) -> str:
    return "".join(p.capitalize() for p in service_name.split("_") if p)


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def set_catalog_enabled(
    workspace: Path,
    service_name: str,
    *,
    enabled: bool,
) -> dict[str, Any]:
    """Toggle enabled flag on desktop catalog overlay JSON."""
    name = assert_lifecycle_allowed(service_name)
    path = (
        eic_dir(workspace) / "desktop_catalog" / f"{name}.json"
    )
    written: list[str] = []
    if path.is_file():
        data = _read_json(path)
        data["app_id"] = data.get("app_id") or name
        data["app_component"] = data.get("app_component") or name
        data["title"] = data.get("title") or name
        data["enabled"] = enabled
        _write_json(path, data)
        written.append(str(path))
    return {
        "ok": True,
        "service_name": name,
        "enabled": enabled,
        "catalog_path": str(path) if path.is_file() else None,
        "written": written,
    }


def _set_live_peer_status(
    workspace: Path,
    service_name: str,
    *,
    status: str,
    enabled: bool,
) -> list[str]:
    written: list[str] = []
    path = live_peers_path(workspace)
    data = _read_json(path)
    peers = data.get("peers")
    if not isinstance(peers, dict):
        peers = {}
    entry: dict[str, Any] = dict(
        peers.get(service_name) or {"service_name": service_name}
    )
    entry["status"] = status
    entry["enabled"] = enabled
    entry["updated_at"] = datetime.now(timezone.utc).isoformat()
    if status == "deleted":
        peers.pop(service_name, None)
    else:
        peers[service_name] = entry
    data["peers"] = peers
    data["updated_at"] = entry["updated_at"]
    _write_json(path, data)
    written.append(str(path))
    return written


def unpatch_desktop_registry(workspace: Path, service_name: str) -> list[str]:
    """Remove mount import/entry from apps/empery_desktop mounts/registry.ts."""
    name = assert_lifecycle_allowed(service_name)
    pascal = _pascal(name)
    path = (
        workspace
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / "registry.ts"
    )
    written: list[str] = []
    if not path.is_file():
        return written
    text = path.read_text(encoding="utf-8")
    import_re = re.compile(
        rf'^import\s+\{{\s*{re.escape(pascal)}Mount\s*\}}\s+from\s+"./{re.escape(name)}";\s*\n',
        re.MULTILINE,
    )
    entry_re = re.compile(
        rf'^\s*{re.escape(name)}:\s*{re.escape(pascal)}Mount,\s*\n',
        re.MULTILINE,
    )
    new_text = import_re.sub("", text)
    new_text = entry_re.sub("", new_text)
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        written.append(str(path))
    return written


def teardown_service_files(
    workspace: Path,
    service_name: str,
    *,
    logger: logging.Logger | None = None,
    remove_service_tree: bool = True,
) -> dict[str, Any]:
    """
    Allowlisted delete of a non-spine service surfaces.

    Removes compose fragment, health/peer overlays, desktop mount/catalog,
    dynamic SQL, and optionally services/{name}/. Soft-archives design md/json.
    """
    name = assert_delete_allowed(workspace, service_name)
    removed: list[str] = []
    errors: list[str] = []

    def _rm(path: Path) -> None:
        try:
            if path.is_file():
                path.unlink()
                removed.append(str(path))
            elif path.is_dir():
                shutil.rmtree(path)
                removed.append(str(path))
        except OSError as exc:
            errors.append(f"{path}: {exc}")

    # Compose + DB overlay
    _rm(workspace / "deploy" / "services" / f"{name}.yml")
    _rm(workspace / "deploy" / "postgres" / "dynamic" / f"{name}.sql")
    all_sql = workspace / "deploy" / "postgres" / "dynamic" / "all.sql"
    if all_sql.is_file():
        try:
            text = all_sql.read_text(encoding="utf-8")
            # Drop Hands auto-provision block for this service (3-line pattern).
            pattern = (
                rf"-- Auto-provisioned by Empery Hands for {re.escape(name)}\n"
                rf"SELECT 'CREATE DATABASE {re.escape(name)}'\n"
                rf"WHERE NOT EXISTS \(SELECT FROM pg_database WHERE datname = '{re.escape(name)}'\)\\gexec\n"
                rf"GRANT ALL PRIVILEGES ON DATABASE {re.escape(name)} TO eworld;\n?"
            )
            new_text = re.sub(pattern, "", text)
            if new_text != text:
                all_sql.write_text(new_text, encoding="utf-8")
                removed.append(str(all_sql))
        except OSError as exc:
            errors.append(f"{all_sql}: {exc}")

    # Health / peer matrices
    for matrix_name, key_path in (
        ("dynamic_health_bases.json", name),
        ("peer_env_matrix.json", None),
    ):
        path = eic_dir(workspace) / matrix_name
        data = _read_json(path)
        if matrix_name == "peer_env_matrix.json":
            peers = data.get("peers")
            if isinstance(peers, dict) and name in peers:
                peers.pop(name, None)
                data["peers"] = peers
                _write_json(path, data)
                removed.append(str(path))
        elif key_path in data:
            data.pop(key_path, None)
            _write_json(path, data)
            removed.append(str(path))

    removed.extend(_set_live_peer_status(workspace, name, status="deleted", enabled=False))

    # Desktop
    removed.extend(unpatch_desktop_registry(workspace, name))
    _rm(
        workspace
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{name}.tsx"
    )
    _rm(eic_dir(workspace) / "desktop_catalog" / f"{name}.json")
    _rm(eic_dir(workspace) / "desktop_catalog" / "lab" / f"{name}.json")

    # ECC product UI / BFF (U1–U9)
    try:
        from services.empery_intelligence_core.src.integration.service_scaffold_ui import (
            teardown_ecc_ui_surfaces,
        )

        ecc = teardown_ecc_ui_surfaces(workspace, name)
        removed.extend(list(ecc.get("removed") or []))
        errors.extend(list(ecc.get("errors") or []))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"ecc ui teardown: {exc}")

    # Soft-archive designs
    designs = workspace / ".cursor" / "orchestration" / "designs"
    archive = designs / "_deleted"
    archive.mkdir(parents=True, exist_ok=True)
    for suffix in (".md", ".json"):
        src = designs / f"{name}_design{suffix}"
        if src.is_file():
            dest = archive / f"{name}_design{suffix}"
            try:
                shutil.move(str(src), str(dest))
                removed.append(str(dest))
            except OSError as exc:
                errors.append(f"{src}: {exc}")

    # Orchestration leftovers — otherwise Autonomous "Задачи" keeps ghost rows
    # (Verify/evolve jobs, deploy_audit paths) after the capsule is gone.
    removed.extend(_purge_service_orchestration_artifacts(workspace, name))

    # Service tree (allowlisted only)
    if remove_service_tree:
        svc_root = workspace / "services" / name
        if svc_root.is_dir():
            try:
                svc_root.resolve().relative_to((workspace / "services").resolve())
            except ValueError:
                errors.append(f"refusing path escape: {svc_root}")
            else:
                _rm(svc_root)

    # Rewrite compose.reflex.yml best-effort
    try:
        from services.empery_intelligence_core.src.integration.service_scaffold import (
            ServiceScaffoldAction,
        )

        ServiceScaffoldAction(
            workspace, logging.getLogger("lifecycle")
        )._rewrite_compose_reflex()  # noqa: SLF001
    except Exception as exc:  # noqa: BLE001
        errors.append(f"compose.reflex: {exc}")

    # Drop in-process registry entry so ECC map/health lose the ghost immediately.
    try:
        from core.registry import registry as global_registry

        unregister = getattr(global_registry, "unregister", None)
        if callable(unregister):
            if unregister(name):
                removed.append(f"registry:{name}")
        # Older baked core images lack unregister — filesystem teardown still wins.
    except Exception as exc:  # noqa: BLE001
        # Soft: ghost cleanup must not fail the operator delete when registry API lags.
        errors.append(f"registry unregister (soft): {exc}")

    soft_prefixes = (
        "registry unregister",
        "compose.reflex:",
    )
    hard_errors = [
        e
        for e in errors
        if not any(str(e).startswith(p) for p in soft_prefixes)
    ]
    if logger is not None:
        log_event(
            logger,
            event="eic.factory.teardown",
            message="Service teardown completed",
            service_name=name,
            removed=len(removed),
            errors=len(errors),
            hard_errors=len(hard_errors),
            level=logging.WARNING if errors else logging.INFO,
        )
    return {
        "ok": not hard_errors,
        "service_name": name,
        "removed": removed,
        "errors": errors,
        "hard_errors": hard_errors,
    }


def set_service_enabled_files(
    workspace: Path,
    service_name: str,
    *,
    enabled: bool,
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    """Filesystem side of enable/disable (catalog + live_peers)."""
    name = assert_lifecycle_allowed(service_name)
    catalog = set_catalog_enabled(workspace, name, enabled=enabled)
    status = "verified" if enabled else "disabled"
    written = list(catalog.get("written") or [])
    written.extend(
        _set_live_peer_status(
            workspace, name, status=status, enabled=enabled
        )
    )
    if logger is not None:
        log_event(
            logger,
            event="eic.factory.set_enabled",
            message="Service enabled flag updated",
            service_name=name,
            enabled=enabled,
        )
    return {
        "ok": True,
        "service_name": name,
        "enabled": enabled,
        "written": written,
        "catalog": catalog,
    }
