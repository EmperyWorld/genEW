"""Registry-driven HTTP health probes for peer services (no hardcoded service list)."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import httpx

from core.logging import log_event
from services.empery_control_center_api.src.core.contracts import RegistrySnapshotPort
from services.empery_control_center_api.src.data.schemas import (
    ServiceHealthItem,
    ServiceHealthListResponse,
)
from services.empery_control_center_api.src.integration.health_history import (
    HealthHistoryBuffer,
)

HealthLiteral = Literal["ok", "degraded", "down", "unknown"]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def map_remote_status(payload: object, http_status: int) -> HealthLiteral:
    """Normalize peer /health JSON (or status code) into FE HealthStatus."""
    if http_status >= 500:
        return "down"
    if http_status >= 400:
        return "degraded"
    if not isinstance(payload, dict):
        return "ok" if 200 <= http_status < 300 else "unknown"
    raw = payload.get("status")
    if raw is None:
        return "ok"
    normalized = str(raw).strip().lower()
    if normalized in {"ok", "healthy", "up"}:
        return "ok"
    if normalized in {"degraded", "warning"}:
        return "degraded"
    if normalized in {"down", "unhealthy", "error", "critical"}:
        return "down"
    if normalized == "unknown":
        return "unknown"
    return "ok"


def _resolve_path(path: Path) -> Path:
    """Prefer existing path; fall back to /app-prefixed when running in compose."""
    if path.is_file():
        return path
    alt = Path("/app") / path
    return alt if alt.is_file() else path


def _load_flat_health_bases(path: Path) -> dict[str, str]:
    path = _resolve_path(path)
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in raw.items():
        name = str(key).strip()
        base = str(value).strip().rstrip("/")
        if name and base:
            out[name] = base
    return out


def _load_peer_matrix_health_bases(path: Path) -> dict[str, str]:
    """Extract health_base/api_base from peer_env_matrix.json or live_peers.json."""
    path = _resolve_path(path)
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    peers = raw.get("peers") if isinstance(raw, dict) else None
    if not isinstance(peers, dict):
        return {}
    out: dict[str, str] = {}
    for name, entry in peers.items():
        if not isinstance(entry, dict):
            continue
        base = entry.get("health_base") or entry.get("api_base")
        if not base:
            port = entry.get("port")
            if port is not None:
                try:
                    base = f"http://{name}:{int(port)}"
                except (TypeError, ValueError):
                    base = None
        if isinstance(base, str) and base.strip():
            out[str(name).strip()] = base.strip().rstrip("/")
    return out


def _load_compose_reflex_health_bases(path: Path) -> dict[str, str]:
    """Derive http://{service}:{port} from Hands compose.reflex SERVICE_PORT blocks."""
    path = _resolve_path(path)
    if not path.is_file():
        return {}
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return {}
    out: dict[str, str] = {}
    # Block-wise parse: service key then SERVICE_PORT inside the block.
    blocks = re.split(r"\n(?=  [a-z][a-z0-9_]*:)", text)
    for block in blocks:
        name_m = re.match(r"  ([a-z][a-z0-9_]*):", block)
        if not name_m:
            name_m = re.match(r"^([a-z][a-z0-9_]*):", block.strip())
            if not name_m:
                continue
            name = name_m.group(1)
        else:
            name = name_m.group(1)
        if name in {"services", "networks", "volumes", "x-python", "x-env"}:
            continue
        port_m = re.search(r'SERVICE_PORT:\s*"(\d+)"', block)
        if not port_m:
            continue
        out[name] = f"http://{name}:{port_m.group(1)}"
    return out


