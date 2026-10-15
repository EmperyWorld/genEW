"""Configuration-Driven Assembly contracts — Blueprint + Manifest (Pydantic V2).

LLM may only emit these JSON shapes. Mechanics (Assembler) owns all domain code.
"""

from __future__ import annotations

import json
import re
from enum import Enum
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Config-driven profiles: ops_dashboard (pilot) + Phase D companion/studio.
CONFIG_DRIVEN_PROFILES = frozenset(
    {"ops_dashboard", "companion_chat", "studio_job"}
)

_JSON_FENCE_RE = re.compile(
    r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", re.IGNORECASE
)


class ComponentType(str, Enum):
    LAYOUT = "Layout"
    CONTAINER = "Container"
    WIDGET = "Widget"
    ATOM = "Atom"


class WidgetType(str, Enum):
    CARD = "card"
    CHART = "chart"
    TABLE = "table"
    METRIC = "metric"
    HEADER = "header"
    SIDEBAR = "sidebar"
    MESSAGE_LIST = "message_list"
    COMPOSER = "composer"
    JOB_FORM = "job_form"
    JOB_LIST = "job_list"


class TargetModule(str, Enum):
    DASHBOARD_STANDARD = "Dashboard_Standard"
    COMPANION_CHAT = "Companion_Chat"
    STUDIO_JOB = "Studio_Job"
    GENERIC = "Generic"


class TreeConstraints(BaseModel):
    allow_reorder: bool = True
    required_data_keys: list[str] = Field(default_factory=list)


class TreeNode(BaseModel):
    id: str = Field(min_length=1)
    type: ComponentType
    widget_type: WidgetType | None = None
    props: dict[str, Any] = Field(default_factory=dict)
    children: list[str] = Field(default_factory=list)
    constraints: TreeConstraints = Field(default_factory=TreeConstraints)


class DataRequirement(BaseModel):
    endpoint: str = Field(min_length=1)
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] = "GET"
    schema_version: str = "1"


class BlueprintContract(BaseModel):
    """Architect output — structural contract before any code."""

    version: str = Field(min_length=1)
    service_name: str = Field(min_length=1, pattern=r"^[a-z][a-z0-9_]*$")
    scaffold_profile: str = Field(min_length=1)
    recipe_packs: list[str] = Field(default_factory=list)
    assembly_mode: Literal["config_driven", "legacy"] = "config_driven"
    target_module: TargetModule = TargetModule.DASHBOARD_STANDARD
    theme: Literal["light", "dark", "system"] = "system"
    target_component_tree: list[TreeNode] = Field(min_length=1)
    data_requirements: list[DataRequirement] = Field(default_factory=list)
    layout_rules: dict[str, Any] = Field(default_factory=dict)

    @field_validator("scaffold_profile")
    @classmethod
    def _normalize_profile(cls, v: str) -> str:
        return v.strip().lower()

    @model_validator(mode="after")
    def _config_driven_needs_data(self) -> BlueprintContract:
        if (
            self.assembly_mode == "config_driven"
            and self.scaffold_profile in CONFIG_DRIVEN_PROFILES
            and not self.data_requirements
        ):
            # Allow empty data_requirements only if widgets declare dynamic keys —
            # still require at least one endpoint for ops_dashboard pilot.
            raise ValueError(
                "config_driven Blueprint requires non-empty data_requirements"
            )
        return self


class PropMapping(BaseModel):
    prop_name: str = Field(min_length=1)
    source_type: Literal["static", "dynamic"]
    value: Any = None
    data_path: str | None = None

    @model_validator(mode="after")
    def _source_fields(self) -> PropMapping:
        if self.source_type == "static" and self.value is None:
            raise ValueError("static mapping requires value")
        if self.source_type == "dynamic" and not self.data_path:
            raise ValueError("dynamic mapping requires data_path")
        return self


class CompositionItem(BaseModel):
    component_id: str = Field(min_length=1)
    component: (
        Literal[
            "Card",
            "Chart",
            "MetricTile",
            "Table",
            "Layout",
            "ChatPanel",
            "Composer",
            "JobForm",
            "JobList",
        ]
        | None
    ) = None
    widget_type: WidgetType | None = None
    mapping: list[PropMapping] = Field(min_length=1)
    data_source: str | None = None


