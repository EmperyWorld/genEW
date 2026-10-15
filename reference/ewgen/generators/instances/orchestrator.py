# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Podman orchestrator for Dynamic Atom Layer sandboxes.
# Invariants:
# - Writes only under data/instances/{id}/; never touches core systemd DB.
# - Deploy gated by EWGEN_ASE_INSTANCE_DEPLOY=1 (default dry-run / write-only).
# Related:
# - generators/bank/events.py
# ---

"""Provision / up / down atom or project sandbox instances."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .compose_render import render_compose_and_env
from .paths import instance_dir, sanitize_instance_id

logger = logging.getLogger("ewgen.instances")

MANIFEST_NAME = "instance.json"


from generators.core_settings.runtime import get_bool


def _deploy_enabled() -> bool:
    return get_bool("EWGEN_ASE_INSTANCE_DEPLOY", default=False)


def _compose_cmd(workdir: Path) -> List[str]:
    """Prefer `podman compose`, fall back to `podman-compose`."""
    if shutil.which("podman"):
        return ["podman", "compose", "-f", "compose.yaml"]
    if shutil.which("podman-compose"):
        return ["podman-compose", "-f", "compose.yaml"]
    raise FileNotFoundError("PODMAN_MISSING: need podman or podman-compose")


def _run_compose(
    workdir: Path,
    args: List[str],
    *,
    dry_run: bool,
) -> Dict[str, Any]:
    cmd = _compose_cmd(workdir) + args
    if dry_run or not _deploy_enabled():
        logger.info(
            "[STEP] instance_compose_skip dry_run=1 cmd=%s cwd=%s",
            cmd,
            workdir,
        )
        return {
            "ok": True,
            "dryRun": True,
            "cmd": cmd,
            "cwd": str(workdir),
        }
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(workdir),
            capture_output=True,
            text=True,
            check=False,
            timeout=float(os.getenv("EWGEN_ASE_INSTANCE_TIMEOUT", "120")),
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug("[STEP] instance_compose_error err=%s", exc)
        return {"ok": False, "error": str(exc), "cmd": cmd}
    return {
        "ok": proc.returncode == 0,
        "dryRun": False,
        "cmd": cmd,
        "returncode": proc.returncode,
        "stdout": (proc.stdout or "")[-4000:],
        "stderr": (proc.stderr or "")[-4000:],
    }


def provision_instance(
    instance_id: str,
    *,
    kind: str = "atom",
    deploy: Optional[bool] = None,
    emit_event: bool = True,
) -> Dict[str, Any]:
    """
    Create data/instances/{id}/ with compose + bind-mount dirs, optionally up.

    Does **not** touch the Stable Core EWGen database.
    """
    iid = sanitize_instance_id(instance_id)
    root = instance_dir(iid)
    root.mkdir(parents=True, exist_ok=True)
    (root / "db_data").mkdir(exist_ok=True)
    (root / "redis_data").mkdir(exist_ok=True)

    rendered = render_compose_and_env(iid, kind=kind)
    sid = rendered["shortId"]
    # Materialize short id into compose (avoid env-only name expansion gaps)
    compose_body = rendered["compose"].replace("${ATOM_SHORT_ID}", sid)
    (root / "compose.yaml").write_text(compose_body, encoding="utf-8")
    (root / ".env").write_text(rendered["env"], encoding="utf-8")

    manifest = {
        "schemaVersion": "ewgen_instance_v1",
        "instanceId": iid,
        "kind": kind,
        "shortId": sid,
        "ports": rendered["ports"],
        "paths": {
            "root": str(root),
            "dbData": str(root / "db_data"),
            "redisData": str(root / "redis_data"),
            "compose": str(root / "compose.yaml"),
        },
        "coreDb": {
            "managed": False,
            "note": "Stable Core EWGen DB is systemd-owned; ASE is client-only",
        },
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    (root / MANIFEST_NAME).write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    do_deploy = _deploy_enabled() if deploy is None else bool(deploy)
    up = _run_compose(
        root,
        ["up", "-d"],
        dry_run=not do_deploy,
    )
    manifest["lastDeploy"] = up
    (root / MANIFEST_NAME).write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    result: Dict[str, Any] = {
        "ok": True,
        "instanceId": iid,
        "instancePath": str(root),
        "ports": rendered["ports"],
        "deploy": up,
        "coreDbUntouched": True,
    }

    if emit_event:
        try:
            from generators.bank.events import publish_bank_event

            publish_bank_event(
                {
                    "type": "atom_upserted"
                    if kind == "atom"
                    else "project_instance_ready",
                    "atom_id": iid,
                    "capabilities": ["instance_runtime"],
                    "sourceRef": f"instance:{kind}",
                    "instancePath": str(root),
                    "ports": rendered["ports"],
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("[STEP] instance_event_skip err=%s", exc)

    return result


def destroy_instance(
    instance_id: str,
    *,
    remove_data: bool = False,
    emit_event: bool = True,
) -> Dict[str, Any]:
    """Stop compose stack; optionally remove instance directory."""
    iid = sanitize_instance_id(instance_id)
    root = instance_dir(iid)
    if not root.is_dir():
        return {"ok": True, "instanceId": iid, "missing": True}

    down = {"ok": True, "dryRun": True}
    if (root / "compose.yaml").is_file():
        down = _run_compose(
            root,
            ["down", "-v"] if remove_data else ["down"],
            dry_run=not _deploy_enabled(),
        )

    if remove_data and root.is_dir():
        # Only under instances_root — never core paths
        shutil.rmtree(root)

    if emit_event:
        try:
            from generators.bank.events import publish_bank_event

            publish_bank_event(
                {
                    "type": "atom_retired",
                    "atom_id": iid,
                    "capabilities": [],
                    "sourceRef": "instance:destroy",
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("[STEP] instance_retire_event_skip err=%s", exc)

    return {
        "ok": True,
        "instanceId": iid,
        "down": down,
        "removed": remove_data,
        "coreDbUntouched": True,
    }


def instance_status(instance_id: str) -> Dict[str, Any]:
    iid = sanitize_instance_id(instance_id)
    root = instance_dir(iid)
    manifest_path = root / MANIFEST_NAME
    if not manifest_path.is_file():
        return {"ok": False, "instanceId": iid, "error": "NOT_PROVISIONED"}
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return {
        "ok": True,
        "instanceId": iid,
        "manifest": manifest,
        "composeExists": (root / "compose.yaml").is_file(),
        "dbDataExists": (root / "db_data").is_dir(),
        "coreDbUntouched": True,
    }
