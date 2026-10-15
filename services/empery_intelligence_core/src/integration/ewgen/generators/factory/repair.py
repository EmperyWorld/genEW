"""
Repair prompt construction for factory self-healing retries.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, List

if TYPE_CHECKING:
    from .spec import ComponentSpec
    from .verification import VerificationReport


REPAIR_DIRECTIVE = (
    "The previous attempt failed with the following error. "
    "Please fix the code and try again."
)


def format_verification_errors(report: "VerificationReport") -> str:
    """Summarize failed verification checks for generator feedback."""
    from .verification import VerificationCheckStatus  # noqa: PLC0415

    lines: List[str] = []
    for check in report.checks:
        if check.status in {
            VerificationCheckStatus.FAILED,
            VerificationCheckStatus.TIMEOUT,
        }:
            lines.append(f"[{check.name}] {check.message}")
            detail = (check.stderr or check.stdout or "").strip()
            if detail:
                lines.append(detail)
    if not lines:
        return report.summary
    return "\n".join(lines)


def build_repair_prompt(spec: "ComponentSpec", report: "VerificationReport") -> str:
    """
    Build contextual feedback injected into the next generation attempt.
    """
    error_block = format_verification_errors(report)
    module_type = spec.module_type.value if spec.module_type else "unspecified"
    parts = [
        f"Original intent: {spec.intent}",
        f"Module type: {module_type}",
        "",
        REPAIR_DIRECTIVE,
        "",
        error_block,
    ]
    return "\n".join(parts).strip()
