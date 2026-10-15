"""
EWGen fullstack module templates for SET install
"""

import json
from typing import Any, Dict, List, Optional

from .paths import set_module_templates_root


def _load_manifest() -> Dict[str, Any]:
    manifest_path = set_module_templates_root() / "manifest.json"
    if not manifest_path.exists():
        return {"schemaVersion": "1.0.0", "templates": []}
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        return data
    return {"schemaVersion": "1.0.0", "templates": []}


def list_set_templates() -> List[Dict[str, Any]]:
    manifest = _load_manifest()
    templates = manifest.get("templates") or []
    result: List[Dict[str, Any]] = []
    for entry in templates:
        if not isinstance(entry, dict):
            continue
        template_id = str(entry.get("templateId", "")).strip()
        if not template_id:
            continue
        template_dir = set_module_templates_root() / template_id
        result.append({
            **entry,
            "available": template_dir.is_dir(),
        })
    return result


def get_set_template(template_id: str) -> Optional[Dict[str, Any]]:
    template_id = template_id.strip()
    for entry in list_set_templates():
        if str(entry.get("templateId")) == template_id:
            return entry
    return None