class LayoutOverride(BaseModel):
    component_id: str
    style_props: dict[str, str] = Field(default_factory=dict)


class AssemblyManifest(BaseModel):
    """Implementer output — mapping only; no domain code."""

    blueprint_id: str = Field(min_length=1)
    blueprint_version: str = Field(min_length=1)
    target_module: TargetModule
    configuration: dict[str, Any] = Field(default_factory=dict)
    composition: list[CompositionItem] = Field(min_length=1)
    layout_overrides: list[LayoutOverride] = Field(default_factory=list)


class AssemblyRuntimeStamp(BaseModel):
    """Assembler stamp under services/{name}/assembly_runtime.json."""

    service_name: str
    blueprint_id: str
    blueprint_version: str
    target_module: str
    scaffold_profile: str
    composition_ids: list[str]
    data_sources: list[str]
    assembler_version: str = "v0"
    widget_count: int = 0


def is_config_driven_profile(profile: str | None) -> bool:
    return bool(profile and profile.strip().lower() in CONFIG_DRIVEN_PROFILES)


def blueprint_path(designs_root: Path, service_name: str) -> Path:
    return designs_root / f"{service_name}_blueprint.json"


def manifest_path(eic_root: Path, service_name: str) -> Path:
    return eic_root / "assembly" / f"{service_name}_manifest.json"


def runtime_stamp_path(workspace: Path, service_name: str) -> Path:
    return workspace / "services" / service_name / "assembly_runtime.json"


def validate_blueprint(data: dict[str, Any] | BlueprintContract) -> BlueprintContract:
    if isinstance(data, BlueprintContract):
        return data
    return BlueprintContract.model_validate(data)


def validate_manifest(data: dict[str, Any] | AssemblyManifest) -> AssemblyManifest:
    if isinstance(data, AssemblyManifest):
        return data
    return AssemblyManifest.model_validate(data)


def validate_manifest_against_blueprint(
    manifest: AssemblyManifest, blueprint: BlueprintContract
) -> None:
    """Raise ValueError when Manifest drifts from Blueprint contract."""
    if manifest.blueprint_version != blueprint.version:
        raise ValueError(
            f"manifest blueprint_version={manifest.blueprint_version!r} "
            f"!= blueprint.version={blueprint.version!r}"
        )
    if manifest.blueprint_id not in {blueprint.service_name, blueprint.version}:
        # Allow service_name or version as id.
        if manifest.blueprint_id != f"{blueprint.service_name}@{blueprint.version}":
            raise ValueError(
                f"manifest.blueprint_id={manifest.blueprint_id!r} "
                f"does not match service {blueprint.service_name!r}"
            )
    if manifest.target_module != blueprint.target_module:
        raise ValueError(
            f"manifest.target_module={manifest.target_module} "
            f"!= blueprint.target_module={blueprint.target_module}"
        )
    bp_ids = {n.id for n in blueprint.target_component_tree}
    for item in manifest.composition:
        # Blueprint owns the tree: composition ids must be exact tree nodes.
        # No fuzzy widget_type / component-name escape — that invited LLM drift.
        if item.component_id in bp_ids:
            continue
        raise ValueError(
            f"composition component_id={item.component_id!r} "
            f"not covered by Blueprint tree ids={sorted(bp_ids)}"
        )
    allowed_endpoints = {d.endpoint for d in blueprint.data_requirements}
    for item in manifest.composition:
        if item.data_source and allowed_endpoints:
            # Allow relative match (api/v1/x vs /api/v1/x)
            src = item.data_source.lstrip("/")
            if not any(
                src == ep.lstrip("/") or src.endswith(ep.lstrip("/"))
                or ep.lstrip("/").endswith(src)
                for ep in allowed_endpoints
            ):
                raise ValueError(
                    f"data_source={item.data_source!r} not in "
                    f"Blueprint data_requirements {sorted(allowed_endpoints)}"
                )


