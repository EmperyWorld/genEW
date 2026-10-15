# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Render atom-instance compose + .env from templates/atom-instance/.
# Invariants:
# - Bind-mounts under instance dir only (./db_data, ./redis_data).
# - Unique ports + container names per instance_id.
# Related:
# - templates/atom-instance/compose.yaml
# ---

"""Compose template rendering for atom sandboxes."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from .core_db_guard import assert_sandbox_safe
from .paths import short_id
from .ports import allocate_ports

TEMPLATE_DIR = (
    Path(__file__).resolve().parents[2] / "templates" / "atom-instance"
)


def render_compose_and_env(
    instance_id: str,
    *,
    kind: str = "atom",
) -> Dict[str, Any]:
    """Return rendered compose.yaml text, .env text, and port map."""
    ports = allocate_ports(instance_id)
    sid = short_id(instance_id)
    template_path = TEMPLATE_DIR / "compose.yaml"
    if not template_path.is_file():
        raise FileNotFoundError(
            f"ATOM_INSTANCE_TEMPLATE_MISSING: {template_path}"
        )
    raw = template_path.read_text(encoding="utf-8")
    # Compose `name:` and container_name use ${ATOM_SHORT_ID} — set in .env
    # Keep template literal; podman-compose substitutes from .env
    compose_text = raw
    env_lines = [
        f"# ASE Dynamic Atom Layer — {kind} instance {instance_id}",
        "# Stable Core EWGen DB is NOT managed here.",
        f"ATOM_ID={instance_id}",
        f"ATOM_SHORT_ID={sid}",
        f"ATOM_KIND={kind}",
        "ATOM_DB_USER=atom",
        "ATOM_DB_PASSWORD=atom",
        "ATOM_DB_NAME=atom_sandbox",
        f"ATOM_DB_PORT={ports['db']}",
        f"ATOM_REDIS_PORT={ports['redis']}",
        "",
    ]
    env_text = "\n".join(env_lines)
    assert_sandbox_safe(
        [compose_text, env_text, f"data/instances/{instance_id}/db_data"],
        context=instance_id,
    )
    return {
        "compose": compose_text,
        "env": env_text,
        "ports": ports,
        "shortId": sid,
        "kind": kind,
    }