class ServiceHealthProber:
    """Probe ``GET {base}/api/v1/health`` for each registered service with a base URL."""

    def __init__(
        self,
        registry: RegistrySnapshotPort,
        *,
        service_bases: dict[str, str],
        timeout_ms: int = 2000,
        cache_ttl_ms: int = 4000,
        self_service_name: str = "empery_control_center_api",
        logger: logging.Logger | None = None,
        dynamic_bases_path: str | Path | None = None,
        orchestration_root: str | Path | None = None,
        history: HealthHistoryBuffer | None = None,
    ) -> None:
        self._registry = registry
        self._static_bases = {k: v.rstrip("/") for k, v in service_bases.items() if v}
        self._dynamic_bases: dict[str, str] = {}
        self._timeout = max(timeout_ms, 100) / 1000.0
        self._cache_ttl_s = max(cache_ttl_ms, 0) / 1000.0
        self._self_name = self_service_name
        self._logger = logger
        self._history = history or HealthHistoryBuffer()
        orch = Path(orchestration_root) if orchestration_root else Path(
            ".cursor/orchestration"
        )
        self._orchestration_root = orch
        self._dynamic_bases_path = (
            Path(dynamic_bases_path)
            if dynamic_bases_path
            else orch / "eic" / "dynamic_health_bases.json"
        )
        self._cached: ServiceHealthListResponse | None = None
        self._cached_mono: float = 0.0
        self._cached_local: HealthLiteral | None = None
        self._lock = asyncio.Lock()
        self.reload_dynamic_bases()

    def reload_dynamic_bases(self) -> None:
        """Merge Hands health bases from orchestration artifacts (hot path).

        Priority (later wins): compose.reflex → live_peers → peer_env_matrix →
        dynamic_health_bases.json. Static ECC_SERVICE_HEALTH_BASES stay lowest
        and are applied in ``_merged_bases``.
        """
        eic = self._orchestration_root / "eic"
        merged: dict[str, str] = {}
        merged.update(
            _load_compose_reflex_health_bases(eic / "compose.reflex.yml")
        )
        # Root mirror used by some host tooling.
        merged.update(
            _load_compose_reflex_health_bases(
                Path("compose.reflex.yml")
            )
        )
        merged.update(_load_peer_matrix_health_bases(eic / "live_peers.json"))
        merged.update(_load_peer_matrix_health_bases(eic / "peer_env_matrix.json"))
        merged.update(_load_flat_health_bases(self._dynamic_bases_path))
        self._dynamic_bases = merged

    def _merged_bases(self) -> dict[str, str]:
        merged = dict(self._static_bases)
        merged.update(self._dynamic_bases)
        return merged

    def _cache_fresh(self, local_status: HealthLiteral) -> ServiceHealthListResponse | None:
        if self._cache_ttl_s <= 0 or self._cached is None:
            return None
        if self._cached_local != local_status:
            return None
        if (time.monotonic() - self._cached_mono) > self._cache_ttl_s:
            return None
        return self._cached

    async def probe_all(
        self,
        *,
        local_status: HealthLiteral = "ok",
        force: bool = False,
    ) -> ServiceHealthListResponse:
        """Return batch health; short TTL + lock coalesce concurrent UI clients."""
        if not force:
            hit = self._cache_fresh(local_status)
            if hit is not None:
                return hit
        async with self._lock:
            if not force:
                hit = self._cache_fresh(local_status)
                if hit is not None:
                    return hit
            result = await self._probe_all_uncached(local_status=local_status)
            self._cached = result
            self._cached_mono = time.monotonic()
            self._cached_local = local_status
            return result

    async def _probe_all_uncached(
        self,
        *,
        local_status: HealthLiteral,
    ) -> ServiceHealthListResponse:
        self.reload_dynamic_bases()
        snapshot = self._registry.snapshot()
        checked_at = _utc_now()
        if not snapshot.services:
            return ServiceHealthListResponse(services=[])

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            tasks = [
                self._probe_one(
                    client,
                    name=entry.name,
                    local_status=local_status,
                    checked_at=checked_at,
                )
                for entry in snapshot.services
            ]
            items = list(await asyncio.gather(*tasks))
        return self._aggregate(items, checked_at=checked_at)

    def _aggregate(
        self, items: list[ServiceHealthItem], *, checked_at: datetime
    ) -> ServiceHealthListResponse:
        ok_count = sum(1 for i in items if i.health == "ok")
        degraded_count = sum(1 for i in items if i.health == "degraded")
        down_count = sum(1 for i in items if i.health == "down")
        unknown_count = sum(1 for i in items if i.health == "unknown")
        alert = degraded_count > 0 or down_count > 0
        if alert and self._logger is not None:
            bad = [
                {"name": i.name, "health": i.health}
                for i in items
                if i.health in {"degraded", "down"}
            ]
            log_event(
                self._logger,
                event="ecc.health.services_alert",
                message=(
                    f"Service health alert: degraded={degraded_count} "
                    f"down={down_count} unknown={unknown_count}"
                ),
                level=logging.WARNING,
                degraded_count=degraded_count,
                down_count=down_count,
                unknown_count=unknown_count,
                ok_count=ok_count,
                non_ok=bad,
            )
        self._history.record(
            items,
            checked_at=checked_at,
            ok_count=ok_count,
            degraded_count=degraded_count,
            down_count=down_count,
            unknown_count=unknown_count,
            alert=alert,
        )
        return ServiceHealthListResponse(
            services=items,
            ok_count=ok_count,
            degraded_count=degraded_count,
            down_count=down_count,
            unknown_count=unknown_count,
            alert=alert,
            history=self._history.history(),
            recent_changes=self._history.recent_changes(),
        )

    async def _probe_one(
        self,
        client: httpx.AsyncClient,
        *,
        name: str,
        local_status: HealthLiteral,
        checked_at: datetime,
    ) -> ServiceHealthItem:
        if name == self._self_name:
            return ServiceHealthItem(
                name=name, health=local_status, checked_at=checked_at
            )

        base = self._merged_bases().get(name)
        if not base:
            return ServiceHealthItem(
                name=name, health="unknown", checked_at=checked_at
            )

        url = f"{base}/api/v1/health"
        try:
            response = await client.get(url)
            try:
                payload: object = response.json()
            except Exception:
                payload = None
            health = map_remote_status(payload, response.status_code)
        except httpx.TimeoutException:
            health = "degraded"
        except httpx.HTTPError:
            health = "down"
        except Exception:
            health = "unknown"
            if self._logger is not None:
                self._logger.debug("health probe failed for %s", name, exc_info=True)

        return ServiceHealthItem(name=name, health=health, checked_at=checked_at)
