#!/usr/bin/env python3
"""Fail-closed Configuration-Driven Assembly smoke (filesystem + optional live).

Usage:
  # Mechanical proof (no live stack) — always exit 0/1:
  python3 scripts/assembly_ops_dashboard_smoke.py --mode unit

  # Live ECC Playwright (fail-closed; does NOT skip as green):
  ASSEMBLY_SMOKE_ROUTE=/ops/foo \\
  ASSEMBLY_SMOKE_TITLES='Total Revenue,Sales History' \\
  python3 scripts/assembly_ops_dashboard_smoke.py --mode live

Exit codes: 0 PASS, 1 FAIL, 2 misconfiguration.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def _unit_smoke() -> int:
    """Assemble Dashboard_Standard mount from Manifest; assert titles + metricField DI."""
    sys.path.insert(0, str(REPO))
    from core.assembly.assembler import (
        run_assembler_v1,
    )
    from core.integration.assembly_contracts import (
        AssemblyManifest,
        CompositionItem,
        PropMapping,
        TargetModule,
        WidgetType,
        default_ops_dashboard_blueprint,
    )
    from core.assembly.gates import (
        verify_assembly_gate_c_full,
        verify_assembly_gate_t,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        _ops_dashboard_mount_tsx,
    )

    service = "asm_smoke_dash"
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        mounts = root / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
        mounts.mkdir(parents=True)
        (mounts / f"{service}.tsx").write_text(
            _ops_dashboard_mount_tsx(service, "AsmSmokeDash", "Asm Smoke", 8099),
            encoding="utf-8",
        )
        designs = root / "orchestration" / "designs"
        designs.mkdir(parents=True)
        eic = root / "orchestration" / "eic" / "assembly"
        eic.mkdir(parents=True)
        bp = default_ops_dashboard_blueprint(service_name=service)
        mf = AssemblyManifest(
            blueprint_id=service,
            blueprint_version="1.0.0",
            target_module=TargetModule.DASHBOARD_STANDARD,
            composition=[
                CompositionItem(
                    component_id="metric_card",
                    component="Card",
                    widget_type=WidgetType.CARD,
                    data_source="/api/v1/metrics",
                    mapping=[
                        PropMapping(
                            prop_name="title",
                            source_type="static",
                            value="Total Revenue",
                        ),
                        PropMapping(
                            prop_name="value",
                            source_type="dynamic",
                            data_path="value",
                        ),
                    ],
                ),
                CompositionItem(
                    component_id="trend_chart",
                    component="Chart",
                    widget_type=WidgetType.CHART,
                    data_source="/api/v1/metrics",
                    mapping=[
                        PropMapping(
                            prop_name="title",
                            source_type="static",
                            value="Sales History",
                        ),
                        PropMapping(
                            prop_name="chart_type",
                            source_type="static",
                            value="area_line",
                        ),
                    ],
                ),
            ],
        )
        (designs / f"{service}_blueprint.json").write_text(
            json.dumps(bp.model_dump(mode="json")), encoding="utf-8"
        )
        mf_path = eic / f"{service}_manifest.json"
        mf_path.write_text(
            json.dumps(mf.model_dump(mode="json")), encoding="utf-8"
        )
        run_assembler_v1(
            root,
            blueprint=bp,
            manifest=mf,
            manifest_path=mf_path,
            run_tsc=False,
        )
        body = (mounts / f"{service}.tsx").read_text(encoding="utf-8")
        checks = [
            ("Total Revenue" in body, "missing title Total Revenue"),
            ("Sales History" in body, "missing title Sales History"),
            ("metricField(" in body, "missing metricField DI binding"),
            ("metricSeries(" in body, "missing metricSeries DI binding"),
            ('data-assembly-data-source="/api/v1/metrics"' in body
             or "data-assembly-data-source" in body, "missing data_source attr"),
        ]
        for ok, msg in checks:
            if not ok:
                print(f"FAIL unit: {msg}", file=sys.stderr)
                return 1
        t_status, t_detail = verify_assembly_gate_t(root, service)
        c_status, c_detail = verify_assembly_gate_c_full(
            root, service, designs_root=designs, eic_root=root / "orchestration" / "eic"
        )
        if t_status != "PASSED":
            print(f"FAIL Gate T: {t_detail}", file=sys.stderr)
            return 1
        if c_status != "PASSED":
            print(f"FAIL Gate C: {c_detail}", file=sys.stderr)
            return 1
        print("PASS unit: Assembler inject + Gate T∧C + metricField DI")
        return 0


def _live_smoke() -> int:
    route = (os.environ.get("ASSEMBLY_SMOKE_ROUTE") or "").strip()
    if not route:
        print(
            "FAIL live: ASSEMBLY_SMOKE_ROUTE unset "
            "(refuse skip-as-green; set route or use --mode unit)",
            file=sys.stderr,
        )
        return 2
    ecc = REPO / "apps" / "empery_control_center"
    cmd = [
        "npm",
        "run",
        "test:e2e",
        "--",
        "e2e/assembly-dashboard-smoke.spec.ts",
    ]
    env = os.environ.copy()
    env.setdefault("ECC_UI_BASE_URL", "http://127.0.0.1:5173")
    proc = subprocess.run(cmd, cwd=str(ecc), env=env, check=False)
    if proc.returncode != 0:
        print(f"FAIL live playwright exit={proc.returncode}", file=sys.stderr)
        return 1
    print("PASS live: Playwright assembly-dashboard-smoke")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        choices=("unit", "live"),
        default="unit",
        help="unit=filesystem Assembler proof; live=Playwright fail-closed",
    )
    args = parser.parse_args()
    if args.mode == "unit":
        return _unit_smoke()
    return _live_smoke()


if __name__ == "__main__":
    raise SystemExit(main())
