"""
Fortune Seaker Security Pipeline
License detection, secret scanning, and supply-chain checks
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from .supply_chain import analyze_supply_chain


# PEM header alone in a quoted denylist string is a common false positive
# (e.g. blocked_markers = ["-----begin private key-----"]). Require a
# newline after the header so only multi-line key material blocks prepare.
BLOCKING_SECRET_PATTERNS: List[Tuple[str, bool]] = [
    (r"AKIA[0-9A-Z]{16}", False),
    (r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s*\r?\n", False),
]

REVIEW_SECRET_PATTERNS: List[Tuple[str, bool]] = [
    (r"api[_-]?key\s*[:=]\s*['\"]([^'\"]+)['\"]", True),
    (r"password\s*[:=]\s*['\"]([^'\"]+)['\"]", True),
    (r"secret[_-]?key\s*[:=]\s*['\"]([^'\"]+)['\"]", True),
    (r"token\s*[:=]\s*['\"]([^'\"]{12,})['\"]", True),
]

TOOLING_PATH_MARKERS = (
    "/scripts/",
    "/script/",
    "/tools/",
    "/tooling/",
    "/build-scripts/",
)

TOOLING_FILE_MARKERS = (
    "vite.config",
    "webpack.config",
    "rollup.config",
    "esbuild.config",
    "generate-meta",
    "postinstall",
    "prebuild",
    "preinstall",
)

TEST_PATH_MARKERS = (
    "/__tests__/",
    "/__test__/",
    "/tests/",
    "/test/",
    "/e2e/",
    "/fixtures/",
    "/testdata/",
    "/test-utils/",
    "/testing/",
)

BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
LINE_COMMENT_RE = re.compile(r"//.*?$", re.MULTILINE)

BLOCKING_DANGEROUS_PATTERNS = [
    r"\beval\s*\(",
    r"child_process",
    r"(?<!\.)exec\s*\(",
    r"\bspawn\s*\(",
    r"__import__\s*\(",
]

WARNING_DANGEROUS_PATTERNS = [
    r"\bnew\s+Function\s*\(",
]

PLACEHOLDER_SECRET_MARKERS = (
    "your_",
    "your-",
    "placeholder",
    "changeme",
    "change_me",
    "example",
    "sample",
    "dummy",
    "fake",
    "todo",
    "insert",
    "enter_",
    "replace",
    "xxx",
    "test_key",
    "api_key_here",
    "access_key_here",
    "not_set",
    "undefined",
    "unsplash",
    "pexels",
    "pixabay",
    "demo",
    "stock",
    "local",
    "default",
    "none",
    "password",
    "passwd",
    "secret",
    "masked",
)

MASKED_SECRET_RE = re.compile(r"^[*•xX._-]+$")

SPDX_LICENSE_RE = re.compile(
    r"SPDX-License-Identifier:\s*([A-Za-z0-9\-.+]+)",
    re.IGNORECASE,
)

ENV_VAR_LINE_RE = re.compile(
    r"process\.env|import\.meta\.env|getenv|os\.environ",
    re.IGNORECASE,
)

ALLOWED_LICENSES = {
    "MIT",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "ISC",
    "Unlicense",
    "CC0-1.0",
}

BLOCKED_LICENSES = {
    "GPL-2.0",
    "GPL-3.0",
    "AGPL-3.0",
    "LGPL-2.1",
    "LGPL-3.0",
}


def _is_placeholder_secret_value(value: str) -> bool:
    normalized = value.strip()
    if not normalized or len(normalized) < 8:
        return True

    lower = normalized.lower()
    if any(marker in lower for marker in PLACEHOLDER_SECRET_MARKERS):
        return True

    if MASKED_SECRET_RE.fullmatch(normalized):
        return True

    if re.fullmatch(r"[A-Z][A-Z0-9_]*", normalized) and "_" in normalized:
        return True

    return False


def _line_uses_env_var(content: str, match_start: int) -> bool:
    line_start = content.rfind("\n", 0, match_start) + 1
    line_end = content.find("\n", match_start)
    if line_end == -1:
        line_end = len(content)
    line = content[line_start:line_end]
    return ENV_VAR_LINE_RE.search(line) is not None


def _strip_comments_for_scan(content: str) -> str:
    without_block = BLOCK_COMMENT_RE.sub("", content)
    return LINE_COMMENT_RE.sub("", without_block)


def _is_tooling_path(path: str) -> bool:
    normalized = path.replace("\\", "/").lower()
    if any(marker in normalized for marker in TOOLING_PATH_MARKERS):
        return True
    basename = normalized.rsplit("/", 1)[-1]
    if any(marker in basename for marker in TOOLING_FILE_MARKERS):
        return True
    return basename.endswith((".config.js", ".config.ts", ".config.mjs", ".config.cjs"))


def _is_test_path(path: str) -> bool:
    """Unit/e2e tests often mock exec, tokens, and child_process — not production risk."""
    normalized = path.replace("\\", "/").lower()
    if any(marker in normalized for marker in TEST_PATH_MARKERS):
        return True
    basename = normalized.rsplit("/", 1)[-1]
    if basename.startswith("test_") or basename.startswith("test."):
        return True
    return basename.endswith((
        ".test.ts",
        ".test.tsx",
        ".test.js",
        ".test.jsx",
        ".spec.ts",
        ".spec.tsx",
        ".spec.js",
        ".spec.jsx",
    ))


def _scan_secret_patterns(
    content: str,
    patterns: List[Tuple[str, bool]],
    label: str,
) -> List[str]:
    findings: List[str] = []
    scan_content = _strip_comments_for_scan(content)
    for pattern, has_value_group in patterns:
        for match in re.finditer(pattern, scan_content, re.IGNORECASE):
            if has_value_group:
                value = match.group(1)
                if _is_placeholder_secret_value(value):
                    continue
                if _line_uses_env_var(scan_content, match.start()):
                    continue
            findings.append(f"{label}: {pattern}")
    return findings


def scan_secrets(content: str) -> List[str]:
    return _scan_secret_patterns(content, BLOCKING_SECRET_PATTERNS, "Potential secret matched")


def scan_secret_warnings(content: str) -> List[str]:
    return _scan_secret_patterns(content, REVIEW_SECRET_PATTERNS, "Review secret-like value")


def scan_dangerous_patterns(
    content: str,
    *,
    tooling: bool = False,
    test_file: bool = False,
) -> List[str]:
    if tooling or test_file:
        return []
    findings: List[str] = []
    for pattern in BLOCKING_DANGEROUS_PATTERNS:
        if re.search(pattern, content, re.IGNORECASE):
            findings.append(f"Dangerous pattern matched: {pattern}")
    return findings


def scan_relaxed_context_warnings(content: str, *, label: str) -> List[str]:
    """Record patterns in tooling/tests for manual review without blocking prepare."""
    findings: List[str] = []
    for pattern in BLOCKING_DANGEROUS_PATTERNS:
        if re.search(pattern, content, re.IGNORECASE):
            findings.append(f"{label} pattern (review): {pattern}")
    return findings


def scan_tooling_warnings(content: str) -> List[str]:
    findings: List[str] = []
    for pattern in BLOCKING_DANGEROUS_PATTERNS:
        if re.search(pattern, content, re.IGNORECASE):
            findings.append(f"Tooling script pattern: {pattern}")
    return findings


def scan_code_warnings(content: str) -> List[str]:
    findings: List[str] = []
    for pattern in WARNING_DANGEROUS_PATTERNS:
        if re.search(pattern, content, re.IGNORECASE):
            findings.append(f"Review recommended: {pattern}")
    return findings


def parse_license_text(license_text: str) -> Dict[str, Any]:
    """
    Parse SPDX license identifier from LICENSE file content.
    """
    match = SPDX_LICENSE_RE.search(license_text)
    if match:
        license_name = match.group(1).strip()
        return _evaluate_license_name(license_name, source="LICENSE")

    upper = license_text.upper()
    for allowed in ALLOWED_LICENSES:
        if allowed.upper() in upper:
            return _evaluate_license_name(allowed, source="LICENSE")

    return {
        "license": "UNKNOWN",
        "allowed": False,
        "reason": "Could not detect SPDX license in LICENSE file",
        "source": "LICENSE",
    }


def _evaluate_license_name(
    license_name: str,
    source: str = "package.json",
) -> Dict[str, Any]:
    if license_name in BLOCKED_LICENSES:
        return {
            "license": license_name,
            "allowed": False,
            "reason": "Copyleft license requires manual review",
            "source": source,
        }

    if license_name not in ALLOWED_LICENSES:
        return {
            "license": license_name,
            "allowed": False,
            "reason": "License not in allowlist",
            "source": source,
        }

    return {
        "license": license_name,
        "allowed": True,
        "source": source,
    }


def _missing_license_result(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Monorepo packages often omit license — allow prepare with manual review flag.
    """
    is_private = data.get("private") is True
    return {
        "license": "UNSPECIFIED",
        "allowed": True,
        "requiresReview": True,
        "reason": (
            "Private package without license field"
            if is_private
            else "License not declared in package.json — manual review required"
        ),
        "source": "package.json",
    }


