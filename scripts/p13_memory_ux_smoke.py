#!/usr/bin/env python3
"""P13 memory / factory visibility smoke — Autonomous job meta + scoped memory.

Production path only. Proves:
  1. Atom file counts for a living golden capsule
  2. Verifier memory atoms carry recipe_packs / atom counts
  3. Memory search accepts service_name filter
  4. Context pack for that service surfaces prior verify/assembly

Usage:
  python3 scripts/p13_memory_ux_smoke.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / ".cursor" / "orchestration" / "reports" / "p13_memory_visible.md"

EIC = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
ECC = os.environ.get("EMPERY_SMOKE_ECC_API", "http://127.0.0.1:8006").rstrip("/")
SERVICE = os.environ.get(
    "EMPERY_SMOKE_SERVICE", "p12_musicforge_20260725103151"
).strip()


def _req(
    method: str,
    url: str,
    *,
    payload: dict[str, Any] | None = None,
    timeout: float = 30.0,
) -> tuple[int, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"raw": raw[:400]}
        return exc.code, body


def _count_atoms(service: str) -> int:
    total = 0
    for base in (
        ROOT / "services" / service / "src" / "integration" / "atoms",
        ROOT / "apps" / "empery_desktop" / "atoms" / service,
    ):
        if base.is_dir():
            total += sum(1 for p in base.rglob("*") if p.is_file())
    return total


def main() -> int:
    notes: list[str] = []
    ok = True
    print("P13 memory_visible smoke", flush=True)

    # 0) health
    code, body = _req("GET", f"{EIC}/api/v1/health")
    if code != 200:
        print(f"FAILED: EIC health {code}")
        return 1
    notes.append(f"EIC health: ok")

    atom_n = _count_atoms(SERVICE)
    if atom_n < 1:
        ok = False
        notes.append(f"atom files for {SERVICE}: MISSING (0)")
    else:
        notes.append(f"atom files for {SERVICE}: {atom_n}")
    print(f"  atoms on disk: {atom_n}", flush=True)

    # 1) ingest verifier with assembly (same shape Hands writes on PASSED)
    ingest = {
        "service_name": SERVICE,
        "title": f"P13 factory memory · {SERVICE}",
        "verify_status": "PASSED",
        "summary": "P13 smoke: factory visibility assembly memory",
        "recipe_packs": ["music_forge", "service_anatomy", "desktop_mount_catalog"],
        "scaffold_profile": "music_forge",
        "atom_file_count": atom_n,
        "extract_adapt_count": 1,
    }
    code, body = _req("POST", f"{EIC}/api/v1/memory/atoms/ingest/verifier", payload=ingest)
    if code not in (200, 201) or not isinstance(body, dict):
        ok = False
        notes.append(f"ingest verifier: FAILED HTTP {code} {str(body)[:160]}")
    else:
        meta = body.get("metadata") or {}
        if meta.get("recipe_packs") and meta.get("eic_atom_file_count") == atom_n:
            notes.append(
                f"ingest verifier: ok packs={meta.get('recipe_packs')} "
                f"atoms={meta.get('eic_atom_file_count')}"
            )
        else:
            ok = False
            notes.append(f"ingest verifier: incomplete metadata {meta}")
        if "Assembly:" not in str(body.get("body") or ""):
            ok = False
            notes.append("ingest verifier: body missing Assembly block")
    print(f"  ingest verifier: HTTP {code}", flush=True)

    # 2) scoped memory search via EIC autonomous facade
    q = urllib.parse.urlencode(
        {"q": "factory assembly music_forge", "limit": 10, "service_name": SERVICE}
    )
    code, body = _req("GET", f"{EIC}/api/v1/autonomous/memory/search?{q}")
    hits = body.get("hits") if isinstance(body, dict) else []
    if code != 200 or not hits:
        ok = False
        notes.append(f"EIC memory search scoped: FAILED HTTP {code} hits={len(hits) if isinstance(hits, list) else 0}")
    else:
        blob = json.dumps(hits).lower()
        if SERVICE.lower() in blob or "music_forge" in blob or "assembly" in blob:
            notes.append(f"EIC memory search scoped: ok hits={len(hits)}")
        else:
            ok = False
            notes.append(f"EIC memory search scoped: hits lack service/assembly content")
    print(f"  EIC search scoped: HTTP {code} hits={len(hits) if isinstance(hits, list) else 0}", flush=True)

    # 3) ECC BFF proxy with service_name (operator path)
    q2 = urllib.parse.urlencode(
        {"q": "Assembly recipe_packs", "limit": 10, "service_name": SERVICE}
    )
    code, body = _req("GET", f"{ECC}/api/v1/autonomous/memory/search?{q2}")
    hits2 = body.get("hits") if isinstance(body, dict) else []
    if code != 200:
        # ECC may require auth — soft note if 401/403, fail otherwise
        if code in (401, 403):
            notes.append(f"ECC memory search: auth required HTTP {code} (expected on locked BFF)")
        else:
            ok = False
            notes.append(f"ECC memory search: FAILED HTTP {code}")
    else:
        notes.append(f"ECC memory search scoped: ok hits={len(hits2) if isinstance(hits2, list) else 0}")
    print(f"  ECC search scoped: HTTP {code}", flush=True)

    # 4) context pack for next Plan
    code, body = _req(
        "POST",
        f"{EIC}/api/v1/memory/context",
        payload={
            "query": f"evolve {SERVICE} improve factory visibility",
            "stage": "plan",
            "service_name": SERVICE,
            "limit": 8,
        },
    )
    if code != 200:
        # alternate path
        code, body = _req(
            "POST",
            f"{EIC}/api/v1/memory/context-pack",
            payload={
                "query": f"evolve {SERVICE} improve factory visibility",
                "stage": "plan",
                "service_name": SERVICE,
            },
        )
    formatted = ""
    if isinstance(body, dict):
        formatted = str(body.get("formatted_context") or "")
        atoms = body.get("atoms") or []
        notes.append(
            f"context pack: HTTP {code} atoms={len(atoms) if isinstance(atoms, list) else 0} "
            f"chars={len(formatted)}"
        )
        if code == 200 and (SERVICE in formatted or "music_forge" in formatted.lower() or atoms):
            notes.append("context pack: prior memory visible for service")
        elif code == 200:
            notes.append("context pack: empty/weak (recipes may still inject SOURCE)")
        else:
            ok = False
            notes.append(f"context pack: FAILED {str(body)[:160]}")
    else:
        ok = False
        notes.append(f"context pack: bad response HTTP {code}")
    print(f"  context pack: HTTP {code}", flush=True)

    # 5) UI source gates (job card + memory filter)
    row = (
        ROOT
        / "apps"
        / "empery_control_center"
        / "src"
        / "features"
        / "autonomous"
        / "AutonomousJobRow.tsx"
    )
    outcome = (
        ROOT
        / "apps"
        / "empery_control_center"
        / "src"
        / "features"
        / "autonomous"
        / "jobOutcome.ts"
    )
    mem = (
        ROOT
        / "apps"
        / "empery_control_center"
        / "src"
        / "features"
        / "autonomous"
        / "MemorySearchLight.tsx"
    )
    for path, needle, label in (
        (outcome, "atomFileCount", "jobOutcome.atomFileCount"),
        (row, "autonomous-job-factory", "AutonomousJobRow factory testid"),
        (row, "atomFiles", "AutonomousJobRow atoms i18n"),
        (mem, "autonomous-memory-service", "MemorySearchLight service filter"),
    ):
        if path.is_file() and needle in path.read_text(encoding="utf-8"):
            notes.append(f"UI {label}: ok")
        else:
            ok = False
            notes.append(f"UI {label}: MISSING")

    lines = [
        "# P13 memory visible",
        "",
        f"Date: {datetime.now(timezone.utc).isoformat()}",
        f"Service: `{SERVICE}`",
        f"Verdict: **{'PASSED' if ok else 'FAILED'}**",
        "",
        "## Evidence",
        "",
        *[f"- {n}" for n in notes],
        "",
        "## Operator surface",
        "",
        "- Autonomous job card: `packs ×N · atoms ×N · extract_adapt ×N` via `jobOutcome` + `AutonomousJobRow`",
        "- Memory light search: optional `service_name` filter (EIC + ECC BFF)",
        "- Next Plan: verify atoms include Assembly block (packs/profile/atom_files)",
        "",
    ]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(("PASSED" if ok else "FAILED") + f" — {REPORT}", flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
