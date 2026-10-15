# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Manifest-only import mode (EG-02) — metadata + SHA256 index instead of src/imported trees.
# Invariants:
# - Product-domain sources (EliteEW, …) never materialize full FE trees under src/imported/.
# Related:
# - generators/importer/prepare.py
# - generators/warsmith/materialize.py
# ---

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from .naming import to_kebab

MANIFEST_ONLY_SOURCE_FILE_THRESHOLD = 40
MAX_MANIFEST_SNAPSHOT_BYTES = 65536

_PRODUCT_ROOT_MARKERS = frozenset(
    {
        "EliteEW",
        "EliteEW2",
        "DEWA",
        "MobileAndroid",
    }
)

_SOURCE_EXTENSIONS = frozenset({".ts", ".tsx", ".js", ".jsx", ".py"})

FE_MANIFEST_ONLY_NO_RUNTIME = "FE_MANIFEST_ONLY_NO_RUNTIME"


def _normalize_path(path: str) -> str:
    return path.replace("\\", "/").lstrip("./")


def _is_source_file(path: str) -> bool:
    lowered = path.lower()
    return any(lowered.endswith(ext) for ext in _SOURCE_EXTENSIONS)


def detect_product_source_root(source_files: List[Dict[str, str]]) -> Optional[str]:
    for file in source_files:
        path = _normalize_path(str(file.get("path", "")))
        parts = [part for part in path.split("/") if part]
        if not parts:
            continue
        if parts[0] in _PRODUCT_ROOT_MARKERS:
            return parts[0]
        if len(parts) >= 2 and parts[0] == "web" and parts[1] == "frontend":
            return "EliteEW/web/frontend"
    return None


def count_source_files(source_files: List[Dict[str, str]]) -> int:
    return sum(1 for file in source_files if _is_source_file(str(file.get("path", ""))))


def should_use_manifest_only(
    source_files: List[Dict[str, str]],
    *,
    force: Optional[bool] = None,
) -> bool:
    if force is not None:
        return force
    if detect_product_source_root(source_files):
        return True
    return count_source_files(source_files) >= MANIFEST_ONLY_SOURCE_FILE_THRESHOLD


def build_source_index(
    source_files: List[Dict[str, str]],
    *,
    module_name: str,
    source: str,
    source_ref: Optional[str],
    product_root: Optional[str],
) -> Dict[str, Any]:
    entries: List[Dict[str, Any]] = []
    for file in source_files:
        path = _normalize_path(str(file.get("path", "")))
        if not path:
            continue
        content = str(file.get("content", ""))
        encoded = content.encode("utf-8")
        entries.append(
            {
                "path": path,
                "bytes": len(encoded),
                "sha256": hashlib.sha256(encoded).hexdigest(),
                "language": _detect_language(path),
            }
        )

    return {
        "schema": "ewgen.import.source-index.v1",
        "moduleName": module_name,
        "manifestOnly": True,
        "source": source,
        "sourceRef": source_ref,
        "productRootDetected": product_root,
        "ssotHint": "Read live sources from monorepo SSOT (e.g. EliteEW/web/frontend); do not rely on src/imported/",
        "rematerializePolicy": (
            "Full tree re-materialization requires explicit operator action from catalog/SSOT — "
            "never implicit shadow copies on disk."
        ),
        "fileCount": len(entries),
        "sourceFileCount": count_source_files(source_files),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "files": entries,
    }


def build_manifest_only_contract_test(module_name: str) -> Dict[str, str]:
    kebab = to_kebab(module_name)
    content = f"""/**
 * Manifest-only import contract (no @imported runtime tree)
 */
import sourceIndex from '../../../manifests/imported-{kebab}.source-index.json';

describe('{module_name} manifest-only contract', () => {{
  it('declares manifest-only mode', () => {{
    expect(sourceIndex.manifestOnly).toBe(true);
    expect(sourceIndex.fileCount).toBeGreaterThan(0);
  }});

  it('records sha256 for each indexed path', () => {{
    const first = sourceIndex.files[0];
    expect(first.path).toBeTruthy();
    expect(first.sha256).toMatch(/^[a-f0-9]{{64}}$/);
  }});
}});
"""
    return {
        "path": f"src/__tests__/manifest-only/imported-{kebab}.contract.test.ts",
        "content": content,
        "language": "typescript",
        "description": "Manifest-only contract test (no shadow tree imports)",
    }


