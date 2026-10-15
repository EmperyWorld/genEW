"""
Config Normalizer
Maps backend API config to TypeScript generator expected format
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional

from generators.factory.intent_naming import derive_entity_name_from_intent

from .types import GeneratorConfig

DEFAULT_CRUD_FEATURES: Dict[str, bool] = {
    "search": True,
    "pagination": True,
    "filters": False,
    "sorting": True,
    "detailView": True,
}


def _merge_features(
    base: Optional[Mapping[str, Any]],
    specific: Optional[Mapping[str, Any]],
) -> Dict[str, Any]:
    merged: Dict[str, Any] = {}
    if base:
        merged.update(dict(base))
    if specific:
        merged.update(dict(specific))
    return merged


def _crud_field_type(hint: str) -> str:
    lowered = hint.lower()
    if lowered in {"date", "created_at", "updated_at"}:
        return "date"
    if lowered in {"amount", "price", "count", "quantity", "total"}:
        return "number"
    if lowered in {"active", "enabled", "published"}:
        return "boolean"
    return "string"


def _derive_crud_entity_name(config: Mapping[str, Any]) -> str:
    explicit = config.get("entityName")
    if explicit:
        return str(explicit)

    intent = str(config.get("intent") or "").strip()
    if intent:
        return derive_entity_name_from_intent(intent)

    module_name = str(config.get("moduleName") or config.get("name") or "Item")
    if len(module_name) <= 24:
        return module_name
    return "Resource"


def _build_crud_fields(config: Mapping[str, Any]) -> List[Dict[str, Any]]:
    existing = config.get("fields")
    if isinstance(existing, list) and existing:
        return [dict(item) for item in existing if isinstance(item, dict)]

    fields: List[Dict[str, Any]] = []
    seen: set[str] = set()
    hints = config.get("fieldHints") or []
    if isinstance(hints, list):
        for hint in hints:
            name = str(hint).strip()
            if not name or name in seen:
                continue
            seen.add(name)
            fields.append(
                {
                    "name": name,
                    "type": _crud_field_type(name),
                    "required": True,
                    "label": name.replace("_", " ").title(),
                }
            )

    if len(fields) == 0:
        fields.append(
            {"name": "name", "type": "string", "required": True, "label": "Name"},
        )
        intent_lower = str(config.get("intent") or "").lower()
        if "health" in intent_lower or "status" in intent_lower:
            fields.append(
                {
                    "name": "status",
                    "type": "string",
                    "required": True,
                    "label": "Status",
                },
            )
    return fields


def normalize_for_ts_generator(
    config: GeneratorConfig | Mapping[str, Any],
    module_type: str,
) -> Dict[str, Any]:
    """
    Normalize backend GeneratorConfig dict to TS ModuleConfiguration shape.
    """
    normalized: Dict[str, Any] = dict(config)

    module_name = config.get("moduleName") or config.get("name") or "Module"
    normalized["moduleName"] = module_name
    normalized["name"] = module_name

    ui = config.get("ui") or {}
    if isinstance(ui, dict):
        if "framework" in ui:
            normalized["uiFramework"] = ui["framework"]
        if "theme" in ui:
            normalized["theme"] = ui["theme"]
        if "animations" in ui:
            normalized["animations"] = ui["animations"]
        if "responsive" in ui:
            normalized["responsive"] = ui["responsive"]

    features_raw = config.get("features")
    features: Dict[str, Any] = (
        dict(features_raw) if isinstance(features_raw, dict) else {}
    )

    if module_type == "crud":
        crud_features = config.get("crudFeatures") or {}
        normalized["features"] = _merge_features(
            _merge_features(DEFAULT_CRUD_FEATURES, features),
            crud_features,
        )
        normalized["entityName"] = _derive_crud_entity_name(config)
        if "entityNamePlural" in config:
            normalized["entityNamePlural"] = config["entityNamePlural"]
        normalized["fields"] = _build_crud_fields(config)

    elif module_type == "dashboard":
        dash_features = config.get("dashboardFeatures") or {}
        normalized["features"] = _merge_features(features, dash_features)
        if "widgets" in config:
            normalized["widgets"] = config["widgets"]
        if "layout" in config:
            normalized["layout"] = config["layout"]

    elif module_type == "chat":
        chat_config = config.get("chatConfig") or {}
        normalized["chatConfig"] = chat_config
        chat_features = config.get("chatFeatures") or {}
        normalized["features"] = _merge_features(features, chat_features)

    elif module_type == "report":
        report_config = config.get("reportConfig") or {}
        normalized["reportConfig"] = report_config

    elif module_type == "kanban":
        kanban_config = config.get("kanbanConfig") or {}
        if kanban_config:
            if "template" in kanban_config:
                normalized["template"] = kanban_config["template"]
            if "styling" in kanban_config:
                normalized["styling"] = kanban_config["styling"]
            if "columns" in kanban_config:
                normalized["columns"] = kanban_config["columns"]
        kanban_features = config.get("kanbanFeatures") or {}
        normalized["features"] = _merge_features(features, kanban_features)

    generation = config.get("generation")
    if isinstance(generation, dict):
        normalized["generation"] = generation

    context_window = config.get("contextWindow")
    context_ref = config.get("contextWindowRef")
    if isinstance(context_window, dict) and context_window.get("snippets"):
        normalized["contextWindow"] = context_window
    if isinstance(context_ref, dict) and context_ref.get("path"):
        normalized["contextWindowRef"] = context_ref

    repair_feedback = config.get("repairFeedback")
    if isinstance(repair_feedback, str) and repair_feedback.strip():
        normalized["repairFeedback"] = repair_feedback.strip()

    field_hints = config.get("fieldHints")
    if isinstance(field_hints, list):
        normalized["fieldHints"] = field_hints

    return normalized


def get_auxiliary_generators(
    config: GeneratorConfig | Mapping[str, Any],
) -> List[str]:
    """
    Return list of auxiliary generator names based on generation flags.
    """
    generation = config.get("generation") or {}
    if not isinstance(generation, dict):
        return []

    mapping = {
        "generateTests": "testGenerator",
        "generateStorybook": "storybookGenerator",
        "generateDocs": "docsGenerator",
        "generateDocker": "dockerGenerator",
        "generateCICD": "cicdGenerator",
        "generateMigrations": "migrationGenerator",
        "generateGraphQL": "graphqlGenerator",
        "generateComponentVariants": "componentVariantsGenerator",
    }

    result: List[str] = []
    for flag, generator_name in mapping.items():
        if generation.get(flag):
            result.append(generator_name)
    return result
