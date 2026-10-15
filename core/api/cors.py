"""Lab CORS helpers — allow LAN host origins on any port."""

from __future__ import annotations

from typing import Iterable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# localhost / lab LAN — any port (Vite often jumps 5174↔5175).
LAB_ORIGIN_REGEX = (
    r"https?://("
    r"localhost|127\.0\.0\.1|"
    r"192\.168\.1\.136|192\.168\.8\.10"
    r")(:\d+)?"
)


def apply_lab_cors(
    app: FastAPI,
    origins: Iterable[str] | None = None,
    *,
    allow_credentials: bool = True,
) -> None:
    """Attach CORS so explicit origins and lab LAN regex both match."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(origins or []),
        allow_origin_regex=LAB_ORIGIN_REGEX,
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )
