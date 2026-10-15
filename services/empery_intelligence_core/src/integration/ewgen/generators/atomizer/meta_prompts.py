# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Prompt pack for Cognitive Overlay META generation (no FS writes).
# Invariants:
# - Prompts forbid rewriting source; evidence-only input.
# - LLM must emit schema-compliant JSON only (atom + interfaces).
# Related:
# - generators/atomizer/meta_overlay.py
# - schemas/atom-manifest.v2.json
# - schemas/interfaces.v1.json
# ---

"""Overlay prompt templates for atom META."""

from __future__ import annotations

import json
from typing import Any, Dict, List

# Capability vocabulary for synthesis matching (LLM should prefer these).
CAPABILITY_VOCAB: List[str] = [
    "api_surface",
    "db_handling",
    "auth_service",
    "docs_processing",
    "ui_polish",
    "worker_jobs",
    "file_storage",
    "messaging",
    "search_index",
    "mixed",
]

SYSTEM_META = """You are the EWGen Cognitive Overlay (semantic layer only).

The Deterministic Core already extracted a closed, self-contained atom and an
Evidence Pack (AST routes, exports, snippets). Your job is METADATA ONLY.

You MUST:
1. Identify Domain / Capability from evidence (prefer vocabulary below).
2. Summarize the Essence of the atom in `atom.purpose` (1-3 sentences).
3. Set `atom.semanticName` to a short human label (not a UUID).
4. Format Interfaces from Core signatures only — routes, exports, feFetches.
5. Return ONLY valid JSON. No markdown fences, no commentary, no code.

You MUST NOT:
- Invent file paths, route paths, HTTP methods, or symbols absent from evidence.
- Rewrite, invent, or suggest source code changes.
- Emit keys other than the response schema below.

Capability vocabulary (prefer these strings in atom.capabilities):
{vocab}

Response schema (exact top-level keys):
{{
  "atom": {{
    "schemaVersion": "ewgen_atom_manifest_v2",
    "atomId": "<copy from evidence.atomId>",
    "semanticName": "<short label>",
    "role": "<ui|api|db|docs|auth|worker|mixed — prefer evidence.role>",
    "capabilities": ["<from vocabulary>"],
    "kind": "module",
    "scale": "micro|meso|macro",
    "purpose": "<essence summary>",
    "tags": ["<optional domain tags>"],
    "domain": "<optional domain phrase, e.g. Database Management>"
  }},
  "interfaces": {{
    "schemaVersion": "ewgen_interfaces_v1",
    "routes": [
      {{"method": "GET", "path": "/from/evidence", "file": "optional"}}
    ],
    "exports": [
      {{"symbol": "from_evidence", "file": "path/from/evidence"}}
    ],
    "feFetches": [
      {{"path": "/api/...", "file": "optional"}}
    ]
  }}
}}
""".format(vocab=", ".join(CAPABILITY_VOCAB))


def _compact_evidence(evidence: Dict[str, Any]) -> Dict[str, Any]:
    """Shrink Evidence Pack for the prompt while keeping AST facts."""
    sigs = evidence.get("signatures") or {}
    if not isinstance(sigs, dict):
        sigs = {}
    routes = list(sigs.get("routes") or [])[:40]
    exports = list(sigs.get("exports") or [])[:60]
    fetches = list(sigs.get("feFetches") or [])[:40]
    snippets = list(evidence.get("snippets") or [])[:8]
    return {
        "atomId": evidence.get("atomId"),
        "role": evidence.get("role"),
        "files": list(evidence.get("files") or [])[:80],
        "signatures": {
            "routes": routes,
            "exports": exports,
            "feFetches": fetches,
        },
        "snippets": snippets,
        "graphEdgeCount": len(evidence.get("graphEdges") or []),
    }


def build_meta_prompt(evidence: Dict[str, Any]) -> str:
    """Build the full Overlay prompt from a Core Evidence Pack."""
    compact = _compact_evidence(evidence)
    return (
        SYSTEM_META
        + "\n\nEvidencePack (authoritative; do not contradict):\n"
        + json.dumps(compact, indent=2, sort_keys=True)
        + "\n\nEmit JSON now (atom + interfaces only):\n"
    )


def build_meta_user_message(evidence: Dict[str, Any]) -> str:
    """User-turn body when using chat-style completions."""
    compact = _compact_evidence(evidence)
    return (
        "Generate META for this Evidence Pack.\n"
        + json.dumps(compact, indent=2, sort_keys=True)
        + "\nReturn ONLY the JSON object."
    )
