#!/usr/bin/env python3
"""Live proof for Post-audit harden Waves 1–3 (fail hard if Mechanics down).

Proves:
  1. Factory default transport=grpc (env unset) → live assemble + Gate T∧C
  2. Mid-StreamAssembly eic.assembler.step on EventBus before assemble returns
  3. extract_adapt via GrpcAssemblerAdapter (no direct shim)
  4. deploy_agent /health workspace_ok (if :8010 up)

Usage:
  python3 scripts/assembly_harden_live_proof.py
  ASSEMBLER_GRPC_TARGET=127.0.0.1:50051 python3 scripts/assembly_harden_live_proof.py

Exit: 0 PASS, 1 FAIL, 2 unreachable.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
REPORT = (
    REPO / ".cursor" / "orchestration" / "reports" / "assembly_harden_live_proof.md"
)
SERVICE = "asm_harden_live"


def main() -> int:
    sys.path.insert(0, str(REPO))
    target = os.environ.get("ASSEMBLER_GRPC_TARGET", "127.0.0.1:50051").strip()
    # Wave 1: do NOT set EIC_ASSEMBLER_TRANSPORT — code default must be grpc.
    os.environ.pop("EIC_ASSEMBLER_TRANSPORT", None)
    os.environ.pop("EIC_VERIFIER_TRANSPORT", None)
    os.environ["EIC_ASSEMBLER_GRPC_TARGET"] = target
    os.environ["EIC_VERIFIER_GRPC_TARGET"] = target
    os.environ["EIC_ASSEMBLY_SKIP_TSC"] = "1"
    os.environ["EIC_ASSEMBLY_SKIP_ECC_RELOAD"] = "1"
    os.environ.setdefault("EIC_ASSEMBLER_WORKSPACE_MAP", f"{REPO}:/app")

    try:
        import grpc

        ch = grpc.insecure_channel(target)
        grpc.channel_ready_future(ch).result(timeout=5)
        ch.close()
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: assembler unreachable at {target}: {exc}", file=sys.stderr)
        return 2

    from core.event_bus import Event, EventBus
    from core.integration.assembly_contracts import (
        default_ops_dashboard_blueprint,
        manifest_from_blueprint,
    )
    from services.empery_intelligence_core.src.core.reflexes import events as ev
    from services.empery_intelligence_core.src.integration.assembler_factory import (
        build_assembler_port,
    )
    from services.empery_intelligence_core.src.integration.assembler_progress import (
        LiveAssemblerProgressPublisher,
        unpublished_assembler_steps,
    )
    from services.empery_intelligence_core.src.integration.grpc_assembler_adapter import (
        GrpcAssemblerAdapter,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        _ops_dashboard_mount_tsx,
    )
    from services.empery_intelligence_core.src.integration.verifier_factory import (
        build_verifier_port,
    )
    from services.empery_intelligence_core.src.integration.grpc_verifier_adapter import (
        GrpcVerifierAdapter,
    )

    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("harden.live")
    lines: list[str] = [
        "# Assembly Harden Live Proof",
        "",
        f"- **When:** {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
        f"- **Target:** `{target}`",
        f"- **Transport env:** unset (code default)",
        "",
    ]

    asm = build_assembler_port(logger=log)
    ver = build_verifier_port(logger=log)
    if not isinstance(asm, GrpcAssemblerAdapter):
        print(f"FAIL: factory default not grpc: {type(asm)}", file=sys.stderr)
        return 1
    if not isinstance(ver, GrpcVerifierAdapter):
        print(f"FAIL: verifier default not grpc: {type(ver)}", file=sys.stderr)
        return 1
    print(f"OK factory default grpc → {asm._target}")
    lines.append(f"- Factory default: **grpc** `{asm._target}`")

    parity = REPO / ".cursor" / "orchestration" / "eic" / "assembly_parity" / SERVICE
    if parity.exists():
        shutil.rmtree(parity)
    mounts = parity / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    (mounts / f"{SERVICE}.tsx").write_text(
        _ops_dashboard_mount_tsx(SERVICE, "HardenLive", "Harden Live", 8095),
        encoding="utf-8",
    )
    designs = parity / ".cursor" / "orchestration" / "designs"
    designs.mkdir(parents=True)
    eic = parity / ".cursor" / "orchestration" / "eic" / "assembly"
    eic.mkdir(parents=True)
    bp = default_ops_dashboard_blueprint(service_name=SERVICE)
    mf = manifest_from_blueprint(bp)
    (designs / f"{SERVICE}_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    mf_host = eic / f"{SERVICE}_manifest.json"
    mf_host.write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    grpc_ws = Path("/app/.cursor/orchestration/eic/assembly_parity") / SERVICE
    grpc_mf = (
        grpc_ws
        / ".cursor"
        / "orchestration"
        / "eic"
        / "assembly"
        / f"{SERVICE}_manifest.json"
    )

    async def _live_progress() -> tuple[int, list[str], bool]:
        bus = EventBus()
        seen: list[tuple[float, str]] = []

        async def _cap(event: Event) -> None:
            seen.append((time.monotonic(), str(event.payload.get("step") or "")))

        bus.subscribe(ev.ASSEMBLER_STEP, _cap)
        pub = LiveAssemblerProgressPublisher(bus, logger=log)
        pub.bind_loop(asyncio.get_running_loop())
        asm.set_progress_callback(pub)

        def _run() -> dict:
            return asm.assemble_v1(
                grpc_ws,
                blueprint=bp,
                manifest=mf,
                manifest_path=grpc_mf,
                run_tsc=False,
                logger=log,
            )

        done_at = {"t": 0.0}
        result = await asyncio.to_thread(_run)
        done_at["t"] = time.monotonic()
        if not result.get("ok", True):
            raise RuntimeError(f"assemble failed: {result}")
        mid = [s for t, s in seen if t < done_at["t"]]
        live = any(p.get("live_published") for p in asm.last_progress)
        unpublished = unpublished_assembler_steps(asm.last_progress)
        if unpublished:
            raise RuntimeError(f"expected all steps live_published, left={unpublished}")
        return len(seen), mid, live

    n, mid_steps, live_ok = asyncio.run(_live_progress())
    if n < 1 or not mid_steps:
        print(
            f"FAIL: live progress missing (bus={n} mid_before_return={mid_steps})",
            file=sys.stderr,
        )
        return 1
    if not live_ok:
        print("FAIL: last_progress missing live_published", file=sys.stderr)
        return 1
    print(f"OK live EventBus steps={n} mid_stream={mid_steps[:5]}...")
    lines.append(f"- Live `eic.assembler.step`: **{n}** events, mid-stream before return")

    freeze = parity / "services" / SERVICE / "assembly_freeze.json"
    if not freeze.is_file():
        print("FAIL: assembly_freeze.json missing", file=sys.stderr)
        return 1
    pre = ver.verify_assembly(
        grpc_ws, SERVICE, gate_t=True, gate_c=True, gate_s=False, intent="ops dashboard"
    )
    if pre.get("gate_t") != "PASSED" or pre.get("gate_c") != "PASSED":
        print(f"FAIL: Gate T∧C {pre}", file=sys.stderr)
        return 1
    print(f"OK Gate T∧C PASSED transport={pre.get('transport')}")
    lines.append(f"- Gate T∧C: **PASSED** (`{pre.get('transport')}`)")

    # ExtractAdapt via live port
    from services.empery_intelligence_core.config import ServiceConfig
    from services.empery_intelligence_core.src.integration.orchestration_paths import (
        EicOrchestrationPaths,
    )
    from services.empery_intelligence_core.src.integration.workspace_tools import (
        WorkspaceToolAdapter,
    )

    pack = (
        REPO
        / ".cursor"
        / "orchestration"
        / "eic"
        / "assembly_parity"
        / "asm_harden_extract"
    )
    if pack.exists():
        shutil.rmtree(pack)
    src = pack / "reference" / "eliteew" / "packs" / "harden_pack"
    src.mkdir(parents=True)
    (src / "w.tsx").write_text("export const H = 1;\n", encoding="utf-8")
    cfg = ServiceConfig(
        workspace_root=str(pack),
        orchestration_root=str(pack / ".cursor" / "orchestration"),
        deploy_agent_url="",
        auto_deploy_on_implement=False,
        engine_allow_service_writes=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=pack)
    paths.designs_root.mkdir(parents=True, exist_ok=True)
    paths.eic_root.mkdir(parents=True, exist_ok=True)
    tools = WorkspaceToolAdapter(paths, cfg, log, assembler=asm)
    ex = tools.extract_adapt_action(
        {
            "source_glob": "reference/eliteew/packs/harden_pack/*.tsx",
            "dest": "services/harden_svc/src/integration/atoms/",
            "mode": "genesis",
        },
        service_name="harden_svc",
    )
    if not ex.get("ok") or ex.get("transport") != "grpc":
        print(f"FAIL: extract_adapt {ex}", file=sys.stderr)
        return 1
    atoms = pack / "services" / "harden_svc" / "src" / "integration" / "atoms"
    if not any(atoms.rglob("*.tsx")):
        print(f"FAIL: no atom files under {atoms}", file=sys.stderr)
        return 1
    print(f"OK ExtractAdapt transport=grpc written={ex.get('written')}")
    lines.append(f"- ExtractAdapt gRPC: **ok** written={ex.get('written')}")

    # Deploy agent health (optional)
    deploy_line = "- Deploy agent health: skipped (not on :8010)"
    try:
        import urllib.request

        with urllib.request.urlopen(
            "http://127.0.0.1:8010/api/v1/health", timeout=2
        ) as resp:
            raw = json.loads(resp.read().decode())
        deploy_line = (
            f"- Deploy agent health: **{raw.get('status')}** "
            f"workspace=`{raw.get('workspace')}` "
            f"details={raw.get('details')}"
        )
        print(f"OK deploy_agent {raw.get('status')} workspace={raw.get('workspace')}")
    except Exception as exc:  # noqa: BLE001
        print(f"NOTE deploy_agent: {exc}")
    lines.append(deploy_line)
    lines.extend(["", "**Verdict:** PASS", ""])
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"PASS harden live proof\nreport={REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
