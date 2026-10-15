"""Load assembly recipes for LLM prompts (assemble from parts, don't invent)."""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from services.empery_intelligence_core.src.integration.assembly_profiles import (
    AssemblySelection,
    is_law_pack,
    is_product_pack,
    resolve_scaffold_profile,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)

_log = logging.getLogger("eic.recipe_catalog")

_MAX_CHARS = 22_000
_MAX_EXTRACT_PATHS = 32
_MAX_SEED_FILES = 6
_MAX_SEED_CHARS = 2_800

# Prefer these UI-heavy extract filenames when seeding Implementer prompts.
_UI_SEED_HINTS = (
    "companionslim",
    "companionchat",
    "ewadesktop",
    "studiochrome",
    "studioshared",
    "imagestudiopage",
    "musicforge",
    "videostudio",
    "doceditor",
    "usersitestudio",
)
_LAW_PACKS = (
    "service_anatomy.md",
    "desktop_mount_catalog.md",
    "verify_gates.md",
    "service_factory.md",
)

_SOURCE_PATH_RE = re.compile(
    r"^\s*[-*]\s+`?(/[^\s`]+\.\w+|reference/[^\s`]+|/home/[^\s`]+\.\w+)`?",
    re.MULTILINE,
)


def recipes_root(paths: EicOrchestrationPaths) -> Path:
    return paths.orchestration_root / "recipes"


def atom_catalog_path(paths: EicOrchestrationPaths) -> Path:
    return recipes_root(paths) / "atom_catalog.yaml"


@lru_cache(maxsize=4)
def _load_atom_catalog_raw(catalog_file: str) -> dict[str, Any]:
    path = Path(catalog_file)
    if not path.is_file():
        return {}
    try:
        import yaml  # type: ignore
    except ImportError:
        # Minimal YAML subset for our catalog (no nested complexity beyond lists)
        return _parse_simple_atom_yaml(path.read_text(encoding="utf-8"))
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        _log.warning("atom_catalog yaml load failed: %s", exc)
        return {}
    return data if isinstance(data, dict) else {}


def _parse_simple_atom_yaml(text: str) -> dict[str, Any]:
    """Fallback parser when PyYAML is absent — enough for atom_catalog.yaml."""
    packs: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    list_key: str | None = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith("packs:"):
            continue
        if line.startswith("  - pack:"):
            if current:
                packs.append(current)
            current = {"pack": line.split(":", 1)[1].strip()}
            list_key = None
            continue
        if current is None:
            continue
        if line.startswith("    ") and ":" in line and not line.strip().startswith("-"):
            key, _, val = line.strip().partition(":")
            key = key.strip()
            val = val.strip()
            if val == "":
                current[key] = []
                list_key = key
            else:
                current[key] = val.strip("\"'")
                list_key = None
            continue
        if list_key and line.strip().startswith("- "):
            item = line.strip()[2:].strip().strip("\"'")
            current.setdefault(list_key, []).append(item)
    if current:
        packs.append(current)
    return {"packs": packs}


def load_atom_catalog(paths: EicOrchestrationPaths) -> dict[str, Any]:
    path = atom_catalog_path(paths)
    return _load_atom_catalog_raw(str(path.resolve()))


def atom_catalog_entry(paths: EicOrchestrationPaths, pack_stem: str) -> dict[str, Any] | None:
    data = load_atom_catalog(paths)
    packs = data.get("packs") or []
    if not isinstance(packs, list):
        return None
    for entry in packs:
        if isinstance(entry, dict) and entry.get("pack") == pack_stem:
            return dict(entry)
    return None


