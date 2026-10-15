# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Derive human-readable module/entity names from factory intake intent strings.
# Invariants:
# - Slugs are kebab-case catalog ids; Pascal names are for TS moduleName.
# Related:
# - generators/factory/generator_adapter.py
# - generators/factory/deploy.py
# - generators/config_normalizer.py
# ---

from __future__ import annotations

import re

from generators.importer.naming import to_kebab

INTENT_FILLER_WORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "api",
        "build",
        "create",
        "crud",
        "endpoint",
        "endpoints",
        "for",
        "generate",
        "make",
        "module",
        "the",
        "with",
    }
)


def _title_word(word: str) -> str:
    return word[:1].upper() + word[1:].lower()


def derive_entity_name_from_intent(intent: str) -> str:
    cleaned = intent.strip()
    if not cleaned:
        return "Resource"

    if re.search(r"\bhealth\s+endpoint\b", cleaned, re.IGNORECASE):
        return "HealthCheck"

    for pattern in (
        r"\bfor\s+([a-zA-Z][\w-]*)",
        r"\bwith\s+([a-zA-Z][\w-]*)\s+endpoint",
        r"\b([a-zA-Z][\w-]*)\s+management\b",
    ):
        match = re.search(pattern, cleaned, re.IGNORECASE)
        if not match:
            continue
        word = match.group(1)
        if word.lower() not in INTENT_FILLER_WORDS:
            return _title_word(word)

    tokens = _meaningful_tokens(cleaned)
    if tokens:
        return _title_word(tokens[0])
    return "Resource"


def derive_pascal_module_name(intent: str) -> str:
    entity = derive_entity_name_from_intent(intent)
    lowered = intent.lower()
    if "dashboard" in lowered:
        return f"{entity}Dashboard"
    if "kanban" in lowered:
        return f"{entity}Kanban"
    if "presentation" in lowered:
        return f"{entity}Presentation"
    if re.search(r"\bcrud\b", lowered):
        return f"{entity}Crud"
    if re.search(r"\bapi\b", lowered):
        return f"{entity}Api"
    return f"{entity}Module"


def derive_module_slug_from_intent(intent: str) -> str:
    cleaned = intent.strip()
    if not cleaned:
        return "factory-module"

    if re.search(r"\bhealth\s+endpoint\b", cleaned, re.IGNORECASE):
        slug = "health-check"
        if re.search(r"\bcrud\b", cleaned, re.IGNORECASE):
            slug = f"{slug}-crud"
        elif re.search(r"\bapi\b", cleaned, re.IGNORECASE):
            slug = f"{slug}-api"
        return slug

    tokens = _meaningful_tokens(cleaned)
    if tokens:
        slug = "-".join(tokens[:4])
        slug = re.sub(r"[^a-z0-9-]", "-", slug.lower())
        slug = re.sub(r"-+", "-", slug).strip("-")
        if slug:
            return slug[:48]

    pascal = derive_pascal_module_name(cleaned)
    return to_kebab(pascal) or "factory-module"


def _meaningful_tokens(intent: str) -> list[str]:
    words = re.findall(r"[a-zA-Z]{3,}", intent.lower())
    return [word for word in words if word not in INTENT_FILLER_WORDS]


def module_name_from_intent(intent: str) -> str:
    """Backward-compatible alias used by generator adapter."""
    return derive_pascal_module_name(intent)
