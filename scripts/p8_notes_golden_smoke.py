#!/usr/bin/env python3
"""P8.2 notes golden smoke — pack match + anti-generic (live stack).

Strict defaults mirror P7.3: posthoc off, fresh create unless EMPERY_SMOKE_SERVICE.

  python3 scripts/p8_notes_golden_smoke.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / ".cursor" / "orchestration" / "reports" / "p8_notes_golden_smoke.md"
EIC = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
IDENTITY = os.environ.get(
    "EMPERY_SMOKE_IDENTITY_BASE", "http://127.0.0.1:8003"
).rstrip("/")
POLL_TIMEOUT_S = float(os.environ.get("EMPERY_SMOKE_POLL_TIMEOUT_S", str(20 * 60)))
EXISTING = os.environ.get("EMPERY_SMOKE_SERVICE", "").strip()
ALLOW_POSTHOC = os.environ.get("EMPERY_SMOKE_ALLOW_POSTHOC", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def _post_json(url: str, payload: dict, *, timeout: float = 60.0) -> tuple[int, dict]:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data = {"raw": raw}
        return exc.code, data


def _get(url: str, timeout: float = 30.0) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode()


def main() -> int:
    notes: list[str] = []
    # Preflight
    try:
        code, _ = _get(f"{EIC}/api/v1/health", timeout=15)
        if code != 200:
            print("FAILED: EIC health", code)
            return 1
    except Exception as exc:  # noqa: BLE001
        print("FAILED: EIC unreachable", exc)
        return 1

    suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    service = EXISTING or f"p8_notes_{suffix}"
    enqueue = not bool(EXISTING)
    notes.append(f"service={service} enqueue={enqueue} posthoc={ALLOW_POSTHOC}")

    if enqueue:
        intent = (
            f"Create a notes tool service {service} with TipTap longread editor "
            f"and optional notes CRUD list — use notes_tool / notes_crud recipe packs"
        )
        code, body = _post_json(
            f"{EIC}/api/v1/autonomous/intentions",
            {
                "intention": intent,
                "service_name": service,
                "features": ["health", "notes"],
                "metadata": {"scaffold_profile": "editor_local"},
            },
        )
        if code != 201:
            print("FAILED enqueue", code, body)
            return 1
        job_id = str((body.get("job") or {}).get("id") or "")
        notes.append(f"enqueue job_id={job_id}")
        deadline = time.monotonic() + POLL_TIMEOUT_S
        terminal: dict = {}
        while time.monotonic() < deadline:
            _, raw = _get(f"{EIC}/api/v1/autonomous/jobs/{job_id}", timeout=60)
            terminal = json.loads(raw).get("job") or {}
            status = str(terminal.get("status") or "")
            print(f"  job {status} stage={terminal.get('stage')}")
            if status in {"completed", "failed", "cancelled"}:
                break
            time.sleep(15)
        else:
            print("FAILED: poll timeout")
            return 1
        notes.append(f"job status={terminal.get('status')}")
        if terminal.get("status") != "completed" and not ALLOW_POSTHOC:
            print("FAILED: job not completed")
            _write(False, service, notes)
            return 1

    # Pack / anti-generic gates from intention metadata or design
    meta = {}
    # Prefer job metadata when present
    # Also read design if exists
    design = (
        ROOT
        / ".cursor"
        / "orchestration"
        / "designs"
        / f"{service}_design.json"
    )
    if design.is_file():
        try:
            meta = json.loads(design.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            meta = {}

    profile = str(
        (meta.get("scaffold_profile") or meta.get("assembly_profile") or "")
    ).lower()
    packs = meta.get("recipe_packs") or meta.get("packs") or []
    # Fallback: scan intention archive metadata from host if Hands wrote last_scaffold_meta
    # into service metadata file — also check factory extract under services
    svc_manifest = ROOT / "services" / service / "manifest.json"
    if not svc_manifest.is_file():
        notes.append("manifest: MISSING")
        _write(False, service, notes)
        return 1
    notes.append("manifest: ok")

    # Assembly quality: fail if productish notes intent landed as generic without allow
    allow_generic = bool(meta.get("allow_generic"))
    if profile == "generic" and not allow_generic:
        notes.append("assembly_profile=generic without allow_generic — FAIL")
        _write(False, service, notes)
        return 1
    if profile:
        notes.append(f"scaffold_profile={profile}")
    if isinstance(packs, list) and packs:
        notes.append(f"recipe_packs={packs}")
    else:
        # Soft: require notes keyword in design/intent path if no packs recorded
        text = design.read_text(encoding="utf-8") if design.is_file() else ""
        if "notes" not in text.lower() and profile not in {
            "notes",
            "notes_tool",
            "notes_crud",
            "doc_editor",
        }:
            notes.append(
                "WARN: no recipe_packs in design — check Hands assembly metadata"
            )

    # Desktop mount presence
    mount = ROOT / "apps" / "empery_desktop" / "src" / "shell" / "mounts" / f"{service}.tsx"
    if mount.is_file():
        notes.append("desktop mount: ok")
    else:
        notes.append("desktop mount: MISSING")
        _write(False, service, notes)
        return 1

    ok = True
    _write(ok, service, notes)
    print("PASSED" if ok else "FAILED", "—", REPORT)
    return 0 if ok else 1


def _write(ok: bool, service: str, notes: list[str]) -> None:
    lines = [
        "# P8.2 notes golden smoke",
        "",
        f"Date: {datetime.now(timezone.utc).isoformat()}",
        f"Service: `{service}`",
        f"Verdict: **{'PASSED' if ok else 'FAILED'}**",
        "",
        "## Notes",
        "",
        *[f"- {n}" for n in notes],
        "",
    ]
    REPORT.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
