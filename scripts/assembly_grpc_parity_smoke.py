#!/usr/bin/env python3
"""Parity smoke: local AssemblerPort vs gRPC StreamAssembly freeze hashes.

Fixture lives under ``.cursor/orchestration/eic/assembly_parity/`` (compose-mounted).

Usage:
  python3 scripts/assembly_grpc_parity_smoke.py
  ASSEMBLER_GRPC_TARGET=127.0.0.1:50051 python3 scripts/assembly_grpc_parity_smoke.py
  ASSEMBLER_PARITY_HOST_MODE=1  # when assembler runs on host, not in container

Exit: 0 PASS, 1 FAIL, 2 unreachable.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SERVICE = "asm_grpc_parity"


def _build_fixture(root: Path) -> tuple[Path, object, object]:
    sys.path.insert(0, str(REPO))
    from core.integration.assembly_contracts import (
        AssemblyManifest,
        CompositionItem,
        PropMapping,
        TargetModule,
        WidgetType,
        default_ops_dashboard_blueprint,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        _ops_dashboard_mount_tsx,
    )

    mounts = root / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    (mounts / f"{SERVICE}.tsx").write_text(
        _ops_dashboard_mount_tsx(SERVICE, "ParitySmoke", "Parity Smoke", 8099),
        encoding="utf-8",
    )
    # Only desktop mount — ECC page without slot would fail AST inject.

    designs = root / ".cursor" / "orchestration" / "designs"
    designs.mkdir(parents=True)
    eic = root / ".cursor" / "orchestration" / "eic" / "assembly"
    eic.mkdir(parents=True)

    bp = default_ops_dashboard_blueprint(service_name=SERVICE)
    mf = AssemblyManifest(
        blueprint_id=SERVICE,
        blueprint_version=bp.version,
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
            )
        ],
    )
    (designs / f"{SERVICE}_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    mf_path = eic / f"{SERVICE}_manifest.json"
    mf_path.write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    return mf_path, bp, mf


def _freeze_basenames(workspace: Path) -> dict[str, str]:
    freeze = workspace / "services" / SERVICE / "assembly_freeze.json"
    if not freeze.is_file():
        return {}
    files = json.loads(freeze.read_text(encoding="utf-8")).get("files") or {}
    return {Path(k).name: v for k, v in files.items()}


def main() -> int:
    sys.path.insert(0, str(REPO))
    os.environ["EIC_ASSEMBLY_SKIP_TSC"] = "1"
    target = os.environ.get("ASSEMBLER_GRPC_TARGET", "127.0.0.1:50051").strip()

    try:
        import grpc

        ch = grpc.insecure_channel(target)
        grpc.channel_ready_future(ch).result(timeout=5)
        ch.close()
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: gRPC unreachable at {target}: {exc}", file=sys.stderr)
        return 2

    from services.empery_intelligence_core.src.integration.grpc_assembler_adapter import (
        GrpcAssemblerAdapter,
    )
    from services.empery_intelligence_core.src.integration.local_assembler_adapter import (
        LocalAssemblerAdapter,
    )

    parity = REPO / ".cursor" / "orchestration" / "eic" / "assembly_parity" / SERVICE
    if parity.exists():
        shutil.rmtree(parity)
    mf_path, bp, mf = _build_fixture(parity)

    local_result = LocalAssemblerAdapter().assemble_v1(
        parity,
        blueprint=bp,
        manifest=mf,
        manifest_path=mf_path,
        run_tsc=False,
    )
    if not local_result.get("ok", True):
        print("FAIL: local assemble", file=sys.stderr)
        return 1
    local_h = _freeze_basenames(parity)
    if not local_h:
        print("FAIL: local freeze missing", file=sys.stderr)
        return 1

    host_mode = os.environ.get("ASSEMBLER_PARITY_HOST_MODE", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    if host_mode:
        grpc_ws: Path = parity
        grpc_mf = mf_path
    else:
        grpc_ws = Path("/app/.cursor/orchestration/eic/assembly_parity") / SERVICE
        grpc_mf = (
            grpc_ws
            / ".cursor"
            / "orchestration"
            / "eic"
            / "assembly"
            / f"{SERVICE}_manifest.json"
        )

    remote = GrpcAssemblerAdapter(target, use_stream=True)
    try:
        grpc_result = remote.assemble_v1(
            grpc_ws,
            blueprint=bp,
            manifest=mf,
            manifest_path=grpc_mf,
            run_tsc=False,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: gRPC assemble: {exc}", file=sys.stderr)
        return 1

    if not grpc_result.get("ok", True):
        print("FAIL: gRPC assemble not ok", file=sys.stderr)
        return 1

    grpc_h = _freeze_basenames(parity)
    keys = sorted(
        k
        for k in (set(local_h) & set(grpc_h))
        if k.endswith((".tsx", ".json"))
    ) or sorted(set(local_h) & set(grpc_h))
    if not keys:
        print(
            f"FAIL: no overlapping freeze keys local={list(local_h)} grpc={list(grpc_h)}",
            file=sys.stderr,
        )
        return 1
    bad = [k for k in keys if local_h[k] != grpc_h[k]]
    if bad:
        print(f"FAIL: hash mismatch {bad}", file=sys.stderr)
        return 1

    print(
        "PASS local≡gRPC",
        f"keys={keys}",
        f"progress_local={len(local_result.get('progress') or [])}",
        f"progress_grpc={len(remote.last_progress)}",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
