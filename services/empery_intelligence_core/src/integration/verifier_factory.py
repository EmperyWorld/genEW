"""Build VerifierPort from EIC_VERIFIER_TRANSPORT (local|grpc).

Production default is grpc (follows EIC_ASSEMBLER_TRANSPORT when verifier
env unset). Opt into local via EIC_VERIFIER_TRANSPORT=local or
EIC_ASSEMBLER_TRANSPORT=local. VerifyService is co-hosted on empery_assembler.
"""

from __future__ import annotations

import logging
import os

from core.integration.verifier_port import VerifierPort
from services.empery_intelligence_core.src.integration.grpc_verifier_adapter import (
    GrpcVerifierAdapter,
)
from services.empery_intelligence_core.src.integration.local_verifier_adapter import (
    LocalVerifierAdapter,
)


def build_verifier_port(
    *,
    logger: logging.Logger | None = None,
) -> VerifierPort:
    """Default transport=grpc (follows EIC_ASSEMBLER_TRANSPORT when unset)."""
    transport = os.environ.get("EIC_VERIFIER_TRANSPORT", "").strip().lower()
    if not transport:
        transport = os.environ.get("EIC_ASSEMBLER_TRANSPORT", "grpc").strip().lower()
    if transport in {"local", "inprocess", "in-process"}:
        return LocalVerifierAdapter()
    if transport not in {"grpc", "remote", ""}:
        transport = "grpc"
    target = os.environ.get("EIC_VERIFIER_GRPC_TARGET", "").strip()
    if not target:
        target = os.environ.get(
            "EIC_ASSEMBLER_GRPC_TARGET", "127.0.0.1:50051"
        ).strip()
    if not target:
        raise RuntimeError(
            "EIC_VERIFIER_GRPC_TARGET / EIC_ASSEMBLER_GRPC_TARGET unset — "
            "cannot build grpc VerifierPort"
        )
    timeout_s = float(
        os.environ.get(
            "EIC_VERIFIER_GRPC_TIMEOUT_S",
            os.environ.get("EIC_ASSEMBLER_GRPC_TIMEOUT_S", "120"),
        )
        or "120"
    )
    if logger is not None:
        logger.info("verifier transport=grpc target=%s", target)
    return GrpcVerifierAdapter(target, timeout_s=timeout_s, logger=logger)