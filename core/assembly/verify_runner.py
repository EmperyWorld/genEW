"""Shared Assembly Auditor — Gate T/C/S runner (Phase 4)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from core.assembly.gates import (
    apply_authoritative_assembly_gates,
    verify_assembly_gate_c_full,
    verify_assembly_gate_s,
    verify_assembly_gate_t,
)


def run_assembly_gates(
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
    """Run selected assembly gates; return structured report for ports/gRPC."""
    gates: list[dict[str, Any]] = []
    violations: list[dict[str, Any]] = []

    t_status: str | None = None
    c_status: str | None = None
    s_status: str | None = None
    s_payload: dict[str, Any] | None = None

    if gate_t:
        t_status, t_detail = verify_assembly_gate_t(workspace, service_name)
        gates.append(
            {
                "gate": "T",
                "status": t_status,
                "detail": t_detail,
                "violations": _violations_from_detail("T", t_status, t_detail),
            }
        )
        violations.extend(gates[-1]["violations"])

    if gate_c:
        c_status, c_detail = verify_assembly_gate_c_full(
            workspace,
            service_name,
            designs_root=designs_root,
            eic_root=eic_root,
        )
        gates.append(
            {
                "gate": "C",
                "status": c_status,
                "detail": c_detail,
                "violations": _violations_from_detail("C", c_status, c_detail),
            }
        )
        violations.extend(gates[-1]["violations"])

    if gate_s:
        s_status, s_detail, s_payload = verify_assembly_gate_s(
            intent=intent,
            workspace=workspace,
            service_name=service_name,
            designs_root=designs_root,
            eic_root=eic_root,
            judge_raw=judge_raw,
        )
        gates.append(
            {
                "gate": "S",
                "status": s_status,
                "detail": s_detail,
                "violations": _violations_from_detail("S", s_status, s_detail),
                "payload": s_payload,
            }
        )
        violations.extend(gates[-1]["violations"])

    auth = apply_authoritative_assembly_gates(
        "UNKNOWN",
        gate_t=t_status,
        gate_c=c_status,
        gate_s=s_status,
    )
    return {
        "service_name": service_name,
        "status": auth,
        "gate_t": t_status,
        "gate_c": c_status,
        "gate_s": s_status,
        "gates": gates,
        "violations": violations,
        "gate_s_payload": s_payload,
        "details": {
            g["gate"]: g.get("detail") for g in gates
        },
    }


def _violations_from_detail(
    gate: str, status: str, detail: str
) -> list[dict[str, Any]]:
    if status != "FAILED":
        return []
    code = {
        "T": "EIC_ASSEMBLY_FREEZE_DRIFT",
        "C": "EIC_ASSEMBLY_CONTRACT_FAILED",
        "S": "EIC_ASSEMBLY_SEMANTIC_FAILED",
    }.get(gate, "EIC_ASSEMBLY_GATE_FAILED")
    return [
        {
            "code": code,
            "gate": gate,
            "severity": "CRITICAL" if gate in {"T", "C"} else "ERROR",
            "message": detail,
        }
    ]


def report_to_json(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2, ensure_ascii=False)
