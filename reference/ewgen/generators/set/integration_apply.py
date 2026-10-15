"""
SET — auto-apply Warsmith integration pack snippets on install
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

_TSCONFIG_MERGE_RE = re.compile(r"tsconfig\.merge.*\.json$", re.I)
_REGISTRY_MERGE_RE = re.compile(r"registry\.merge\.json$", re.I)
_ENV_EXAMPLE_RE = re.compile(r"\.env\.example$", re.I)


def _merge_tsconfig_paths(base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(base)
    compiler = dict(result.get("compilerOptions") or {})
    patch_compiler = patch.get("compilerOptions") or {}
    paths = dict(compiler.get("paths") or {})
    patch_paths = (patch_compiler.get("paths") if isinstance(patch_compiler, dict) else {}) or {}
    if isinstance(patch_paths, dict):
        paths.update(patch_paths)
    compiler["paths"] = paths
    result["compilerOptions"] = compiler
    return result


def apply_local_tsconfig_merges(fe_root: Path) -> List[str]:
    """Merge tsconfig.merge-*.json snippets already present in module frontend."""
    applied: List[str] = []
    tsconfig_path = fe_root / "tsconfig.json"
    base: Dict[str, Any] = {}
    if tsconfig_path.is_file():
        try:
            loaded = json.loads(tsconfig_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                base = loaded
        except json.JSONDecodeError:
            base = {}

    for merge_path in sorted(fe_root.glob("tsconfig.merge*.json")):
        try:
            patch = json.loads(merge_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if not isinstance(patch, dict):
            continue
        paths = patch.get("paths")
        if not isinstance(paths, dict):
            compiler = patch.get("compilerOptions")
            if isinstance(compiler, dict):
                paths = compiler.get("paths")
        if not isinstance(paths, dict):
            continue
        merged = _merge_tsconfig_paths(base if isinstance(base, dict) else {}, {
            "compilerOptions": {"paths": paths},
        })
        base = merged
        tsconfig_path.parent.mkdir(parents=True, exist_ok=True)
        tsconfig_path.write_text(
            json.dumps(merged, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        applied.append(merge_path.name)

    return applied


def apply_integration_snippets(
    module_root: Path,
    integration_pack: Dict[str, Any],
    *,
    module_id: str,
) -> Dict[str, Any]:
    """
    Apply integration pack snippets to module-local files.
    """
    fe_root = module_root / "frontend"
    applied: List[str] = []
    entry_override: Optional[str] = None
    env_lines: List[str] = []

    snippets = integration_pack.get("aggregatedSnippets") or []
    if not isinstance(snippets, list):
        snippets = []

    for snippet in snippets:
        if not isinstance(snippet, dict):
            continue
        path = str(snippet.get("path", "")).replace("\\", "/")
        content = str(snippet.get("content", ""))
        if not path or not content:
            continue

        if _TSCONFIG_MERGE_RE.search(path):
            tsconfig_path = fe_root / "tsconfig.json"
            base: Dict[str, Any] = {}
            if tsconfig_path.is_file():
                try:
                    base = json.loads(tsconfig_path.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    base = {}
            try:
                patch = json.loads(content)
            except json.JSONDecodeError:
                continue
            if isinstance(patch, dict):
                merged = _merge_tsconfig_paths(base if isinstance(base, dict) else {}, patch)
                tsconfig_path.parent.mkdir(parents=True, exist_ok=True)
                tsconfig_path.write_text(
                    json.dumps(merged, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )
                applied.append("tsconfig.merge")

        elif _REGISTRY_MERGE_RE.search(path):
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict):
                entry = data.get("entry") or data
                preview = entry.get("previewEntrypoint") or entry.get("entryPoint")
                if isinstance(preview, str) and preview.strip():
                    entry_override = preview.strip()
                    applied.append("registry.merge")

        elif _ENV_EXAMPLE_RE.search(path):
            for line in content.splitlines():
                stripped = line.strip()
                if stripped and not stripped.startswith("#"):
                    env_lines.append(stripped)
            applied.append(".env.example")

    if env_lines:
        env_modules = module_root / ".set" / "env.modules"
        env_modules.parent.mkdir(parents=True, exist_ok=True)
        existing = ""
        if env_modules.is_file():
            existing = env_modules.read_text(encoding="utf-8")
        merged_env = existing.rstrip("\n")
        for line in env_lines:
            key = line.split("=", 1)[0].strip()
            if key and f"{key}=" not in merged_env:
                merged_env += f"\n{line}"
        env_modules.write_text(merged_env.strip() + "\n", encoding="utf-8")

    return {
        "applied": applied,
        "entryPointOverride": entry_override,
        "moduleId": module_id,
    }
