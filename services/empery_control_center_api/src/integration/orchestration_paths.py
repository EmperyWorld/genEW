"""Resolve repo-relative orchestration artifact roots."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from services.empery_control_center_api.config import ServiceConfig


@dataclass(frozen=True)
class OrchestrationPaths:
    """Resolved absolute paths under the orchestration root."""

    orchestration_root: Path
    jobs_root: Path
    pending_dir: Path
    claimed_dir: Path
    archive_dir: Path
    audit_path: Path
    designs_root: Path
    reports_root: Path
    intents_root: Path

    @classmethod
    def from_config(cls, config: ServiceConfig, *, cwd: Path | None = None) -> OrchestrationPaths:
        base = Path(config.orchestration_root)
        if not base.is_absolute():
            root = (cwd or Path.cwd()) / base
        else:
            root = base
        root = root.resolve()
        jobs = root / config.jobs_subdir
        return cls(
            orchestration_root=root,
            jobs_root=jobs,
            pending_dir=jobs / "pending",
            claimed_dir=jobs / "claimed",
            archive_dir=jobs / "archive",
            audit_path=root / config.audit_subdir / config.audit_filename,
            designs_root=root / config.designs_subdir,
            reports_root=root / config.reports_subdir,
            intents_root=root / config.intents_subdir,
        )

    def as_response_dict(self) -> dict[str, str]:
        return {
            "orchestration_root": str(self.orchestration_root),
            "jobs_root": str(self.jobs_root),
            "audit_path": str(self.audit_path),
            "designs_root": str(self.designs_root),
            "reports_root": str(self.reports_root),
        }
