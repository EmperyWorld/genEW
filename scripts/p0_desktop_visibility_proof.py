#!/usr/bin/env python3
"""Live P0.2/P0.3 visibility proof against a running Empery stack.

P4.1: launch catalog excludes probe apps. Proof uses a product companion (ai_chat).

Checks (fail closed):
1. desktop_shell bootstrap lists ai_chat (product launch path)
2. Probe apps (recipe_probe_svc, unnamed_service) are NOT in launch catalog
3. ai_chat mount on disk is not a scaffold stub
4. refresh_desktop_ui uses deploy-agent action=up and succeeds
5. Desktop UI HTTP healthz responds
6. Baked Desktop assets include the product mount symbol after refresh

Usage (from repo root, stack up):
  python3 scripts/p0_desktop_visibility_proof.py
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEPLOY = "http://127.0.0.1:8010"
SHELL = "http://127.0.0.1:8020"
DESKTOP_UI = "http://127.0.0.1:5174"
SERVICE = "ai_chat"
PROBE_EXCLUDED = ("recipe_probe_svc", "unnamed_service")


def _get(url: str, timeout: float = 30.0) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def _post_json(url: str, payload: dict, timeout: float = 600.0) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw) if raw else {}


def main() -> int:
    sys.path.insert(0, str(ROOT))
    from core.logging import configure_logging
    from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
        refresh_desktop_ui,
        verify_service_desktop,
    )

    errors: list[str] = []

    mount = ROOT / "apps/empery_desktop/src/shell/mounts" / f"{SERVICE}.tsx"
    if not mount.is_file():
        # Companion may live under atoms — accept registry presence via verify.
        alt = ROOT / "apps/empery_desktop/src/shell/mounts" / "ewa_companion.tsx"
        if not alt.is_file():
            errors.append(f"missing mount for {SERVICE} and ewa_companion fallback")
    else:
        text = mount.read_text(encoding="utf-8")
        if "Scaffolded desktop mount" in text:
            errors.append("mount still contains scaffold stub phrase")

    status, detail = verify_service_desktop(ROOT, SERVICE)
    if status != "PASSED":
        errors.append(f"verify_service_desktop={status}: {detail}")

    try:
        code, raw = _get(f"{SHELL}/api/v1/shell-bootstrap", timeout=10)
        boot = json.loads(raw)
        apps = {
            i.get("app_component")
            for i in boot.get("items", [])
            if isinstance(i, dict)
        }
        catalog_ids = {
            c.get("app_id")
            for c in boot.get("catalog", [])
            if isinstance(c, dict)
        }
        if SERVICE not in apps and SERVICE not in catalog_ids:
            errors.append(
                f"desktop_shell bootstrap missing {SERVICE}; "
                f"items={sorted(a for a in apps if a is not None)} "
                f"catalog={sorted(c for c in catalog_ids if c is not None)}"
            )
        for probe in PROBE_EXCLUDED:
            if probe in apps or probe in catalog_ids:
                errors.append(
                    f"P4.1 hygiene fail: probe {probe} still in launch catalog/items"
                )
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        errors.append(f"desktop_shell bootstrap failed: {exc}")

    logger = configure_logging("p0_visibility_proof")
    refresh = refresh_desktop_ui(
        deploy_agent_url=DEPLOY,
        logger=logger,
        timeout_s=900.0,
        required=True,
    )
    if not refresh.get("ok"):
        errors.append(f"refresh_desktop_ui failed: {refresh}")

    try:
        code, body = _get(f"{DESKTOP_UI}/healthz", timeout=10)
        if code != 200:
            errors.append(f"desktop UI healthz HTTP {code}")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        errors.append(f"desktop UI healthz failed: {exc}")

    try:
        _, index = _get(f"{DESKTOP_UI}/", timeout=10)
        asset_urls: list[str] = []
        for part in index.split('src="')[1:]:
            src = part.split('"', 1)[0]
            if src.startswith("/"):
                asset_urls.append(f"{DESKTOP_UI}{src}")
            elif src.startswith("http"):
                asset_urls.append(src)
        found = False
        needles = ("AiChat", "ai_chat", "ewa_companion", "EwaCompanion")
        for url in asset_urls[:8]:
            try:
                _, js = _get(url, timeout=30)
            except (urllib.error.URLError, TimeoutError, OSError):
                continue
            if any(n in js for n in needles):
                found = True
                break
        if not found:
            errors.append(
                f"baked Desktop assets missing product companion markers "
                f"{needles!r} (checked {len(asset_urls)} script tags)"
            )
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        errors.append(f"desktop UI asset scan failed: {exc}")

    from tempfile import TemporaryDirectory

    from services.empery_intelligence_core.src.integration.service_scaffold import (
        ServiceScaffoldAction,
    )

    with TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
        action = ServiceScaffoldAction(tmp_path, logger)
        action.scaffold(
            "p0_companion_proof",
            features=["health"],
            domain_hint="companion chat",
            scaffold_profile="companion_chat",
        )
        st, det = verify_service_desktop(tmp_path, "p0_companion_proof")
        if st != "PASSED":
            errors.append(f"companion desktop verify failed: {det}")
        mount_c = (
            tmp_path
            / "apps/empery_desktop/src/shell/mounts/p0_companion_proof.tsx"
        ).read_text(encoding="utf-8")
        if "Scaffolded desktop mount" in mount_c:
            errors.append("companion mount unexpectedly stub")
        if "/api/v1/messages" not in mount_c:
            errors.append("companion mount missing messages peer API")

    if errors:
        print("P0 visibility proof FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("P0 visibility proof PASSED")
    print(f"  deploy refresh ok={refresh.get('ok')}")
    print(f"  desktop_shell has {SERVICE}; probes excluded")
    print("  desktop UI healthz ok; baked mount present")
    print("  companion profile filesystem verify PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
