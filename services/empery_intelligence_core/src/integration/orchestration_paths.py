"""Resolve EIC + shared orchestration filesystem roots."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from services.empery_intelligence_core.config import ServiceConfig


@dataclass(frozen=True)
class EicOrchestrationPaths:
    """Resolved absolute paths for Reflexes queue + prompt templates."""

    orchestration_root: Path
    eic_root: Path
    intentions_root: Path
    pending_dir: Path
    running_dir: Path
    paused_dir: Path
    archive_dir: Path
    designs_root: Path
    reports_root: Path
    agents_root: Path
    skills_root: Path
    workspace_root: Path

    @classmethod
    def from_config(
        cls, config: ServiceConfig, *, cwd: Path | None = None
    ) -> EicOrchestrationPaths:
        base_cwd = cwd or Path(config.workspace_root or Path.cwd())
        orch = Path(config.orchestration_root)
        if not orch.is_absolute():
            orch = (base_cwd / orch).resolve()
        else:
            orch = orch.resolve()

        eic = orch / config.eic_subdir
        intentions = eic / config.intentions_subdir

        agents = Path(config.agents_root)
        if not agents.is_absolute():
            agents = (base_cwd / agents).resolve()
        skills = Path(config.skills_root)
        if not skills.is_absolute():
            skills = (base_cwd / skills).resolve()

        workspace = Path(config.workspace_root or base_cwd).resolve()

        return cls(
            orchestration_root=orch,
            eic_root=eic,
            intentions_root=intentions,
            pending_dir=intentions / "pending",
            running_dir=intentions / "running",
            paused_dir=intentions / "paused",
            archive_dir=intentions / "archive",
            designs_root=orch / config.designs_subdir,
            reports_root=orch / config.reports_subdir,
            agents_root=agents,
            skills_root=skills,
            workspace_root=workspace,
        )