def _norm_endpoint(endpoint: str) -> str:
    return "/" + str(endpoint or "").lstrip("/")


def _endpoint_in_allowlist(data_source: str, allowed: set[str]) -> bool:
    src = data_source.lstrip("/")
    return any(
        src == ep.lstrip("/")
        or src.endswith(ep.lstrip("/"))
        or ep.lstrip("/").endswith(src)
        for ep in allowed
    )


# Architect/LLM drift → Empery scaffold peer routes (ops_dashboard owns /api/v1/metrics).
_OPS_METRICS_ALIASES = frozenset(
    {
        "/api/v1/metrics/summary",
        "/api/v1/metrics/series",
        "/api/v1/dashboard/metrics",
        "/api/v1/dashboard/layout",
    }
)
_OPS_METRICS_CANON = "/api/v1/metrics"


def _is_ops_metrics_family(endpoint: str) -> bool:
    ep = _norm_endpoint(endpoint)
    if ep == _OPS_METRICS_CANON or ep in _OPS_METRICS_ALIASES:
        return True
    # /api/v1/metrics/series/{id} and similar
    return ep.startswith("/api/v1/metrics/")


def canonicalize_blueprint_endpoints(
    blueprint: BlueprintContract,
) -> BlueprintContract:
    """Collapse profile-known drift endpoints onto scaffold-real routes.

    ops_dashboard peer API is ``GET /api/v1/metrics`` — Architect often invents
    ``/metrics/summary`` etc. Normalize before persist so Manifest heal matches.
    """
    profile = (blueprint.scaffold_profile or "").lower()
    if profile != "ops_dashboard":
        return blueprint
    new_reqs: list[DataRequirement] = []
    seen_metrics = False
    changed = False
    for req in blueprint.data_requirements:
        ep = _norm_endpoint(req.endpoint)
        if _is_ops_metrics_family(ep):
            if ep != _OPS_METRICS_CANON:
                changed = True
            if not seen_metrics:
                new_reqs.append(
                    DataRequirement(
                        endpoint=_OPS_METRICS_CANON,
                        method=req.method or "GET",
                        schema_version=req.schema_version or "1",
                    )
                )
                seen_metrics = True
            continue
        new_reqs.append(req if ep == req.endpoint else req.model_copy(update={"endpoint": ep}))
        if ep != req.endpoint:
            changed = True
    if not new_reqs:
        new_reqs = [DataRequirement(endpoint=_OPS_METRICS_CANON, method="GET")]
        changed = True
    if not changed and list(blueprint.data_requirements) == new_reqs:
        return blueprint
    return blueprint.model_copy(update={"data_requirements": new_reqs})


def rebind_manifest_composition_from_blueprint(
    manifest: AssemblyManifest,
    blueprint: BlueprintContract,
) -> tuple[AssemblyManifest, bool]:
    """Replace composition with the Blueprint projection (source of truth).

    Used when Implementer Manifest cites foreign component_ids. Does **not**
    fuzzy-remap invented ids onto similar tree nodes — composition is fully
    derived via ``manifest_from_blueprint``. Preserves configuration /
    layout_overrides from the Implementer Manifest.
    """
    derived = manifest_from_blueprint(blueprint)
    old_ids = [c.component_id for c in manifest.composition]
    new_ids = [c.component_id for c in derived.composition]
    same_projection = (
        old_ids == new_ids
        and manifest.blueprint_id
        in {
            blueprint.service_name,
            blueprint.version,
            f"{blueprint.service_name}@{blueprint.version}",
        }
        and manifest.blueprint_version == blueprint.version
        and manifest.target_module == blueprint.target_module
    )
    if same_projection:
        return manifest, False
    rebound = manifest.model_copy(
        update={
            "blueprint_id": derived.blueprint_id,
            "blueprint_version": derived.blueprint_version,
            "target_module": derived.target_module,
            "composition": derived.composition,
        }
    )
    return rebound, True


