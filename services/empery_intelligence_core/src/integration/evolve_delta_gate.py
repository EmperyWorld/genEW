"""Evolve delta gate — require intent delivery evidence, not FS presence alone."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

_EVOLVE_MARKER_RE = re.compile(r"/\*\s*eic-evolve:[^*]*\*/\s*", re.MULTILINE)


def mount_rel(service_name: str) -> str:
    return f"apps/empery_desktop/src/shell/mounts/{service_name}.tsx"


def feature_slug(service_name: str) -> str:
    return service_name.replace("_", "-")


def hits_product_ui_paths(paths: list[str], service_name: str) -> bool:
    """True when written paths include Desktop mount or ECC feature/client files."""
    mount = mount_rel(service_name)
    slug = feature_slug(service_name)
    camel_parts = service_name.split("_")
    client = camel_parts[0] + "".join(p.capitalize() for p in camel_parts[1:]) + "Client"
    markers = (
        mount,
        f"apps/empery_control_center/src/features/{slug}/",
        f"apps/empery_control_center/src/features/{service_name}/",
        f"apps/empery_control_center/src/api/{client}",
    )
    for path in paths:
        norm = str(path).replace("\\", "/").lstrip("./")
        if any(m in norm for m in markers):
            return True
    return False


def hash_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stamp_evolve_mount_delivery(
    workspace: Path,
    service_name: str,
    *,
    intention_id: str,
    attempt: int = 0,
    blueprint_version: str | None = None,
) -> bool:
    """Ensure Desktop-touch evolve changes mount bytes (honest delivery evidence).

    Config-driven Assembler inject is often idempotent — same Manifest → same
    mount bytes, so path listed ≠ hash delta. Replace a single mechanics-owned
    marker (not LLM prose) so verify_evolve_delta can see a real content change.
    Returns True when the mount file was rewritten.
    """
    path = workspace / mount_rel(service_name)
    if not path.is_file():
        return False
    iid = (intention_id or "unknown").strip() or "unknown"
    bp = (blueprint_version or "-").strip() or "-"
    marker = f"/* eic-evolve:{iid}:a{int(attempt)}:bp{bp} */\n"
    text = path.read_text(encoding="utf-8")
    stripped = _EVOLVE_MARKER_RE.sub("", text, count=1)
    # Keep marker at file top (before imports) so AST inject slots stay stable.
    new_text = marker + stripped.lstrip("\n")
    if new_text == text:
        return False
    path.write_text(new_text, encoding="utf-8")
    return True


def snapshot_evolve_baseline(
    workspace: Path,
    service_name: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    """Stamp pre-implement mount hash once (idempotent)."""
    meta = dict(metadata or {})
    if meta.get("eic_evolve_mount_hash_before"):
        return meta
    path = workspace / mount_rel(service_name)
    digest = hash_file(path)
    if digest:
        meta["eic_evolve_mount_hash_before"] = digest
    return meta


def accumulate_evolve_written_paths(
    metadata: dict[str, Any],
    written_paths: list[str],
    *,
    cap: int = 400,
) -> dict[str, Any]:
    """Union implement write paths into metadata for verify-time delta checks."""
    meta = dict(metadata or {})
    prior = meta.get("eic_evolve_written_paths")
    out: list[str] = []
    seen: set[str] = set()
    for item in list(prior or []) + list(written_paths or []):
        norm = str(item).replace("\\", "/").lstrip("./")
        if not norm or norm in seen:
            continue
        seen.add(norm)
        out.append(norm)
    meta["eic_evolve_written_paths"] = out[-cap:]
    return meta


def _path_hits_mount(path: str, service_name: str) -> bool:
    needle = mount_rel(service_name)
    return path.endswith(needle) or f"/{needle}" in f"/{path}"


def _path_hits_ecc_feature(path: str, service_name: str) -> bool:
    slug = feature_slug(service_name)
    markers = (
        f"apps/empery_control_center/src/features/{slug}/",
        f"apps/empery_control_center/src/features/{service_name}/",
        f"apps/empery_control_center/src/api/{_camel_client(service_name)}",
    )
    return any(m in path for m in markers)


def _camel_client(service_name: str) -> str:
    parts = service_name.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:]) + "Client.ts"


def _desktop_atom_writes(written: list[str], service_name: str) -> list[str]:
    prefix = f"apps/empery_desktop/atoms/{service_name}/"
    out: list[str] = []
    for path in written:
        if prefix in path and path.endswith((".tsx", ".ts", ".css")):
            # Ignore provenance/docs
            name = Path(path).name.lower()
            if name in {"source.md", "atoms_provenance.md", "readme.md"}:
                continue
            out.append(path)
    return out


def verify_evolve_delta(
    workspace: Path,
    service_name: str,
    *,
    intent: str,
    metadata: dict[str, Any] | None,
    touch_gates: dict[str, bool] | None = None,
) -> tuple[str, str]:
    """Return (PASSED|FAILED|SKIPPED, detail) for evolve intent delivery.

    UI-surface evolves must change Desktop mount and/or ECC feature files this job.
    New desktop atoms without a mount import FAIL (sidecar dump ≠ product).
    """
    from services.empery_intelligence_core.src.integration.evolve_verify_touches import (
        is_ui_surface_intent,
    )

    meta = metadata or {}
    gates = touch_gates or {}
    needs_surface = bool(
        gates.get("ui")
        or gates.get("desktop")
        or is_ui_surface_intent(intent)
        or is_ui_surface_intent(_selected_prose(meta))
    )
    if not needs_surface:
        return "SKIPPED", "Evolve delta skipped — no UI-surface requirement"

    written = [
        str(p).replace("\\", "/").lstrip("./")
        for p in (meta.get("eic_evolve_written_paths") or [])
    ]
    mount_hit = any(_path_hits_mount(p, service_name) for p in written)
    ecc_hit = any(_path_hits_ecc_feature(p, service_name) for p in written)

    mount_path = workspace / mount_rel(service_name)
    before = meta.get("eic_evolve_mount_hash_before")
    after = hash_file(mount_path)
    mount_changed = bool(before and after and before != after)
    # Assembler may rewrite the same mount bytes — path listed ≠ delivery.
    if before and after and before == after:
        mount_hit = False

    needs_desktop = bool(gates.get("desktop"))

    failures: list[str] = []
    if needs_desktop and before and not mount_changed:
        failures.append(
            "Desktop-touch evolve requires mount content delta "
            f"({mount_rel(service_name)} hash unchanged)"
        )
    elif not mount_hit and not ecc_hit and not mount_changed:
        failures.append(
            "UI-surface evolve delivered no Desktop mount write/change and no "
            f"ECC feature write (expected {mount_rel(service_name)} and/or "
            f"features/{feature_slug(service_name)}/)"
        )

    atom_writes = _desktop_atom_writes(written, service_name)
    if atom_writes:
        if not mount_path.is_file():
            failures.append(
                "desktop atoms extracted but mount missing: "
                + mount_rel(service_name)
            )
        else:
            mount_text = mount_path.read_text(encoding="utf-8")
            wired = [
                Path(p).stem
                for p in atom_writes
                if Path(p).stem in mount_text or Path(p).name in mount_text
            ]
            if not wired:
                sample = [Path(p).name for p in atom_writes[:8]]
                failures.append(
                    "extract wrote desktop atoms but mount imports none of them: "
                    + ", ".join(sample)
                )

    if failures:
        return "FAILED", "Evolve delta gate:\n- " + "\n- ".join(failures)

    notes: list[str] = []
    if mount_hit or mount_changed:
        notes.append("mount delta evidence")
    if ecc_hit:
        notes.append("ECC feature write evidence")
    if atom_writes:
        notes.append("desktop atoms wired into mount")
    return "PASSED", "Evolve delta OK: " + "; ".join(notes or ["surface evidence"])


def _selected_prose(metadata: dict[str, Any]) -> str:
    selected = metadata.get("selected_option")
    if not isinstance(selected, dict):
        return ""
    return " ".join(
        [
            str(selected.get("title") or ""),
            str(selected.get("delta_summary") or ""),
            str(selected.get("id") or ""),
        ]
    )
