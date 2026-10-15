"""AssemblerPort — Brain talks to Mechanics via this contract.

Local adapter calls ``core.assembly.assembler`` in-process.
gRPC adapter calls ``empery_assembler`` AssembleService / TransformAtom / ExtractAdapt.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from core.integration.assembly_contracts import AssemblyManifest, BlueprintContract


@runtime_checkable
class AssemblerPort(Protocol):
    """Mechanics surface for config-driven assembly.

    Local adapter: in-process ``core.assembly``.
    gRPC adapter: ``AssembleService`` / ``TransformAtom`` / ``ExtractAdapt``.
    """

    def assemble_v1(
        self,
        workspace: Path,
        *,
        blueprint: BlueprintContract | dict[str, Any],
        manifest: AssemblyManifest | dict[str, Any],
        manifest_path: Path,
        run_tsc: bool = True,
        logger: Any | None = None,
    ) -> dict[str, Any]:
        """Stamp + AST inject + freeze (+ optional tsc)."""

    def transform_atom(
        self,
        *,
        manifest_path: Path,
        target_path: Path,
        out_path: Path | None = None,
        logger: Any | None = None,
    ) -> dict[str, Any]:
        """Single-file Manifest inject via Node assemble.mjs."""

    def extract_adapt(
        self,
        workspace: Path,
        *,
        source_glob: str,
        dest: str,
        transforms: list[str] | None = None,
        service_name: str | None = None,
        mode: str | None = None,
        logger: Any | None = None,
    ) -> dict[str, Any]:
        """EliteEW / reference corpus extract (Mechanics EXTRACT step)."""