def heal_manifest_data_sources(
    manifest: AssemblyManifest,
    blueprint: BlueprintContract,
) -> tuple[AssemblyManifest, bool]:
    """Remap Manifest data_source onto Blueprint allowlist when LLM drifts.

    Returns (manifest, healed). Prefer profile aliases, else first allowlisted
    endpoint. Does not invent endpoints outside Blueprint data_requirements.
    """
    allowed = {_norm_endpoint(d.endpoint) for d in blueprint.data_requirements}
    if not allowed:
        return manifest, False
    primary = next(iter(sorted(allowed)))
    # Prefer canonical metrics when present.
    if _OPS_METRICS_CANON in allowed:
        primary = _OPS_METRICS_CANON
    profile = (blueprint.scaffold_profile or "").lower()
    new_comp: list[CompositionItem] = []
    healed = False
    for item in manifest.composition:
        src = item.data_source
        if not src:
            new_comp.append(item)
            continue
        if _endpoint_in_allowlist(src, allowed):
            new_comp.append(item)
            continue
        mapped = src
        if profile == "ops_dashboard" and _is_ops_metrics_family(src):
            mapped = _OPS_METRICS_CANON if _OPS_METRICS_CANON in allowed else primary
        else:
            mapped = primary
        if not _endpoint_in_allowlist(mapped, allowed):
            mapped = primary
        if _norm_endpoint(mapped) != _norm_endpoint(src):
            healed = True
            new_comp.append(item.model_copy(update={"data_source": mapped}))
        else:
            new_comp.append(item)
    if not healed:
        return manifest, False
    return manifest.model_copy(update={"composition": new_comp}), True


def extract_json_objects(text: str) -> list[dict[str, Any]]:
    """Pull JSON objects from fenced blocks and bare braces in LLM text."""
    found: list[dict[str, Any]] = []
    for match in _JSON_FENCE_RE.finditer(text or ""):
        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            found.append(payload)
    if not found:
        # Last resort: largest {...} span
        start = (text or "").find("{")
        end = (text or "").rfind("}")
        if start >= 0 and end > start:
            try:
                payload = json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                payload = None
            if isinstance(payload, dict):
                found.append(payload)
    return found


def parse_blueprint_from_text(
    text: str, *, service_name: str
) -> BlueprintContract | None:
    """Find a Blueprint-shaped object in Architect output."""
    for obj in extract_json_objects(text):
        # Unwrap common wrappers
        candidate = obj.get("blueprint") if isinstance(obj.get("blueprint"), dict) else obj
        if "eic_actions" in obj and "target_component_tree" not in candidate:
            continue
        if "target_component_tree" not in candidate and "scaffold_profile" not in candidate:
            continue
        if "service_name" not in candidate:
            candidate = {**candidate, "service_name": service_name}
        try:
            return validate_blueprint(candidate)
        except Exception:
            continue
    return None


def parse_manifest_from_text(text: str) -> AssemblyManifest | None:
    for obj in extract_json_objects(text):
        candidate = obj.get("manifest") if isinstance(obj.get("manifest"), dict) else obj
        if "composition" not in candidate and "configuration" not in candidate:
            continue
        # Accept layout-style shorthand → normalize
        if "composition" not in candidate and isinstance(
            candidate.get("configuration"), dict
        ):
            layout = candidate["configuration"].get("layout")
            if isinstance(layout, list):
                composition = []
                for i, row in enumerate(layout):
                    if not isinstance(row, dict):
                        continue
                    props = row.get("props") if isinstance(row.get("props"), dict) else {}
                    mapping = [
                        {
                            "prop_name": k,
                            "source_type": "static",
                            "value": v,
                        }
                        for k, v in props.items()
                        if not str(k).endswith("_source") and not str(k).endswith("data_source")
                    ]
                    data_source = (
                        props.get("data_source")
                        or props.get("value_source")
                        or row.get("data_source")
                    )
                    if data_source:
                        mapping.append(
                            {
                                "prop_name": "data_source",
                                "source_type": "dynamic",
                                "data_path": str(data_source),
                            }
                        )
                    if not mapping:
                        mapping = [
                            {
                                "prop_name": "title",
                                "source_type": "static",
                                "value": row.get("component_id") or f"item_{i}",
                            }
                        ]
                    composition.append(
                        {
                            "component_id": str(
                                row.get("component_id") or f"item_{i}"
                            ),
                            "widget_type": row.get("widget_type"),
                            "mapping": mapping,
                            "data_source": data_source,
                        }
                    )
                candidate = {
                    **candidate,
                    "composition": composition,
                }
        if "composition" not in candidate:
            continue
        try:
            return validate_manifest(candidate)
        except Exception:
            continue
    return None


