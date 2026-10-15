#!/usr/bin/env python3
"""Prove config_driven Architect/Implementer attach OpenAI assembly tools.

Offline (always):
  - openai_assembly_tools specs
  - materialize_assembly_tool_calls → parseable Blueprint/Manifest

Live (EMPERY_SMOKE_LIVE=1):
  - evolve existing capsule (EMPERY_SMOKE_SERVICE)
  - assert job.metadata.assembly_tools_attached includes architect|implementer
  - record assembly_tool_calls if the model used native emit_*

Usage:
  python3 scripts/assembly_tools_live_smoke.py
  EMPERY_SMOKE_LIVE=1 EMPERY_SMOKE_SERVICE=asm_c7_ops_… \\
    python3 scripts/assembly_tools_live_smoke.py
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
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPORT = (
    ROOT / ".cursor" / "orchestration" / "reports" / "assembly_tools_live_smoke.md"
)

EIC = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
LIVE = os.environ.get("EMPERY_SMOKE_LIVE", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
LIVE_SERVICE = os.environ.get(
    "EMPERY_SMOKE_SERVICE", "asm_c7_ops_20261006070638"
).strip() or "asm_c7_ops_20261006070638"
POLL_TIMEOUT_S = float(os.environ.get("EMPERY_SMOKE_POLL_TIMEOUT_S", str(25 * 60)))
POLL_INTERVAL_S = float(os.environ.get("EMPERY_SMOKE_POLL_INTERVAL_S", "12"))
TERMINAL = frozenset({"completed", "failed", "cancelled"})

sys.path.insert(0, str(ROOT))


def _get(url: str, timeout: float = 30.0) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def _post_json(url: str, payload: dict[str, Any], timeout: float = 60.0) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return exc.code, {"message": raw}


def _put_json(url: str, payload: dict[str, Any], timeout: float = 30.0) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return resp.status, json.loads(raw) if raw else {}


def _offline() -> list[str]:
    from core.integration.assembly_contracts import (
        EMIT_BLUEPRINT_TOOL,
        EMIT_MANIFEST_TOOL,
        default_ops_dashboard_blueprint,
        materialize_assembly_tool_calls,
        openai_assembly_tools,
        parse_blueprint_from_text,
        parse_manifest_from_text,
        manifest_from_blueprint,
    )

    notes: list[str] = []
    arch = openai_assembly_tools(role="architect")
    impl = openai_assembly_tools(role="implementer")
    assert arch and arch[0]["function"]["name"] == EMIT_BLUEPRINT_TOOL
    assert impl and impl[0]["function"]["name"] == EMIT_MANIFEST_TOOL
    notes.append("openai_assembly_tools architect/implementer OK")

    bp = default_ops_dashboard_blueprint(service_name="tools_smoke")
    text = materialize_assembly_tool_calls(
        [
            {
                "function": {
                    "name": EMIT_BLUEPRINT_TOOL,
                    "arguments": json.dumps({"blueprint": bp.model_dump(mode="json")}),
                }
            }
        ]
    )
    assert text and parse_blueprint_from_text(text, service_name="tools_smoke")
    mf = manifest_from_blueprint(bp)
    text_mf = materialize_assembly_tool_calls(
        [
            {
                "function": {
                    "name": EMIT_MANIFEST_TOOL,
                    "arguments": json.dumps({"manifest": mf.model_dump(mode="json")}),
                }
            }
        ]
    )
    assert text_mf and parse_manifest_from_text(text_mf)
    notes.append("materialize tool_calls → Blueprint/Manifest parse OK")
    return notes


def _ensure_autonomous() -> None:
    code, _ = _get(f"{EIC}/api/v1/health", timeout=15)
    if code != 200:
        raise RuntimeError(f"EIC health HTTP {code}")
    code, raw = _get(f"{EIC}/api/v1/autonomous/mode", timeout=15)
    if code != 200:
        raise RuntimeError(f"autonomous mode GET HTTP {code}")
    mode = json.loads(raw)
    if mode.get("enabled"):
        return
    put_code, put_body = _put_json(f"{EIC}/api/v1/autonomous/mode", {"enabled": True})
    if put_code != 200 or not put_body.get("enabled"):
        raise RuntimeError(f"failed to enable autonomous: {put_body}")


def _poll_job(job_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + POLL_TIMEOUT_S
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        code, raw = _get(f"{EIC}/api/v1/autonomous/jobs/{job_id}", timeout=120.0)
        if code != 200:
            raise RuntimeError(f"job poll HTTP {code}: {raw}")
        last = json.loads(raw).get("job") or {}
        status = str(last.get("status") or "")
        print(
            f"    job {job_id} status={status} stage={last.get('stage')}",
            flush=True,
        )
        if status in TERMINAL:
            return last
        time.sleep(POLL_INTERVAL_S)
    raise TimeoutError(f"job {job_id} not terminal within {POLL_TIMEOUT_S}s")


def _live() -> list[str]:
    notes: list[str] = []
    service = LIVE_SERVICE
    capsule = ROOT / "services" / service / "manifest.json"
    if not capsule.is_file():
        raise RuntimeError(
            f"evolve requires existing capsule services/{service}/ "
            f"(set EMPERY_SMOKE_SERVICE); refuse invent"
        )
    bp = (
        ROOT
        / ".cursor"
        / "orchestration"
        / "designs"
        / f"{service}_blueprint.json"
    )
    if not bp.is_file():
        raise RuntimeError(f"missing Blueprint {bp} — config_driven tools need it")
    _ensure_autonomous()
    intent = (
        f"evolve {service}: refresh JTBD Desktop mount labels "
        f"(config_driven assembly tools path)"
    )
    code, body = _post_json(
        f"{EIC}/api/v1/autonomous/intentions",
        {
            "intention": intent,
            "service_name": service,
            "metadata": {
                "kind": "evolve",
                "assembly_mode": "config_driven",
                "scaffold_profile": "ops_dashboard",
                "selected_option": {
                    "id": "assembly_tools_smoke",
                    "title": "Assembly tools live smoke",
                    "delta_summary": f"Exercise emit_* tools on {service}",
                    "risk": "low",
                    "touches": ["ui", "desktop", "factory"],
                },
            },
        },
        timeout=60.0,
    )
    if code >= 300:
        raise RuntimeError(f"enqueue HTTP {code}: {body}")
    job = body.get("job") if isinstance(body.get("job"), dict) else {}
    job_id = str(job.get("id") or "")
    intention_id = str(job.get("intention_id") or body.get("intention", {}).get("id") or "")
    if not job_id:
        raise RuntimeError(f"no job id: {body}")
    notes.append(f"enqueued job_id={job_id} intention_id={intention_id} service={service}")
    job = _poll_job(job_id)
    meta = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    # Prefer intention SoT if job meta is thin.
    if intention_id and not meta.get("assembly_tools_attached"):
        icode, iraw = _get(f"{EIC}/api/v1/eic/intentions/{intention_id}", timeout=30)
        if icode == 200:
            intention = json.loads(iraw).get("intention") or {}
            imeta = intention.get("metadata") if isinstance(intention.get("metadata"), dict) else {}
            if imeta:
                meta = {**meta, **imeta}
    attached = [
        str(x) for x in (meta.get("assembly_tools_attached") or []) if isinstance(x, str)
    ]
    calls = [
        str(x) for x in (meta.get("assembly_tool_calls") or []) if isinstance(x, str)
    ]
    status = str(job.get("status") or "")
    verify = str(
        meta.get("verify_status")
        or (job.get("checkpoint") or {}).get("verify_status")
        or ""
    ).upper()
    notes.append(
        f"terminal status={status} verify={verify or 'MISSING'} "
        f"assembly_tools_attached={attached} assembly_tool_calls={calls}"
    )
    err = str(job.get("error_message") or "")[:240]
    if err:
        notes.append(f"error: {err}")
    if not attached:
        raise AssertionError(
            "assembly_tools_attached empty — config_driven chat+tools path not exercised"
        )
    if not any(r in attached for r in ("architect", "implementer")):
        raise AssertionError(
            f"expected architect|implementer in assembly_tools_attached, got {attached}"
        )
    notes.append("live: assembly tools attached on Architect/Implementer turn")
    if calls:
        notes.append(f"live: model emitted native tool_calls {calls}")
    else:
        notes.append(
            "live: model did not emit native tool_calls "
            "(prose/heal path still valid; tools were attached)"
        )
    return notes


def _write_report(offline: list[str], live: list[str] | None, ok: bool) -> None:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Assembly tools live smoke",
        "",
        f"- Date: {datetime.now(timezone.utc).isoformat()}",
        f"- Verdict: {'PASS' if ok else 'FAIL'}",
        f"- Live: {'ran' if live is not None else 'skipped (set EMPERY_SMOKE_LIVE=1)'}",
        "",
        "## Offline",
        "",
    ]
    for n in offline:
        lines.append(f"- {n}")
    if live is not None:
        lines.extend(["", "## Live", ""])
        for n in live:
            lines.append(f"- {n}")
    lines.append("")
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    print("Assembly tools live smoke", flush=True)
    offline = _offline()
    for n in offline:
        print(f"  OK {n}", flush=True)
    live_notes: list[str] | None = None
    try:
        if LIVE:
            print(
                f"EMPERY_SMOKE_LIVE=1 — evolve tools path on {LIVE_SERVICE}",
                flush=True,
            )
            live_notes = _live()
            for n in live_notes:
                print(f"  OK {n}", flush=True)
        _write_report(offline, live_notes, ok=True)
        print(f"PASSED — report: {REPORT}", flush=True)
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: {exc}", flush=True)
        _write_report(offline, live_notes, ok=False)
        print(f"report: {REPORT}", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