def parse_license(package_json: str) -> Dict[str, Any]:
    try:
        data = json.loads(package_json)
    except json.JSONDecodeError:
        return {"license": "UNKNOWN", "allowed": False, "reason": "Invalid package.json"}

    license_field = data.get("license")
    if license_field is None or license_field == "":
        return _missing_license_result(data)

    if isinstance(license_field, dict):
        license_name = license_field.get("type", "UNKNOWN")
    else:
        license_name = str(license_field)

    if license_name in ("UNKNOWN", "UNLICENSED"):
        return _missing_license_result(data)

    return _evaluate_license_name(license_name, source="package.json")


def security_gate(
    files: List[Dict[str, str]],
    package_json: Optional[str] = None,
    license_text: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run security checks on prepared import bundle.
    """
    secret_findings: List[str] = []
    secret_warnings: List[str] = []
    dangerous_findings: List[str] = []
    code_warnings: List[str] = []

    for file in files:
        content = file.get("content", "")
        path = file.get("path", "")
        tooling = _is_tooling_path(path)
        test_file = _is_test_path(path)
        skip_blocking_scans = tooling or test_file

        for finding in scan_secrets(content):
            # Fixtures often embed sample PEM/AWS material — review, do not block.
            if skip_blocking_scans:
                secret_warnings.append(f"{path}: {finding}")
            else:
                secret_findings.append(f"{path}: {finding}")
        if not skip_blocking_scans:
            for finding in scan_secret_warnings(content):
                secret_warnings.append(f"{path}: {finding}")
        for finding in scan_dangerous_patterns(
            content,
            tooling=tooling,
            test_file=test_file,
        ):
            dangerous_findings.append(f"{path}: {finding}")
        if tooling:
            for finding in scan_tooling_warnings(content):
                code_warnings.append(f"{path}: {finding}")
        elif test_file:
            for finding in scan_relaxed_context_warnings(content, label="Test file"):
                code_warnings.append(f"{path}: {finding}")
        for finding in scan_code_warnings(content):
            code_warnings.append(f"{path}: {finding}")

    license_result: Dict[str, Any]
    if license_text:
        license_result = parse_license_text(license_text)
    elif package_json:
        license_result = parse_license(package_json)
    else:
        license_result = {
            "license": "UNKNOWN",
            "allowed": True,
            "reason": "No package.json or LICENSE provided",
            "source": "none",
        }

    supply_chain = analyze_supply_chain(package_json)

    blocked = (
        bool(secret_findings)
        or bool(dangerous_findings)
        or not license_result.get("allowed", False)
        or not supply_chain.get("passed", True)
    )

    requires_review = bool(
        secret_warnings
        or code_warnings
        or license_result.get("requiresReview")
        or supply_chain.get("warnings")
    )

    return {
        "passed": not blocked,
        "secrets": secret_findings,
        "secretWarnings": secret_warnings,
        "dangerousPatterns": dangerous_findings,
        "codeWarnings": code_warnings,
        "requiresReview": requires_review,
        "license": license_result,
        "supplyChain": supply_chain,
        "blocked": blocked,
    }
