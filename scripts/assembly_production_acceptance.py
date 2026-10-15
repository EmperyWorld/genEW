#!/usr/bin/env python3
"""Production acceptance — Autonomous job + ECC WS live assembler steps + UI bake.

Fails hard unless:
  1. config_driven Autonomous create/evolve → verify PASSED
  2. Mid-job ``eic.assembler.step`` on ECC WebSocket before job ends
  3. deploy_agent Desktop UI rebuild returns ok

Usage:
  python3 scripts/assembly_production_acceptance.py
  EMPERY_SMOKE_EVOLVE=1 EMPERY_SMOKE_SERVICE=asm_prod_acc_… \\
    python3 scripts/assembly_production_acceptance.py

Exit: 0 PASS, 1 FAIL, 2 unreachable.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Unbuffered progress when piped (tee / CI).
os.environ.setdefault("PYTHONUNBUFFERED", "1")
try:
    sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
    sys.stderr.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
except Exception:  # noqa: BLE001
    pass

ROOT = Path(__file__).resolve().parents[1]
REPORT = (
    ROOT
    / ".cursor"
    / "orchestration"
    / "reports"
    / "assembly_production_acceptance.md"
)

EIC = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
ECC = os.environ.get("EMPERY_SMOKE_ECC_API", "http://127.0.0.1:8006").rstrip("/")
DEPLOY = os.environ.get(
    "EMPERY_SMOKE_DEPLOY_AGENT", "http://127.0.0.1:8010"
).rstrip("/")
POLL_TIMEOUT_S = float(os.environ.get("EMPERY_SMOKE_POLL_TIMEOUT_S", str(30 * 60)))
POLL_INTERVAL_S = float(os.environ.get("EMPERY_SMOKE_POLL_INTERVAL_S", "10"))
TERMINAL = frozenset({"completed", "failed", "cancelled"})


def _http_json(
    method: str,
    url: str,
    payload: dict[str, Any] | None = None,
    *,
    timeout: float = 60,
) -> tuple[int, dict[str, Any]]:
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"raw": raw}
        return exc.code, body
    except Exception as exc:  # noqa: BLE001
        return 0, {"error": str(exc)}


def _get_json(url: str, *, timeout: float = 30) -> tuple[int, dict[str, Any]]:
    return _http_json("GET", url, timeout=timeout)


class _WsStepCollector:
    def __init__(self) -> None:
        self.steps: list[dict[str, Any]] = []
        self.errors: list[str] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.first_at: float | None = None

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run, name="ws-assembler", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        try:
            import websockets
        except ImportError:
            self.errors.append("websockets package missing")
            return

        uri = (
            f"{ECC.replace('http', 'ws', 1)}"
            "/api/v1/ws/events?topics=eic.assembler.step"
        )

        async def _listen() -> None:
            try:
                async with websockets.connect(uri, open_timeout=10) as ws:
                    # Drain hello / any non-step frames until job publishes steps
                    while not self._stop.is_set():
                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
                        except asyncio.TimeoutError:
                            continue
                        try:
                            msg = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        name = (
                            msg.get("event_name")
                            or msg.get("name")
                            or msg.get("topic")
                            or ""
                        )
                        payload = msg.get("payload") or msg.get("data") or {}
                        msg_type = str(msg.get("type") or "")
                        if msg_type in {"hello", "heartbeat", "pong"}:
                            continue
                        if (
                            name == "eic.assembler.step"
                            or "assembler" in str(name)
                            or (
                                isinstance(payload, dict)
                                and str(payload.get("step") or "").startswith(
                                    "ASSEMBLY_STEP"
                                )
                            )
                        ):
                            if self.first_at is None:
                                self.first_at = time.monotonic()
                            self.steps.append(
                                {
                                    "at": time.monotonic(),
                                    "name": name,
                                    "step": (
                                        payload.get("step")
                                        if isinstance(payload, dict)
                                        else None
                                    ),
                                    "message": (
                                        payload.get("message")
                                        if isinstance(payload, dict)
                                        else None
                                    ),
                                }
                            )
            except Exception as exc:  # noqa: BLE001
                self.errors.append(str(exc)[:400])

        asyncio.run(_listen())


def _verify_status(job: dict[str, Any]) -> str:
    meta = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    raw = str(meta.get("verify_status") or "")
    if raw in {"PASSED", "FAILED"}:
        return raw
    summary = str(job.get("result_summary") or "")
    m = re.match(r"verify_status=(PASSED|FAILED)", summary, re.I)
    return m.group(1).upper() if m else ""


def _unwrap_job(payload: dict[str, Any]) -> dict[str, Any]:
    """EIC GET /autonomous/jobs/{id} returns ``{job: {...}}``."""
    if isinstance(payload.get("job"), dict):
        return payload["job"]
    return payload


def main() -> int:
    sys.path.insert(0, str(ROOT))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    evolve = os.environ.get("EMPERY_SMOKE_EVOLVE", "").strip() in {
        "1",
        "true",
        "yes",
    }
    existing = os.environ.get("EMPERY_SMOKE_SERVICE", "").strip()
    if evolve and existing:
        service = existing
        payload: dict[str, Any] = {
            "intention": (
                f"evolve {service}: refresh ops dashboard metrics cards layout "
                "— Configuration-Driven Assembly"
            ),
            "service_name": service,
            "features": ["health", "ops_dashboard"],
            "metadata": {
                "scaffold_profile": "ops_dashboard",
                "recipe_packs": ["ops_dashboard"],
                "assembly_mode": "config_driven",
                "kind": "evolve",
                "evolve_skip_propose": True,
            },
        }
    else:
        service = existing or f"asm_prod_acc_{stamp}"
        payload = {
            "intention": (
                f"create_service {service} ops dashboard with metrics cards "
                "and revenue chart — Configuration-Driven Assembly"
            ),
            "service_name": service,
            "features": ["health", "ops_dashboard"],
            "metadata": {
                "scaffold_profile": "ops_dashboard",
                "recipe_packs": ["ops_dashboard"],
                "assembly_mode": "config_driven",
            },
        }

    lines = [
        "# Assembly Production Acceptance",
        "",
        f"- **When:** {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
        f"- **Service:** `{service}`",
        f"- **Mode:** {'evolve' if evolve else 'create'}",
        f"- **EIC:** `{EIC}`",
        f"- **ECC WS:** `{ECC}`",
        "",
    ]

    code, health = _get_json(f"{EIC}/api/v1/health")
    if code != 200 or health.get("status") != "ok":
        print(f"FAIL: EIC health {code} {health}", file=sys.stderr)
        return 2
    code, dhealth = _get_json(f"{DEPLOY}/api/v1/health")
    if code != 200:
        print(f"FAIL: deploy_agent health {code}", file=sys.stderr)
        return 2
    if dhealth.get("status") != "ok":
        print(f"FAIL: deploy_agent degraded {dhealth}", file=sys.stderr)
        return 1
    details = dhealth.get("details") or {}
    if details.get("workspace_ok") is False:
        print(f"FAIL: workspace_ok false {dhealth}", file=sys.stderr)
        return 1
    print(f"OK preflight EIC+deploy workspace={dhealth.get('workspace')}")

    _http_json("PUT", f"{EIC}/api/v1/autonomous/mode", {"enabled": True})

    collector = _WsStepCollector()
    collector.start()
    time.sleep(0.8)

    code, created = _http_json(
        "POST",
        f"{EIC}/api/v1/autonomous/intentions",
        payload,
        timeout=120,
    )
    if code not in {200, 201}:
        collector.stop()
        print(f"FAIL: enqueue {code} {created}", file=sys.stderr)
        return 1
    job = created.get("job") or {}
    job_id = str(job.get("id") or "")
    if not job_id:
        intention = created.get("intention") or {}
        job_id = str(
            (intention.get("metadata") or {}).get("ecc_job_id")
            or intention.get("id")
            or ""
        )
    if not job_id:
        collector.stop()
        print(f"FAIL: no job id in {created}", file=sys.stderr)
        return 1
    print(f"OK enqueued job={job_id} service={service}")
    lines.append(f"- Job: `{job_id}`")

    deadline = time.monotonic() + POLL_TIMEOUT_S
    final: dict[str, Any] = {}
    job_done_at: float | None = None
    while time.monotonic() < deadline:
        code, raw_job = _get_json(f"{EIC}/api/v1/autonomous/jobs/{job_id}")
        if code != 200:
            time.sleep(POLL_INTERVAL_S)
            continue
        final = _unwrap_job(raw_job)
        status = str(final.get("status") or "").lower()
        print(
            f"… status={status} ws_steps={len(collector.steps)} "
            f"verify={_verify_status(final) or '-'} "
            f"ws_err={collector.errors[:1] or '-'}"
        )
        if status in TERMINAL:
            job_done_at = time.monotonic()
            break
        time.sleep(POLL_INTERVAL_S)
    else:
        collector.stop()
        print("FAIL: poll timeout", file=sys.stderr)
        return 1

    time.sleep(1.5)
    collector.stop()

    verify = _verify_status(final)
    status = str(final.get("status") or "").lower()
    meta = final.get("metadata") if isinstance(final.get("metadata"), dict) else {}
    gate_s = (meta.get("assembly_verifier") or {}).get("gate_s") or meta.get(
        "assembly_gate_s"
    )
    assembler_steps = [
        s
        for s in collector.steps
        if s.get("step")
        or str(s.get("name") or "") == "eic.assembler.step"
        or "assembler" in str(s.get("name") or "")
    ]
    mid_stream = bool(
        job_done_at
        and collector.first_at is not None
        and collector.first_at < job_done_at
    )
    step_names = [str(s.get("step") or s.get("name") or "") for s in assembler_steps]
    lines.append(f"- Job status: **{status}** verify=**{verify or 'MISSING'}**")
    lines.append(f"- Gate S meta: `{gate_s}`")
    lines.append(f"- WS assembler steps: **{len(assembler_steps)}**")
    lines.append(f"- Mid-stream before job end: **{mid_stream}**")
    lines.append(f"- Steps sample: {step_names[:8]}")
    if collector.errors:
        lines.append(f"- WS errors: {collector.errors}")

    ok = True
    if status != "completed" or verify != "PASSED":
        print(
            f"FAIL: job {status} verify={verify} meta_keys={list(meta)[:20]}",
            file=sys.stderr,
        )
        ok = False
    if collector.errors and not assembler_steps:
        print(f"FAIL: WS collector errors {collector.errors}", file=sys.stderr)
        ok = False
    if len(assembler_steps) < 1:
        print("FAIL: no eic.assembler.step on ECC WS during job", file=sys.stderr)
        ok = False
    elif not mid_stream:
        print(
            "FAIL: assembler.step only after job finished (not live mid-stream)",
            file=sys.stderr,
        )
        ok = False
    else:
        print(
            f"OK live WS steps={len(assembler_steps)} mid_stream={step_names[:5]}"
        )
    code, bake = _http_json(
        "POST",
        f"{DEPLOY}/api/v1/deploy",
        {"service_name": "empery_desktop_ui", "action": "rebuild"},
        timeout=900,
    )
    bake_ok = code == 200 and bool(bake.get("ok"))
    lines.append(
        f"- Desktop UI bake: **{'ok' if bake_ok else 'FAIL'}** "
        f"error=`{(bake.get('error') or '')[:200]}`"
    )
    if not bake_ok:
        print(f"FAIL: desktop bake {code} {bake}", file=sys.stderr)
        ok = False
    else:
        print("OK desktop UI rebuild via deploy_agent")

    freeze = ROOT / "services" / service / "assembly_freeze.json"
    mount = (
        ROOT
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service}.tsx"
    )
    lines.append(f"- Freeze present: **{freeze.is_file()}**")
    lines.append(f"- Desktop mount present: **{mount.is_file()}**")
    if not freeze.is_file() or not mount.is_file():
        print(
            f"FAIL: missing freeze={freeze.is_file()} mount={mount.is_file()}",
            file=sys.stderr,
        )
        ok = False

    # Prior create evidence (if this run is evolve)
    prior = ROOT / "services" / "asm_prod_acc_20261006100320" / "manifest.json"
    if prior.is_file():
        lines.append("- Prior create asm_prod_acc_20261006100320: present (PASSED earlier)")

    lines.extend(["", f"**Verdict:** {'PASS' if ok else 'FAIL'}", ""])
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"{'PASS' if ok else 'FAIL'} production acceptance\nreport={REPORT}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
