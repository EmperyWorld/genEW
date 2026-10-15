"""
SET Adapter — normalize Warsmith bundles to SET Module Standard (between Warsmith and SET)
"""

from .analyze import analyze_for_set
from .component_standard import verify_set_component_standard
from .constants import SET_COMPONENT_MODULE_KIND, SET_COMPONENT_STANDARD_VERSION
from .fe_closure import expand_fe_closure, load_archive_contents
from .gate import assert_adapter_ready_for_install, evaluate_adapter_gate
from .pipeline import run_adapter_pipeline
from .staging import get_staging_status
from .transform import transform_for_set
from .verify import verify_adapter_staging

__all__ = [
    "SET_COMPONENT_MODULE_KIND",
    "SET_COMPONENT_STANDARD_VERSION",
    "analyze_for_set",
    "assert_adapter_ready_for_install",
    "evaluate_adapter_gate",
    "expand_fe_closure",
    "get_staging_status",
    "load_archive_contents",
    "run_adapter_pipeline",
    "transform_for_set",
    "verify_adapter_staging",
    "verify_set_component_standard",
]
