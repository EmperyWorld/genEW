#!/usr/bin/env python3
"""P1 debt closure proof: extract → empery_targets + forbid_scratch + D1 remount.

Does not require a living LLM. Uses repo workspace + atom_catalog.

  python3 scripts/p1_extract_genesis_proof.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    sys.path.insert(0, str(ROOT))
    from core.logging import configure_logging
    from services.empery_intelligence_core.config import ServiceConfig
    from services.empery_intelligence_core.src.integration.extract_adapt import (
        extract_from_catalog_entry,
    )
    from services.empery_intelligence_core.src.integration.orchestration_paths import (
        EicOrchestrationPaths,
    )
    from services.empery_intelligence_core.src.integration.recipe_catalog import (
        atom_catalog_entry,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        ServiceDesktopScaffoldAction,
        verify_service_desktop,
    )
    from services.empery_intelligence_core.src.integration.workspace_tools import (
        WorkspaceToolAdapter,
    )

    service = "p3_comp_live"
    cfg = ServiceConfig(workspace_root=str(ROOT))
    paths = EicOrchestrationPaths.from_config(cfg, cwd=ROOT)
    log = configure_logging("p1_proof")

    entry = atom_catalog_entry(paths, "ewa_companion")
    if not entry:
        print("FAILED: atom_catalog missing ewa_companion")
        return 1

    print("1) extract_from_catalog_entry → empery_targets")
    result = extract_from_catalog_entry(
        workspace=ROOT, entry=entry, service_name=service
    )
    if not result.ok or not result.written:
        print(f"FAILED: extract {result.error}")
        return 1
    desktop_atoms = ROOT / "apps/empery_desktop/atoms" / service
    svc_atoms = ROOT / "services" / service / "src" / "integration" / "atoms"
    if not desktop_atoms.is_dir() and not any(
        "empery_desktop/atoms" in p for p in result.written
    ):
        print(f"FAILED: no desktop atoms; written={result.written[:8]}")
        return 1
    print(f"  extract ok files={len(result.written)} desktop={desktop_atoms.is_dir()} svc={svc_atoms.is_dir()}")

    print("2) forbid_scratch: scaffold-only must FAIL; extract must PASS")
    adapter = WorkspaceToolAdapter(paths, cfg, log)
    bad = adapter.forbid_scratch_violation(
        intent="create companion chat",
        service_name=service,
        action_stats={"extract_adapt": 0, "scaffold": 1},
    )
    if bad is None:
        print("FAILED: scaffold-only cleared forbid_scratch")
        return 1
    good = adapter.forbid_scratch_violation(
        intent="create companion chat",
        service_name=service,
        action_stats={"extract_adapt": 1, "scaffold": 1},
    )
    if good is not None:
        print(f"FAILED: extract should clear gate: {good}")
        return 1
    print("  forbid_scratch ok")

    print("3) re-scaffold companion mount (rich D1) + verify")
    port = 8037
    manifest = ROOT / "services" / service / "manifest.json"
    if manifest.is_file():
        import json

        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
            p = data.get("port") or (data.get("compose") or {}).get("port")
            if p:
                port = int(p)
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            pass
    # Prefer known proof ports
    if service == "p3_comp_live":
        port = 8037
    desk = ServiceDesktopScaffoldAction(ROOT, log)
    desk.scaffold_desktop(
        service,
        register_live=False,
        ui_profile="companion_chat",
        peer_port=port,
        force=True,
    )
    status, detail = verify_service_desktop(
        ROOT, service, ui_profile="companion_chat"
    )
    if status != "PASSED":
        print(f"FAILED: D1 {status} {detail}")
        return 1
    mount = (
        ROOT / "apps/empery_desktop/src/shell/mounts" / f"{service}.tsx"
    ).read_text(encoding="utf-8")
    if "getEccToken" not in mount or "/api/v1/messages" not in mount:
        print("FAILED: remount missing Bearer/messages markers")
        return 1
    print(f"  desktop verify PASSED ({detail})")

    # Also refresh p3_companion_x if present
    other = ROOT / "services" / "p3_companion_x"
    if other.is_dir():
        print("4) refresh p3_companion_x mount")
        extract_from_catalog_entry(
            workspace=ROOT, entry=entry, service_name="p3_companion_x"
        )
        desk.scaffold_desktop(
            "p3_companion_x",
            register_live=False,
            ui_profile="companion_chat",
            peer_port=8058,
            force=True,
        )
        st2, det2 = verify_service_desktop(
            ROOT, "p3_companion_x", ui_profile="companion_chat"
        )
        print(f"  p3_companion_x: {st2} ({det2[:80]})")
        if st2 != "PASSED":
            return 1

    print("P1 extract genesis proof PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
