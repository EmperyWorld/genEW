"""Scaffold profiles — recipe-keyed Hands templates (not invent DomainItem CRUD)."""

from __future__ import annotations

from dataclasses import dataclass

from core.integration.assembly_contracts import (
    CONFIG_DRIVEN_PROFILES,
    is_config_driven_profile,
)

__all__ = [
    "AssemblySelection",
    "CONFIG_DRIVEN_PROFILES",
    "assembly_generic_refuse_message",
    "forbid_generic_crud",
    "intent_looks_productish",
    "is_config_driven_profile",
    "is_law_pack",
    "is_product_pack",
    "profile_for_pack",
    "resolve_scaffold_profile",
    "should_refuse_assembly_generic",
]

# Product recipe stems → Hands profile (forbid generic DomainItem when matched).
_PACK_TO_PROFILE: dict[str, str] = {
    "service_anatomy": "health_probe",
    "desktop_mount_catalog": "health_probe",
    "verify_gates": "health_probe",
    "service_factory": "health_probe",
    "desktop_shell_kernel": "shell_host",
    "window_snap": "shell_host",
    "doc_editor": "editor_local",
    "notes_crud": "editor_local",
    "notes_tool": "editor_local",
    "ops_dashboard": "ops_dashboard",
    "task_board": "task_board",
    "research_report": "research_report",
    "site_studio": "site_studio",
    "image_studio": "image_studio",
    "studios": "studio_job",
    "video_studio": "video_studio",
    "music_forge": "music_forge",
    "ewrp": "presentation_ai",
    "ewa_companion": "companion_chat",
    "comfy_image_peer": "image_studio",
    "nervas_llm_peer": "peer_http",
}

_PRODUCT_PACKS = frozenset(
    {
        "desktop_shell_kernel",
        "window_snap",
        "doc_editor",
        "notes_crud",
        "notes_tool",
        "ops_dashboard",
        "task_board",
        "research_report",
        "studios",
        "video_studio",
        "music_forge",
        "site_studio",
        "image_studio",
        "ewrp",
        "ewa_companion",
        "comfy_image_peer",
        "nervas_llm_peer",
    }
)

_LAW_PACKS = frozenset(
    {"service_anatomy", "desktop_mount_catalog", "verify_gates", "service_factory"}
)


@dataclass(frozen=True)
class AssemblySelection:
    """Resolved packs + Hands profile for one intention."""

    packs: tuple[str, ...]
    scaffold_profile: str
    forbid_generic_crud: bool
    extract_roots: tuple[str, ...]
    must_read_paths: tuple[str, ...]


def is_product_pack(stem: str) -> bool:
    return stem in _PRODUCT_PACKS


def is_law_pack(stem: str) -> bool:
    return stem in _LAW_PACKS


_PRODUCTISH_KEYWORDS = (
    "companion",
    "chat",
    "studio",
    "image",
    "video",
    "music",
    "forge",
    "ace-step",
    "acestep",
    "marketing",
    "dashboard",
    "ops",
    "notes",
    "note",
    "bloknot",
    "task",
    "board",
    "kanban",
    "research",
    "report",
    "site",
    "preview",
    "editor",
    "doc_editor",
    "tiptap",
    "presentation",
    "презентац",
    "ewrp",
    "slide",
    "слайд",
    "deck",
)


def intent_looks_productish(
    intent: str | None, service_name: str | None = None
) -> bool:
    """True when operator language implies a product pack (not invent DomainItem)."""
    hay = f"{service_name or ''} {intent or ''}".lower()
    return any(k in hay for k in _PRODUCTISH_KEYWORDS)


def should_refuse_assembly_generic(
    *,
    scaffold_profile: str | None,
    intent: str | None,
    service_name: str | None = None,
    allow_generic: bool = False,
) -> bool:
    """P15: productish intent must not silently land on DomainItem generic."""
    profile = (scaffold_profile or "").strip().lower()
    if profile != "generic":
        return False
    if allow_generic:
        return False
    return intent_looks_productish(intent, service_name)


def assembly_generic_refuse_message() -> str:
    return (
        "assembly_generic_refuse: product intent "
        "resolved to scaffold_profile=generic "
        "without allow_generic — compose from a "
        "product pack, do not invent DomainItem CRUD"
    )


def profile_for_pack(stem: str) -> str | None:
    return _PACK_TO_PROFILE.get(stem)


def _intent_asks_marketing(intent: str | None) -> bool:
    """True when operator intent asks for a marketing capsule (not service_name)."""
    hay = (intent or "").strip().lower()
    if not hay:
        return False
    markers = (
        "marketing",
        "маркетинг",
        "campaign",
        "кампани",
        "creatives",
        "audience segment",
        "маркетинговый кабинет",
        "marketing cabinet",
    )
    return any(m in hay for m in markers)


def resolve_scaffold_profile(
    packs: list[str],
    *,
    service_name: str | None = None,
    intent: str | None = None,
    explicit_profile: str | None = None,
) -> str:
    """Pick Hands template profile. Prefer design/explicit, then product packs."""
    if explicit_profile and explicit_profile.strip():
        return explicit_profile.strip().lower()

    # Prefer specific product packs over shell_host/window_snap when several match
    # (intent often mentions "desktop D1–D3" which would otherwise steal profile).
    # IMPORTANT: do NOT steal ``marketing`` from service_name (marketing_cabinet
    # must still resolve ops_dashboard / research_report from packs + intent).
    _PROFILE_RANK = {
        "video_studio": -1,  # prefer Wan I2V over image_studio / studio_job
        "presentation_ai": -1,  # prefer EWRP over ops_dashboard / companion steal
        "companion_chat": 0,
        "site_studio": 0,  # prefer preview peer over generic studios/studio_job
        "image_studio": 0,  # prefer Comfy peer over generic studios/studio_job
        "music_forge": 0,  # prefer AceStep peer over generic studios/studio_job
        "studio_job": 1,
        "ops_dashboard": 1,
        "task_board": 1,
        "research_report": 1,
        "editor_local": 1,
        "marketing": 4,
        "peer_http": 6,
        "health_probe": 8,
        "shell_host": 9,
        "generic": 10,
    }
    ranked: list[tuple[int, str]] = []
    for stem in packs:
        if is_product_pack(stem):
            profile = _PACK_TO_PROFILE.get(stem, "studio_job")
            ranked.append((_PROFILE_RANK.get(profile, 5), profile))
    if ranked:
        ranked.sort(key=lambda x: x[0])
        return ranked[0][1]

    # Intent-only marketing (never service_name substring).
    if _intent_asks_marketing(intent):
        return "marketing"

    hay = f"{service_name or ''} {intent or ''}".lower()
    name = (service_name or "").lower()
    if (
        name.endswith("_probe")
        or name.endswith("_probe_svc")
        or "_probe_" in name
        or "probe" in hay
        or ("anatomy" in hay and "create" in hay)
    ):
        return "health_probe"

    # Law packs only (create_service with no product keyword) → health probe,
    # not DomainItem CRUD.
    if packs and all(is_law_pack(p) or p in _PACK_TO_PROFILE for p in packs):
        if any(is_law_pack(p) for p in packs) and not any(
            is_product_pack(p) for p in packs
        ):
            return "health_probe"

    return "generic"


def forbid_generic_crud(profile: str) -> bool:
    return profile != "generic"
