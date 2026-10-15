"""
SET Adapter — staging directory helpers
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from generators.set.paths import adapter_staging_root


def staging_module_root(module_id: str) -> Path:
    return adapter_staging_root() / module_id


def normalize_path(path: str) -> str:
    return path.replace("\\", "/").lstrip("/")


def write_layer_files(base_dir: Path, files: List[Dict[str, str]]) -> int:
    written = 0
    for file in files:
        rel = normalize_path(str(file.get("path", "")))
        if not rel:
            continue
        target = base_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(str(file.get("content", "")), encoding="utf-8")
        written += 1
    return written


def write_adapter_manifest(module_root: Path, manifest: Dict[str, Any]) -> Path:
    path = module_root / "set.adapter.manifest.json"
    path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return path


def read_adapter_manifest(module_id: str) -> Optional[Dict[str, Any]]:
    path = staging_module_root(module_id) / "set.adapter.manifest.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def clear_staging(module_id: str) -> bool:
    root = staging_module_root(module_id)
    if not root.exists():
        return False
    shutil.rmtree(root)
    return True


def get_staging_status(module_id: str) -> Dict[str, Any]:
    root = staging_module_root(module_id)
    manifest = read_adapter_manifest(module_id)
    fe_dist = root / "frontend" / "dist"
    return {
        "moduleId": module_id,
        "exists": root.is_dir(),
        "stagingPath": str(root),
        "manifest": manifest,
        "hasFrontend": (root / "frontend").is_dir(),
        "hasBackend": (root / "backend").is_dir(),
        "hasDist": fe_dist.is_dir() and any(fe_dist.glob("**/*")),
        "adapterStatus": (manifest or {}).get("adapterStatus"),
        "transformedAt": (manifest or {}).get("transformedAt"),
    }


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
