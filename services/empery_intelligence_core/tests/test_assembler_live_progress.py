"""LIVE: StreamAssembly mid-stream → EventBus (requires empery_assembler :50051)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path

import grpc
import pytest

from core.event_bus import Event, EventBus
from core.integration.assembly_contracts import (
    AssemblyManifest,
    CompositionItem,
    PropMapping,
    TargetModule,
    WidgetType,
    default_ops_dashboard_blueprint,
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

REPO = Path(__file__).resolve().parents[3]
SERVICE = "asm_live_progress"
TARGET = os.environ.get("ASSEMBLER_GRPC_TARGET", "127.0.0.1:50051").strip()


def _assembler_ready(target: str = TARGET, timeout_s: float = 3.0) -> bool:
    try:
        ch = grpc.insecure_channel(target)
        grpc.channel_ready_future(ch).result(timeout=timeout_s)
        ch.close()
        return True
    except Exception:  # noqa: BLE001
        return False


requires_live_assembler = pytest.mark.skipif(
    not _assembler_ready(),
    reason=f"empery_assembler not reachable at {TARGET}",
)


def _fixture(root: Path) -> tuple[Path, object, object]:
    mounts = root / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    (mounts / f"{SERVICE}.tsx").write_text(
        _ops_dashboard_mount_tsx(SERVICE, "LiveProg", "Live Progress", 8097),
        encoding="utf-8",
    )
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
                        value="Live",
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


@requires_live_assembler
@pytest.mark.asyncio
async def test_live_stream_assembly_publishes_steps_before_return(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Real gRPC StreamAssembly: EventBus gets steps while assemble still running."""
    monkeypatch.setenv("EIC_ASSEMBLER_TRANSPORT", "grpc")
    monkeypatch.setenv("EIC_ASSEMBLER_GRPC_TARGET", TARGET)
    monkeypatch.setenv("EIC_ASSEMBLY_SKIP_TSC", "1")
    # Host Brain → container Mechanics (compose shared bind).
    monkeypatch.setenv("EIC_ASSEMBLER_WORKSPACE_MAP", f"{REPO}:/app")

    parity = (
        REPO
        / ".cursor"
        / "orchestration"
        / "eic"
        / "assembly_parity"
        / SERVICE
    )
    if parity.exists():
        import shutil

        shutil.rmtree(parity)
    mf_path, bp, mf = _fixture(parity)

    # Workspace path as Mechanics sees it (container /app).
    grpc_ws = Path("/app/.cursor/orchestration/eic/assembly_parity") / SERVICE
    grpc_mf = (
        grpc_ws
        / ".cursor"
        / "orchestration"
        / "eic"
        / "assembly"
        / f"{SERVICE}_manifest.json"
    )

    bus = EventBus()
    mid_stream: list[tuple[float, Event]] = []
    assemble_done_at: dict[str, float] = {}

    async def _capture(event: Event) -> None:
        mid_stream.append((time.monotonic(), event))

    bus.subscribe(ev.ASSEMBLER_STEP, _capture)
    publisher = LiveAssemblerProgressPublisher(
        bus, logger=logging.getLogger("live.progress")
    )
    publisher.bind_loop(asyncio.get_running_loop())

    # Factory default path (grpc) + live publisher — same as wire_reflexes.
    port = build_assembler_port(
        logger=logging.getLogger("live.progress"),
        on_progress=publisher,
    )
    assert isinstance(port, GrpcAssemblerAdapter)

    def _assemble() -> dict:
        return port.assemble_v1(
            grpc_ws,
            blueprint=bp,
            manifest=mf,
            manifest_path=grpc_mf,
            run_tsc=False,
            logger=logging.getLogger("live.progress"),
        )

    result = await asyncio.to_thread(_assemble)
    assemble_done_at["t"] = time.monotonic()

    assert result.get("ok", True), result
    assert mid_stream, "no eic.assembler.step on EventBus during StreamAssembly"
    # At least one bus event must have arrived before assemble returned.
    assert any(t < assemble_done_at["t"] for t, _ in mid_stream), (
        "progress only arrived after assemble finished — not live"
    )
    steps = [e.payload.get("step") for _, e in mid_stream]
    assert "ASSEMBLY_STEP_VALIDATE" in steps or "ASSEMBLY_STEP_STAMP" in steps, steps
    assert all(e.name == ev.ASSEMBLER_STEP for _, e in mid_stream)
    live_flags = [p.get("live_published") for p in port.last_progress]
    assert any(live_flags), port.last_progress
    # Post-hoc path must not re-burst live steps.
    assert unpublished_assembler_steps(port.last_progress) == []
    freeze = parity / "services" / SERVICE / "assembly_freeze.json"
    assert freeze.is_file(), "Mechanics did not write freeze on shared FS"


def test_unpublished_assembler_steps_dedupes_live_and_duplicates() -> None:
    steps = [
        {"step": "ASSEMBLY_STEP_VALIDATE", "live_published": True, "request_id": "r"},
        {"step": "ASSEMBLY_STEP_STAMP", "request_id": "r"},
        {"step": "ASSEMBLY_STEP_STAMP", "request_id": "r"},
        {"step": "ASSEMBLY_STEP_DONE", "request_id": "r"},
    ]
    out = unpublished_assembler_steps(steps)
    assert [s["step"] for s in out] == [
        "ASSEMBLY_STEP_STAMP",
        "ASSEMBLY_STEP_DONE",
    ]
