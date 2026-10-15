"""
Scavenger - Python security gate
"""

import re
from typing import Any, Dict, List

from generators.importer.security import (
    _is_test_path,
    _is_tooling_path,
    parse_license_text,
    scan_code_warnings,
    scan_dangerous_patterns,
    scan_secret_warnings,
    scan_secrets,
)

PYTHON_BLOCKING_PATTERNS = [
    r"\beval\s*\(",
    r"\bexec\s*\(",
    r"__import__\s*\(",
    r"\bos\.system\s*\(",
    r"\bsubprocess\.",
    r"\bpickle\.loads\s*\(",
    r"\bmarshal\.loads\s*\(",
]

PYTHON_WARNING_PATTERNS = [
    r"\bshell\s*=\s*True",
    r"\byaml\.load\s*\([^)]*\)",
]


def _scan_python_patterns(
    content: str,
    path: str,
    patterns: List[str],
    label: str,
) -> List[str]:
    findings: List[str] = []
    for pattern in patterns:
        if re.search(pattern, content, re.IGNORECASE | re.MULTILINE):
            findings.append(f"{path}: {label}: {pattern}")
    return findings


def python_security_gate(
    files: List[Dict[str, str]],
    license_text: str | None = None,
    *,
    third_party_import: bool = True,
) -> Dict[str, Any]:
    """
    Security preview for Python scavenger imports.

    For third-party monorepo imports, only hard secrets block prepare;
    dangerous patterns require manual review but do not block.
    """
    secret_findings: List[str] = []
    secret_warnings: List[str] = []
    dangerous_findings: List[str] = []
    code_warnings: List[str] = []

    for file in files:
        content = str(file.get("content", ""))
        path = str(file.get("path", ""))
        tooling = _is_tooling_path(path)
        test_file = _is_test_path(path)
        skip_blocking_secrets = tooling or test_file

        for finding in scan_secrets(content):
            if skip_blocking_secrets:
                secret_warnings.append(f"{path}: {finding}")
            else:
                secret_findings.append(f"{path}: {finding}")
        for finding in scan_secret_warnings(content):
            secret_warnings.append(f"{path}: {finding}")

        if third_party_import:
            for finding in scan_dangerous_patterns(
                content,
                tooling=tooling,
                test_file=test_file,
            ):
                code_warnings.append(f"{path}: {finding}")
            if not skip_blocking_secrets:
                code_warnings.extend(
                    _scan_python_patterns(
                        content, path, PYTHON_BLOCKING_PATTERNS, "Python review"
                    )
                )
        else:
            for finding in scan_dangerous_patterns(
                content,
                tooling=tooling,
                test_file=test_file,
            ):
                dangerous_findings.append(f"{path}: {finding}")
            if not skip_blocking_secrets:
                dangerous_findings.extend(
                    _scan_python_patterns(
                        content, path, PYTHON_BLOCKING_PATTERNS, "Python blocking"
                    )
                )

        for finding in scan_code_warnings(content):
            code_warnings.append(f"{path}: {finding}")
        code_warnings.extend(
            _scan_python_patterns(content, path, PYTHON_WARNING_PATTERNS, "Python review")
        )

    if license_text:
        license_result = parse_license_text(license_text)
    else:
        license_result = {
            "license": "UNKNOWN",
            "allowed": True,
            "reason": "No LICENSE provided — manual review required",
            "source": "none",
            "requiresReview": True,
        }

    blocked = bool(secret_findings) or bool(dangerous_findings)
    if not license_result.get("allowed", False):
        blocked = True

    requires_review = bool(
        secret_warnings
        or code_warnings
        or license_result.get("requiresReview")
    )

    return {
        "passed": not blocked,
        "blocked": blocked,
        "secrets": secret_findings,
        "secretWarnings": secret_warnings,
        "dangerousPatterns": dangerous_findings,
        "codeWarnings": code_warnings,
        "requiresReview": requires_review,
        "license": license_result,
        "supplyChain": {
            "dependencyCount": 0,
            "blocked": [],
            "warnings": [],
            "passed": True,
        },
    }
