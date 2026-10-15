"""
Scavenger - Shared limits (aligned with Fortune Seaker importer)
"""

from generators.importer.limits import (  # noqa: F401
    MAX_ANALYZED_SOURCES,
    MAX_ARCHIVE_ENTRIES,
    MAX_FILE_SIZE,
    MAX_TOTAL_SIZE,
    MAX_UPLOAD_SIZE,
)

# Python-specific analyze cap (same default as TS analyze limit)
MAX_ANALYZED_PYTHON = int(
    __import__("os").getenv(
        "EWGEN_SCAVENGER_MAX_ANALYZED_PYTHON",
        str(MAX_ANALYZED_SOURCES),
    )
)
