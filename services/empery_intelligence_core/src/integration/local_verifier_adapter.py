"""In-process VerifierPort — Phase 4 local transport."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from core.assembly.verify_runner import run_assembly_gates


class LocalVerifierAdapter:
    """Runs Gate T/C/S in-process via ``core.assembly.verify_runner``."""

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
        report = run_assembly_gates(
            workspace,
            service_name,
            gate_t=gate_t,
            gate_c=gate_c,
            gate_s=gate_s,
            intent=intent,
            judge_raw=judge_raw,
            designs_root=designs_root,
            eic_root=eic_root,
        )
        report["transport"] = "local"
        return report