def default_ops_dashboard_blueprint(
    *,
    service_name: str,
    recipe_packs: list[str] | None = None,
) -> BlueprintContract:
    """Minimal valid Blueprint when Architect omits structured JSON (heal path)."""
    return BlueprintContract(
        version="1.0.0",
        service_name=service_name,
        scaffold_profile="ops_dashboard",
        recipe_packs=list(recipe_packs or ["ops_dashboard"]),
        assembly_mode="config_driven",
        target_module=TargetModule.DASHBOARD_STANDARD,
        theme="system",
        target_component_tree=[
            TreeNode(
                id="root_layout",
                type=ComponentType.LAYOUT,
                children=["metric_card", "trend_chart"],
            ),
            TreeNode(
                id="metric_card",
                type=ComponentType.WIDGET,
                widget_type=WidgetType.CARD,
                props={"title": "Metrics"},
                constraints=TreeConstraints(required_data_keys=["value"]),
            ),
            TreeNode(
                id="trend_chart",
                type=ComponentType.WIDGET,
                widget_type=WidgetType.CHART,
                props={"chart_type": "area_line"},
                constraints=TreeConstraints(required_data_keys=["series"]),
            ),
        ],
        data_requirements=[
            DataRequirement(endpoint="/api/v1/metrics", method="GET"),
        ],
    )


def default_companion_chat_blueprint(
    *,
    service_name: str,
    recipe_packs: list[str] | None = None,
) -> BlueprintContract:
    """Heal Blueprint for companion_chat when Architect omits JSON."""
    return BlueprintContract(
        version="1.0.0",
        service_name=service_name,
        scaffold_profile="companion_chat",
        recipe_packs=list(recipe_packs or ["ewa_companion"]),
        assembly_mode="config_driven",
        target_module=TargetModule.COMPANION_CHAT,
        theme="system",
        target_component_tree=[
            TreeNode(
                id="root_layout",
                type=ComponentType.LAYOUT,
                children=["message_panel", "composer_box"],
            ),
            TreeNode(
                id="message_panel",
                type=ComponentType.WIDGET,
                widget_type=WidgetType.MESSAGE_LIST,
                props={
                    "title": "Transcript",
                    "empty_hint": "Ask anything — replies come from living Nervas.",
                },
                constraints=TreeConstraints(required_data_keys=["messages"]),
            ),
            TreeNode(
                id="composer_box",
                type=ComponentType.WIDGET,
                widget_type=WidgetType.COMPOSER,
                props={
                    "title": "Composer",
                    "placeholder": "Ask the companion…",
                    "send_label": "Send",
                },
            ),
        ],
        data_requirements=[
            DataRequirement(endpoint="/api/v1/messages", method="GET"),
        ],
    )


def default_studio_job_blueprint(
    *,
    service_name: str,
    recipe_packs: list[str] | None = None,
) -> BlueprintContract:
    """Heal Blueprint for studio_job when Architect omits JSON."""
    return BlueprintContract(
        version="1.0.0",
        service_name=service_name,
        scaffold_profile="studio_job",
        recipe_packs=list(recipe_packs or ["studios"]),
        assembly_mode="config_driven",
        target_module=TargetModule.STUDIO_JOB,
        theme="system",
        target_component_tree=[
            TreeNode(
                id="root_layout",
                type=ComponentType.LAYOUT,
                children=["prompt_form", "jobs_panel"],
            ),
            TreeNode(
                id="prompt_form",
                type=ComponentType.WIDGET,
                widget_type=WidgetType.JOB_FORM,
                props={
                    "title": "Generate",
                    "placeholder": "Describe what to generate…",
                    "button_label": "Generate",
                },
            ),
            TreeNode(
                id="jobs_panel",
                type=ComponentType.WIDGET,
                widget_type=WidgetType.JOB_LIST,
                props={"title": "Jobs", "empty_hint": "No jobs yet."},
                constraints=TreeConstraints(required_data_keys=["jobs"]),
            ),
        ],
        data_requirements=[
            DataRequirement(endpoint="/api/v1/jobs", method="GET"),
        ],
    )


