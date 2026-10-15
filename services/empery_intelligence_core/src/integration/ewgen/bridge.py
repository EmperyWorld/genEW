"""Empery bridge into vendored EWGen generators (Fortune Seaker / Scavenger / Component Factory).

Law:
- Runtime code lives under this package (copy of EWGen generators).
- ``reference/ewgen`` is provenance only — never import it at runtime.
- Catalogs write under workspace ``.cursor/orchestration/ewgen_data/``.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any


def _ewgen_pkg_root() -> Path:
    return Path(__file__).resolve().parent


def ensure_ewgen_path() -> Path:
    """Make ``import generators...`` resolve to the vendored tree."""
    root = _ewgen_pkg_root()
    root_s = str(root)
    if root_s not in sys.path:
        sys.path.insert(0, root_s)
    return root


def configure_ewgen_data(workspace: Path) -> Path:
    """Point EWGen catalogs at Empery orchestration data (not trash EWGen)."""
    ensure_ewgen_path()
    data = (workspace.resolve() / ".cursor" / "orchestration" / "ewgen_data").resolve()
    data.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("EWGEN_IMPORT_CATALOG_PATH", str(data / "import-catalog.json"))
    os.environ.setdefault(
        "EWGEN_SCAVENGER_CATALOG_PATH", str(data / "scavenger-catalog.json")
    )
    warsmith = data / "warsmith-catalog.json"
    os.environ.setdefault("EWGEN_WARSMITH_CATALOG_PATH", str(warsmith))
    for name in (
        "import-catalog.json",
        "scavenger-catalog.json",
        "warsmith-catalog.json",
    ):
        path = data / name
        if not path.is_file():
            path.write_text("[]\n", encoding="utf-8")
    # Prefer offline / no LLM overlay unless operator opts in.
    os.environ.setdefault("EWGEN_ASE_LLM", "0")
    return data


def analyze_frontend_zip(data: bytes) -> dict[str, Any]:
    """Fortune Seaker analyze — component groups + exports."""
    ensure_ewgen_path()
    from generators.importer.analyze import analyze_zip

    return analyze_zip(data)


def analyze_backend_zip(data: bytes) -> dict[str, Any]:
    """Scavenger analyze — Python package clusters."""
    ensure_ewgen_path()
    from generators.scavenger.analyze import analyze_zip

    return analyze_zip(data)


def classify_archive(data: bytes) -> dict[str, Any]:
    ensure_ewgen_path()
    from generators.unified_ingest.classify import classify_zip_bytes

    return classify_zip_bytes(data)


def prepare_ingest_zip(
    data: bytes,
    *,
    workspace: Path,
    rematerialize: bool = False,
    save_to_catalog: bool = True,
    source_ref: str = "empery-ingest.zip",
) -> dict[str, Any]:
    """Unified prepare → FE+BE bank entries (catalog under ewgen_data)."""
    configure_ewgen_data(workspace)
    from generators.unified_ingest.prepare_orchestrate import prepare_ingest_zip as _prep

    return _prep(
        data,
        rematerialize=rematerialize,
        allow_manifest_only=False,
        save_to_catalog=save_to_catalog,
        source_ref=source_ref,
    )


def suggest_crafts(
    *,
    workspace: Path,
    intent: str,
    capabilities: list[str] | None = None,
    bank_entries: list[dict[str, Any]] | None = None,
    use_llm: bool = False,
    limit: int = 5,
) -> dict[str, Any]:
    configure_ewgen_data(workspace)
    from generators.warsmith.craft_suggest import suggest_project_crafts

    return suggest_project_crafts(
        intent=intent,
        capabilities=list(capabilities or []),
        limit=limit,
        use_llm=use_llm,
        dry_run_validate=True,
        bank_entries=bank_entries,
    )


def run_component_factory(
    data: bytes,
    *,
    workspace: Path,
    project_name: str,
    intent: str = "",
    capabilities: list[str] | None = None,
    use_llm: bool = False,
    allow_weak_contracts: bool = True,
    register: bool = False,
) -> dict[str, Any]:
    """One-shot Component Factory (prepare → suggest → compose → validate).

    ``register`` defaults False on Empery — Hands owns capsule registration.
    ``allow_weak_contracts`` defaults True so dry compose can finish without SET.
    """
    configure_ewgen_data(workspace)
    from generators.factory.component_factory_run import run_component_factory as _run

    return _run(
        data,
        project_name=project_name,
        intent=intent,
        capabilities=list(capabilities or []),
        rematerialize=False,
        allow_weak_contracts=allow_weak_contracts,
        register=register,
        overwrite=True,
        use_llm=use_llm,
        source_ref="empery-factory.zip",
    )


def atomize_files(
    files: dict[str, str],
    *,
    workspace: Path,
    origin: str = "empery",
    role: str | None = None,
) -> dict[str, Any]:
    """Deterministic atomize into workspace ``.cursor/orchestration/ewgen_data/atoms``."""
    configure_ewgen_data(workspace)
    ensure_ewgen_path()
    from generators.atomizer.atomize import atomize_files as _atomize
    from generators.atomizer.esal_layout import atoms_root

    # Point atoms under orchestration data by chdir-safe base override if supported.
    base = workspace.resolve() / ".cursor" / "orchestration" / "ewgen_data"
    base.mkdir(parents=True, exist_ok=True)
    try:
        return _atomize(
            files,
            origin=origin,
            role=role,
            base=base,
            emit_bank_event=False,
        )
    except TypeError:
        # Older signature without base — still run Core atomize.
        return _atomize(files, origin=origin, role=role, emit_bank_event=False)


def cluster_component_groups_from_zip(data: bytes) -> list[dict[str, Any]]:
    """Return Fortune Seaker ``componentGroups`` (id, paths, labels)."""
    analysis = analyze_frontend_zip(data)
    groups = analysis.get("componentGroups") or analysis.get("groups") or []
    return [g for g in groups if isinstance(g, dict)]


def materialize_group_files_to_dest(
    *,
    workspace: Path,
    zip_bytes: bytes,
    group: dict[str, Any],
    dest_rel: str,
    transforms: list[str] | None = None,
    service_name: str | None = None,
) -> dict[str, Any]:
    """Write one component group's files into Empery dest via extract_adapt transforms."""
    from services.empery_intelligence_core.src.integration.extract_adapt import (
        apply_transforms,
    )

    ws = workspace.resolve()
    dest_root = (ws / dest_rel.lstrip("./")).resolve()
    if not str(dest_root).startswith(str(ws)):
        return {"ok": False, "error": "dest outside workspace", "written": []}

    import zipfile
    from io import BytesIO

    paths = list(group.get("candidatePaths") or []) + list(group.get("assetPaths") or [])
    written: list[str] = []
    skipped: list[str] = []
    xf = list(transforms or ["strip_reference_imports", "rewrite_service_token"])
    with zipfile.ZipFile(BytesIO(zip_bytes), "r") as zf:
        names = set(zf.namelist())
        if not paths:
            # fall back: all non-dir members under first package root hint
            paths = [n for n in names if not n.endswith("/")]
        for path in paths:
            if path.endswith("/") or path not in names:
                skipped.append(path)
                continue
            try:
                raw = zf.read(path).decode("utf-8", errors="ignore")
            except KeyError:
                skipped.append(path)
                continue
            text = apply_transforms(raw, xf, service_name=service_name)
            # strip leading archive prefix (first segment often zip root)
            rel = path.replace("\\", "/")
            parts = rel.split("/")
            if len(parts) > 1 and parts[0] and not parts[0].endswith(".tsx"):
                # keep full relative under dest for traceability
                out_rel = "/".join(parts)
            else:
                out_rel = rel
            out = dest_root / out_rel
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(text, encoding="utf-8")
            written.append(str(out.relative_to(ws)).replace("\\", "/"))
    return {
        "ok": bool(written),
        "written": written,
        "skipped": skipped[:50],
        "groupId": group.get("id"),
        "label": group.get("displayLabel") or group.get("moduleName"),
        "dest": dest_rel,
    }
