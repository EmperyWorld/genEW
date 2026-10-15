"""
Fortune Seaker - Import size limits
Configurable via environment variables
"""

import os

# Default 50 MB — enough for typical module archives with node_modules excluded
DEFAULT_MAX_UPLOAD_BYTES = 52_428_800

MAX_UPLOAD_SIZE = int(os.getenv("EWGEN_IMPORT_MAX_UPLOAD_SIZE", str(DEFAULT_MAX_UPLOAD_BYTES)))
MAX_TOTAL_SIZE = int(os.getenv("EWGEN_IMPORT_MAX_TOTAL_SIZE", str(MAX_UPLOAD_SIZE)))
MAX_FILE_SIZE = int(os.getenv("EWGEN_IMPORT_MAX_FILE_SIZE", "524288"))  # 512 KB per file

# Hard cap on raw archive file entries (zip bomb / DoS guard)
MAX_ARCHIVE_ENTRIES = int(os.getenv("EWGEN_IMPORT_MAX_ARCHIVE_ENTRIES", "20000"))

# Max TS/JS source files to analyze (after path filters)
MAX_ANALYZED_SOURCES = int(
    os.getenv(
        "EWGEN_IMPORT_MAX_ANALYZED_SOURCES",
        os.getenv("EWGEN_IMPORT_MAX_FILES", "3000"),
    )
)

# Backward-compatible alias
MAX_FILES = MAX_ANALYZED_SOURCES
