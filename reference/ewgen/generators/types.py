"""
Generator Types
Type definitions for generator system
"""

from typing import Any, Dict, List, Literal, Optional, TypedDict


class GeneratedFile(TypedDict):
    """A single generated file"""

    path: str
    content: str
    language: str
    description: Optional[str]


class FieldDefinition(TypedDict, total=False):
    """CRUD field definition"""

    name: str
    type: Literal[
        "string",
        "number",
        "boolean",
        "date",
        "enum",
        "array",
        "object",
    ]
    required: bool
    enumValues: List[str]
    arrayItemType: str
    label: str
    placeholder: str
    validation: Dict[str, Any]


class CRUDFeatures(TypedDict, total=False):
    """CRUD module features"""

    search: bool
    filters: bool
    sorting: bool
    pagination: bool
    bulkActions: bool
    export: bool
    detailView: bool
    authentication: bool
    softDelete: bool
    audit: bool


class DashboardFeatures(TypedDict, total=False):
    """Dashboard module features"""

    realtime: bool
    export: bool
    filters: bool
    responsive: bool
    authentication: bool
    caching: bool
    darkMode: bool


class DashboardWidget(TypedDict, total=False):
    """Dashboard widget configuration"""

    id: str
    type: str
    title: str
    dataSource: str
    size: Dict[str, int]
    position: Dict[str, int]
    config: Dict[str, Any]


class GeneratorConfig(TypedDict, total=False):
    """Generator configuration"""

    # Common
    moduleName: str
    moduleType: str

    # CRUD specific
    entityName: str
    entityNamePlural: str
    fields: List[FieldDefinition]
    features: CRUDFeatures

    # Dashboard specific
    widgets: List[DashboardWidget]
    layout: str
    theme: str

    # UI options
    ui: Dict[str, Any]


class GeneratorResult(TypedDict):
    """Result from generator"""

    success: bool
    files: List[GeneratedFile]
    stats: Dict[str, Any]
    error: Optional[str]
