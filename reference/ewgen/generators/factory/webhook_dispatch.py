"""
Optional webhook callback when async pipeline runs reach terminal state.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

DEFAULT_WEBHOOK_TIMEOUT_SECONDS = 10.0


def dispatch_pipeline_webhook(
    webhook_url: str,
    *,
    run_id: str,
    status: str,
    deployment_success: bool,
    error: Optional[str] = None,
    module_id: Optional[str] = None,
    obligations: Optional[Dict[str, Any]] = None,
) -> None:
    """POST terminal pipeline snapshot to operator webhook (best-effort)."""
    payload = {
        "run_id": run_id,
        "status": status,
        "deployment_success": deployment_success,
        "error": error,
        "module_id": module_id,
        "obligations": obligations,
    }
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        webhook_url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=DEFAULT_WEBHOOK_TIMEOUT_SECONDS) as response:
            logger.info(
                "[factory-webhook] delivered run_id=%s http=%s",
                run_id,
                response.status,
            )
    except urllib.error.URLError as error:
        logger.warning(
            "[factory-webhook] delivery_failed run_id=%s error=%s",
            run_id,
            error,
        )
