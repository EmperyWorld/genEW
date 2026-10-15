"""In-process AssemblerPort — Phase 2 local transport."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from core.assembly.assembler import invoke_assembler_cli, run_assembler_v1
from core.integration.assembly_contracts import AssemblyManifest, BlueprintContract


class LocalAssemblerAdapter:
    """Calls shared ``core.assembly.assembler`` in the same process."""

    def __init__(self) -> None:
        self.last_progress: list[dict[str, Any]] = []

    def assemble_v1(
        self,
        workspace: Path,
        *,
        blueprint: BlueprintContract | dict[str, Any],
        manifest: AssemblyManifest | dict[str, Any],
        manifest_path: Path,
        run_tsc: bool = True,
        logger: logging.Logger | None = None,
    ) -> dict[str, Any]:
        self.last_progress = [
            {
                "step": "ASSEMBLY_STEP_VALIDATE",
                "fraction": 0.1,
                "message": "local validate",
                "transport": "local",
            },
            {
                "step": "ASSEMBLY_STEP_STAMP",
                "fraction": 0.4,
                "message": "local stamp+inject+freeze",
                "transport": "local",
            },
        ]
        result = run_assembler_v1(
            workspace,
            blueprint=blueprint,
            manifest=manifest,
            manifest_path=manifest_path,
            logger=logger,
            run_tsc=run_tsc,
        )
        self.last_progress.append(
            {
                "step": "ASSEMBLY_STEP_DONE",
                "fraction": 1.0,
                "message": "local assemble done",
                "transport": "local",
                "widget_count": result.get("widget_count"),
            }
        )
        result = {**result, "transport": "local", "progress": list(self.last_progress)}
        return result

    def transform_atom(
        self,
        *,
        manifest_path: Path,
        target_path: Path,
        out_path: Path | None = None,
        logger: logging.Logger | None = None,
    ) -> dict[str, Any]:
        return invoke_assembler_cli(
            manifest_path=manifest_path,
            target_path=target_path,
            out_path=out_path,
            logger=logger,
        )

    def extract_adapt(
        self,
        workspace: Path,
        *,
        source_glob: str,
        dest: str,
        transforms: list[str] | None = None,
        service_name: str | None = None,
        mode: str | None = None,
        logger: logging.Logger | None = None,
    ) -> dict[str, Any]:
        from core.assembly.extract_adapt import extract_adapt

        result = extract_adapt(
            workspace=workspace,
            source_glob=source_glob,
            dest=dest,
            transforms=list(transforms or []),
            service_name=service_name,
            mode=mode,
        )
        return {
            "ok": result.ok,
            "error": result.error,
            "written": list(result.written),
            "skipped": list(result.skipped),
            "mode": result.mode,
            "transport": "local",
        }
