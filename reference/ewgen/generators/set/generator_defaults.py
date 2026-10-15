"""
Default EWGen generator configs for SET standard module slots.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

_GENERATION_OFF = {
    "generateTests": False,
    "generateStorybook": False,
    "generateDocs": False,
    "generateDocker": False,
    "generateCICD": False,
    "generateMigrations": False,
    "generateGraphQL": False,
    "generateComponentVariants": False,
}

_UI = {
    "framework": "shadcn",
    "theme": "dark",
    "animations": True,
    "responsive": True,
}


def build_generator_config(
    template_id: str,
    module_name: str,
    *,
    entity_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Build GeneratorWrapper config for a SET template slot."""
    base: Dict[str, Any] = {
        "moduleName": module_name,
        "moduleType": template_id,
        "ui": dict(_UI),
        "generation": dict(_GENERATION_OFF),
    }

    if template_id == "crud":
        entity = entity_name or "Item"
        plural = f"{entity}s" if not entity.endswith("s") else entity
        base.update({
            "entityName": entity,
            "entityNamePlural": plural,
            "fields": [
                {"name": "id", "type": "string", "required": True, "label": "ID"},
                {"name": "name", "type": "string", "required": True, "label": "Name"},
                {"name": "description", "type": "string", "required": False, "label": "Description"},
            ],
            "crudFeatures": {
                "search": True,
                "filters": True,
                "pagination": True,
                "sorting": True,
            },
        })
        return base

    if template_id == "dashboard":
        base.update({
            "moduleType": "dashboard",
            "widgets": [],
            "dashboardFeatures": {
                "realtime": False,
                "export": True,
                "filters": True,
                "responsive": True,
            },
            "layout": "grid",
        })
        return base

    if template_id == "chat":
        base.update({
            "moduleType": "chat",
            "chatConfig": {
                "enableWebSocket": False,
                "enableFileUpload": True,
                "enableTypingIndicator": True,
                "enableAIAssistant": False,
            },
            "chatFeatures": {
                "authentication": False,
                "realtime": False,
                "notifications": True,
            },
        })
        return base

    if template_id == "report":
        base.update({
            "moduleType": "report",
            "reportConfig": {
                "name": module_name,
                "exportFormats": ["pdf", "excel", "csv", "json"],
                "templates": ["sales", "financial", "analytics"],
                "features": {
                    "builder": True,
                    "preview": True,
                    "charts": True,
                    "scheduling": False,
                    "emailDelivery": False,
                },
                "chartLibrary": "recharts",
                "styling": "tailwind",
            },
        })
        return base

    if template_id == "kanban":
        base.update({
            "moduleType": "kanban",
            "kanbanConfig": {
                "columns": [
                    {"id": "todo", "title": "To do"},
                    {"id": "in_progress", "title": "In progress"},
                    {"id": "done", "title": "Done"},
                ],
            },
            "kanbanFeatures": {
                "dragAndDrop": True,
                "filters": True,
                "assignees": True,
            },
        })
        return base

    if template_id == "presentation":
        base.update({
            "moduleType": "presentation",
            "presentationLibrary": "reveal",
            "topic": f"{module_name} — Empery World",
            "title": module_name,
            "author": "Empery World · EWGen",
            "transition": "convex",
            "transitions": "convex",
            "backgroundTransition": "zoom",
            "theme": "dark",
            "slideCount": 8,
            "aspectRatio": "16:9",
        })
        return base

    raise ValueError(f"Unknown SET template for generator config: {template_id}")
