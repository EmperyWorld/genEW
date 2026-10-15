"""Map host workspace paths to container paths for gRPC Mechanics.

When Brain runs on the host against a containerized ``empery_assembler``
(shared bind mount), set::

  EIC_ASSEMBLER_WORKSPACE_MAP=/data/repos/genEW:/app

Compose (both sides ``/app``) leaves the env unset — no rewrite.

Content-transfer (Phase 6): when Mechanics does **not** share the Brain FS,
set ``EIC_ASSEMBLER_SHARED_FS=0`` (or ``EIC_ASSEMBLER_CONTENT_TRANSFER=1``).
Brain then requests ``include_artifact_bytes`` and materializes onto its workspace.
"""

from __future__ import annotations

import os
from pathlib import Path


def map_workspace_for_grpc(workspace: Path | str) -> Path:
    """Rewrite workspace_root sent on the wire; leave local FS ops on the original."""
    raw = os.environ.get("EIC_ASSEMBLER_WORKSPACE_MAP", "").strip()
    if not raw or ":" not in raw:
        return Path(workspace)
    host_prefix, container_prefix = raw.split(":", 1)
    host_prefix = host_prefix.rstrip("/")
    container_prefix = container_prefix.rstrip("/") or "/"
    text = str(workspace)
    if text == host_prefix or text.startswith(host_prefix + "/"):
        suffix = text[len(host_prefix) :]
        return Path(container_prefix + suffix)
    try:
        resolved = str(Path(workspace).resolve())
    except OSError:
        return Path(workspace)
    if resolved == host_prefix or resolved.startswith(host_prefix + "/"):
        suffix = resolved[len(host_prefix) :]
        return Path(container_prefix + suffix)
    return Path(workspace)


def _env_flag(name: str) -> str | None:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return None
    if raw in {"1", "true", "yes", "on"}:
        return "on"
    if raw in {"0", "false", "no", "off"}:
        return "off"
    return None


def needs_artifact_content_transfer(workspace: Path | str | None = None) -> bool:
    """True when Brain must pull artifact bytes (no shared FS with Mechanics).

    Priority:
    1. ``EIC_ASSEMBLER_CONTENT_TRANSFER`` force on/off
    2. ``EIC_ASSEMBLER_SHARED_FS`` — ``0`` means remote-only → transfer on
    3. Default: shared FS (compose bind / host map to same volume) → off
    """
    transfer = _env_flag("EIC_ASSEMBLER_CONTENT_TRANSFER")
    if transfer == "on":
        return True
    if transfer == "off":
        return False
    shared = _env_flag("EIC_ASSEMBLER_SHARED_FS")
    if shared == "off":
        return True
    if shared == "on":
        return False
    # Non-directory workspace cannot share bind — request bytes.
    if workspace is not None and not Path(workspace).is_dir():
        return True
    return False
