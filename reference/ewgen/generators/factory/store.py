"""
Redis-backed durable store for FactoryRun state and event logs.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from .state import FactoryRunEvent, FactoryRunRecord, FactoryRunStage, utc_now_iso

logger = logging.getLogger(__name__)

DEFAULT_KEY_PREFIX = "factory:run"
DEFAULT_RUN_TTL_SECONDS = int(os.getenv("EWGEN_FACTORY_RUN_TTL", "604800"))
DEFAULT_MAX_RETRIES = int(os.getenv("EWGEN_FACTORY_MAX_RETRIES", "3"))
REDIS_CONNECT_TIMEOUT = float(os.getenv("EWGEN_REDIS_CONNECT_TIMEOUT", "2.0"))

CREATE_RUN_LUA = """
local status_key = KEYS[1]
local record_key = KEYS[2]
local events_key = KEYS[3]
local status = ARGV[1]
local record_json = ARGV[2]
local event_json = ARGV[3]
local ttl = tonumber(ARGV[4])

if redis.call('EXISTS', status_key) == 1 then
  return {0, 'ALREADY_EXISTS'}
end

redis.call('SET', status_key, status)
redis.call('SET', record_key, record_json)
redis.call('RPUSH', events_key, event_json)
if ttl > 0 then
  redis.call('EXPIRE', status_key, ttl)
  redis.call('EXPIRE', record_key, ttl)
  redis.call('EXPIRE', events_key, ttl)
end
return {1, status}
"""

TRANSITION_RUN_LUA = """
local status_key = KEYS[1]
local record_key = KEYS[2]
local events_key = KEYS[3]
local expected_status = ARGV[1]
local new_status = ARGV[2]
local record_json = ARGV[3]
local event_json = ARGV[4]
local ttl = tonumber(ARGV[5])

local current = redis.call('GET', status_key)
if current == false then
  return {0, 'NOT_FOUND', ''}
end
if current ~= expected_status then
  return {0, 'INVALID_TRANSITION', current}
end

redis.call('SET', status_key, new_status)
redis.call('SET', record_key, record_json)
redis.call('RPUSH', events_key, event_json)
if ttl > 0 then
  redis.call('EXPIRE', status_key, ttl)
  redis.call('EXPIRE', record_key, ttl)
  redis.call('EXPIRE', events_key, ttl)
