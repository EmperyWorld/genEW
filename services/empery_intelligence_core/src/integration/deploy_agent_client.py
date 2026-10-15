"""HTTP client for empery_deploy_agent (in-loop compose, no host crutches)."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

from core.logging import log_event


class DeployAgentClient:
    """Call allowlisted deploy-agent endpoints; fail closed on errors."""

    def __init__(
        self,
        base_url: str,
        logger: logging.Logger,
        *,
        timeout_s: float = 120.0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._logger = logger
        self._timeout_s = timeout_s

    @property
    def configured(self) -> bool:
        return bool(self._base)

    def deploy(
        self,
        service_name: str,
        *,
        action: str = "up",
        health_url: str | None = None,
    ) -> dict[str, Any]:
        if not self._base:
            return {
                "ok": False,
                "error": "EIC_DEPLOY_AGENT_URL unset",
                "service_name": service_name,
            }
        payload: dict[str, Any] = {
            "service_name": service_name,
            "action": action,
        }
        if health_url:
            payload["health_url"] = health_url
        url = f"{self._base}/api/v1/deploy"
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        log_event(
            self._logger,
            event="eic.deploy_agent.request",
            message="Requesting in-loop deploy",
            url=url,
            service_name=service_name,
            action=action,
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout_s) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                data = json.loads(raw) if raw else {}
                if not isinstance(data, dict):
                    return {"ok": False, "error": "invalid_deploy_agent_response"}
                data.setdefault("ok", False)
                return data
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:2000]
            return {
                "ok": False,
                "error": f"deploy_agent_http_{exc.code}",
                "output": detail,
                "service_name": service_name,
            }
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            return {
                "ok": False,
                "error": f"deploy_agent_unreachable: {exc}",
                "service_name": service_name,
            }

    def health(self) -> dict[str, Any]:
        if not self._base:
            return {"ok": False, "error": "EIC_DEPLOY_AGENT_URL unset"}
        url = f"{self._base}/api/v1/health"
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                data = json.loads(raw) if raw else {}
                return {"ok": data.get("status") == "ok", **data}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}
