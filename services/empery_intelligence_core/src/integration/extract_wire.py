"""Post-extract mount wiring — atoms stay outside Vite src/; mounts get markers."""

from __future__ import annotations

import re
from pathlib import Path

_PRESENTATIONAL_STEM_RE = re.compile(
    r"(Body|Card|Slot|Panel|Widget)$",
    re.IGNORECASE,
)

# Cap FE dump size per extract_atoms_for_intention call (evolve/genesis).
MAX_DESKTOP_FE_ATOMS_PER_EXTRACT = 24

# Prior factory bug: TS import of raw EliteEW FE into mounts broke Desktop bake.
_ATOM_IMPORT_RE = re.compile(
    r"""^\s*import\s+[\s\S]*?\s+from\s+["']\.\./\.\./\.\./atoms/"""
    r"""(?P<svc>[a-z][a-z0-9_]*)/(?P<stem>[^"']+)["']\s*;?\s*$""",
    re.MULTILINE,
)


def list_desktop_fe_atoms(written: list[str], service_name: str) -> list[str]:
    prefix = f"apps/empery_desktop/atoms/{service_name}/"
    out: list[str] = []
    for path in written:
        norm = path.replace("\\", "/")
        if prefix not in norm:
            continue
        if not norm.endswith((".tsx", ".ts", ".css")):
            continue
        name = Path(norm).name.lower()
        if name in {"source.md", "atoms_provenance.md", "readme.md"}:
            continue
        if name.endswith(".md"):
            continue
        out.append(norm)
    return out


def is_presentational_atom(path: str) -> bool:
    stem = Path(path).stem
    if path.endswith(".css"):
        return False
    return bool(_PRESENTATIONAL_STEM_RE.search(stem))


def mount_imports_any(mount_text: str, atom_paths: list[str]) -> list[str]:
    """True wire evidence: stem/name appears in mount (import *or* eic:extract-wire)."""
    wired: list[str] = []
    for path in atom_paths:
        stem = Path(path).stem
        name = Path(path).name
        if stem in mount_text or name in mount_text:
            wired.append(path)
    return wired


def strip_bake_breaking_atom_imports(
    mount_text: str,
    service_name: str,
) -> tuple[str, bool]:
    """Drop ``import … from '../../../atoms/{service}/…'`` lines from a mount.

    Extract corpus lives outside Vite ``src/`` so it cannot break the Desktop
    bake. Pulling raw EliteEW FE into the mount graph fails ``tsc`` (missing
    ``@/utils/cn``, ``@heroicons``, wrong export names, ``noUnusedLocals``).
    """
    lines = mount_text.splitlines(keepends=True)
    out: list[str] = []
    changed = False
    needle = f"atoms/{service_name}/"
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith("import ") and needle in line.replace("\\", "/"):
            changed = True
            continue
        out.append(line)
    return "".join(out), changed


def sanitize_mount_atom_imports(
    workspace: Path,
    service_name: str,
) -> bool:
    """Heal mounts that still have bake-breaking atom imports. Returns True if edited."""
    mount = (
        workspace
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service_name}.tsx"
    )
    if not mount.is_file():
        return False
    text = mount.read_text(encoding="utf-8")
    cleaned, changed = strip_bake_breaking_atom_imports(text, service_name)
    if not changed:
        return False
    mount.write_text(cleaned, encoding="utf-8")
    return True


def try_wire_single_presentational_atom(
    workspace: Path,
    service_name: str,
    atom_rel: str,
) -> bool:
    """Record extract corpus in the mount via marker (no TS import).

    Returns True when mount already references the stem or was patched.
    """
    if not is_presentational_atom(atom_rel):
        return False
    stem = Path(atom_rel).stem
    mount = (
        workspace
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service_name}.tsx"
    )
    if not mount.is_file():
        return False
    text = mount.read_text(encoding="utf-8")
    cleaned, stripped = strip_bake_breaking_atom_imports(text, service_name)
    text = cleaned
    marker = (
        f"// eic:extract-wire:{stem} — corpus under "
        f"atoms/{service_name}/ (not bake-imported)\n"
    )
    if stem in text and not stripped:
        return True
    if marker.strip() in text and not stripped:
        return True
    lines = text.splitlines(keepends=True)
    insert_at = 0
    for i, line in enumerate(lines):
        if line.lstrip().startswith("import "):
            insert_at = i + 1
    if marker.strip() not in "".join(lines):
        lines.insert(insert_at, marker)
        mount.write_text("".join(lines), encoding="utf-8")
        return True
    if stripped:
        mount.write_text("".join(lines), encoding="utf-8")
        return True
    return False


def post_extract_wire_desktop_atoms(
    workspace: Path,
    service_name: str,
    written: list[str],
    *,
    kind: str | None = None,
) -> dict[str, object]:
    """Wire or classify desktop FE atoms after extract.

    Returns metrics: new_desktop, wired, unwired, truncated, mount_patched.

    Product packs (e.g. ops_dashboard) often extract several *Body/*Slot atoms.
    Marker-wire all presentational ones — TS-import wire broke Desktop bake when
    EliteEW FE still had peer ``@/`` / ``@heroicons`` deps.
    """
    desktop = list_desktop_fe_atoms(written, service_name)
    truncated = False
    if len(desktop) > MAX_DESKTOP_FE_ATOMS_PER_EXTRACT:
        desktop = desktop[:MAX_DESKTOP_FE_ATOMS_PER_EXTRACT]
        truncated = True

    mount = (
        workspace
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service_name}.tsx"
    )
    mount_patched = False
    if sanitize_mount_atom_imports(workspace, service_name):
        mount_patched = True

    mount_text = mount.read_text(encoding="utf-8") if mount.is_file() else ""
    wired = mount_imports_any(mount_text, desktop)
    unwired = [p for p in desktop if p not in wired]

    presentational_unwired = [p for p in unwired if is_presentational_atom(p)]
    for atom_rel in presentational_unwired:
        if try_wire_single_presentational_atom(workspace, service_name, atom_rel):
            mount_patched = True
    if mount_patched or presentational_unwired:
        wired = mount_imports_any(
            mount.read_text(encoding="utf-8") if mount.is_file() else "",
            desktop,
        )
        unwired = [p for p in desktop if p not in wired]

    return {
        "new_desktop": len(desktop),
        "wired": [Path(p).name for p in wired],
        "unwired": [Path(p).name for p in unwired],
        "truncated": truncated,
        "mount_patched": mount_patched,
        "kind": (kind or "").strip().lower() or None,
    }
