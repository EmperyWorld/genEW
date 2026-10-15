"""Mechanical copy/adapt from EliteEW or reference corpus into Empery paths.

Never writes into EliteEW. Never used as a runtime import path.
"""

from __future__ import annotations

import os
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


_SERVICE_TOKEN_RE = re.compile(r"\{service_name\}")
_REFERENCE_IMPORT_RE = re.compile(
    r"^\s*(from|import)\s+reference(\.|/|\s)",
    re.MULTILINE,
)


@dataclass
class ExtractResult:
    ok: bool
    written: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    error: str | None = None
    mode: str = "genesis"


def default_eliteew_root() -> Path:
    raw = os.environ.get("ELITEEW_ROOT", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return Path("/home/owned/powered_by_emperyworld/EliteEW").resolve()


def _is_under(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def apply_transforms(
    text: str,
    transforms: Iterable[str],
    *,
    service_name: str | None = None,
) -> str:
    out = text
    for name in transforms:
        key = str(name).strip().lower()
        if key in {"strip_reference_imports", "strip_reference_import"}:
            out = _REFERENCE_IMPORT_RE.sub("# stripped reference import\n", out)
        elif key in {"rewrite_service_token", "service_token"}:
            if service_name:
                out = _SERVICE_TOKEN_RE.sub(service_name, out)
        # unknown transforms ignored (forward-compatible)
    return out


def _expand_globs(workspace: Path, pattern: str) -> list[Path]:
    rel = pattern.strip().lstrip("./")
    # Absolute EliteEW paths handled by caller
    root = workspace
    # Py3.12: `dir/**` matches directories only; use rglob for recursive file listing.
    if rel.endswith("/**"):
        base = root / rel[: -len("/**")]
        if base.is_dir():
            return sorted(p for p in base.rglob("*") if p.is_file())
        return []
    if rel.endswith("/**/*"):
        base = root / rel[: -len("/**/*")]
        if base.is_dir():
            return sorted(p for p in base.rglob("*") if p.is_file())
        return []
    if "*" in rel or "?" in rel or "[" in rel:
        return sorted(p for p in root.glob(rel) if p.is_file())
    path = root / rel
    if path.is_file():
        return [path]
    if path.is_dir():
        return sorted(p for p in path.rglob("*") if p.is_file())
    return []


def _dest_for_file(
    *,
    src: Path,
    dest_root: Path,
    source_anchor: Path | None,
) -> Path:
    if source_anchor is not None and _is_under(src, source_anchor):
        rel = src.relative_to(source_anchor)
        return dest_root / rel
    return dest_root / src.name


def extract_adapt(
    *,
    workspace: Path,
    source_glob: str,
    dest: str,
    transforms: list[str] | None = None,
    service_name: str | None = None,
    eliteew_root: Path | None = None,
    mode: str | None = None,
) -> ExtractResult:
    """Copy files matching source_glob into dest with optional transforms.

    Modes:
    - genesis (default): source under workspace ``reference/`` or ``core/``;
      dest under ``services/`` | ``apps/empery_desktop/`` | ``apps/empery_control_center/``
    - corpus: source under EliteEW ``api/`` or ``web/frontend/src/``;
      dest under ``reference/eliteew/``
    """
    ws = workspace.resolve()
    transforms = list(transforms or [])
    elite = (eliteew_root or default_eliteew_root()).resolve()
    src_pat = source_glob.strip().lstrip("./")
    dest_rel = dest.strip().lstrip("./")
    if service_name:
        dest_rel = _SERVICE_TOKEN_RE.sub(service_name, dest_rel)
        src_pat = _SERVICE_TOKEN_RE.sub(service_name, src_pat)

    inferred = mode
    if inferred is None:
        if src_pat.startswith("reference/") or src_pat.startswith("core/"):
            inferred = "genesis"
        elif _looks_eliteew_rel(src_pat):
            inferred = "corpus"
        else:
            inferred = "genesis"

    if inferred == "corpus":
        return _extract_corpus(
            workspace=ws,
            eliteew_root=elite,
            source_glob=src_pat,
            dest_rel=dest_rel,
            transforms=transforms,
            service_name=service_name,
        )
    return _extract_genesis(
        workspace=ws,
        source_glob=src_pat,
        dest_rel=dest_rel,
        transforms=transforms,
        service_name=service_name,
    )


def _looks_eliteew_rel(src_pat: str) -> bool:
    return src_pat.startswith("api/") or src_pat.startswith("web/frontend/")


def _extract_corpus(
    *,
    workspace: Path,
    eliteew_root: Path,
    source_glob: str,
    dest_rel: str,
    transforms: list[str],
    service_name: str | None,
) -> ExtractResult:
    if not dest_rel.startswith("reference/eliteew/"):
        return ExtractResult(
            ok=False,
            error="corpus mode dest must be under reference/eliteew/",
            mode="corpus",
        )
    if not eliteew_root.is_dir():
        return ExtractResult(
            ok=False,
            error=f"EliteEW root missing: {eliteew_root}",
            mode="corpus",
        )
    dest_root = (workspace / dest_rel).resolve()
    if not _is_under(dest_root, workspace / "reference" / "eliteew"):
        return ExtractResult(
            ok=False,
            error="corpus dest escaped reference/eliteew",
            mode="corpus",
        )

    # Resolve globs relative to EliteEW root
    matches: list[Path] = []
    if "*" in source_glob or "?" in source_glob:
        matches = sorted(p for p in eliteew_root.glob(source_glob) if p.is_file())
    else:
        cand = eliteew_root / source_glob
        if cand.is_file():
            matches = [cand]
        elif cand.is_dir():
            matches = sorted(p for p in cand.rglob("*") if p.is_file())

    if not matches:
        return ExtractResult(
            ok=False,
            error=f"no files matched under EliteEW: {source_glob}",
            mode="corpus",
        )

    written: list[str] = []
    skipped: list[str] = []
    for src in matches:
        if not _is_under(src, eliteew_root):
            skipped.append(str(src))
            continue
        # Never write into EliteEW
        if _is_under(dest_root, eliteew_root):
            return ExtractResult(
                ok=False,
                error="refusing to write into EliteEW",
                mode="corpus",
            )
        rel = src.relative_to(eliteew_root)
        target = dest_root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        if src.suffix.lower() in {".tsx", ".ts", ".py", ".md", ".json", ".css"}:
            try:
                text = src.read_text(encoding="utf-8")
            except OSError as exc:
                return ExtractResult(ok=False, error=str(exc), mode="corpus")
            text = apply_transforms(text, transforms, service_name=service_name)
            target.write_text(text, encoding="utf-8")
        else:
            shutil.copy2(src, target)
        written.append(str(target.relative_to(workspace)).replace("\\", "/"))

    return ExtractResult(ok=True, written=written, skipped=skipped, mode="corpus")


def _allowed_genesis_dest(dest_rel: str) -> bool:
    return (
        dest_rel.startswith("services/")
        or dest_rel.startswith("apps/empery_desktop/")
        or dest_rel.startswith("apps/empery_control_center/")
        or dest_rel.startswith("reference/eliteew/")  # rare re-homing
    )


def _extract_genesis(
    *,
    workspace: Path,
    source_glob: str,
    dest_rel: str,
    transforms: list[str],
    service_name: str | None,
) -> ExtractResult:
    if not (
        source_glob.startswith("reference/")
        or source_glob.startswith("core/")
    ):
        return ExtractResult(
            ok=False,
            error="genesis source_glob must be under reference/ or core/",
            mode="genesis",
        )
    if not _allowed_genesis_dest(dest_rel):
        return ExtractResult(
            ok=False,
            error=(
                "genesis dest must be under services/, apps/empery_desktop/, "
                "or apps/empery_control_center/"
            ),
            mode="genesis",
        )

    matches = _expand_globs(workspace, source_glob)
    if not matches:
        return ExtractResult(
            ok=False,
            error=f"no files matched: {source_glob}",
            mode="genesis",
        )

    dest_path = (workspace / dest_rel).resolve()
    if not _is_under(dest_path, workspace):
        return ExtractResult(ok=False, error="dest escaped workspace", mode="genesis")

    # Anchor = longest existing prefix directory of the glob without wildcards
    anchor_rel = source_glob.split("*", 1)[0].rstrip("/")
    source_anchor = (workspace / anchor_rel).resolve() if anchor_rel else None
    if source_anchor is not None and not source_anchor.is_dir():
        source_anchor = source_anchor.parent if source_anchor.exists() else None

    written: list[str] = []
    skipped: list[str] = []
    dest_is_dir = dest_rel.endswith("/") or dest_path.is_dir() or not dest_path.suffix
    if dest_is_dir:
        dest_path.mkdir(parents=True, exist_ok=True)

    for src in matches:
        if not (_is_under(src, workspace / "reference") or _is_under(src, workspace / "core")):
            skipped.append(str(src))
            continue
        if dest_is_dir:
            target = _dest_for_file(src=src, dest_root=dest_path, source_anchor=source_anchor)
        else:
            target = dest_path
        target.parent.mkdir(parents=True, exist_ok=True)
        if src.suffix.lower() in {".tsx", ".ts", ".py", ".md", ".json", ".css"}:
            try:
                text = src.read_text(encoding="utf-8")
            except OSError as exc:
                return ExtractResult(ok=False, error=str(exc), mode="genesis")
            text = apply_transforms(text, transforms, service_name=service_name)
            target.write_text(text, encoding="utf-8")
        else:
            shutil.copy2(src, target)
        written.append(str(target.relative_to(workspace)).replace("\\", "/"))

    return ExtractResult(ok=True, written=written, skipped=skipped, mode="genesis")


def extract_from_catalog_entry(
    *,
    workspace: Path,
    entry: dict[str, Any],
    service_name: str,
    dest_subdir: str = "atoms",
) -> ExtractResult:
    """Copy pack extract_globs into catalog ``empery_targets`` (not a dead sidecar).

    Routing:
    - FE (``tsx``/``ts``/``css``) → ``apps/empery_desktop/atoms/{service}/``
      (outside Vite ``src/`` so corpus cannot break the Desktop build)
    - ``.py`` → ``services/{service}/src/integration/atoms/``
    - Incomplete ``*.snippet.*`` stored as ``.txt`` under the desktop atoms tree
    - Provenance note under the service atoms dir
    """
    globs = entry.get("extract_globs") or []
    transforms = list(entry.get("transforms") or [])
    targets = [
        str(t).replace("{service_name}", service_name)
        for t in (entry.get("empery_targets") or [])
        if t
    ]
    if not isinstance(globs, list) or not globs:
        return ExtractResult(ok=False, error="catalog entry missing extract_globs")

    desktop_dest = _desktop_atoms_dest(targets, service_name)
    service_dest = _service_atoms_dest(targets, service_name, dest_subdir)

    from services.empery_intelligence_core.src.integration.extract_wire import (
        MAX_DESKTOP_FE_ATOMS_PER_EXTRACT,
        is_presentational_atom,
    )

    all_written: list[str] = []
    desktop_fe_written = 0
    errors: list[str] = []
    for g in globs:
        if not isinstance(g, str) or not g.strip():
            continue
        g_norm = g.strip()
        matches = _expand_globs(workspace, g_norm)
        if not matches:
            continue
        # Prefer presentational FE atoms when capping desktop dumps.
        fe_matches = [
            s
            for s in matches
            if s.suffix.lower() in {".tsx", ".ts", ".css"}
        ]
        other_matches = [s for s in matches if s not in fe_matches]
        fe_matches.sort(
            key=lambda s: (
                0
                if is_presentational_atom(
                    f"apps/empery_desktop/atoms/{service_name}/{s.name}"
                )
                else 1,
                s.name.lower(),
            )
        )
        ordered = fe_matches + other_matches
        for src in ordered:
            suffix = src.suffix.lower()
            is_snippet = ".snippet." in src.name.lower()
            if suffix in {".tsx", ".ts", ".css", ".md"} and (
                "upstream_fe" in str(src)
                or "/slim/" in str(src)
                or "/desktop_mount/" in str(src)
            ):
                dest = desktop_dest
            elif suffix == ".py" or "upstream_api" in str(src):
                dest = service_dest
            elif "empery_desktop" in ",".join(targets) and suffix in {
                ".tsx",
                ".ts",
                ".css",
            }:
                dest = desktop_dest
            else:
                dest = service_dest
            if dest == desktop_dest and suffix in {".tsx", ".ts", ".css"}:
                if desktop_fe_written >= MAX_DESKTOP_FE_ATOMS_PER_EXTRACT:
                    continue
            # Snippets are not valid modules — force .txt name via dest file path
            if is_snippet and dest == desktop_dest:
                dest_file = f"{desktop_dest.rstrip('/')}/{src.stem}.txt"
                result = extract_adapt(
                    workspace=workspace,
                    source_glob=str(src.relative_to(workspace)).replace("\\", "/"),
                    dest=dest_file,
                    transforms=transforms,
                    service_name=service_name,
                    mode="genesis",
                )
            else:
                result = extract_adapt(
                    workspace=workspace,
                    source_glob=str(src.relative_to(workspace)).replace("\\", "/"),
                    dest=dest,
                    transforms=transforms,
                    service_name=service_name,
                    mode="genesis",
                )
            if result.ok:
                all_written.extend(result.written)
                if dest == desktop_dest:
                    desktop_fe_written += sum(
                        1
                        for w in result.written
                        if w.replace("\\", "/").endswith((".tsx", ".ts", ".css"))
                    )
            elif result.error and "no files matched" not in (result.error or ""):
                errors.append(result.error or "extract failed")

    if all_written:
        note = _write_atoms_provenance(
            workspace=workspace,
            service_dest=service_dest,
            service_name=service_name,
            pack=str(entry.get("pack") or ""),
            written=all_written,
        )
        if note:
            all_written.append(note)
        return ExtractResult(ok=True, written=all_written, mode="genesis")
    if errors:
        return ExtractResult(ok=False, error="; ".join(errors[:3]), mode="genesis")
    return ExtractResult(
        ok=False,
        error="no extract_globs produced files for empery_targets",
        mode="genesis",
    )


def _desktop_atoms_dest(targets: list[str], service_name: str) -> str:
    """Place FE atoms outside Vite ``src/`` so snippets cannot break the build."""
    for t in targets:
        if "empery_desktop" in t:
            # Prefer dedicated atoms tree (not under src/shell/mounts)
            return f"apps/empery_desktop/atoms/{service_name}/"
    return f"apps/empery_desktop/atoms/{service_name}/"


def _service_atoms_dest(
    targets: list[str], service_name: str, dest_subdir: str
) -> str:
    for t in targets:
        if t.startswith("services/"):
            # services/{name}/ or services/{name}/src/integration/
            if "/src/" in t:
                return f"{t.rstrip('/')}/{dest_subdir}/"
            return f"services/{service_name}/src/integration/{dest_subdir}/"
    return f"services/{service_name}/src/integration/{dest_subdir}/"


def _write_atoms_provenance(
    *,
    workspace: Path,
    service_dest: str,
    service_name: str,
    pack: str,
    written: list[str],
) -> str | None:
    dest_dir = (workspace / service_dest).resolve()
    try:
        dest_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        return None
    note = dest_dir / "ATOMS_PROVENANCE.md"
    lines = [
        f"# Atoms extracted for `{service_name}`",
        "",
        f"- pack: `{pack}`",
        f"- files: {len(written)}",
        "",
        "## Paths",
        *[f"- `{p}`" for p in written[:40]],
        "",
        "Adapt these into Empery anatomy; never import `reference/` at runtime.",
    ]
    note.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return str(note.relative_to(workspace)).replace("\\", "/")

