# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Canonical ASE / Control Tower settings keys and defaults (Stable Core DB).
# Invariants:
# - DB is source of truth after bootstrap; env used only for one-time seed.
# Related:
# - generators/core_settings/store.py
# ---

"""Default operational settings for EWGen Control Tower."""

from __future__ import annotations

from typing import Any, Dict

# Keys persisted in Stable Core settings table.
SETTING_KEYS = (
    "EWGEN_ASE_LLM",
    "EWGEN_ASE_ATOMIZE",
    "EWGEN_ASE_INSTANCE_PROVISION",
    "EWGEN_ASE_INSTANCE_DEPLOY",
    "EWGEN_ASE_BOOT_SMOKE",
    "llm_endpoint_id",
    "llm_base_url",
    "budget_max_files_per_atom",
    "budget_token_limit",
)

DEFAULT_SETTINGS: Dict[str, Any] = {
    "EWGEN_ASE_LLM": True,
    "EWGEN_ASE_ATOMIZE": True,
    "EWGEN_ASE_INSTANCE_PROVISION": True,
    "EWGEN_ASE_INSTANCE_DEPLOY": False,
    "EWGEN_ASE_BOOT_SMOKE": False,
    "llm_endpoint_id": "prod-core",
    "llm_base_url": "http://192.168.1.111:8080",
    "budget_max_files_per_atom": 200,
    "budget_token_limit": 8192,
}

ENV_ALIASES: Dict[str, str] = {
    "EWGEN_ASE_LLM": "EWGEN_ASE_LLM",
    "EWGEN_ASE_ATOMIZE": "EWGEN_ASE_ATOMIZE",
    "EWGEN_ASE_INSTANCE_PROVISION": "EWGEN_ASE_INSTANCE_PROVISION",
    "EWGEN_ASE_INSTANCE_DEPLOY": "EWGEN_ASE_INSTANCE_DEPLOY",
    "EWGEN_ASE_BOOT_SMOKE": "EWGEN_ASE_BOOT_SMOKE",
    "EWGEN_LLAMA_URL": "llm_base_url",
}

PUBLIC_META: Dict[str, Dict[str, Any]] = {
    "EWGEN_ASE_LLM": {"type": "bool", "label": "ASE LLM Overlay"},
    "EWGEN_ASE_ATOMIZE": {"type": "bool", "label": "Catalog atomization enabled"},
    "EWGEN_ASE_INSTANCE_PROVISION": {
        "type": "bool",
        "label": "Instance sandbox provision",
    },
    "EWGEN_ASE_INSTANCE_DEPLOY": {"type": "bool", "label": "Instance podman deploy"},
    "EWGEN_ASE_BOOT_SMOKE": {"type": "bool", "label": "Born-Ready boot smoke"},
    "llm_endpoint_id": {"type": "string", "label": "LLM endpoint preset id"},
    "llm_base_url": {"type": "string", "label": "LLM base URL"},
    "budget_max_files_per_atom": {
        "type": "int",
        "label": "Max files per atomize",
    },
    "budget_token_limit": {"type": "int", "label": "Overlay token budget"},
}
