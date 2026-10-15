# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Persistent operator registry for assembled project shells (Stage 7).
# Invariants:
# - Registry metadata never replaces project.manifest.json as shell SSOT.
# - Writes are lock-protected and contain no secrets.
# Related:
# - generators/project_shell/lifecycle.py
# - routers/project.py
# ---

"""Project shell registration metadata."""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .paths import ewgen_root

_registry_lock = threading.Lock()


def project_registry_path() -> Path:
    configured = os.getenv("EWGEN_PROJECT_REGISTRY_PATH", "").strip()
    if configured:
        return Path(configured)
    return ewgen_root() / "data" / "project-registry.json"


def _read_registry() -> List[Dict[str, Any]]:
    path = project_registry_path()
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def list_registrations() -> List[Dict[str, Any]]:
    with _registry_lock:
        return _read_registry()


def get_registration(project_id: str) -> Optional[Dict[str, Any]]:
    normalized = project_id.strip()
    return next(
        (
            item
            for item in list_registrations()
            if str(item.get("projectId") or "") == normalized
        ),
        None,
    )


def register_project(
    *,
    project_id: str,
    display_name: str,
    health_url: Optional[str] = None,
    division_slug: Optional[str] = None,
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with _registry_lock:
        entries = _read_registry()
        existing = next(
            (
                item
                for item in entries
                if str(item.get("projectId") or "") == project_id
            ),
            None,
        )
        registered_at = (
            str(existing.get("registeredAt") or now) if existing else now
        )
        entry = {
            "projectId": project_id,
            "displayName": display_name,
            "divisionSlug": (
                division_slug.strip()
                if division_slug
                else f"generation-{project_id}"
            ),
            "healthUrl": health_url.strip() if health_url else None,
            "registeredAt": registered_at,
            "updatedAt": now,
            "status": "registered",
        }
        entries = [
            item
            for item in entries
            if str(item.get("projectId") or "") != project_id
        ]
        entries.insert(0, entry)
        path = project_registry_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(entries, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return entry


def unregister_project(project_id: str) -> Dict[str, Any]:
    """Remove project from operator registry (shell files retained)."""
    normalized = project_id.strip()
    with _registry_lock:
        entries = _read_registry()
        before = len(entries)
        entries = [
            item
            for item in entries
            if str(item.get("projectId") or "") != normalized
        ]
        path = project_registry_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(entries, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return {
            "ok": True,
            "projectId": normalized,
            "unregistered": before != len(entries),
            "status": "unregistered",
        }
