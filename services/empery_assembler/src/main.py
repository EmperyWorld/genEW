"""empery_assembler process entry — gRPC Mechanics sidecar.

Phase 2: handlers call ``core.assembly.assembler`` (shared mechanics).
Optional HTTP ``/health`` for registry/ECC probes.
"""

from __future__ import annotations

import logging
import sys
import threading
from concurrent import futures

import grpc
import uvicorn

from core.logging import configure_logging, log_event
from core.protos.empery.assembly.v1 import assembly_pb2_grpc

from services.empery_assembler.config import get_config
from services.empery_assembler.src.api.main import create_app
from services.empery_assembler.src.integration.servicer import (
    AssemblerServicer,
    VerifierServicer,
)


def _serve_health(host: str, port: int, logger: logging.Logger) -> None:
    app = create_app()
    log_event(
        logger,
        event="empery_assembler.health_bind",
        message="Health HTTP binding",
        host=host,
        port=port,
    )
    uvicorn.run(app, host=host, port=port, log_level="warning")


def serve() -> None:
    config = get_config()
    logger = configure_logging(config.service_name)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)

    if config.enable_health_http:
        thread = threading.Thread(
            target=_serve_health,
            args=(config.health_host, config.health_port, logger),
            name="assembler-health",
            daemon=True,
        )
        thread.start()

    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=config.max_workers)
    )
    assembly_pb2_grpc.add_AssemblerServiceServicer_to_server(
        AssemblerServicer(config, logger),
        server,
    )
    assembly_pb2_grpc.add_VerifierServiceServicer_to_server(
        VerifierServicer(config, logger),
        server,
    )
    bind = f"{config.grpc_host}:{config.grpc_port}"
    bound = server.add_insecure_port(bind)
    if bound == 0:
        log_event(
            logger,
            event="empery_assembler.bind_failed",
            message=f"Failed to bind gRPC on {bind}",
            level=logging.ERROR,
        )
        sys.exit(1)

    server.start()
    log_event(
        logger,
        event="empery_assembler.grpc_started",
        message="Assembler gRPC sidecar listening",
        bind=bind,
        workspace=config.workspace_root,
        health_port=config.health_port if config.enable_health_http else None,
    )
    server.wait_for_termination()


def main() -> None:
    serve()


if __name__ == "__main__":
    main()
