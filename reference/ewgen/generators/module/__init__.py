"""
EWGen module layout normalization (canonical SET slot structure).
"""

from .docs import generate_module_docs
from .normalize import (
    extract_integration_files,
    normalize_module_bundle,
    preview_normalize_module,
    staging_relative_path,
    to_staging_layer_files,
)

__all__ = [
    "extract_integration_files",
    "generate_module_docs",
    "normalize_module_bundle",
    "preview_normalize_module",
    "staging_relative_path",
    "to_staging_layer_files",
]
