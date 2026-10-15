"""VerifierPort — Brain talks to Assembly Auditor via this contract."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class VerifierPort(Protocol):
    """Assembly gates T/C/S (product UI/live gates stay in EIC)."""

    def verify_assembly(
        self,
        workspace: Path,
        service_name: str,
        *,
        gate_t: bool = True,
        gate_c: bool = True,
        gate_s: bool = True,
        intent: str = "",
        judge_raw: str | None = None,
        designs_root: Path | None = None,
        eic_root: Path | None = None,
    ) -> dict[str, Any]:
        """Return structured report with authoritative status (PASSED ⇔ T∧C)."""