end
return {1, new_status, current}
"""


class FactoryStoreError(Exception):
    """Factory persistence layer failure."""


class FactoryRunNotFoundError(FactoryStoreError):
    """Run id does not exist in the store."""


class FactoryTransitionError(FactoryStoreError):
    """Illegal or concurrent stage transition."""

    def __init__(self, message: str, *, current_status: Optional[str] = None):
        super().__init__(message)
        self.current_status = current_status


def _get_redis_url() -> str:
    return os.getenv("EWGEN_REDIS_URL", "").strip()


def _get_key_prefix() -> str:
    return os.getenv("EWGEN_FACTORY_KEY_PREFIX", DEFAULT_KEY_PREFIX).strip(
        ":"
    )


class FactoryRunStore:
    """Durable FactoryRun persistence with atomic stage transitions."""

    def __init__(
        self,
        client: Any,
        *,
        key_prefix: str = DEFAULT_KEY_PREFIX,
        run_ttl_seconds: int = DEFAULT_RUN_TTL_SECONDS,
    ):
        self._client = client
        self._key_prefix = key_prefix
        self._run_ttl_seconds = run_ttl_seconds
        self._create_script = client.register_script(CREATE_RUN_LUA)
        self._transition_script = client.register_script(TRANSITION_RUN_LUA)

    def _status_key(self, run_id: str) -> str:
        return f"{self._key_prefix}:{run_id}:status"

    def _record_key(self, run_id: str) -> str:
        return f"{self._key_prefix}:{run_id}:record"

    def _events_key(self, run_id: str) -> str:
        return f"{self._key_prefix}:{run_id}:events"

    def ping(self) -> bool:
        try:
            return bool(self._client.ping())
        except Exception:
            return False

    def create_run(self, record: FactoryRunRecord, event: FactoryRunEvent) -> None:
        result = self._create_script(
            keys=[
                self._status_key(record.run_id),
                self._record_key(record.run_id),
                self._events_key(record.run_id),
            ],
            args=[
                record.status.value,
                record.model_dump_json(),
                event.model_dump_json(),
                str(self._run_ttl_seconds),
            ],
        )
        ok = int(result[0])
        if ok != 1:
            code = str(result[1]) if len(result) > 1 else "UNKNOWN"
            raise FactoryStoreError(f"Failed to create factory run: {code}")

    def get_status(self, run_id: str) -> Optional[str]:
        return self._client.get(self._status_key(run_id))

    def get_record(self, run_id: str) -> Optional[FactoryRunRecord]:
        raw = self._client.get(self._record_key(run_id))
        if not raw:
            return None
        return FactoryRunRecord.model_validate_json(raw)

    def get_events(self, run_id: str) -> List[FactoryRunEvent]:
        raw_events = self._client.lrange(self._events_key(run_id), 0, -1)
        events: List[FactoryRunEvent] = []
        for raw in raw_events:
            events.append(FactoryRunEvent.model_validate_json(raw))
        return events

    def transition_run(
        self,
        run_id: str,
        *,
        expected_status: FactoryRunStage,
        new_status: FactoryRunStage,
        record: FactoryRunRecord,
        event: FactoryRunEvent,
    ) -> None:
        result = self._transition_script(
            keys=[
                self._status_key(run_id),
                self._record_key(run_id),
                self._events_key(run_id),
            ],
            args=[
                expected_status.value,
                new_status.value,
                record.model_dump_json(),
                event.model_dump_json(),
                str(self._run_ttl_seconds),
            ],
        )
        ok = int(result[0])
        if ok == 1:
            return
        code = str(result[1]) if len(result) > 1 else "UNKNOWN"
        current = str(result[2]) if len(result) > 2 else None
        if code == "NOT_FOUND":
            raise FactoryRunNotFoundError(f"Factory run not found: {run_id}")
        if code == "INVALID_TRANSITION":
            raise FactoryTransitionError(
                (
                    f"Cannot transition run {run_id} from "
                    f"{expected_status.value} to {new_status.value}; "
                    f"current status is {current}"
                ),
                current_status=current,
            )
        raise FactoryStoreError(f"Transition failed: {code}")

    def append_event(self, run_id: str, event: FactoryRunEvent) -> None:
        if not self._client.exists(self._status_key(run_id)):
            raise FactoryRunNotFoundError(f"Factory run not found: {run_id}")
        self._client.rpush(self._events_key(run_id), event.model_dump_json())
        if self._run_ttl_seconds > 0:
            self._client.expire(self._events_key(run_id), self._run_ttl_seconds)

    def patch_record(self, run_id: str, record: FactoryRunRecord) -> None:
        """Update run snapshot without changing status (retry metadata, spec)."""
        current_status = self.get_status(run_id)
        if current_status is None:
            raise FactoryRunNotFoundError(f"Factory run not found: {run_id}")
        if record.status.value != current_status:
            raise FactoryTransitionError(
                (
                    f"Record status {record.status.value} does not match "
                    f"store status {current_status}"
                ),
                current_status=current_status,
            )
        self._client.set(self._record_key(run_id), record.model_dump_json())
        if self._run_ttl_seconds > 0:
            self._client.expire(self._record_key(run_id), self._run_ttl_seconds)


_store_instance: Optional[FactoryRunStore] = None


def get_factory_run_store(*, force_new: bool = False) -> FactoryRunStore:
    """Return shared Redis-backed factory store (requires EWGEN_REDIS_URL)."""
    global _store_instance
    if _store_instance is not None and not force_new:
        return _store_instance

    redis_url = _get_redis_url()
    if not redis_url:
        raise FactoryStoreError(
            "EWGEN_REDIS_URL is not configured; factory runs require Redis"
        )

    try:
        import redis
    except ImportError as exc:
        raise FactoryStoreError(
            "redis package is required for factory run persistence"
        ) from exc

    client = redis.Redis.from_url(
        redis_url,
        decode_responses=True,
        socket_connect_timeout=REDIS_CONNECT_TIMEOUT,
        socket_timeout=REDIS_CONNECT_TIMEOUT,
        health_check_interval=30,
    )
    if not client.ping():
        raise FactoryStoreError("Redis ping failed for factory run store")

    prefix = _get_key_prefix()
    store = FactoryRunStore(client, key_prefix=prefix)
    _store_instance = store
    return store


def build_run_record(
    run_id: str,
    spec: "ComponentSpec",
    *,
    status: FactoryRunStage = FactoryRunStage.INTAKE,
    error: Optional[str] = None,
    max_retries: Optional[int] = None,
) -> FactoryRunRecord:
    from .spec import ComponentSpec  # noqa: PLC0415

    if not isinstance(spec, ComponentSpec):
        raise TypeError("spec must be a ComponentSpec instance")

    now = utc_now_iso()
    return FactoryRunRecord(
        run_id=run_id,
        status=status,
        spec=spec,
        created_at=now,
        updated_at=now,
        error=error,
        retry_count=0,
        max_retries=max_retries if max_retries is not None else DEFAULT_MAX_RETRIES,
    )
