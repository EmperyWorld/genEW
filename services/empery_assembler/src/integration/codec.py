"""Protobuf ↔ Empery assembly contract codecs (Phase 1 sidecar)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from google.protobuf.json_format import MessageToDict
from google.protobuf.struct_pb2 import Struct
from google.protobuf.timestamp_pb2 import Timestamp

from core.protos.empery.assembly.v1 import assembly_pb2

_TARGET_MODULE = {
    "TARGET_MODULE_UNSPECIFIED": "Dashboard_Standard",
    "TARGET_MODULE_DASHBOARD_STANDARD": "Dashboard_Standard",
    "TARGET_MODULE_COMPANION_CHAT": "Companion_Chat",
    "TARGET_MODULE_STUDIO_JOB": "Studio_Job",
    "TARGET_MODULE_GENERIC": "Generic",
    "Dashboard_Standard": "Dashboard_Standard",
    "Companion_Chat": "Companion_Chat",
    "Studio_Job": "Studio_Job",
    "Generic": "Generic",
}

_COMPONENT_KIND = {
    "COMPONENT_KIND_UNSPECIFIED": "Layout",
    "COMPONENT_KIND_LAYOUT": "Layout",
    "COMPONENT_KIND_CONTAINER": "Container",
    "COMPONENT_KIND_WIDGET": "Widget",
    "COMPONENT_KIND_ATOM": "Atom",
    "Layout": "Layout",
    "Container": "Container",
    "Widget": "Widget",
    "Atom": "Atom",
}

_WIDGET_TYPE = {
    "WIDGET_TYPE_UNSPECIFIED": None,
    "WIDGET_TYPE_CARD": "card",
    "WIDGET_TYPE_CHART": "chart",
    "WIDGET_TYPE_TABLE": "table",
    "WIDGET_TYPE_METRIC": "metric",
    "WIDGET_TYPE_HEADER": "header",
    "WIDGET_TYPE_SIDEBAR": "sidebar",
    "WIDGET_TYPE_MESSAGE_LIST": "message_list",
    "WIDGET_TYPE_COMPOSER": "composer",
    "WIDGET_TYPE_JOB_FORM": "job_form",
    "WIDGET_TYPE_JOB_LIST": "job_list",
    "card": "card",
    "chart": "chart",
    "table": "table",
    "metric": "metric",
    "header": "header",
    "sidebar": "sidebar",
    "message_list": "message_list",
    "composer": "composer",
    "job_form": "job_form",
    "job_list": "job_list",
}

_ASSEMBLY_MODE = {
    "ASSEMBLY_MODE_UNSPECIFIED": "config_driven",
    "ASSEMBLY_MODE_CONFIG_DRIVEN": "config_driven",
    "ASSEMBLY_MODE_LEGACY": "legacy",
    "config_driven": "config_driven",
    "legacy": "legacy",
}


def _dict_from_struct(struct: Struct | None) -> dict[str, Any]:
    if struct is None:
        return {}
    return MessageToDict(struct, preserving_proto_field_name=True)


def _struct_from_dict(data: dict[str, Any] | None) -> Struct:
    struct = Struct()
    if data:
        struct.update(data)
    return struct


def design_to_blueprint_dict(design: assembly_pb2.Design) -> dict[str, Any]:
    """Convert proto Design → BlueprintContract-compatible dict."""
    tree: list[dict[str, Any]] = []
    for node in design.target_component_tree:
        item: dict[str, Any] = {
            "id": node.id,
            "type": _COMPONENT_KIND.get(
                assembly_pb2.ComponentKind.Name(node.type), "Layout"
            ),
            "props": _dict_from_struct(node.props),
            "children": list(node.children),
            "constraints": {
                "allow_reorder": True,
                "required_data_keys": list(node.required_data_keys),
            },
        }
        if node.HasField("widget_type"):
            wt = _WIDGET_TYPE.get(assembly_pb2.WidgetType.Name(node.widget_type))
            if wt:
                item["widget_type"] = wt
        tree.append(item)

    data_reqs = [
        {
            "endpoint": r.endpoint,
            "method": r.method or "GET",
            "schema_version": r.schema_version or "1",
        }
        for r in design.data_requirements
    ]

    return {
        "version": design.version,
        "service_name": design.service_name,
        "scaffold_profile": design.scaffold_profile,
        "recipe_packs": list(design.recipe_packs),
        "assembly_mode": _ASSEMBLY_MODE.get(
            assembly_pb2.AssemblyMode.Name(design.assembly_mode),
            "config_driven",
        ),
        "target_module": _TARGET_MODULE.get(
            assembly_pb2.TargetModule.Name(design.target_module),
            "Dashboard_Standard",
        ),
        "theme": design.theme or "system",
        "target_component_tree": tree,
        "data_requirements": data_reqs,
        "layout_rules": _dict_from_struct(design.layout_rules),
    }


def manifest_proto_to_dict(manifest: assembly_pb2.AssemblyManifest) -> dict[str, Any]:
    """Convert proto AssemblyManifest → AssemblyManifest-compatible dict."""
    composition: list[dict[str, Any]] = []
    for item in manifest.composition:
        mapping: list[dict[str, Any]] = []
        for m in item.mapping:
            entry: dict[str, Any] = {
                "prop_name": m.prop_name,
                "source_type": m.source_type,
            }
            if m.source_type == "static":
                kind = m.value.WhichOneof("kind")
                if kind == "null_value":
                    entry["value"] = None
                elif kind == "number_value":
                    entry["value"] = m.value.number_value
                elif kind == "string_value":
                    entry["value"] = m.value.string_value
                elif kind == "bool_value":
                    entry["value"] = m.value.bool_value
                elif kind == "struct_value":
                    entry["value"] = _dict_from_struct(m.value.struct_value)
                elif kind == "list_value":
                    entry["value"] = [
                        MessageToDict(v) for v in m.value.list_value.values
                    ]
                else:
                    entry["value"] = None
            if m.HasField("data_path"):
                entry["data_path"] = m.data_path
            mapping.append(entry)

        row: dict[str, Any] = {
            "component_id": item.component_id,
            "mapping": mapping,
        }
        if item.HasField("component"):
            row["component"] = item.component
        if item.HasField("widget_type"):
            wt = _WIDGET_TYPE.get(assembly_pb2.WidgetType.Name(item.widget_type))
            if wt:
                row["widget_type"] = wt
        if item.HasField("data_source"):
            row["data_source"] = item.data_source
        composition.append(row)

    return {
        "blueprint_id": manifest.blueprint_id,
        "blueprint_version": manifest.blueprint_version,
        "target_module": _TARGET_MODULE.get(
            assembly_pb2.TargetModule.Name(manifest.target_module),
            "Dashboard_Standard",
        ),
        "configuration": _dict_from_struct(manifest.configuration),
        "composition": composition,
        "layout_overrides": [
            {
                "component_id": o.component_id,
                "style_props": dict(o.style_props),
            }
            for o in manifest.layout_overrides
        ],
    }


def load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ValueError(f"JSON artifact not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_workspace(root: str, default_root: str) -> Path:
    chosen = (root or default_root or "").strip()
    if not chosen:
        raise ValueError("workspace_root is required")
    path = Path(chosen).expanduser().resolve()
    if not path.is_dir():
        raise ValueError(f"workspace_root is not a directory: {path}")
    return path


def resolve_contracts(
    request: assembly_pb2.DesignRequest,
    *,
    default_workspace: str,
) -> tuple[Path, dict[str, Any], dict[str, Any], Path]:
    """Return (workspace, blueprint_dict, manifest_dict, manifest_path)."""
    ws = resolve_workspace(request.workspace.workspace_root, default_workspace)
    service = (
        request.workspace.service_name
        or (request.blueprint.service_name if request.blueprint.service_name else "")
    )

    bp_rel = (
        request.blueprint_relpath
        if request.HasField("blueprint_relpath")
        else (
            f".cursor/orchestration/designs/{service}_blueprint.json" if service else ""
        )
    )
    mf_rel = (
        request.manifest_relpath
        if request.HasField("manifest_relpath")
        else (
            f".cursor/orchestration/eic/assembly/{service}_manifest.json"
            if service
            else ""
        )
    )

    if request.blueprint.service_name and request.blueprint.version:
        blueprint = design_to_blueprint_dict(request.blueprint)
    elif bp_rel:
        blueprint = load_json(ws / bp_rel)
    else:
        raise ValueError("DesignRequest requires inline blueprint or blueprint_relpath")

    if request.manifest.blueprint_id and request.manifest.composition:
        manifest = manifest_proto_to_dict(request.manifest)
    elif mf_rel:
        manifest = load_json(ws / mf_rel)
    else:
        raise ValueError("DesignRequest requires inline manifest or manifest_relpath")

    if not service:
        service = str(blueprint.get("service_name") or "")
    if not mf_rel:
        mf_rel = f".cursor/orchestration/eic/assembly/{service}_manifest.json"
    manifest_path = ws / mf_rel
    if not manifest_path.is_file():
        # Persist inline manifest so AST CLI can read --manifest path.
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return ws, blueprint, manifest, manifest_path


def assembly_result_to_response(
    result: dict[str, Any],
    *,
    emit_deploy_hint: bool,
    workspace: Path | None = None,
    include_artifact_bytes: bool = False,
) -> assembly_pb2.AssemblyResponse:
    written = []
    raw_inv = result.get("written_artifacts")
    if isinstance(raw_inv, list) and raw_inv:
        inventory: list[dict[str, Any]] = [
            x for x in raw_inv if isinstance(x, dict)
        ]
    else:
        inventory = []
        for rel in result.get("written") or []:
            kind = "artifact"
            if str(rel).endswith("assembly_runtime.json"):
                kind = "stamp"
            elif str(rel).endswith("assembly_freeze.json"):
                kind = "freeze"
            elif str(rel).endswith("assembly_artifact_bundle.json"):
                kind = "bundle"
            elif str(rel).endswith(".tsx") or str(rel).endswith(".ts"):
                kind = "tsx"
            inventory.append({"relpath": str(rel), "kind": kind})

    if include_artifact_bytes and workspace is not None:
        from core.assembly.artifact_bundle import attach_artifact_bytes

        inventory = attach_artifact_bytes(workspace, inventory)

    for item in inventory:
        rel = str(item.get("relpath") or "")
        if not rel:
            continue
        kind = str(item.get("kind") or "artifact")
        sha = item.get("sha256")
        art = assembly_pb2.WrittenArtifact(relpath=rel, kind=kind)
        if isinstance(sha, str) and sha:
            art.sha256 = sha
        content = item.get("content")
        if isinstance(content, (bytes, bytearray)) and content:
            art.content = bytes(content)
        written.append(art)

    resp = assembly_pb2.AssemblyResponse(
        ok=bool(result.get("ok", True)),
        service_name=str(result.get("service_name") or ""),
        assembler_version=str(result.get("assembler_version") or "v1"),
        widget_count=int(result.get("widget_count") or 0),
        written=written,
    )
    bundle_rel = result.get("artifact_bundle_relpath")
    if isinstance(bundle_rel, str) and bundle_rel:
        resp.artifact_bundle_relpath = bundle_rel
    if emit_deploy_hint and resp.ok and resp.service_name:
        resp.deploy_hint.CopyFrom(
            assembly_pb2.DeployHint(
                service_name=resp.service_name,
                refresh_ecc_api=True,
                compose_up=False,
                bake_apps=["empery_desktop", "empery_control_center"],
            )
        )
    return resp


def error_response(
    *,
    service_name: str = "",
    error_code: str,
    error_message: str,
    details: dict[str, Any] | None = None,
) -> assembly_pb2.AssemblyResponse:
    resp = assembly_pb2.AssemblyResponse(
        ok=False,
        service_name=service_name,
        assembler_version="v1",
        widget_count=0,
        error_code=error_code,
        error_message=error_message,
    )
    if details:
        resp.details.CopyFrom(_struct_from_dict(details))
    return resp


def now_timestamp() -> Timestamp:
    ts = Timestamp()
    ts.GetCurrentTime()
    return ts