def product_atom_entries_for_stems(
    paths: EicOrchestrationPaths, stems: list[str] | tuple[str, ...]
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for stem in stems:
        if is_law_pack(stem) or not is_product_pack(stem):
            continue
        entry = atom_catalog_entry(paths, stem)
        if entry:
            out.append(entry)
    return out


def _is_create_or_evolve_intent(hay: str) -> bool:
    return any(
        k in hay
        for k in (
            "create",
            "scaffold",
            "genesis",
            "create-service",
            "create_service",
            "new service",
            "evolve",
            "anatomy",
            "verify",
            "assemble",
        )
    )


_DOC_EDITOR_KEYWORDS = (
    "doc_editor",
    "document editor",
    "tiptap",
    "rich text",
    "notepad",
    "bloknot",
    "блокнот",
    "notes app",
    "notes tool",
    "longread",
    "long read",
    "типограф",
    "notebook",
)

_OPS_DASHBOARD_KEYWORDS = (
    "ops_dashboard",
    "ops dashboard",
    "dashboard",
    "дашборд",
    "metrics board",
    "метрики",
    "jtbd board",
    "jtbd",
    "kpi board",
)

_KANBAN_TASK_KEYWORDS = (
    "kanban",
    "task board",
    "taskboard",
    "задачи",
    "доска задач",
    "todo board",
)

_CRUD_DIRECTORY_KEYWORDS = (
    "справочник",
    "directory",
    "crud list",
    "crud app",
    "entity list",
    "catalog crud",
    "reference book",
)

_SITE_STUDIO_KEYWORDS = (
    "site_studio",
    "site studio",
    "usersitestudio",
    "user site studio",
    "site builder",
)

_EWRP_KEYWORDS = (
    "ewrp",
    "presentation_ai",
    "presentation ai",
    "presentationsai",
    "presentation",
    "presentations",
    "презентац",
    "слайд",
    "slides",
    "slide deck",
    "deck generator",
    "pptx",
    "powerpoint",
)

_IMAGE_STUDIO_KEYWORDS = (
    "image studio",
    "text-to-image",
    "text to image",
    "image_studio",
    "comfy",
    "comfyui",
    "image peer",
    "z-image",
    "text_to_image",
)

_VIDEO_STUDIO_KEYWORDS = (
    "video_studio",
    "video studio",
    "text-to-video",
    "text to video",
    "video generation",
    "image-to-video",
    "image_to_video",
    "wan",
    "i2v",
    "wan2.2",
)

_RESEARCH_REPORT_KEYWORDS = (
    "research",
    "исследован",
    "market report",
    "marketing report",
    "маркетинг отчёт",
    "маркетинг отчет",
    "analyst report",
    "report builder",
)

_STUDIO_PRODUCT_KEYWORDS = (
    "studio",
    "image studio",
    "creative",
    "text-to-image",
    "text to image",
    "video_studio",
    "video studio",
    "text-to-video",
    "text to video",
    "video generation",
    "music_forge",
    "musicforge",
    "music forge",
    "text-to-music",
    "text to music",
    "audio generation",
    "ace-step",
    "site_studio",
    "site studio",
    "usersitestudio",
    "user site studio",
    "site builder",
    "comfy",
    "comfyui",
    "image_studio",
    "image peer",
    "z-image",
    "text_to_image",
)

_COMPANION_KEYWORDS = (
    "ewa_companion",
    "ewa companion",
    "companion slim",
    "companionslim",
    "companion dock",
    "companion chat",
    "companion_chat",
    "companionchat",
    "ewa app",
    "ai chat",
    "ai_chat",
    "aichat",
)

_CHAT_SIGNAL_KEYWORDS = (
    "чат",
    "chat",
    "companion",
    "сообщени",
    "transcript",
)

_STRONG_NON_CHAT_PRODUCT_KEYWORDS = (
    *_DOC_EDITOR_KEYWORDS,
    *_OPS_DASHBOARD_KEYWORDS,
    *_KANBAN_TASK_KEYWORDS,
    *_CRUD_DIRECTORY_KEYWORDS,
    *_RESEARCH_REPORT_KEYWORDS,
    *_SITE_STUDIO_KEYWORDS,
    *_EWRP_KEYWORDS,
    *_STUDIO_PRODUCT_KEYWORDS,
    "crud",
    "directory list",
)


def _has_keyword(hay: str, keywords: tuple[str, ...]) -> bool:
    return any(k in hay for k in keywords)


def _has_chat_signal(hay: str) -> bool:
    return _has_keyword(hay, _CHAT_SIGNAL_KEYWORDS)


def _strong_non_chat_product(hay: str) -> bool:
    return _has_keyword(hay, _STRONG_NON_CHAT_PRODUCT_KEYWORDS)


def _should_add_ewa_companion(hay: str) -> bool:
    """Companion pack only for explicit chat/companion intents — not bare llm/ai traps.

    Strong product intents (research/ops/task/studio/notes) win over accidental
    substrings like \"not companion chat\" in operator prose.
    """
    if _strong_non_chat_product(hay):
        # Explicit Ewa/companion product tokens only — negation phrases must not steal.
        return _has_keyword(
            hay,
            (
                "ewa_companion",
                "ewa companion",
                "ewa app",
                "companion slim",
                "companionslim",
                "companion dock",
                "companion_chat",
                "companionchat",
                "ai chat",
                "ai_chat",
                "aichat",
            ),
        )
    if _has_keyword(hay, _COMPANION_KEYWORDS):
        return True
    if (
        re.search(r"\bcompanion\b", hay)
        and not _has_keyword(hay, ("studio", "shell_host", "desktop_shell"))
    ):
        return True
    # Bare llm/ai must not force companion without chat signal.
    if re.search(r"\b(?:llm|ai)\b", hay) and not _has_chat_signal(hay):
        return False
    return False


def _eliteew_root(paths: EicOrchestrationPaths) -> Path:
    return paths.workspace_root / "reference" / "eliteew"


def match_recipe_pack_names(
    *,
    service_name: str | None = None,
    intent: str | None = None,
    explicit_packs: list[str] | None = None,
) -> list[str]:
    """Return ordered recipe markdown filenames (with .md) for this intention."""
    pack_names: list[str] = []
    hay = f"{service_name or ''} {intent or ''}".lower()

    if explicit_packs:
        for raw in explicit_packs:
            name = raw.strip()
            if not name:
                continue
            if not name.endswith(".md"):
                name = f"{name}.md"
            pack_names.append(name)

    if _is_create_or_evolve_intent(hay):
        pack_names.extend(_LAW_PACKS)
        pack_names.append("ewgen_factory.md")

    if any(
        k in hay
        for k in (
            "ewgen",
            "fortune seaker",
            "fortuneseaker",
            "scavenger",
            "warsmith",
            "component factory",
            "component_factory",
            "atomize",
            "atomizer",
            "unified ingest",
        )
    ):
        if "ewgen_factory.md" not in pack_names:
            pack_names.append("ewgen_factory.md")

    if any(
        k in hay
        for k in (
            "desktop_shell",
            "desktop shell",
            "shell_kernel",
            "shell kernel",
            "ewdesk",
            "ew desk",
        )
    ):
        pack_names.append("desktop_shell_kernel.md")
    if any(k in hay for k in ("snap", "window", "geometry", "taskbar")):
        pack_names.append("window_snap.md")

    # Strong non-chat product intents (before weak llm/ai/companion traps).
    if _has_keyword(hay, _DOC_EDITOR_KEYWORDS):
        pack_names.append("doc_editor.md")
        if _has_keyword(hay, ("notes", "блокнот", "notepad", "notebook", "notes_tool")):
            pack_names.append("notes_tool.md")
            # Product atom pack for extract_adapt (notes_tool recipe → notes_crud corpus).
            pack_names.append("notes_crud.md")
    # Presentation / EWRP before ops_dashboard — "дашборд истории презентаций"
    # must not steal the product pack to metrics-only ops.
    has_ewrp = _has_keyword(hay, _EWRP_KEYWORDS)
    if has_ewrp:
        pack_names.append("ewrp.md")
        if "nervas_llm_peer.md" not in pack_names:
            pack_names.append("nervas_llm_peer.md")
    if _has_keyword(hay, _OPS_DASHBOARD_KEYWORDS) and not has_ewrp:
        pack_names.append("ops_dashboard.md")
    if _has_keyword(hay, _KANBAN_TASK_KEYWORDS):
        pack_names.append("task_board.md")
    if _has_keyword(hay, _CRUD_DIRECTORY_KEYWORDS):
        if "service_factory.md" not in pack_names:
            pack_names.append("service_factory.md")
    if _has_keyword(hay, _RESEARCH_REPORT_KEYWORDS):
        pack_names.append("research_report.md")
        if "nervas_llm_peer.md" not in pack_names:
            pack_names.append("nervas_llm_peer.md")

    if _has_keyword(hay, _SITE_STUDIO_KEYWORDS):
        pack_names.append("site_studio.md")
        if "nervas_llm_peer.md" not in pack_names:
            pack_names.append("nervas_llm_peer.md")
    # Image/creative studios — do not steal site_studio ("site studio" contains "studio").
    has_video = _has_keyword(hay, _VIDEO_STUDIO_KEYWORDS)
    has_image = _has_keyword(hay, _IMAGE_STUDIO_KEYWORDS)
    if has_video:
        pack_names.append("video_studio.md")
        if "studios.md" not in pack_names:
            pack_names.append("studios.md")
    if has_image and not has_video:
        pack_names.append("comfy_image_peer.md")
        if "studios.md" not in pack_names:
            pack_names.append("studios.md")
    elif not has_video and (
        _has_keyword(hay, ("creative",))
        or (
            re.search(r"\bstudio\b", hay)
            and not _has_keyword(hay, _SITE_STUDIO_KEYWORDS)
        )
    ):
        pack_names.append("studios.md")
    if _has_keyword(
        hay,
        (
            "music_forge",
            "musicforge",
            "music forge",
            "text-to-music",
            "text to music",
            "audio generation",
            "ace-step",
            "acestep",
            "music generation",
        ),
    ):
        pack_names.append("music_forge.md")
    if _should_add_ewa_companion(hay):
        pack_names.append("ewa_companion.md")
        if "nervas_llm_peer.md" not in pack_names:
            pack_names.append("nervas_llm_peer.md")
    if _has_keyword(
        hay,
        (
            "nervas",
            "llm",
            "llama",
            "living brain",
            "fakeai",
            "fake nervas",
            "openai-compatible",
            "gemma",
        ),
    ):
        if "nervas_llm_peer.md" not in pack_names:
            pack_names.append("nervas_llm_peer.md")
    if any(k in hay for k in ("mount", "catalog", "start menu", "desktop app")):
        if "desktop_mount_catalog.md" not in pack_names:
            pack_names.append("desktop_mount_catalog.md")

    seen: set[str] = set()
    ordered: list[str] = []
    for name in pack_names:
        if name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


def _source_candidates(paths: EicOrchestrationPaths, stem: str) -> list[Path]:
    elite = _eliteew_root(paths)
    cands = [
        elite / "packs" / stem / "SOURCE.md",
        elite / "packs" / stem.replace("_", "-") / "SOURCE.md",
    ]
    if stem in {"desktop_shell_kernel", "desktop_shell"}:
        cands.insert(0, elite / "desktop" / "SOURCE.md")
        cands.append(elite / "SOURCE.md")
    return cands


def _pack_dir(paths: EicOrchestrationPaths, stem: str) -> Path | None:
    elite = _eliteew_root(paths)
    for cand in (
        elite / "packs" / stem,
        elite / "packs" / stem.replace("_", "-"),
        elite / "desktop" if stem in {"desktop_shell_kernel", "desktop_shell"} else None,
    ):
        if cand is not None and cand.is_dir():
            return cand
    return None


def _list_extract_rel_paths(pack_dir: Path, *, limit: int = _MAX_EXTRACT_PATHS) -> list[str]:
    exts = {".tsx", ".ts", ".py", ".json", ".md"}
    found: list[str] = []
    for path in sorted(pack_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.name in {"SOURCE.md", "INVENTORY.md"}:
            continue
        if path.suffix.lower() not in exts:
            continue
        try:
            rel = path.relative_to(pack_dir)
        except ValueError:
            continue
        found.append(str(rel).replace("\\", "/"))
        if len(found) >= limit:
            break
    return found


def _parse_source_path_hints(source_body: str) -> list[str]:
    hints: list[str] = []
    for match in _SOURCE_PATH_RE.finditer(source_body):
        raw = match.group(1).strip().rstrip("`")
        # Prefer leaf filename for LLM checklist
        hints.append(raw)
        if len(hints) >= _MAX_EXTRACT_PATHS:
            break
    return hints


def _seed_excerpts(pack_dir: Path, rel_paths: list[str]) -> str:
    chunks: list[str] = []
    used = 0
    # Prefer UI-heavy files first
    ranked = sorted(
        rel_paths,
        key=lambda r: (
            0
            if any(h in r.lower().replace("_", "").replace("-", "") for h in _UI_SEED_HINTS)
            else 1,
            r,
        ),
    )
    for rel in ranked:
        if used >= _MAX_SEED_FILES:
            break
        path = pack_dir / rel
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".tsx", ".ts", ".py"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        if len(text) > _MAX_SEED_CHARS:
            text = text[:_MAX_SEED_CHARS] + "\n…(truncated)"
        chunks.append(
            f"### Seed excerpt: `{pack_dir.name}/{rel}`\n\n```{path.suffix.lstrip('.')}\n{text}\n```"
        )
        used += 1
    return "\n\n".join(chunks)


def load_design_assembly(
    paths: EicOrchestrationPaths,
    *,
    service_name: str | None,
    design_path: str | None = None,
) -> dict:
    """Load optional assembly block from design JSON if present."""
    candidates: list[Path] = []
    if design_path:
        p = Path(design_path)
        if not p.is_absolute():
            p = paths.workspace_root / design_path
        candidates.append(p)
        if p.suffix == ".md":
            candidates.append(p.with_suffix(".json"))
    if service_name:
        candidates.append(
            paths.workspace_root
            / ".cursor"
            / "orchestration"
            / "designs"
            / f"{service_name}_design.json"
        )
    for cand in candidates:
        if not cand.is_file() or cand.suffix != ".json":
            continue
        try:
            data = json.loads(cand.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(data, dict) and isinstance(data.get("assembly"), dict):
            return dict(data["assembly"])
    return {}


def resolve_assembly_selection(
    paths: EicOrchestrationPaths,
    *,
    service_name: str | None = None,
    intent: str | None = None,
    design_path: str | None = None,
    explicit_packs: list[str] | None = None,
    explicit_profile: str | None = None,
) -> AssemblySelection:
    assembly = load_design_assembly(
        paths, service_name=service_name, design_path=design_path
    )
    packs_from_design = assembly.get("recipe_packs") or []
    if not isinstance(packs_from_design, list):
        packs_from_design = []
    profile_from_design = assembly.get("scaffold_profile")
    if isinstance(profile_from_design, str):
        explicit_profile = explicit_profile or profile_from_design

    merged_explicit = list(explicit_packs or []) + [
        str(p) for p in packs_from_design if p
    ]
    pack_files = match_recipe_pack_names(
        service_name=service_name,
        intent=intent,
        explicit_packs=merged_explicit or None,
    )
    stems = [Path(n).stem for n in pack_files]
    # P18: product packs without PASSED golden are not assembly-active.
    from services.empery_intelligence_core.src.integration.pack_golden_law import (
        filter_active_pack_stems,
    )

    stems = filter_active_pack_stems(paths, stems)
    profile = resolve_scaffold_profile(
        stems,
        service_name=service_name,
        intent=intent,
        explicit_profile=explicit_profile,
    )

    extract_roots: list[str] = []
    must_read: list[str] = []
    for stem in stems:
        if is_law_pack(stem):
            continue
        catalog_entry = atom_catalog_entry(paths, stem)
        if catalog_entry:
            for g in catalog_entry.get("extract_globs") or []:
                if not isinstance(g, str) or not g.strip():
                    continue
                # Root = directory part before first wildcard
                root = g.split("*", 1)[0].rstrip("/")
                if root and root not in extract_roots:
                    extract_roots.append(root)
                must_read.append(g)
        pack_dir = _pack_dir(paths, stem)
        if pack_dir is None:
            continue
        try:
            rel_root = pack_dir.relative_to(paths.workspace_root)
            rel_s = str(rel_root).replace("\\", "/")
        except ValueError:
            rel_s = str(pack_dir)
        if rel_s not in extract_roots:
            extract_roots.append(rel_s)
        for rel in _list_extract_rel_paths(pack_dir):
            must_read.append(f"{rel_s}/{rel}")

    design_roots = assembly.get("extract_roots") or []
    if isinstance(design_roots, list):
        for r in design_roots:
            if r and str(r) not in extract_roots:
                extract_roots.append(str(r))

    forbid = bool(assembly.get("forbid_generic_crud"))
    if not forbid:
        forbid = profile != "generic"

    return AssemblySelection(
        packs=tuple(stems),
        scaffold_profile=profile,
        forbid_generic_crud=forbid,
        extract_roots=tuple(extract_roots),
        must_read_paths=tuple(must_read[:_MAX_EXTRACT_PATHS]),
    )


def load_recipe_catalog_digest(
    paths: EicOrchestrationPaths,
    *,
    service_name: str | None = None,
    intent: str | None = None,
    design_path: str | None = None,
    explicit_packs: list[str] | None = None,
    explicit_profile: str | None = None,
) -> tuple[str, list[str]]:
    """
    Return markdown digest + template paths for prompt injection.

    Always includes INDEX.md when present; attaches matching pack files by
    service_name / intent / design.assembly. Includes SOURCE + extract path
    checklist + seed excerpts when pack corpus exists.
    """
    root = recipes_root(paths)
    if not root.is_dir():
        return "", []

    selection = resolve_assembly_selection(
        paths,
        service_name=service_name,
        intent=intent,
        design_path=design_path,
        explicit_packs=explicit_packs,
        explicit_profile=explicit_profile,
    )

    chunks: list[str] = []
    used: list[str] = []

    index = root / "INDEX.md"
    if index.is_file():
        body = index.read_text(encoding="utf-8").strip()
        chunks.append(f"## Recipe catalog (INDEX)\n\n{body}")
        used.append(str(index))

    # Assembly contract block — steers Architect + Hands
    contract_lines = [
        "## Assembly contract (mandatory)",
        f"- **scaffold_profile:** `{selection.scaffold_profile}`",
        f"- **forbid_generic_crud:** `{selection.forbid_generic_crud}`",
        f"- **forbid_scratch_when_recipe:** `{any(is_product_pack(p) for p in selection.packs)}`",
        "- When a product pack matches: emit `extract_adapt` (copy from `reference/eliteew` "
        "or catalog globs) — do not invent API/mount from scratch.",
        f"- **recipe_packs:** {', '.join(selection.packs) or '(none)'}",
        f"- **atom_catalog:** `{'present' if atom_catalog_path(paths).is_file() else 'missing'}`",
    ]
    if selection.extract_roots:
        contract_lines.append("- **extract_roots:**")
        for r in selection.extract_roots:
            contract_lines.append(f"  - `{r}`")
    if selection.must_read_paths:
        contract_lines.append("- **Must-read extract paths (copy/adapt — never invent when present):**")
        for p in selection.must_read_paths:
            contract_lines.append(f"  - `{p}`")
    if selection.forbid_generic_crud:
        contract_lines.append(
            "- **FORBIDDEN:** inventing `{Service}Item` DomainItem CRUD when a recipe pack "
            "or health_probe/studio/peer profile applies. Assemble from extracts + Empery anatomy."
        )
    chunks.append("\n".join(contract_lines))

    # Root EliteEW provenance when any product pack matched
    if any(is_product_pack(s) for s in selection.packs):
        root_src = _eliteew_root(paths) / "SOURCE.md"
        if root_src.is_file():
            body = root_src.read_text(encoding="utf-8").strip()
            if len(body) > 2_500:
                body = body[:2_500] + "\n…(truncated)"
            chunks.append(
                f"## EliteEW extract provenance\n\nPath: `{root_src}`\n\n{body}"
            )
            used.append(str(root_src))

    ordered_files = match_recipe_pack_names(
        service_name=service_name,
        intent=intent,
        explicit_packs=explicit_packs
        or list(
            load_design_assembly(
                paths, service_name=service_name, design_path=design_path
            ).get("recipe_packs")
            or []
        )
        or None,
    )
    for stem in selection.packs:
        name = f"{stem}.md"
        if name not in ordered_files:
            ordered_files.append(name)

    for name in ordered_files:
        path = root / name
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8").strip()
        chunks.append(f"## Recipe pack: {path.stem}\n\n{text}")
        used.append(str(path))

        stem = path.stem
        for src in _source_candidates(paths, stem):
            if not src.is_file():
                continue
            src_body = src.read_text(encoding="utf-8").strip()
            hints = _parse_source_path_hints(src_body)
            hint_block = ""
            if hints:
                hint_block = "\n\n### SOURCE path hints\n" + "\n".join(
                    f"- `{h}`" for h in hints[:_MAX_EXTRACT_PATHS]
                )
            chunks.append(
                f"## Extract SOURCE (read first, then copy/adapt — never import)\n"
                f"Path: `{src}`\n\n{src_body}{hint_block}"
            )
            used.append(str(src))
            break

        pack_dir = _pack_dir(paths, stem)
        if pack_dir is not None:
            rels = _list_extract_rel_paths(pack_dir)
            if rels:
                try:
                    root_rel = pack_dir.relative_to(paths.workspace_root)
                except ValueError:
                    root_rel = pack_dir
                path_lines = "\n".join(f"- `{root_rel}/{r}`" for r in rels)
                chunks.append(
                    f"## Pack extract files under `{root_rel}`\n\n{path_lines}"
                )
                seed = _seed_excerpts(pack_dir, rels)
                if seed:
                    chunks.append(
                        "## Seed excerpts (adapt into Empery paths — "
                        "do not paste EliteEW imports)\n\n" + seed
                    )

    # Live peers — dependency-capable newborns for the next genesis
    try:
        from services.empery_intelligence_core.src.integration.service_factory_peers import (
            format_live_peers_digest,
            live_peers_path,
        )

        peers_block = format_live_peers_digest(paths.workspace_root)
        chunks.append(peers_block)
        lp = live_peers_path(paths.workspace_root)
        if lp.is_file():
            used.append(str(lp))
        else:
            used.append("live_peers://empty")
    except Exception:  # noqa: BLE001
        pass

    digest = "\n\n---\n\n".join(chunks).strip()
    if len(digest) > _MAX_CHARS:
        digest = digest[:_MAX_CHARS] + "\n\n…(truncated)"
    used.append(f"assembly://profile={selection.scaffold_profile}")
    return digest, used
