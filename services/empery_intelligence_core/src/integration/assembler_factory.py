"""Build AssemblerPort from EIC_ASSEMBLER_TRANSPORT (local|grpc).

Production default is grpc (fail toward Mechanics sidecar). Set
``EIC_ASSEMBLER_TRANSPORT=local`` only for unit/lab in-process Mechanics.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from typing import Any

from core.integration.assembler_port import AssemblerPort
from services.empery_intelligence_core.src.integration.grpc_assembler_adapter import (
    GrpcAssemblerAdapter,
)
from services.empery_intelligence_core.src.integration.local_assembler_adapter import (
    LocalAssemblerAdapter,
)

ProgressCallback = Callable[[dict[str, Any]], None]


def build_assembler_port(
    *,
    logger: logging.Logger | None = None,
    on_progress: ProgressCallback | None = None,
) -> AssemblerPort:
    """Default transport=grpc. Opt into local via EIC_ASSEMBLER_TRANSPORT=local."""
    transport = os.environ.get("EIC_ASSEMBLER_TRANSPORT", "grpc").strip().lower()
    if transport in {"local", "inprocess", "in-process"}:
        return LocalAssemblerAdapter()
    if transport not in {"grpc", "remote", ""}:
        transport = "grpc"
    target = os.environ.get(
        "EIC_ASSEMBLER_GRPC_TARGET", "127.0.0.1:50051"
    ).strip()
    if not target:
        raise RuntimeError(
            "EIC_ASSEMBLER_GRPC_TARGET unset — cannot build grpc AssemblerPort"
        )
    timeout_s = float(
        os.environ.get("EIC_ASSEMBLER_GRPC_TIMEOUT_S", "300") or "300"
    )
    if logger is not None:
        logger.info(
            "assembler transport=grpc target=%s",
            target,
        )
    return GrpcAssemblerAdapter(
        target,
        timeout_s=timeout_s,
        logger=logger,
        on_progress=on_progress,
    )