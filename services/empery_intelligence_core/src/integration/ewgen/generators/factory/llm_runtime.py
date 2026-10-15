# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Runtime Llama endpoint selection (prod-core default vs command-center).
# Invariants:
# - Only allowlisted base URLs; default is prod-core :8080.
# - Persists under data/llm-endpoint.json for ASE LlamaClient.
# Related:
# - generators/factory/llama_client.py
# - routers/settings_llm.py
# ---

"""Mutable Llama upstream for ASE / factory Overlay."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("ewgen.llm_runtime")

DEFAULT_ENDPOINT_ID = "prod-core"
PRESETS: List[Dict[str, str]] = [
    {
        "id": "prod-core",
        "label": "prod-core (.111:8080)",
        "baseUrl": "http://192.168.1.111:8080",
        "proxyPath": "/api/llama",
    },
    {
        "id": "command-center",
        "label": "command-center (.136:7777)",
        "baseUrl": "http://192.168.1.136:7777",
        "proxyPath": "/api/llama-cc",
    },
]

_ALLOW = {p["baseUrl"].rstrip("/") for p in PRESETS}
_current_id = DEFAULT_ENDPOINT_ID


def _state_path() -> Path:
    root = Path(
        os.getenv("EWGEN_DATA_DIR")
        or Path(__file__).resolve().parents[2] / "data"
    )
    root.mkdir(parents=True, exist_ok=True)
    return root / "llm-endpoint.json"


def _preset_by_id(endpoint_id: str) -> Optional[Dict[str, str]]:
    for preset in PRESETS:
        if preset["id"] == endpoint_id:
            return preset
    return None


def _preset_by_url(base_url: str) -> Optional[Dict[str, str]]:
    normalized = base_url.rstrip("/")
    for preset in PRESETS:
        if preset["baseUrl"].rstrip("/") == normalized:
            return preset
    return None


def load_persisted() -> None:
    """Load selection from disk / env at process start."""
    global _current_id
    env_url = (os.getenv("EWGEN_LLAMA_URL") or "").strip().rstrip("/")
    if env_url and env_url in _ALLOW:
        match = _preset_by_url(env_url)
        if match:
            _current_id = match["id"]
            return
    path = _state_path()
    if not path.is_file():
        _current_id = DEFAULT_ENDPOINT_ID
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        eid = str((data or {}).get("id") or DEFAULT_ENDPOINT_ID)
        if _preset_by_id(eid):
            _current_id = eid
    except (json.JSONDecodeError, OSError) as exc:
        logger.debug("[STEP] llm_runtime_load_skip err=%s", exc)
        _current_id = DEFAULT_ENDPOINT_ID


def get_current() -> Dict[str, Any]:
    preset = _preset_by_id(_current_id) or PRESETS[0]
    return {
        "id": preset["id"],
        "label": preset["label"],
        "baseUrl": preset["baseUrl"],
        "proxyPath": preset["proxyPath"],
        "presets": PRESETS,
        "defaultId": DEFAULT_ENDPOINT_ID,
    }


def set_endpoint(
    *,
    endpoint_id: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Dict[str, Any]:
    global _current_id
    preset: Optional[Dict[str, str]] = None
    if endpoint_id:
        preset = _preset_by_id(str(endpoint_id).strip())
    elif base_url:
        preset = _preset_by_url(str(base_url).strip())
    if preset is None:
        raise ValueError(
            "LLM endpoint must be one of: "
            + ", ".join(sorted(_ALLOW))
        )
    _current_id = preset["id"]
    path = _state_path()
    path.write_text(
        json.dumps(
            {
                "id": preset["id"],
                "baseUrl": preset["baseUrl"],
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    # Keep process env in sync for any code reading EWGEN_LLAMA_URL
    os.environ["EWGEN_LLAMA_URL"] = preset["baseUrl"]
    logger.info(
        "[STEP] llm_endpoint_set id=%s url=%s",
        preset["id"],
        preset["baseUrl"],
    )
    return get_current()


def current_base_url() -> str:
    return str(get_current()["baseUrl"])


# Bootstrap once on import
load_persisted()