def default_blueprint_for_profile(
    profile: str,
    *,
    service_name: str,
    recipe_packs: list[str] | None = None,
) -> BlueprintContract | None:
    """Return heal Blueprint for a config_driven profile, or None."""
    key = (profile or "").strip().lower()
    if key == "ops_dashboard":
        return default_ops_dashboard_blueprint(
            service_name=service_name, recipe_packs=recipe_packs
        )
    if key == "companion_chat":
        return default_companion_chat_blueprint(
            service_name=service_name, recipe_packs=recipe_packs
        )
    if key == "studio_job":
        return default_studio_job_blueprint(
            service_name=service_name, recipe_packs=recipe_packs
        )
    return None


def _widget_composition_item(
    node: TreeNode, *, endpoint: str
) -> CompositionItem:
    wt = node.widget_type or WidgetType.CARD
    title = str(node.props.get("title") or node.id)
    if wt == WidgetType.CHART:
        chart_type = str(node.props.get("chart_type") or "area_line")
        return CompositionItem(
            component_id=node.id,
            component="Chart",
            widget_type=WidgetType.CHART,
            data_source=endpoint,
            mapping=[
                PropMapping(
                    prop_name="title",
                    source_type="static",
                    value=title if title != node.id else "Trend",
                ),
                PropMapping(
                    prop_name="chart_type",
                    source_type="static",
                    value=chart_type,
                ),
            ],
        )
    if wt == WidgetType.MESSAGE_LIST:
        empty = str(
            node.props.get("empty_hint")
            or "Ask anything — replies come from living Nervas."
        )
        return CompositionItem(
            component_id=node.id,
            component="ChatPanel",
            widget_type=WidgetType.MESSAGE_LIST,
            data_source=endpoint,
            mapping=[
                PropMapping(prop_name="title", source_type="static", value=title),
                PropMapping(
                    prop_name="empty_hint", source_type="static", value=empty
                ),
                PropMapping(
                    prop_name="messages",
                    source_type="dynamic",
                    data_path="messages",
                ),
            ],
        )
    if wt == WidgetType.COMPOSER:
        placeholder = str(node.props.get("placeholder") or "Ask the companion…")
        send_label = str(node.props.get("send_label") or "Send")
        return CompositionItem(
            component_id=node.id,
            component="Composer",
            widget_type=WidgetType.COMPOSER,
            data_source=endpoint,
            mapping=[
                PropMapping(prop_name="title", source_type="static", value=title),
                PropMapping(
                    prop_name="placeholder",
                    source_type="static",
                    value=placeholder,
                ),
                PropMapping(
                    prop_name="send_label",
                    source_type="static",
                    value=send_label,
                ),
            ],
        )
    if wt == WidgetType.JOB_FORM:
        placeholder = str(
            node.props.get("placeholder") or "Describe what to generate…"
        )
        button_label = str(node.props.get("button_label") or "Generate")
        return CompositionItem(
            component_id=node.id,
            component="JobForm",
            widget_type=WidgetType.JOB_FORM,
            data_source=endpoint,
            mapping=[
                PropMapping(prop_name="title", source_type="static", value=title),
                PropMapping(
                    prop_name="placeholder",
                    source_type="static",
                    value=placeholder,
                ),
                PropMapping(
                    prop_name="button_label",
                    source_type="static",
                    value=button_label,
                ),
            ],
        )
    if wt == WidgetType.JOB_LIST:
        empty = str(node.props.get("empty_hint") or "No jobs yet.")
        return CompositionItem(
            component_id=node.id,
            component="JobList",
            widget_type=WidgetType.JOB_LIST,
            data_source=endpoint,
            mapping=[
                PropMapping(prop_name="title", source_type="static", value=title),
                PropMapping(
                    prop_name="empty_hint", source_type="static", value=empty
                ),
                PropMapping(
                    prop_name="jobs", source_type="dynamic", data_path="jobs"
                ),
            ],
        )
    return CompositionItem(
        component_id=node.id,
        component="Card",
        widget_type=wt if wt in {WidgetType.CARD, WidgetType.METRIC} else WidgetType.CARD,
        data_source=endpoint,
        mapping=[
            PropMapping(prop_name="title", source_type="static", value=title),
            PropMapping(
                prop_name="value", source_type="dynamic", data_path="value"
            ),
        ],
    )