def is_workspace_artifact_path(path: str) -> bool:
    """Paths that must not be rewritten under src/imported/<kebab>/."""
    normalized = _normalize_path(path)
    if normalized in ("README.md", "package.imported.json"):
        return True
    prefixes = (
        "manifests/",
        "src/registry/snippets/",
        "src/__tests__/manifest-only/",
        "src/__tests__/contract/",
    )
    if any(normalized.startswith(prefix) for prefix in prefixes):
        return True
    if normalized.startswith("tsconfig.imported-") or normalized.startswith(
        "tsconfig.merge-imported-",
    ):
        return True
    return False


def is_runtime_frontend_source_path(path: str) -> bool:
    """True for TS/JS sources that can back Warsmith/SET FE layers."""
    normalized = _normalize_path(path)
    if not normalized or is_workspace_artifact_path(normalized):
        return False
    if normalized.startswith("manifests/"):
        return False
    if normalized.endswith("MANIFEST.snapshot.json"):
        return False
    if normalized.endswith(".source-index.json"):
        return False
    lowered = normalized.lower()
    return any(
        lowered.endswith(ext) for ext in (".ts", ".tsx", ".js", ".jsx")
    )


def count_runtime_frontend_sources(files: List[Dict[str, str]]) -> int:
    return sum(
        1
        for file in files
        if is_runtime_frontend_source_path(str(file.get("path", "")))
    )


def frontend_entry_needs_rematerialize(frontend_entry: Dict[str, Any]) -> bool:
    """
    Manifest-only / index-only FE catalogs cannot compose a runnable FE layer.

    Stage 2 gate: hard-fail unless operator rematerializes from SSOT.
    """
    files = frontend_entry.get("files") or []
    if count_runtime_frontend_sources(files) > 0:
        return False
    if frontend_entry.get("manifestOnly"):
        return True
    quality = frontend_entry.get("bundleQuality") or {}
    if quality.get("manifestOnly"):
        return True
    manifest = frontend_entry.get("importManifest") or {}
    if manifest.get("manifestOnly"):
        return True
    # Empty or metadata-only file list after EG-02 prepare
    return True


def assert_frontend_runtime_for_compose(
    frontend_entry: Dict[str, Any],
    *,
    allow_manifest_only: bool = False,
) -> None:
    """
    Raise ValueError with FE_MANIFEST_ONLY_NO_RUNTIME when FE has no runtime sources.

    Dual-flag: allow_manifest_only=True skips the gate (metadata-only compose).
    """
    if allow_manifest_only:
        return
    if not frontend_entry_needs_rematerialize(frontend_entry):
        return
    ssot = (
        frontend_entry.get("ssotHint")
        or (frontend_entry.get("importManifest") or {}).get("ssotHint")
        or "monorepo SSOT / Fortune Seaker rematerialize"
    )
    raise ValueError(
        f"{FE_MANIFEST_ONLY_NO_RUNTIME}: frontend catalog is manifest-only "
        "(no runtime .ts/.tsx/.js/.jsx). Re-materialize from SSOT before "
        f"Warsmith compose/SET install. Hint: {ssot}"
    )


def augment_import_manifest(
    manifest: Dict[str, Any],
    *,
    source_index: Dict[str, Any],
    product_root: Optional[str],
) -> Dict[str, Any]:
    updated = dict(manifest)
    updated["manifestOnly"] = True
    updated["productRootDetected"] = product_root
    updated["sourceIndexPath"] = source_index.get("path") or (
        f"manifests/imported-{to_kebab(str(manifest.get('displayName', 'module')))}.source-index.json"
    )
    updated["ssotHint"] = source_index.get("ssotHint")
    updated["rematerializePolicy"] = source_index.get("rematerializePolicy")
    return updated


def manifest_only_artifact_paths(module_name: str) -> Set[str]:
    kebab = to_kebab(module_name)
    return {
        f"manifests/imported-{kebab}.manifest.json",
        f"manifests/imported-{kebab}.source-index.json",
        f"src/__tests__/manifest-only/imported-{kebab}.contract.test.ts",
    }


