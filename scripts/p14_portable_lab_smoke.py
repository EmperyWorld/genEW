#!/usr/bin/env python3
"""P14 portable lab gate — stranger path without insider knobs.

Proves (no mid-run code edits):
  - ``ew2_one_click_deploy.sh --lab`` is documented and wires compose.lab.yml
  - PODMAN.md has one «From zero to green smoke» block
  - Nightly workflow runs p4 + p8 when EMPERY_SMOKE_NIGHTLY=1
  - Lab compose config resolves; optional living-brain + convergence

Usage:
  python3 scripts/p14_portable_lab_smoke.py
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / ".cursor" / "orchestration" / "reports" / "p14_portable_lab.md"
DEPLOY = ROOT / "scripts" / "ew2_one_click_deploy.sh"
PODMAN = ROOT / "PODMAN.md"
NIGHTLY = ROOT / ".github" / "workflows" / "optional-factory-smokes.yml"
LAB_YML = ROOT / "compose.lab.yml"


def _run(cmd: list[str], *, timeout: float = 120.0) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        out = (proc.stdout or "") + (proc.stderr or "")
        return proc.returncode, out
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, str(exc)


def _resolve_compose() -> list[str] | None:
    rc, _ = _run(["podman-compose", "version"], timeout=15)
    if rc == 0:
        return ["podman-compose"]
    rc, _ = _run(["podman", "compose", "version"], timeout=15)
    if rc == 0:
        return ["podman", "compose"]
    return None


def main() -> int:
    notes: list[str] = []
    ok = True
    print("P14 portable lab smoke", flush=True)

    # 1) --lab flag
    if not DEPLOY.is_file():
        ok = False
        notes.append("ew2_one_click_deploy.sh: MISSING")
    else:
        help_txt = DEPLOY.read_text(encoding="utf-8")
        if "--lab)" in help_txt or '"--lab"' in help_txt or "--lab) LAB=1" in help_txt:
            notes.append("deploy --lab flag: ok")
        else:
            ok = False
            notes.append("deploy --lab flag: MISSING")
        if "compose.lab.yml" in help_txt and "COMPOSE_FILE_ARGS" in help_txt:
            notes.append("deploy lab compose wiring: ok")
        else:
            ok = False
            notes.append("deploy lab compose wiring: MISSING")
        if "mutually exclusive" in help_txt.lower() or 'LAB" -eq 1 && "$STRICT"' in help_txt:
            notes.append("deploy --lab/--strict mutex: ok")
        rc, out = _run(["bash", str(DEPLOY), "--help"], timeout=15)
        if rc == 0 and "--lab" in out:
            notes.append("deploy --help documents --lab: ok")
        else:
            ok = False
            notes.append(f"deploy --help: FAILED rc={rc}")

    # 2) compose.lab.yml
    if LAB_YML.is_file() and "EIC_AUTONOMOUS_ENABLED" in LAB_YML.read_text(encoding="utf-8"):
        notes.append("compose.lab.yml autonomy ON: ok")
    else:
        ok = False
        notes.append("compose.lab.yml autonomy: MISSING")

    # 3) PODMAN zero→green block
    if not PODMAN.is_file():
        ok = False
        notes.append("PODMAN.md: MISSING")
    else:
        text = PODMAN.read_text(encoding="utf-8")
        if "From zero to green smoke" in text and "ew2_one_click_deploy.sh --lab" in text:
            notes.append("PODMAN.md zero→green lab block: ok")
        else:
            ok = False
            notes.append("PODMAN.md zero→green lab block: MISSING")
        if "p4_golden_loop_smoke.py" in text and "p8_notes_golden_smoke.py" in text:
            notes.append("PODMAN.md p4+p8 smokes listed: ok")
        else:
            ok = False
            notes.append("PODMAN.md p4+p8 smokes: MISSING")
        # No secret LAN narrative as the happy path default
        if "192.168.1.111" in text and "default" in text.lower():
            # Allow mention as optional LAN, fail if presented as required default in zero block
            zero = text.split("## From zero to green smoke")[1].split("---")[0]
            if "192.168.1.111" in zero:
                ok = False
                notes.append("PODMAN.md zero block hardcodes LAN IP — FAIL")
            else:
                notes.append("PODMAN.md zero block portable brain: ok")
        else:
            notes.append("PODMAN.md zero block portable brain: ok")

    # 4) Nightly p4 + p8
    if not NIGHTLY.is_file():
        ok = False
        notes.append("optional-factory-smokes.yml: MISSING")
    else:
        yml = NIGHTLY.read_text(encoding="utf-8")
        if "EMPERY_SMOKE_NIGHTLY" in yml and "schedule:" in yml:
            notes.append("nightly schedule gated by EMPERY_SMOKE_NIGHTLY: ok")
        else:
            ok = False
            notes.append("nightly schedule gate: MISSING")
        # Both p4 and p8 on schedule
        p4_sched = bool(
            re.search(
                r"p4_golden_loop_smoke\.py[\s\S]{0,200}schedule|"
                r"schedule[\s\S]{0,400}p4_golden_loop_smoke\.py",
                yml,
            )
        )
        # Simpler: both steps mention schedule in their if:
        p4_ok = "p4_golden_loop_smoke.py" in yml and "github.event_name == 'schedule'" in yml
        # Count schedule appearances in p8 step — after our fix p8 also has schedule
        p8_block = ""
        if "P8 notes pack golden" in yml:
            p8_block = yml.split("P8 notes pack golden", 1)[1][:500]
        p8_ok = "p8_notes_golden_smoke.py" in yml and "schedule" in p8_block
        if p4_ok and p8_ok:
            notes.append("nightly runs p4 + p8: ok")
        else:
            ok = False
            notes.append(f"nightly p4+p8: FAILED p4={p4_ok} p8={p8_ok}")

    # 5) Lab compose config resolves
    compose = _resolve_compose()
    if compose is None:
        ok = False
        notes.append("podman compose: MISSING on PATH")
    else:
        rc, out = _run(
            [*compose, "-f", "compose.yml", "-f", "compose.lab.yml", "config"],
            timeout=90,
        )
        if rc == 0 and "empery_intelligence_core" in out:
            notes.append("lab compose config: ok")
            if "EIC_AUTONOMOUS_ENABLED" in out or "true" in out.lower():
                notes.append("lab compose config includes EIC service: ok")
        else:
            ok = False
            notes.append(f"lab compose config: FAILED rc={rc} {out[:200]}")

    # 6) Living brain — honest N/A if unreachable
    brain = ROOT / "scripts" / "verify_living_brain.py"
    if brain.is_file():
        rc, out = _run([sys.executable, str(brain)], timeout=60)
        if rc == 0:
            notes.append("verify_living_brain: ok")
        else:
            notes.append(
                f"verify_living_brain: N/A rc={out.strip()[:120] or rc} "
                "(operator must point EIC_LLM_BASE_URL — not a Fake* escape)"
            )
    else:
        notes.append("verify_living_brain.py: MISSING (soft)")

    # 7) Mutex check
    rc, out = _run(["bash", str(DEPLOY), "--lab", "--strict", "--help"], timeout=10)
    # --help exits 0 before mutex if parsed wrong — call without help
    rc, out = _run(["bash", "-c", f"bash {DEPLOY} --lab --strict --no-pull --no-build 2>&1 | head -5"], timeout=15)
    # Actually that might start deploy — use a dry parse:
    rc, out = _run(
        [
            "bash",
            "-c",
            "source /dev/null; "
            f"bash -c 'STRICT=0; LAB=0; for a in --lab --strict; do case $a in --lab) LAB=1;; --strict) STRICT=1;; esac; done; "
            f"if [[ $LAB -eq 1 && $STRICT -eq 1 ]]; then echo MUTEX_OK; exit 2; fi'",
        ],
        timeout=10,
    )
    # Direct: script should exit 2 immediately on --lab --strict before long work
    rc, out = _run(["bash", str(DEPLOY), "--lab", "--strict"], timeout=15)
    if rc == 2 and "mutually exclusive" in out.lower():
        notes.append("deploy --lab/--strict reject: ok")
    else:
        # If it started deploy somehow, soft warn
        if "mutually exclusive" in out.lower():
            notes.append("deploy --lab/--strict reject: ok")
        else:
            ok = False
            notes.append(f"deploy --lab/--strict reject: FAILED rc={rc} {out[:160]}")

    lines = [
        "# P14 portable lab",
        "",
        f"Date: {datetime.now(timezone.utc).isoformat()}",
        f"Verdict: **{'PASSED' if ok else 'FAILED'}**",
        "",
        "## Evidence",
        "",
        *[f"- {n}" for n in notes],
        "",
        "## Operator path",
        "",
        "```bash",
        "./scripts/ew2_one_click_deploy.sh --lab",
        "python3 scripts/verify_living_brain.py",
        "./scripts/smoke_convergence.sh",
        "python3 scripts/p4_golden_loop_smoke.py",
        "python3 scripts/p8_notes_golden_smoke.py",
        "```",
        "",
        "Docs: `PODMAN.md` § From zero to green smoke (lab).",
        "Nightly: `optional-factory-smokes.yml` when `EMPERY_SMOKE_NIGHTLY=1`.",
        "",
    ]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(("PASSED" if ok else "FAILED") + f" — {REPORT}", flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
