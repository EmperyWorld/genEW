import datetime

from google.protobuf import struct_pb2 as _struct_pb2
from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class AssemblyMode(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ASSEMBLY_MODE_UNSPECIFIED: _ClassVar[AssemblyMode]
    ASSEMBLY_MODE_CONFIG_DRIVEN: _ClassVar[AssemblyMode]
    ASSEMBLY_MODE_LEGACY: _ClassVar[AssemblyMode]

class TargetModule(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    TARGET_MODULE_UNSPECIFIED: _ClassVar[TargetModule]
    TARGET_MODULE_DASHBOARD_STANDARD: _ClassVar[TargetModule]
    TARGET_MODULE_COMPANION_CHAT: _ClassVar[TargetModule]
    TARGET_MODULE_STUDIO_JOB: _ClassVar[TargetModule]
    TARGET_MODULE_GENERIC: _ClassVar[TargetModule]

class ComponentKind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    COMPONENT_KIND_UNSPECIFIED: _ClassVar[ComponentKind]
    COMPONENT_KIND_LAYOUT: _ClassVar[ComponentKind]
    COMPONENT_KIND_CONTAINER: _ClassVar[ComponentKind]
    COMPONENT_KIND_WIDGET: _ClassVar[ComponentKind]
    COMPONENT_KIND_ATOM: _ClassVar[ComponentKind]

class WidgetType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    WIDGET_TYPE_UNSPECIFIED: _ClassVar[WidgetType]
    WIDGET_TYPE_CARD: _ClassVar[WidgetType]
    WIDGET_TYPE_CHART: _ClassVar[WidgetType]
    WIDGET_TYPE_TABLE: _ClassVar[WidgetType]
    WIDGET_TYPE_METRIC: _ClassVar[WidgetType]
    WIDGET_TYPE_HEADER: _ClassVar[WidgetType]
    WIDGET_TYPE_SIDEBAR: _ClassVar[WidgetType]
    WIDGET_TYPE_MESSAGE_LIST: _ClassVar[WidgetType]
    WIDGET_TYPE_COMPOSER: _ClassVar[WidgetType]
    WIDGET_TYPE_JOB_FORM: _ClassVar[WidgetType]
    WIDGET_TYPE_JOB_LIST: _ClassVar[WidgetType]

class VerifyStatus(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    VERIFY_STATUS_UNSPECIFIED: _ClassVar[VerifyStatus]
    VERIFY_STATUS_PASSED: _ClassVar[VerifyStatus]
    VERIFY_STATUS_FAILED: _ClassVar[VerifyStatus]

class Severity(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    SEVERITY_UNSPECIFIED: _ClassVar[Severity]
    SEVERITY_INFO: _ClassVar[Severity]
    SEVERITY_WARNING: _ClassVar[Severity]
    SEVERITY_ERROR: _ClassVar[Severity]
    SEVERITY_CRITICAL: _ClassVar[Severity]

class AssemblyStep(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ASSEMBLY_STEP_UNSPECIFIED: _ClassVar[AssemblyStep]
    ASSEMBLY_STEP_VALIDATE: _ClassVar[AssemblyStep]
    ASSEMBLY_STEP_SCAFFOLD: _ClassVar[AssemblyStep]
    ASSEMBLY_STEP_EXTRACT: _ClassVar[AssemblyStep]
    ASSEMBLY_STEP_STAMP: _ClassVar[AssemblyStep]
    ASSEMBLY_STEP_INJECT: _ClassVar[AssemblyStep]
    ASSEMBLY_STEP_FREEZE: _ClassVar[AssemblyStep]
    ASSEMBLY_STEP_TSC: _ClassVar[AssemblyStep]
    ASSEMBLY_STEP_RELOAD_HINT: _ClassVar[AssemblyStep]
    ASSEMBLY_STEP_DONE: _ClassVar[AssemblyStep]
    ASSEMBLY_STEP_FAILED: _ClassVar[AssemblyStep]
ASSEMBLY_MODE_UNSPECIFIED: AssemblyMode
ASSEMBLY_MODE_CONFIG_DRIVEN: AssemblyMode
ASSEMBLY_MODE_LEGACY: AssemblyMode
TARGET_MODULE_UNSPECIFIED: TargetModule
TARGET_MODULE_DASHBOARD_STANDARD: TargetModule
TARGET_MODULE_COMPANION_CHAT: TargetModule
TARGET_MODULE_STUDIO_JOB: TargetModule
TARGET_MODULE_GENERIC: TargetModule
COMPONENT_KIND_UNSPECIFIED: ComponentKind
COMPONENT_KIND_LAYOUT: ComponentKind
COMPONENT_KIND_CONTAINER: ComponentKind
COMPONENT_KIND_WIDGET: ComponentKind
COMPONENT_KIND_ATOM: ComponentKind
WIDGET_TYPE_UNSPECIFIED: WidgetType
WIDGET_TYPE_CARD: WidgetType
WIDGET_TYPE_CHART: WidgetType
WIDGET_TYPE_TABLE: WidgetType
WIDGET_TYPE_METRIC: WidgetType
WIDGET_TYPE_HEADER: WidgetType
WIDGET_TYPE_SIDEBAR: WidgetType
WIDGET_TYPE_MESSAGE_LIST: WidgetType
WIDGET_TYPE_COMPOSER: WidgetType
WIDGET_TYPE_JOB_FORM: WidgetType
WIDGET_TYPE_JOB_LIST: WidgetType
VERIFY_STATUS_UNSPECIFIED: VerifyStatus
VERIFY_STATUS_PASSED: VerifyStatus
VERIFY_STATUS_FAILED: VerifyStatus
SEVERITY_UNSPECIFIED: Severity
SEVERITY_INFO: Severity
SEVERITY_WARNING: Severity
SEVERITY_ERROR: Severity
SEVERITY_CRITICAL: Severity
ASSEMBLY_STEP_UNSPECIFIED: AssemblyStep
ASSEMBLY_STEP_VALIDATE: AssemblyStep
ASSEMBLY_STEP_SCAFFOLD: AssemblyStep
ASSEMBLY_STEP_EXTRACT: AssemblyStep
ASSEMBLY_STEP_STAMP: AssemblyStep
ASSEMBLY_STEP_INJECT: AssemblyStep
ASSEMBLY_STEP_FREEZE: AssemblyStep
ASSEMBLY_STEP_TSC: AssemblyStep
ASSEMBLY_STEP_RELOAD_HINT: AssemblyStep
ASSEMBLY_STEP_DONE: AssemblyStep
ASSEMBLY_STEP_FAILED: AssemblyStep

class PropMapping(_message.Message):
    __slots__ = ("prop_name", "source_type", "value", "data_path")
    PROP_NAME_FIELD_NUMBER: _ClassVar[int]
    SOURCE_TYPE_FIELD_NUMBER: _ClassVar[int]
    VALUE_FIELD_NUMBER: _ClassVar[int]
    DATA_PATH_FIELD_NUMBER: _ClassVar[int]
    prop_name: str
    source_type: str
    value: _struct_pb2.Value
    data_path: str
    def __init__(self, prop_name: _Optional[str] = ..., source_type: _Optional[str] = ..., value: _Optional[_Union[_struct_pb2.Value, _Mapping]] = ..., data_path: _Optional[str] = ...) -> None: ...

class TreeNode(_message.Message):
    __slots__ = ("id", "type", "widget_type", "props", "children", "required_data_keys")
    ID_FIELD_NUMBER: _ClassVar[int]
    TYPE_FIELD_NUMBER: _ClassVar[int]
    WIDGET_TYPE_FIELD_NUMBER: _ClassVar[int]
    PROPS_FIELD_NUMBER: _ClassVar[int]
    CHILDREN_FIELD_NUMBER: _ClassVar[int]
    REQUIRED_DATA_KEYS_FIELD_NUMBER: _ClassVar[int]
    id: str
    type: ComponentKind
    widget_type: WidgetType
    props: _struct_pb2.Struct
    children: _containers.RepeatedScalarFieldContainer[str]
    required_data_keys: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, id: _Optional[str] = ..., type: _Optional[_Union[ComponentKind, str]] = ..., widget_type: _Optional[_Union[WidgetType, str]] = ..., props: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ..., children: _Optional[_Iterable[str]] = ..., required_data_keys: _Optional[_Iterable[str]] = ...) -> None: ...

class DataRequirement(_message.Message):
    __slots__ = ("endpoint", "method", "schema_version")
    ENDPOINT_FIELD_NUMBER: _ClassVar[int]
    METHOD_FIELD_NUMBER: _ClassVar[int]
    SCHEMA_VERSION_FIELD_NUMBER: _ClassVar[int]
    endpoint: str
    method: str
    schema_version: str
    def __init__(self, endpoint: _Optional[str] = ..., method: _Optional[str] = ..., schema_version: _Optional[str] = ...) -> None: ...

class Design(_message.Message):
    __slots__ = ("version", "service_name", "scaffold_profile", "recipe_packs", "assembly_mode", "target_module", "theme", "target_component_tree", "data_requirements", "layout_rules")
    VERSION_FIELD_NUMBER: _ClassVar[int]
    SERVICE_NAME_FIELD_NUMBER: _ClassVar[int]
    SCAFFOLD_PROFILE_FIELD_NUMBER: _ClassVar[int]
    RECIPE_PACKS_FIELD_NUMBER: _ClassVar[int]
    ASSEMBLY_MODE_FIELD_NUMBER: _ClassVar[int]
    TARGET_MODULE_FIELD_NUMBER: _ClassVar[int]
    THEME_FIELD_NUMBER: _ClassVar[int]
    TARGET_COMPONENT_TREE_FIELD_NUMBER: _ClassVar[int]
    DATA_REQUIREMENTS_FIELD_NUMBER: _ClassVar[int]
    LAYOUT_RULES_FIELD_NUMBER: _ClassVar[int]
    version: str
    service_name: str
    scaffold_profile: str
    recipe_packs: _containers.RepeatedScalarFieldContainer[str]
    assembly_mode: AssemblyMode
    target_module: TargetModule
    theme: str
    target_component_tree: _containers.RepeatedCompositeFieldContainer[TreeNode]
    data_requirements: _containers.RepeatedCompositeFieldContainer[DataRequirement]
    layout_rules: _struct_pb2.Struct
    def __init__(self, version: _Optional[str] = ..., service_name: _Optional[str] = ..., scaffold_profile: _Optional[str] = ..., recipe_packs: _Optional[_Iterable[str]] = ..., assembly_mode: _Optional[_Union[AssemblyMode, str]] = ..., target_module: _Optional[_Union[TargetModule, str]] = ..., theme: _Optional[str] = ..., target_component_tree: _Optional[_Iterable[_Union[TreeNode, _Mapping]]] = ..., data_requirements: _Optional[_Iterable[_Union[DataRequirement, _Mapping]]] = ..., layout_rules: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ...) -> None: ...

class CompositionItem(_message.Message):
    __slots__ = ("component_id", "component", "widget_type", "mapping", "data_source")
    COMPONENT_ID_FIELD_NUMBER: _ClassVar[int]
    COMPONENT_FIELD_NUMBER: _ClassVar[int]
    WIDGET_TYPE_FIELD_NUMBER: _ClassVar[int]
    MAPPING_FIELD_NUMBER: _ClassVar[int]
    DATA_SOURCE_FIELD_NUMBER: _ClassVar[int]
    component_id: str
    component: str
    widget_type: WidgetType
    mapping: _containers.RepeatedCompositeFieldContainer[PropMapping]
    data_source: str
    def __init__(self, component_id: _Optional[str] = ..., component: _Optional[str] = ..., widget_type: _Optional[_Union[WidgetType, str]] = ..., mapping: _Optional[_Iterable[_Union[PropMapping, _Mapping]]] = ..., data_source: _Optional[str] = ...) -> None: ...

class LayoutOverride(_message.Message):
    __slots__ = ("component_id", "style_props")
    class StylePropsEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    COMPONENT_ID_FIELD_NUMBER: _ClassVar[int]
    STYLE_PROPS_FIELD_NUMBER: _ClassVar[int]
    component_id: str
    style_props: _containers.ScalarMap[str, str]
    def __init__(self, component_id: _Optional[str] = ..., style_props: _Optional[_Mapping[str, str]] = ...) -> None: ...

class AssemblyManifest(_message.Message):
    __slots__ = ("blueprint_id", "blueprint_version", "target_module", "configuration", "composition", "layout_overrides")
    BLUEPRINT_ID_FIELD_NUMBER: _ClassVar[int]
    BLUEPRINT_VERSION_FIELD_NUMBER: _ClassVar[int]
    TARGET_MODULE_FIELD_NUMBER: _ClassVar[int]
    CONFIGURATION_FIELD_NUMBER: _ClassVar[int]
    COMPOSITION_FIELD_NUMBER: _ClassVar[int]
    LAYOUT_OVERRIDES_FIELD_NUMBER: _ClassVar[int]
    blueprint_id: str
    blueprint_version: str
    target_module: TargetModule
    configuration: _struct_pb2.Struct
    composition: _containers.RepeatedCompositeFieldContainer[CompositionItem]
    layout_overrides: _containers.RepeatedCompositeFieldContainer[LayoutOverride]
    def __init__(self, blueprint_id: _Optional[str] = ..., blueprint_version: _Optional[str] = ..., target_module: _Optional[_Union[TargetModule, str]] = ..., configuration: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ..., composition: _Optional[_Iterable[_Union[CompositionItem, _Mapping]]] = ..., layout_overrides: _Optional[_Iterable[_Union[LayoutOverride, _Mapping]]] = ...) -> None: ...

class ComponentAtom(_message.Message):
    __slots__ = ("atom_id", "catalog_key", "source_glob", "target_relpath", "metadata")
    ATOM_ID_FIELD_NUMBER: _ClassVar[int]
    CATALOG_KEY_FIELD_NUMBER: _ClassVar[int]
    SOURCE_GLOB_FIELD_NUMBER: _ClassVar[int]
    TARGET_RELPATH_FIELD_NUMBER: _ClassVar[int]
    METADATA_FIELD_NUMBER: _ClassVar[int]
    atom_id: str
    catalog_key: str
    source_glob: str
    target_relpath: str
    metadata: _struct_pb2.Struct
    def __init__(self, atom_id: _Optional[str] = ..., catalog_key: _Optional[str] = ..., source_glob: _Optional[str] = ..., target_relpath: _Optional[str] = ..., metadata: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ...) -> None: ...

class WorkspaceRef(_message.Message):
    __slots__ = ("workspace_root", "service_name", "intention_id", "ecc_job_id", "request_id")
    WORKSPACE_ROOT_FIELD_NUMBER: _ClassVar[int]
    SERVICE_NAME_FIELD_NUMBER: _ClassVar[int]
    INTENTION_ID_FIELD_NUMBER: _ClassVar[int]
    ECC_JOB_ID_FIELD_NUMBER: _ClassVar[int]
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    workspace_root: str
    service_name: str
    intention_id: str
    ecc_job_id: str
    request_id: str
    def __init__(self, workspace_root: _Optional[str] = ..., service_name: _Optional[str] = ..., intention_id: _Optional[str] = ..., ecc_job_id: _Optional[str] = ..., request_id: _Optional[str] = ...) -> None: ...

class DesignRequest(_message.Message):
    __slots__ = ("workspace", "blueprint", "manifest", "blueprint_relpath", "manifest_relpath", "run_scaffold", "run_extract", "run_tsc", "emit_deploy_hint", "assembler_version", "include_artifact_bytes")
    WORKSPACE_FIELD_NUMBER: _ClassVar[int]
    BLUEPRINT_FIELD_NUMBER: _ClassVar[int]
    MANIFEST_FIELD_NUMBER: _ClassVar[int]
    BLUEPRINT_RELPATH_FIELD_NUMBER: _ClassVar[int]
    MANIFEST_RELPATH_FIELD_NUMBER: _ClassVar[int]
    RUN_SCAFFOLD_FIELD_NUMBER: _ClassVar[int]
    RUN_EXTRACT_FIELD_NUMBER: _ClassVar[int]
    RUN_TSC_FIELD_NUMBER: _ClassVar[int]
    EMIT_DEPLOY_HINT_FIELD_NUMBER: _ClassVar[int]
    ASSEMBLER_VERSION_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_ARTIFACT_BYTES_FIELD_NUMBER: _ClassVar[int]
    workspace: WorkspaceRef
    blueprint: Design
    manifest: AssemblyManifest
    blueprint_relpath: str
    manifest_relpath: str
    run_scaffold: bool
    run_extract: bool
    run_tsc: bool
    emit_deploy_hint: bool
    assembler_version: str
    include_artifact_bytes: bool
    def __init__(self, workspace: _Optional[_Union[WorkspaceRef, _Mapping]] = ..., blueprint: _Optional[_Union[Design, _Mapping]] = ..., manifest: _Optional[_Union[AssemblyManifest, _Mapping]] = ..., blueprint_relpath: _Optional[str] = ..., manifest_relpath: _Optional[str] = ..., run_scaffold: _Optional[bool] = ..., run_extract: _Optional[bool] = ..., run_tsc: _Optional[bool] = ..., emit_deploy_hint: _Optional[bool] = ..., assembler_version: _Optional[str] = ..., include_artifact_bytes: _Optional[bool] = ...) -> None: ...

class WrittenArtifact(_message.Message):
    __slots__ = ("relpath", "kind", "sha256", "content")
    RELPATH_FIELD_NUMBER: _ClassVar[int]
    KIND_FIELD_NUMBER: _ClassVar[int]
    SHA256_FIELD_NUMBER: _ClassVar[int]
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    relpath: str
    kind: str
    sha256: str
    content: bytes
    def __init__(self, relpath: _Optional[str] = ..., kind: _Optional[str] = ..., sha256: _Optional[str] = ..., content: _Optional[bytes] = ...) -> None: ...

class DeployHint(_message.Message):
    __slots__ = ("service_name", "refresh_ecc_api", "compose_up", "bake_apps")
    SERVICE_NAME_FIELD_NUMBER: _ClassVar[int]
    REFRESH_ECC_API_FIELD_NUMBER: _ClassVar[int]
    COMPOSE_UP_FIELD_NUMBER: _ClassVar[int]
    BAKE_APPS_FIELD_NUMBER: _ClassVar[int]
    service_name: str
    refresh_ecc_api: bool
    compose_up: bool
    bake_apps: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, service_name: _Optional[str] = ..., refresh_ecc_api: _Optional[bool] = ..., compose_up: _Optional[bool] = ..., bake_apps: _Optional[_Iterable[str]] = ...) -> None: ...

class AssemblyResponse(_message.Message):
    __slots__ = ("ok", "service_name", "assembler_version", "widget_count", "written", "deploy_hint", "error_code", "error_message", "details", "artifact_bundle_relpath")
    OK_FIELD_NUMBER: _ClassVar[int]
    SERVICE_NAME_FIELD_NUMBER: _ClassVar[int]
    ASSEMBLER_VERSION_FIELD_NUMBER: _ClassVar[int]
    WIDGET_COUNT_FIELD_NUMBER: _ClassVar[int]
    WRITTEN_FIELD_NUMBER: _ClassVar[int]
    DEPLOY_HINT_FIELD_NUMBER: _ClassVar[int]
    ERROR_CODE_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    DETAILS_FIELD_NUMBER: _ClassVar[int]
    ARTIFACT_BUNDLE_RELPATH_FIELD_NUMBER: _ClassVar[int]
    ok: bool
    service_name: str
    assembler_version: str
    widget_count: int
    written: _containers.RepeatedCompositeFieldContainer[WrittenArtifact]
    deploy_hint: DeployHint
    error_code: str
    error_message: str
    details: _struct_pb2.Struct
    artifact_bundle_relpath: str
    def __init__(self, ok: _Optional[bool] = ..., service_name: _Optional[str] = ..., assembler_version: _Optional[str] = ..., widget_count: _Optional[int] = ..., written: _Optional[_Iterable[_Union[WrittenArtifact, _Mapping]]] = ..., deploy_hint: _Optional[_Union[DeployHint, _Mapping]] = ..., error_code: _Optional[str] = ..., error_message: _Optional[str] = ..., details: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ..., artifact_bundle_relpath: _Optional[str] = ...) -> None: ...

class FetchArtifactsRequest(_message.Message):
    __slots__ = ("workspace", "service_name", "include_bytes", "relpaths")
    WORKSPACE_FIELD_NUMBER: _ClassVar[int]
    SERVICE_NAME_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_BYTES_FIELD_NUMBER: _ClassVar[int]
    RELPATHS_FIELD_NUMBER: _ClassVar[int]
    workspace: WorkspaceRef
    service_name: str
    include_bytes: bool
    relpaths: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, workspace: _Optional[_Union[WorkspaceRef, _Mapping]] = ..., service_name: _Optional[str] = ..., include_bytes: _Optional[bool] = ..., relpaths: _Optional[_Iterable[str]] = ...) -> None: ...

class FetchArtifactsResponse(_message.Message):
    __slots__ = ("ok", "service_name", "artifact_bundle_relpath", "written", "error_code", "error_message")
    OK_FIELD_NUMBER: _ClassVar[int]
    SERVICE_NAME_FIELD_NUMBER: _ClassVar[int]
    ARTIFACT_BUNDLE_RELPATH_FIELD_NUMBER: _ClassVar[int]
    WRITTEN_FIELD_NUMBER: _ClassVar[int]
    ERROR_CODE_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    ok: bool
    service_name: str
    artifact_bundle_relpath: str
    written: _containers.RepeatedCompositeFieldContainer[WrittenArtifact]
    error_code: str
    error_message: str
    def __init__(self, ok: _Optional[bool] = ..., service_name: _Optional[str] = ..., artifact_bundle_relpath: _Optional[str] = ..., written: _Optional[_Iterable[_Union[WrittenArtifact, _Mapping]]] = ..., error_code: _Optional[str] = ..., error_message: _Optional[str] = ...) -> None: ...

class ExtractAdaptRequest(_message.Message):
    __slots__ = ("workspace", "source_glob", "dest", "transforms", "service_name", "mode")
    WORKSPACE_FIELD_NUMBER: _ClassVar[int]
    SOURCE_GLOB_FIELD_NUMBER: _ClassVar[int]
    DEST_FIELD_NUMBER: _ClassVar[int]
    TRANSFORMS_FIELD_NUMBER: _ClassVar[int]
    SERVICE_NAME_FIELD_NUMBER: _ClassVar[int]
    MODE_FIELD_NUMBER: _ClassVar[int]
    workspace: WorkspaceRef
    source_glob: str
    dest: str
    transforms: _containers.RepeatedScalarFieldContainer[str]
    service_name: str
    mode: str
    def __init__(self, workspace: _Optional[_Union[WorkspaceRef, _Mapping]] = ..., source_glob: _Optional[str] = ..., dest: _Optional[str] = ..., transforms: _Optional[_Iterable[str]] = ..., service_name: _Optional[str] = ..., mode: _Optional[str] = ...) -> None: ...

class ExtractAdaptResponse(_message.Message):
    __slots__ = ("ok", "mode", "written", "skipped", "error_code", "error_message")
    OK_FIELD_NUMBER: _ClassVar[int]
    MODE_FIELD_NUMBER: _ClassVar[int]
    WRITTEN_FIELD_NUMBER: _ClassVar[int]
    SKIPPED_FIELD_NUMBER: _ClassVar[int]
    ERROR_CODE_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    ok: bool
    mode: str
    written: _containers.RepeatedCompositeFieldContainer[WrittenArtifact]
    skipped: _containers.RepeatedScalarFieldContainer[str]
    error_code: str
    error_message: str
    def __init__(self, ok: _Optional[bool] = ..., mode: _Optional[str] = ..., written: _Optional[_Iterable[_Union[WrittenArtifact, _Mapping]]] = ..., skipped: _Optional[_Iterable[str]] = ..., error_code: _Optional[str] = ..., error_message: _Optional[str] = ...) -> None: ...

class ProgressUpdate(_message.Message):
    __slots__ = ("request_id", "intention_id", "step", "fraction", "message", "at", "attributes")
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    INTENTION_ID_FIELD_NUMBER: _ClassVar[int]
    STEP_FIELD_NUMBER: _ClassVar[int]
    FRACTION_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    AT_FIELD_NUMBER: _ClassVar[int]
    ATTRIBUTES_FIELD_NUMBER: _ClassVar[int]
    request_id: str
    intention_id: str
    step: AssemblyStep
    fraction: float
    message: str
    at: _timestamp_pb2.Timestamp
    attributes: _struct_pb2.Struct
    def __init__(self, request_id: _Optional[str] = ..., intention_id: _Optional[str] = ..., step: _Optional[_Union[AssemblyStep, str]] = ..., fraction: _Optional[float] = ..., message: _Optional[str] = ..., at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., attributes: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ...) -> None: ...

class AssemblyProgress(_message.Message):
    __slots__ = ("progress", "completed")
    PROGRESS_FIELD_NUMBER: _ClassVar[int]
    COMPLETED_FIELD_NUMBER: _ClassVar[int]
    progress: ProgressUpdate
    completed: AssemblyResponse
    def __init__(self, progress: _Optional[_Union[ProgressUpdate, _Mapping]] = ..., completed: _Optional[_Union[AssemblyResponse, _Mapping]] = ...) -> None: ...

class TransformRequest(_message.Message):
    __slots__ = ("workspace", "manifest_relpath", "target_relpath", "out_relpath", "manifest_inline")
    WORKSPACE_FIELD_NUMBER: _ClassVar[int]
    MANIFEST_RELPATH_FIELD_NUMBER: _ClassVar[int]
    TARGET_RELPATH_FIELD_NUMBER: _ClassVar[int]
    OUT_RELPATH_FIELD_NUMBER: _ClassVar[int]
    MANIFEST_INLINE_FIELD_NUMBER: _ClassVar[int]
    workspace: WorkspaceRef
    manifest_relpath: str
    target_relpath: str
    out_relpath: str
    manifest_inline: AssemblyManifest
    def __init__(self, workspace: _Optional[_Union[WorkspaceRef, _Mapping]] = ..., manifest_relpath: _Optional[str] = ..., target_relpath: _Optional[str] = ..., out_relpath: _Optional[str] = ..., manifest_inline: _Optional[_Union[AssemblyManifest, _Mapping]] = ...) -> None: ...

class TransformationResult(_message.Message):
    __slots__ = ("ok", "target_relpath", "out_relpath", "widget_count", "error_code", "error_message", "cli_payload")
    OK_FIELD_NUMBER: _ClassVar[int]
    TARGET_RELPATH_FIELD_NUMBER: _ClassVar[int]
    OUT_RELPATH_FIELD_NUMBER: _ClassVar[int]
    WIDGET_COUNT_FIELD_NUMBER: _ClassVar[int]
    ERROR_CODE_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    CLI_PAYLOAD_FIELD_NUMBER: _ClassVar[int]
    ok: bool
    target_relpath: str
    out_relpath: str
    widget_count: int
    error_code: str
    error_message: str
    cli_payload: _struct_pb2.Struct
    def __init__(self, ok: _Optional[bool] = ..., target_relpath: _Optional[str] = ..., out_relpath: _Optional[str] = ..., widget_count: _Optional[int] = ..., error_code: _Optional[str] = ..., error_message: _Optional[str] = ..., cli_payload: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ...) -> None: ...

class TransformResponse(_message.Message):
    __slots__ = ("result",)
    RESULT_FIELD_NUMBER: _ClassVar[int]
    result: TransformationResult
    def __init__(self, result: _Optional[_Union[TransformationResult, _Mapping]] = ...) -> None: ...

class VerificationRequest(_message.Message):
    __slots__ = ("workspace", "service_name", "gate_t", "gate_c", "gate_s", "factory", "ui", "desktop", "live", "evolve_delta", "gate_s_judge_json", "blueprint_relpath", "manifest_relpath", "intent")
    WORKSPACE_FIELD_NUMBER: _ClassVar[int]
    SERVICE_NAME_FIELD_NUMBER: _ClassVar[int]
    GATE_T_FIELD_NUMBER: _ClassVar[int]
    GATE_C_FIELD_NUMBER: _ClassVar[int]
    GATE_S_FIELD_NUMBER: _ClassVar[int]
    FACTORY_FIELD_NUMBER: _ClassVar[int]
    UI_FIELD_NUMBER: _ClassVar[int]
    DESKTOP_FIELD_NUMBER: _ClassVar[int]
    LIVE_FIELD_NUMBER: _ClassVar[int]
    EVOLVE_DELTA_FIELD_NUMBER: _ClassVar[int]
    GATE_S_JUDGE_JSON_FIELD_NUMBER: _ClassVar[int]
    BLUEPRINT_RELPATH_FIELD_NUMBER: _ClassVar[int]
    MANIFEST_RELPATH_FIELD_NUMBER: _ClassVar[int]
    INTENT_FIELD_NUMBER: _ClassVar[int]
    workspace: WorkspaceRef
    service_name: str
    gate_t: bool
    gate_c: bool
    gate_s: bool
    factory: bool
    ui: bool
    desktop: bool
    live: bool
    evolve_delta: bool
    gate_s_judge_json: str
    blueprint_relpath: str
    manifest_relpath: str
    intent: str
    def __init__(self, workspace: _Optional[_Union[WorkspaceRef, _Mapping]] = ..., service_name: _Optional[str] = ..., gate_t: _Optional[bool] = ..., gate_c: _Optional[bool] = ..., gate_s: _Optional[bool] = ..., factory: _Optional[bool] = ..., ui: _Optional[bool] = ..., desktop: _Optional[bool] = ..., live: _Optional[bool] = ..., evolve_delta: _Optional[bool] = ..., gate_s_judge_json: _Optional[str] = ..., blueprint_relpath: _Optional[str] = ..., manifest_relpath: _Optional[str] = ..., intent: _Optional[str] = ...) -> None: ...

class Violation(_message.Message):
    __slots__ = ("code", "gate", "severity", "message", "path", "evidence")
    CODE_FIELD_NUMBER: _ClassVar[int]
    GATE_FIELD_NUMBER: _ClassVar[int]
    SEVERITY_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    PATH_FIELD_NUMBER: _ClassVar[int]
    EVIDENCE_FIELD_NUMBER: _ClassVar[int]
    code: str
    gate: str
    severity: Severity
    message: str
    path: str
    evidence: _struct_pb2.Struct
    def __init__(self, code: _Optional[str] = ..., gate: _Optional[str] = ..., severity: _Optional[_Union[Severity, str]] = ..., message: _Optional[str] = ..., path: _Optional[str] = ..., evidence: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ...) -> None: ...

class GateResult(_message.Message):
    __slots__ = ("gate", "status", "violations")
    GATE_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    VIOLATIONS_FIELD_NUMBER: _ClassVar[int]
    gate: str
    status: VerifyStatus
    violations: _containers.RepeatedCompositeFieldContainer[Violation]
    def __init__(self, gate: _Optional[str] = ..., status: _Optional[_Union[VerifyStatus, str]] = ..., violations: _Optional[_Iterable[_Union[Violation, _Mapping]]] = ...) -> None: ...

class VerificationReport(_message.Message):
    __slots__ = ("service_name", "status", "gates", "violations", "report_relpath", "at")
    SERVICE_NAME_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    GATES_FIELD_NUMBER: _ClassVar[int]
    VIOLATIONS_FIELD_NUMBER: _ClassVar[int]
    REPORT_RELPATH_FIELD_NUMBER: _ClassVar[int]
    AT_FIELD_NUMBER: _ClassVar[int]
    service_name: str
    status: VerifyStatus
    gates: _containers.RepeatedCompositeFieldContainer[GateResult]
    violations: _containers.RepeatedCompositeFieldContainer[Violation]
    report_relpath: str
    at: _timestamp_pb2.Timestamp
    def __init__(self, service_name: _Optional[str] = ..., status: _Optional[_Union[VerifyStatus, str]] = ..., gates: _Optional[_Iterable[_Union[GateResult, _Mapping]]] = ..., violations: _Optional[_Iterable[_Union[Violation, _Mapping]]] = ..., report_relpath: _Optional[str] = ..., at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...