def is_shadow_tree_source_path(path: str) -> bool:
    normalized = _normalize_path(path)
    if not normalized.startswith("src/imported/"):
        return False
    if normalized.endswith(".gitkeep"):
        return False
    if normalized.endswith("MANIFEST.snapshot.json"):
        return True
    return _is_source_file(normalized)


def filter_manifest_only_materialize_files(
    files: List[Dict[str, str]],
    module_name: str,
) -> List[Dict[str, str]]:
    """
    Drop heavy src/imported/* sources; keep manifests, snippets, manifest-only tests.
    """
    allowed_prefixes = (
        "manifests/",
        "snippets/",
        "src/__tests__/manifest-only/",
    )
    kebab = to_kebab(module_name)
    snapshot_name = f"src/imported/{kebab}/MANIFEST.snapshot.json"

    kept: List[Dict[str, str]] = []
    dropped: List[str] = []

    for file in files:
        path = _normalize_path(str(file.get("path", "")))
        if not path:
            continue
        if path.startswith(allowed_prefixes) or path == snapshot_name:
            kept.append({"path": path, "content": str(file.get("content", ""))})
            continue
        if is_shadow_tree_source_path(path):
            dropped.append(path)
            continue
        kept.append({"path": path, "content": str(file.get("content", ""))})

    if dropped:
        index = build_source_index_from_paths(dropped, files, module_name)
        kept.append(
            {
                "path": snapshot_name,
                "content": json.dumps(index, indent=2, ensure_ascii=False) + "\n",
            }
        )

    return kept


def build_source_index_from_paths(
    dropped_paths: List[str],
    files: List[Dict[str, str]],
    module_name: str,
) -> Dict[str, Any]:
    by_path = {
        _normalize_path(str(f.get("path", ""))): str(f.get("content", ""))
        for f in files
    }
    pseudo_files = [
        {"path": path, "content": by_path.get(path, "")} for path in dropped_paths
    ]
    return build_source_index(
        pseudo_files,
        module_name=module_name,
        source="materialize-filter",
        source_ref="manifest-only",
        product_root=detect_product_source_root(pseudo_files),
    )


def assert_manifest_only_materialize_allowed(files: List[Dict[str, str]]) -> None:
    violations: List[str] = []
    for file in files:
        path = _normalize_path(str(file.get("path", "")))
        content = str(file.get("content", ""))
        if not is_shadow_tree_source_path(path):
            continue
        if path.endswith("MANIFEST.snapshot.json"):
            if len(content.encode("utf-8")) > MAX_MANIFEST_SNAPSHOT_BYTES:
                violations.append(f"snapshot too large: {path}")
            continue
        violations.append(path)

    if violations:
        preview = ", ".join(violations[:5])
        suffix = "..." if len(violations) > 5 else ""
        raise ValueError(
            "Manifest-only policy blocks shadow tree materialization under src/imported/. "
            f"Use catalog metadata or explicit SSOT re-materialization. Blocked: {preview}{suffix}"
        )


def scan_shadow_tree(imported_dir: Path) -> Dict[str, Any]:
    """Scan src/imported for disallowed shadow-tree artifacts."""
    root = Path(imported_dir)
    if not root.exists():
        return {
            "disallowedFiles": [],
            "oversizedFiles": [],
            "passed": True,
        }

    disallowed: List[str] = []
    oversized: List[str] = []

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        size = path.stat().st_size
        if rel == ".gitkeep":
            continue
        if rel.endswith("MANIFEST.snapshot.json"):
            if size > MAX_MANIFEST_SNAPSHOT_BYTES:
                oversized.append(f"{rel} ({size} bytes)")
            continue
        if size > MAX_MANIFEST_SNAPSHOT_BYTES:
            oversized.append(f"{rel} ({size} bytes)")
        if is_shadow_tree_source_path(f"src/imported/{rel}"):
            disallowed.append(rel)
            continue
        disallowed.append(rel)

    passed = not disallowed and not oversized
    return {
        "disallowedFiles": disallowed,
        "oversizedFiles": oversized,
        "passed": passed,
    }


def _detect_language(path: str) -> str:
    if path.endswith(".tsx"):
        return "typescript"
    if path.endswith(".ts"):
        return "typescript"
    if path.endswith(".jsx"):
        return "javascript"
    if path.endswith(".js"):
        return "javascript"
    if path.endswith(".py"):
        return "python"
    if path.endswith(".json"):
        return "json"
    return "text"