def manifest_from_blueprint(blueprint: BlueprintContract) -> AssemblyManifest:
    """Mechanics heal: derive Manifest composition from Blueprint tree + data_requirements.

    Used when Implementer omits valid Manifest JSON — Assembler still owns inject.
    """
    endpoint = "/api/v1/metrics"
    if blueprint.data_requirements:
        endpoint = blueprint.data_requirements[0].endpoint
    elif blueprint.scaffold_profile == "companion_chat":
        endpoint = "/api/v1/messages"
    elif blueprint.scaffold_profile == "studio_job":
        endpoint = "/api/v1/jobs"

    composition: list[CompositionItem] = []
    for node in blueprint.target_component_tree:
        if node.type != ComponentType.WIDGET:
            continue
        composition.append(_widget_composition_item(node, endpoint=endpoint))

    if not composition:
        # Fallback by profile when tree had no widgets.
        if blueprint.scaffold_profile == "companion_chat":
            composition = [
                _widget_composition_item(
                    TreeNode(
                        id="message_panel",
                        type=ComponentType.WIDGET,
                        widget_type=WidgetType.MESSAGE_LIST,
                        props={"title": "Transcript"},
                    ),
                    endpoint=endpoint,
                ),
                _widget_composition_item(
                    TreeNode(
                        id="composer_box",
                        type=ComponentType.WIDGET,
                        widget_type=WidgetType.COMPOSER,
                        props={"title": "Composer"},
                    ),
                    endpoint=endpoint,
                ),
            ]
        elif blueprint.scaffold_profile == "studio_job":
            composition = [
                _widget_composition_item(
                    TreeNode(
                        id="prompt_form",
                        type=ComponentType.WIDGET,
                        widget_type=WidgetType.JOB_FORM,
                        props={"title": "Generate"},
                    ),
                    endpoint=endpoint,
                ),
                _widget_composition_item(
                    TreeNode(
                        id="jobs_panel",
                        type=ComponentType.WIDGET,
                        widget_type=WidgetType.JOB_LIST,
                        props={"title": "Jobs"},
                    ),
                    endpoint=endpoint,
                ),
            ]
        else:
            composition = [
                CompositionItem(
                    component_id="metric_card",
                    component="Card",
                    widget_type=WidgetType.CARD,
                    data_source=endpoint,
                    mapping=[
                        PropMapping(
                            prop_name="title",
                            source_type="static",
                            value="Metrics",
                        ),
                        PropMapping(
                            prop_name="value",
                            source_type="dynamic",
                            data_path="value",
                        ),
                    ],
                ),
                CompositionItem(
                    component_id="trend_chart",
                    component="Chart",
                    widget_type=WidgetType.CHART,
                    data_source=endpoint,
                    mapping=[
                        PropMapping(
                            prop_name="title",
                            source_type="static",
                            value="Trend",
                        ),
                        PropMapping(
                            prop_name="chart_type",
                            source_type="static",
                            value="area_line",
                        ),
                    ],
                ),
            ]

    return AssemblyManifest(
        blueprint_id=blueprint.service_name,
        blueprint_version=blueprint.version,
        target_module=blueprint.target_module,
        composition=composition,
    )


