"""Path allowlist and apply-gate helpers for self-documentation."""

from __future__ import annotations

import fnmatch
from pathlib import PurePosixPath

from core.errors import ServiceError, StandardizedErrorResponse

PROPOSE_ALLOWLIST = (
    ".cursor/orchestration/SYSTEM_BLUEPRINT.md",
    ".cursor/orchestration/lifecycle.json",
    ".cursor/orchestration/designs/**",
    ".cursor/orchestration/reports/**",
    ".cursor/orchestration/proposals/**",
    ".cursor/rules/**",
)

DENY_PREFIXES = (
    "services/",
    "core/",
    "apps/",
)


def normalize_relative_path(path: str) -> str:
    """Normalize to posix relative path; reject absolute / escape attempts."""
    raw = path.strip().replace("\\", "/")
    if not raw:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_MEMORY_INVALID_PATH",
                message="Target path must be non-empty",
            ),
            http_status=400,
        )
    if raw.startswith("/") or raw.startswith("~"):
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_MEMORY_INVALID_PATH",
                message="Absolute paths are not allowed",
                details={"path": path},
            ),
            http_status=400,
        )
    parts = PurePosixPath(raw).parts
    if ".." in parts:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_MEMORY_INVALID_PATH",
                message="Path traversal is not allowed",
                details={"path": path},
            ),
            http_status=400,
        )
    normalized = str(PurePosixPath(*parts)) if parts else ""
    if normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized


def is_denied_path(normalized: str) -> bool:
    return any(normalized == p.rstrip("/") or normalized.startswith(p) for p in DENY_PREFIXES)


def is_allowlisted_propose_path(normalized: str) -> bool:
    if is_denied_path(normalized):
        return False
    for pattern in PROPOSE_ALLOWLIST:
        if fnmatch.fnmatch(normalized, pattern) or normalized == pattern.rstrip("/*"):
            return True
        # Exact file patterns without glob
        if "**" not in pattern and normalized == pattern:
            return True
    return False


def is_rules_path(normalized: str) -> bool:
    return normalized == ".cursor/rules" or normalized.startswith(".cursor/rules/")


def assert_propose_allowed(target_relative_path: str) -> str:
    normalized = normalize_relative_path(target_relative_path)
    if not is_allowlisted_propose_path(normalized):
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_MEMORY_PATH_NOT_ALLOWLISTED",
                message="Target path is not on the documentation propose allowlist",
                details={"path": normalized},
            ),
            http_status=403,
        )
    return normalized


def assert_apply_gates(
    *,
    allow_doc_apply: bool,
    allow_rules_apply: bool,
    apply_rules: bool,
    confirm: bool,
    target_relative_path: str,
) -> str:
    if not allow_doc_apply:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_MEMORY_APPLY_DISABLED",
                message="Doc apply is disabled; set EIC_ALLOW_DOC_APPLY=true to enable",
            ),
            http_status=403,
        )
    if confirm is not True:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_MEMORY_APPLY_DISABLED",
                message="Apply requires confirm=true",
            ),
            http_status=400,
        )
    normalized = assert_propose_allowed(target_relative_path)
    if is_rules_path(normalized):
        if not (allow_rules_apply and apply_rules):
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MEMORY_RULES_APPLY_DISABLED",
                    message=(
                        "Applying under .cursor/rules requires "
                        "EIC_ALLOW_RULES_APPLY=true and apply_rules=true"
                    ),
                    details={"path": normalized},
                ),
                http_status=403,
            )
    return normalized
