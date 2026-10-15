"""
Sync SET backend modules/registry.json from inventory
"""

import json
from typing import Any, Dict, List

from generators.importer.naming import to_kebab

from .paths import runtime_registry_path
from .volume_permissions import ensure_registry_volume_access


def sync_runtime_registry(modules: List[Dict[str, Any]]) -> None:
    registry_path = runtime_registry_path()
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_entries = []
    for entry in modules:
        module_id = str(entry.get("moduleId", "")).strip()
        if not module_id:
            continue
        kebab = to_kebab(module_id)
        registry_item: Dict[str, Any] = {
            "moduleId": kebab,
            "displayName": entry.get("displayName", module_id),
            "source": entry.get("source", "unknown"),
            "status": entry.get("status", "enabled"),
            "fe": entry.get("fe") or {"mount": f"/app/{kebab}"},
            "be": entry.get("be") or {"prefix": f"/api/modules/{kebab}"},
        }
        source = entry.get("source")
        if source:
            registry_item["source"] = source
        source_catalog_id = entry.get("sourceCatalogId")
        if source_catalog_id:
            registry_item["sourceCatalogId"] = source_catalog_id
        template_id = entry.get("templateId")
        if template_id:
            registry_item["templateId"] = template_id
        entity_name = entry.get("entityName")
        if entity_name:
            registry_item["entityName"] = entity_name
        stats = entry.get("stats")
        if isinstance(stats, dict) and stats:
            registry_item["stats"] = stats
        contract = entry.get("contract")
        if isinstance(contract, dict) and contract:
            registry_item["contract"] = contract
        runtime = entry.get("runtime")
        if isinstance(runtime, dict) and runtime:
            registry_item["runtime"] = runtime
        registry_entries.append(registry_item)
    registry_path.write_text(
        json.dumps(registry_entries, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    ensure_registry_volume_access(registry_path)
