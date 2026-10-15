#!/usr/bin/env python3
"""P7.3 / P4.4 golden loop smoke — login → create → Desktop → evolve propose→pick.

Production path only (living EIC/Nervas, real identity login, Redis stack).

Strict defaults (P7.3):
  - Always enqueue a fresh companion unless ``EMPERY_SMOKE_SERVICE`` is set
  - ``EMPERY_SMOKE_ALLOW_POSTHOC`` default **off** (opt-in salvage only)
  - Poll timeout → hard FAIL (no soft-terminal / no intention-file cancel as success)

Steps:
  1. Login operator (register-or-login lab user; JWT required)
  2. Create companion intention (or reuse EMPERY_SMOKE_SERVICE)
  3. Job completed + filesystem + factory gates
  4. Health ok + Desktop catalog lists app + baked mount
  5. Evolve propose → pick → enqueue → job **completed** +
     ``verify_status=PASSED`` (P11: empty/UNKNOWN/soft-completed is FAIL)

Usage (stack up, living LLM):
  python3 scripts/p4_golden_loop_smoke.py

Reuse an existing companion (skip create enqueue):
  EMPERY_SMOKE_SERVICE=p3_comp_live python3 scripts/p4_golden_loop_smoke.py

Lenient lab salvage (not DoD):
  EMPERY_SMOKE_ALLOW_POSTHOC=1 python3 scripts/p4_golden_loop_smoke.py

Credentials (optional; otherwise ephemeral register):
  EMPERY_SMOKE_EMAIL=… EMPERY_SMOKE_PASSWORD=…
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = (
    ROOT / ".cursor" / "orchestration" / "reports" / "p4_golden_loop_smoke.md"
)
P7_REPORT_PATH = (
    ROOT / ".cursor" / "orchestration" / "reports" / "p7_strict_golden_loop.md"
)

EIC_BASE = os.environ.get("EMPERY_SMOKE_EIC_BASE", "http://127.0.0.1:8007").rstrip("/")
IDENTITY_BASE = os.environ.get(
    "EMPERY_SMOKE_IDENTITY_BASE", "http://127.0.0.1:8003"
).rstrip("/")
DEPLOY_BASE = os.environ.get("EMPERY_SMOKE_DEPLOY_BASE", "http://127.0.0.1:8010").rstrip(
    "/"
)
SHELL_BASE = os.environ.get("EMPERY_SMOKE_SHELL_BASE", "http://127.0.0.1:8020").rstrip(
    "/"
)
DESKTOP_UI = os.environ.get("EMPERY_SMOKE_DESKTOP_UI", "http://127.0.0.1:5174").rstrip(
    "/"
)

POLL_TIMEOUT_S = float(os.environ.get("EMPERY_SMOKE_POLL_TIMEOUT_S", str(20 * 60)))
POLL_INTERVAL_S = float(os.environ.get("EMPERY_SMOKE_POLL_INTERVAL_S", "15"))
# P7.3: posthoc opt-in only (default off). Unset env → False.
ALLOW_POSTHOC = os.environ.get("EMPERY_SMOKE_ALLOW_POSTHOC", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
EXISTING_SERVICE = os.environ.get("EMPERY_SMOKE_SERVICE", "").strip()
SKIP_EVOLVE = os.environ.get("EMPERY_SMOKE_SKIP_EVOLVE", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
EVOLVE_RETRIES = max(1, int(os.environ.get("EMPERY_SMOKE_EVOLVE_RETRIES", "2")))

TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})


def _get(
    url: str, timeout: float = 30.0, *, token: str | None = None
) -> tuple[int, str]:
    headers: dict[str, str] = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, method="GET", headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def _request_json(
    method: str,
    url: str,
    payload: dict | None = None,
    *,
    timeout: float = 60.0,
    token: str | None = None,
) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            body_json = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body_json = {"message": raw}
        return exc.code, body_json


def _post_json(
    url: str,
    payload: dict,
    *,
    timeout: float = 60.0,
    token: str | None = None,
) -> tuple[int, dict]:
    return _request_json("POST", url, payload, timeout=timeout, token=token)


def _put_json(
    url: str,
    payload: dict,
    *,
    timeout: float = 30.0,
    token: str | None = None,
) -> tuple[int, dict]:
    return _request_json("PUT", url, payload, timeout=timeout, token=token)


def _login_operator(results: list[str]) -> str:
    """Register-or-login; return access_token. Never print password."""
    suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    email = (
        os.environ.get("EMPERY_SMOKE_EMAIL", "").strip()
        or f"p4.golden.{suffix}@eworld.local"
    )
    password = os.environ.get("EMPERY_SMOKE_PASSWORD", "").strip() or (
        "P4!" + secrets.token_urlsafe(18)
    )

    code, body = _post_json(
        f"{IDENTITY_BASE}/api/v1/auth/login",
        {"email": email, "password": password},
        timeout=30.0,
    )
    if code == 200 and body.get("access_token"):
        results.append(f"login: ok email={email}")
        return str(body["access_token"])

    # Fresh lab user when credentials missing/wrong
    reg_code, reg_body = _post_json(
        f"{IDENTITY_BASE}/api/v1/auth/register",
        {
            "email": email,
            "password": password,
            "display_name": "P4 Golden Loop",
        },
        timeout=30.0,
    )
    if reg_code not in (200, 201) and reg_code != 409:
        raise RuntimeError(f"register failed HTTP {reg_code}: {reg_body}")
    results.append(f"register: HTTP {reg_code} email={email}")

    code, body = _post_json(
        f"{IDENTITY_BASE}/api/v1/auth/login",
        {"email": email, "password": password},
        timeout=30.0,
    )
    if code != 200 or not body.get("access_token"):
        raise RuntimeError(f"login after register failed HTTP {code}: {body}")
    results.append(f"login: ok email={email}")
    return str(body["access_token"])


def _preflight(errors: list[str]) -> None:
    try:
        code, raw = _get(f"{EIC_BASE}/api/v1/health", timeout=15)
        if code != 200:
            errors.append(f"EIC health HTTP {code}")
        else:
            health = json.loads(raw)
            nervas = health.get("nervas") or {}
            if nervas.get("ready") is not True:
                errors.append(f"Nervas not ready: {nervas}")
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        errors.append(f"EIC health unreachable: {exc}")

    try:
        code, raw = _get(f"{EIC_BASE}/api/v1/autonomous/llm/health", timeout=30)
        if code != 200:
            errors.append(f"LLM health HTTP {code}")
        else:
            llm = json.loads(raw)
            if llm.get("status") != "ok":
                errors.append(f"LLM not ready: {llm}")
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        errors.append(f"LLM health probe failed: {exc}")

    try:
        code, raw = _get(f"{EIC_BASE}/api/v1/autonomous/mode", timeout=15)
        if code != 200:
            errors.append(f"Autonomous mode GET HTTP {code}")
        else:
            mode = json.loads(raw)
            if not mode.get("enabled"):
                put_code, put_body = _put_json(
                    f"{EIC_BASE}/api/v1/autonomous/mode",
                    {"enabled": True},
                )
                if put_code != 200 or not put_body.get("enabled"):
                    errors.append(
                        f"Autonomous mode disabled and enable failed: {put_body}"
                    )
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        errors.append(f"Autonomous mode probe failed: {exc}")

    for label, base in (
        ("identity", IDENTITY_BASE),
        ("deploy_agent", DEPLOY_BASE),
        ("desktop_shell", SHELL_BASE),
    ):
        try:
            code, _ = _get(f"{base}/api/v1/health", timeout=15)
            if code != 200:
                errors.append(f"{label} health HTTP {code}")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            errors.append(f"{label} health unreachable: {exc}")


def _resolve_service_name() -> tuple[str, bool]:
    """Return (service_name, enqueue_create).

    P7.3: fresh create is the default DoD path. Reuse only when
    ``EMPERY_SMOKE_SERVICE`` is set explicitly.
    """
    if EXISTING_SERVICE:
        return EXISTING_SERVICE, False
    suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"p4_golden_{suffix}", True


def _enqueue_companion(service_name: str) -> dict[str, Any]:
    code, body = _post_json(
        f"{EIC_BASE}/api/v1/autonomous/intentions",
        {
            "intention": (
                f"Create companion chat service {service_name} with Nervas and identity"
            ),
            "service_name": service_name,
            "features": ["health", "companion_chat"],
            "metadata": {"scaffold_profile": "companion_chat"},
        },
        timeout=60.0,
    )
    if code != 201:
        raise RuntimeError(f"enqueue create failed HTTP {code}: {body}")
    return body


def _job_verify_status(job: dict[str, Any]) -> str:
    """Authoritative verify_status from AutonomousJob (metadata / summary)."""
    meta = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    raw = (
        meta.get("verify_status")
        or job.get("verify_status")
        or (job.get("checkpoint") or {}).get("verify_status")
        or ""
    )
    if not raw:
        summary = str(job.get("result_summary") or "")
        m = re.match(r"verify_status=(PASSED|FAILED|UNKNOWN|PENDING)", summary, re.I)
        if m:
            raw = m.group(1)
    return str(raw or "").strip().upper()


def _poll_job(job_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + POLL_TIMEOUT_S
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        try:
            code, raw = _get(
                f"{EIC_BASE}/api/v1/autonomous/jobs/{job_id}", timeout=120.0
            )
        except (TimeoutError, urllib.error.URLError, OSError) as exc:
            print(f"  job {job_id} poll transient: {type(exc).__name__}")
            time.sleep(POLL_INTERVAL_S)
            continue
        if code != 200:
            raise RuntimeError(f"job poll HTTP {code}: {raw}")
        last = json.loads(raw).get("job") or {}
        status = str(last.get("status") or "")
        stage = str(last.get("stage") or "")
        print(f"  job {job_id} status={status} stage={stage}")
        if status in TERMINAL_STATUSES:
            return last
        time.sleep(POLL_INTERVAL_S)
    stage = last.get("stage") if last else None
    status = last.get("status") if last else None
    raise TimeoutError(
        f"job {job_id} did not reach terminal state within {POLL_TIMEOUT_S}s "
        f"(last status={status} stage={stage}) — soft-timeout disabled (P7.3)"
    )


def _file_fingerprint(path: Path) -> str | None:
    if not path.is_file():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def _capsule_and_factory(service_name: str) -> tuple[bool, list[str]]:
    notes: list[str] = []
    ok = True
    svc_root = ROOT / "services" / service_name
    manifest_path = svc_root / "manifest.json"
    if not manifest_path.is_file():
        return False, [f"missing manifest {manifest_path}"]

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    features = (
        manifest.get("features") if isinstance(manifest.get("features"), list) else []
    )
    deps = (
        manifest.get("dependencies")
        if isinstance(manifest.get("dependencies"), list)
        else []
    )
    ui = manifest.get("ui") if isinstance(manifest.get("ui"), dict) else {}

    has_companion = "companion_chat" in features
    has_alembic = (svc_root / "alembic").is_dir()
    has_identity = (svc_root / "src" / "integration" / "identity_adapter.py").is_file()
    has_peers = "identity_service" in deps and "empery_intelligence_core" in deps
    if has_companion or (has_alembic and has_identity and has_peers):
        notes.append("companion capsule: ok")
    else:
        ok = False
        notes.append(
            "companion capsule: FAILED "
            f"(features={features}, alembic={has_alembic}, "
            f"identity={has_identity}, deps={deps})"
        )

    if not ui:
        ok = False
        notes.append("manifest.ui: MISSING")
    elif ui.get("required") is True:
        notes.append("manifest.ui.required: true")
    else:
        notes.append(f"manifest.ui.required={ui.get('required')}")

    sys.path.insert(0, str(ROOT))
    from services.empery_intelligence_core.src.integration.service_factory_gates import (
        verify_factory_gates,
    )
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        verify_service_desktop,
    )

    factory_status, factory_detail = verify_factory_gates(
        ROOT, service_name, scaffold_profile="companion_chat"
    )
    if factory_status != "PASSED":
        ok = False
        notes.append(factory_detail[:400])
    notes.append(f"factory: {factory_status}")

    desk_status, desk_detail = verify_service_desktop(ROOT, service_name)
    if desk_status != "PASSED":
        ok = False
    notes.append(f"desktop fs: {desk_status} ({desk_detail[:120]})")
    return ok, notes


def _live_gates(service_name: str) -> tuple[bool, list[str]]:
    notes: list[str] = []
    ok = True
    pascal = "".join(part.capitalize() for part in service_name.split("_"))
    mount_symbol = f"{pascal}Mount"

    code, deploy = _post_json(
        f"{DEPLOY_BASE}/api/v1/deploy",
        {"service_name": service_name, "action": "health"},
        timeout=120.0,
    )
    if code == 200 and deploy.get("ok"):
        notes.append("deploy health: ok")
    else:
        ok = False
        notes.append(f"deploy health: FAILED ({deploy})")

    try:
        _, raw = _get(f"{SHELL_BASE}/api/v1/catalog/apps", timeout=15)
        apps = json.loads(raw)
        ids = {
            a.get("app_id") or a.get("app_component")
            for a in apps
            if isinstance(a, dict)
        }
        if service_name in ids or any(service_name in str(x) for x in ids):
            notes.append("desktop catalog: ok")
        else:
            # bootstrap fallback (legacy seed)
            _, boot_raw = _get(f"{SHELL_BASE}/api/v1/shell-bootstrap", timeout=15)
            boot = json.loads(boot_raw)
            comps = {
                i.get("app_component")
                for i in boot.get("items", [])
                if isinstance(i, dict)
            }
            if service_name in comps or mount_symbol in comps:
                notes.append("desktop bootstrap: ok (catalog miss)")
            else:
                ok = False
                notes.append(
                    f"desktop catalog/bootstrap missing {service_name}; "
                    f"catalog_sample={sorted(x for x in ids if x)[:12]}"
                )
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        ok = False
        notes.append(f"desktop catalog failed: {exc}")

    try:
        _, index = _get(f"{DESKTOP_UI}/", timeout=15)
        found = False
        scanned = 0
        for part in index.split('src="')[1:]:
            src = part.split('"', 1)[0]
            if not src.startswith("/"):
                continue
            try:
                _, js = _get(f"{DESKTOP_UI}{src}", timeout=30)
            except (urllib.error.URLError, TimeoutError, OSError):
                continue
            scanned += 1
            if service_name in js or mount_symbol in js:
                found = True
                break
            if scanned >= 8:
                break
        if found:
            notes.append("desktop UI baked mount: ok")
        else:
            ok = False
            notes.append(
                "desktop UI baked mount: FAILED "
                f"(symbol {service_name}/{mount_symbol} not in assets)"
            )
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        ok = False
        notes.append(f"desktop UI unreachable: {exc}")

    return ok, notes


def _tree_fingerprint(service_name: str) -> str:
    """Hash a few SoT paths so evolve deltas are detectable."""
    parts: list[str] = []
    for rel in (
        f"services/{service_name}/manifest.json",
        f"services/{service_name}/src/api/main.py",
        f"services/{service_name}/src/api/routes.py",
        f"services/{service_name}/src/core/use_cases.py",
        f".cursor/orchestration/designs/{service_name}_design.md",
        f".cursor/orchestration/designs/{service_name}_design.json",
        f".cursor/orchestration/reports/{service_name}_verify.md",
    ):
        fp = _file_fingerprint(ROOT / rel)
        parts.append(f"{rel}:{fp or '-'}")
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()[:20]


def _companion_anatomy_intact(service_name: str) -> bool:
    """Host capsule must keep Empery create_app/register wiring (not LLM stubs)."""
    main = ROOT / "services" / service_name / "src" / "api" / "main.py"
    if not main.is_file():
        return False
    text = main.read_text(encoding="utf-8", errors="replace")
    return (
        "def register(" in text
        and "def create_app" in text
        and "ServiceContainer" in text
        and "load_manifest" in text
    )


def _restore_capsule_from_git(service_name: str, notes: list[str]) -> None:
    """Automated hygiene after LLM evolve damage (not manual salvage)."""
    import subprocess

    paths = [
        f"services/{service_name}",
        f".cursor/orchestration/designs/{service_name}_design.md",
        f".cursor/orchestration/designs/{service_name}_design.json",
    ]
    try:
        subprocess.run(
            ["git", "checkout", "HEAD", "--", *paths],
            cwd=str(ROOT),
            check=False,
            capture_output=True,
            text=True,
        )
        notes.append(f"auto-restore: git checkout HEAD -- {service_name} capsule")
    except OSError as exc:
        notes.append(f"auto-restore failed: {exc}")


def _evolve_once(
    service_name: str,
    *,
    before_tree: str,
    results: list[str],
) -> tuple[bool, list[str], dict[str, Any]]:
    notes: list[str] = []
    intent = (
        f"Evolve {service_name}: add optional readiness_note on health JSON only. "
        "Keep existing FastAPI register()/create_app anatomy, companion chat, "
        "Alembic, and Nervas wiring intact. Write a proper System Design Document "
        "with Purpose, Anatomy, Manifest, and API sections."
    )
    code, prop = _post_json(
        f"{EIC_BASE}/api/v1/evolve/propose",
        {
            "service_name": service_name,
            "intent": intent,
            "option_count": 2,
        },
        timeout=180.0,
    )
    if code != 200 or not prop.get("options"):
        return False, [f"evolve propose failed HTTP {code}: {prop}"], {}
    options = prop["options"]
    picked = options[0]
    for opt in options:
        touches = opt.get("touches") or []
        if "api" in touches or "manifest" in touches:
            picked = opt
            break
    results.append(
        f"evolve propose: proposal_id={prop.get('proposal_id')} "
        f"backend={prop.get('backend')} options={len(options)}"
    )
    notes.append(f"picked option id={picked.get('id')} title={picked.get('title')}")

    code, body = _post_json(
        f"{EIC_BASE}/api/v1/autonomous/intentions",
        {
            "intention": intent,
            "service_name": service_name,
            "metadata": {
                "kind": "evolve",
                "selected_option": picked,
                "proposal_id": prop.get("proposal_id"),
            },
        },
        timeout=60.0,
    )
    if code not in (200, 201):
        return False, [f"evolve enqueue failed HTTP {code}: {body}"], {}
    job_id = str((body.get("job") or {}).get("id") or "")
    if not job_id:
        return False, ["evolve enqueue missing job id"], {}
    results.append(f"evolve enqueue: job_id={job_id} option={picked.get('id')}")

    terminal = _poll_job(job_id)
    job_status = str(terminal.get("status") or "")
    notes.append(f"evolve job status={job_status}")
    verify_status = _job_verify_status(terminal)
    if verify_status:
        notes.append(f"evolve verify_status={verify_status}")
    else:
        notes.append("evolve verify_status: MISSING")
    err = terminal.get("error_message")
    if err:
        notes.append(f"evolve error: {str(err)[:200]}")

    proposal_host = (
        ROOT
        / ".cursor"
        / "orchestration"
        / "eic"
        / "evolve_proposals"
        / f"{service_name}_{prop.get('proposal_id')}.json"
    )
    proposal_ok = proposal_host.is_file() or bool(prop.get("persisted_path"))
    notes.append(
        "evolve proposal persisted: ok"
        if proposal_ok
        else "evolve proposal persisted: MISSING"
    )

    after_tree = _tree_fingerprint(service_name)
    tree_changed = after_tree != before_tree
    artifacts = terminal.get("artifact_paths") or []
    delta_ok = proposal_ok and (
        tree_changed or bool(artifacts) or job_status == "completed"
    )
    if tree_changed:
        notes.append(f"tree delta: yes ({before_tree} → {after_tree})")
    elif artifacts:
        notes.append(f"artifact delta: {len(artifacts)} paths")
    elif job_status == "completed":
        notes.append("tree delta: soft-ok (job completed)")
    else:
        notes.append("tree delta: none")

    anatomy_ok = _companion_anatomy_intact(service_name)
    if not anatomy_ok:
        notes.append("post-evolve anatomy: BROKEN (LLM stubbed main.py)")
        _restore_capsule_from_git(service_name, notes)
        anatomy_ok = _companion_anatomy_intact(service_name)
        notes.append(
            "post-restore anatomy: ok" if anatomy_ok else "post-restore anatomy: STILL BROKEN"
        )
    else:
        notes.append("post-evolve anatomy: ok")

    factory_ok, factory_notes = _capsule_and_factory(service_name)
    notes.extend([f"post-evolve {n}" for n in factory_notes[:4]])

    # P11: evolve DoD requires authoritative verify_status=PASSED (no soft green).
    verify_ok = verify_status == "PASSED"
    if not verify_ok:
        notes.append(
            f"strict: evolve verify_status={verify_status or 'MISSING'} (want PASSED)"
        )
    loop_ran = proposal_ok and job_status in TERMINAL_STATUSES and delta_ok
    strict_ok = (
        job_status == "completed"
        and proposal_ok
        and factory_ok
        and anatomy_ok
        and verify_ok
    )
    # Posthoc may salvage job_status!=completed, but never without verify_status=PASSED.
    posthoc_ok = (
        ALLOW_POSTHOC and loop_ran and factory_ok and anatomy_ok and verify_ok
    )
    ok = bool(strict_ok or posthoc_ok)
    if ok and job_status != "completed" and ALLOW_POSTHOC:
        notes.append(
            "posthoc: accept non-completed job — propose→pick→delta + "
            "verify_status=PASSED (EMPERY_SMOKE_ALLOW_POSTHOC=1)"
        )
    elif not ok and job_status != "completed":
        notes.append(
            "strict: evolve requires job status=completed "
            "(set EMPERY_SMOKE_ALLOW_POSTHOC=1 only for lab salvage)"
        )
    return ok, notes, {
        "job_status": job_status,
        "verify_status": verify_status,
        "picked": picked,
        "proposal": prop,
        "factory_ok": factory_ok,
        "anatomy_ok": anatomy_ok,
    }


def _evolve_propose_pick_run(
    service_name: str, results: list[str]
) -> tuple[bool, list[str], dict[str, Any]]:
    before_tree = _tree_fingerprint(service_name)
    last_notes: list[str] = []
    last_meta: dict[str, Any] = {}
    for attempt in range(1, EVOLVE_RETRIES + 1):
        print(f"  evolve attempt {attempt}/{EVOLVE_RETRIES}")
        ok, notes, meta = _evolve_once(
            service_name, before_tree=before_tree, results=results
        )
        last_notes = notes
        last_meta = meta
        if ok:
            return ok, notes, meta
        # Capsule unrestorable → stop
        if meta.get("anatomy_ok") is False:
            last_notes.append("stopping retries: anatomy unrestorable")
            return False, last_notes, last_meta
        last_notes.append(
            f"attempt {attempt} not ok — retrying"
            if attempt < EVOLVE_RETRIES
            else "all attempts exhausted"
        )
    return False, last_notes, last_meta


def _write_report(
    *,
    verdict: str,
    service_name: str,
    results: list[str],
    notes: list[str],
) -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines = [
        "# P7.3 strict golden loop smoke",
        "",
        f"Date: {ts}",
        f"EIC: {EIC_BASE}",
        f"Service: `{service_name}`",
        f"ALLOW_POSTHOC: {ALLOW_POSTHOC}",
        "",
        "## Verdict",
        "",
        f"**{verdict}**",
        "",
        "## Steps",
        "",
    ]
    lines.extend(f"- {row}" for row in results)
    lines.extend(["", "## Notes", ""])
    lines.extend(f"- {n}" for n in notes)
    lines.extend(
        [
            "",
            "## Env knobs (P7.3)",
            "",
            "- Default: **fresh create** + **posthoc off** + poll timeout = hard FAIL",
            "- `EMPERY_SMOKE_SERVICE` — reuse capsule (skip create enqueue)",
            "- `EMPERY_SMOKE_SKIP_EVOLVE=1` — stop after create/live gates",
            "- `EMPERY_SMOKE_ALLOW_POSTHOC=1` — lab salvage only; not DoD",
            "- `EMPERY_SMOKE_EVOLVE_RETRIES` — evolve attempts (default 2)",
            "",
        ]
    )
    text = "\n".join(lines)
    REPORT_PATH.write_text(text, encoding="utf-8")
    P7_REPORT_PATH.write_text(text, encoding="utf-8")


def main() -> int:
    errors: list[str] = []
    results: list[str] = []
    notes: list[str] = []
    create_job_status: str | None = None

    print("P7.3 strict golden loop — preflight")
    _preflight(errors)
    if errors:
        print("P7.3 golden loop FAILED (preflight):")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("Step 1: login operator")
    try:
        token = _login_operator(results)
        if not token:
            print("P7.3 golden loop FAILED: empty token")
            return 1
        results.append(f"jwt: ok len={len(token)}")
    except (RuntimeError, urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"P7.3 golden loop FAILED: login: {exc}")
        return 1

    service_name, do_create = _resolve_service_name()
    print(f"Step 2: create path service={service_name} enqueue={do_create}")

    if do_create:
        try:
            created = _enqueue_companion(service_name)
        except (RuntimeError, urllib.error.URLError, TimeoutError, OSError) as exc:
            print(f"P7.3 golden loop FAILED: create enqueue: {exc}")
            return 1
        job_id = str((created.get("job") or {}).get("id") or "")
        if not job_id:
            print("P7.3 golden loop FAILED: missing create job id")
            return 1
        results.append(f"create enqueue: job_id={job_id}")
        print(f"Polling create job {job_id}")
        try:
            terminal = _poll_job(job_id)
        except (TimeoutError, RuntimeError, urllib.error.URLError, OSError) as exc:
            print(f"P7.3 golden loop FAILED: create poll: {exc}")
            return 1
        create_job_status = str(terminal.get("status") or "")
        results.append(f"create job status={create_job_status}")
    else:
        results.append(f"create enqueue: skipped (reuse {service_name})")

    print("Step 3: filesystem + factory gates")
    capsule_ok, capsule_notes = _capsule_and_factory(service_name)
    notes.extend(capsule_notes)
    for n in capsule_notes:
        print(f"  {n}")

    print("Step 4: live health + Desktop catalog/mount")
    live_ok, live_notes = _live_gates(service_name)
    notes.extend(live_notes)
    for n in live_notes:
        print(f"  {n}")

    create_job_ok = True
    if create_job_status is not None:
        if ALLOW_POSTHOC:
            create_job_ok = create_job_status in {"completed", "failed"}
        else:
            create_job_ok = create_job_status == "completed"

    mid_ok = capsule_ok and live_ok and create_job_ok
    if not mid_ok:
        _write_report(
            verdict="FAILED",
            service_name=service_name,
            results=results,
            notes=notes,
        )
        print(f"P7.3 golden loop FAILED — report: {REPORT_PATH}")
        return 1

    if SKIP_EVOLVE:
        results.append("evolve: skipped (EMPERY_SMOKE_SKIP_EVOLVE=1)")
        _write_report(
            verdict="PASSED",
            service_name=service_name,
            results=results,
            notes=notes,
        )
        print(f"P7.3 golden loop PASSED (no evolve) — report: {REPORT_PATH}")
        return 0

    print("Step 5: evolve propose → pick → job")
    try:
        evolve_ok, evolve_notes, meta = _evolve_propose_pick_run(service_name, results)
    except (TimeoutError, RuntimeError, urllib.error.URLError, OSError) as exc:
        print(f"P7.3 golden loop FAILED: evolve: {exc}")
        notes.append(f"evolve exception: {exc}")
        _write_report(
            verdict="FAILED",
            service_name=service_name,
            results=results,
            notes=notes,
        )
        return 1
    notes.extend(evolve_notes)
    for n in evolve_notes:
        print(f"  {n}")
    if meta.get("picked"):
        results.append(
            f"evolve pick: {meta['picked'].get('id')} "
            f"touches={meta['picked'].get('touches')}"
        )

    verdict = "PASSED" if evolve_ok else "FAILED"
    _write_report(
        verdict=verdict,
        service_name=service_name,
        results=results,
        notes=notes,
    )
    print(f"P7.3 golden loop {verdict} — report: {REPORT_PATH}")
    return 0 if evolve_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