def load_assembly_registry(workspace: Path) -> dict[str, Any]:
    path = (
        workspace
        / ".cursor"
        / "orchestration"
        / "assembly"
        / "registry.yaml"
    )
    if not path.is_file():
        return {"profiles": {}, "defaults": {"assembly_mode": "legacy"}}
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {"profiles": {}, "defaults": {"assembly_mode": "legacy"}}


def profile_assembly_mode(workspace: Path, profile: str | None) -> str:
    if is_config_driven_profile(profile):
        return "config_driven"
    reg = load_assembly_registry(workspace)
    profiles = reg.get("profiles") if isinstance(reg.get("profiles"), dict) else {}
    key = (profile or "").strip().lower()
    entry = profiles.get(key) if key else None
    if isinstance(entry, dict) and entry.get("assembly_mode"):
        return str(entry["assembly_mode"])
    defaults = reg.get("defaults") if isinstance(reg.get("defaults"), dict) else {}
    return str(defaults.get("assembly_mode") or "legacy")


# ---------------------------------------------------------------------------
# OpenAI-native assembly tools (Arli pattern: tools + thinking on chat)
# ---------------------------------------------------------------------------

EMIT_BLUEPRINT_TOOL = "emit_blueprint"
EMIT_MANIFEST_TOOL = "emit_manifest"


def openai_assembly_tools(*, role: str) -> list[dict[str, Any]]:
    """OpenAI tool specs for config_driven Architect / Implementer turns."""
    key = (role or "").strip().lower()
    if key in {"architect", "plan"}:
        return [
            {
                "type": "function",
                "function": {
                    "name": EMIT_BLUEPRINT_TOOL,
                    "description": (
                        "Emit the Assembly BlueprintContract JSON. "
                        "target_component_tree ids are the sole source of truth; "
                        "do not invent composition ids outside this tree."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "blueprint": {
                                "type": "object",
                                "description": "Full BlueprintContract object",
                            }
                        },
                        "required": ["blueprint"],
                    },
                },
            }
        ]
    if key in {"implementer", "implement"}:
        return [
            {
                "type": "function",
                "function": {
                    "name": EMIT_MANIFEST_TOOL,
                    "description": (
                        "Emit the AssemblyManifest JSON. Every composition "
                        "component_id MUST equal an id from the Blueprint "
                        "target_component_tree (no invented ids)."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "manifest": {
                                "type": "object",
                                "description": "Full AssemblyManifest object",
                            }
                        },
                        "required": ["manifest"],
                    },
                },
            }
        ]
    return []


def materialize_assembly_tool_calls(
    tool_calls: list[dict[str, Any]] | None,
) -> str | None:
    """Turn native tool_calls into fenced JSON for existing Blueprint/Manifest parsers."""
    if not tool_calls:
        return None
    for tc in tool_calls:
        if not isinstance(tc, dict):
            continue
        fn = tc.get("function") if isinstance(tc.get("function"), dict) else tc
        name = str(fn.get("name") or tc.get("name") or "").strip()
        raw_args = fn.get("arguments") if isinstance(fn, dict) else tc.get("arguments")
        args: dict[str, Any] = {}
        if isinstance(raw_args, dict):
            args = raw_args
        elif isinstance(raw_args, str) and raw_args.strip():
            try:
                parsed = json.loads(raw_args)
                if isinstance(parsed, dict):
                    args = parsed
            except json.JSONDecodeError:
                continue
        if name == EMIT_BLUEPRINT_TOOL:
            payload = args.get("blueprint") if isinstance(args.get("blueprint"), dict) else args
            if isinstance(payload, dict) and payload:
                return (
                    "```json\n"
                    + json.dumps({"blueprint": payload}, ensure_ascii=False, indent=2)
                    + "\n```"
                )
        if name == EMIT_MANIFEST_TOOL:
            payload = args.get("manifest") if isinstance(args.get("manifest"), dict) else args
            if isinstance(payload, dict) and payload:
                return (
                    "```json\n"
                    + json.dumps({"manifest": payload}, ensure_ascii=False, indent=2)
                    + "\n```"
                )
    return None
