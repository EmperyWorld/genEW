# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# BankEvent publish — Redis list + optional RabbitMQ; file fallback journal.
# Invariants:
# - Never blocks atomize on broker failure (journal to data/bank-events.jsonl).
# - Never reconfigures Stable Core Postgres; brokers are client-only.
# - Vectors optional via EWGEN_ASE_VECTOR_UPSERT=1 hook stub.
# Related:
# - documentation/platform/EWGEN-AUTONOMOUS-SYNTHESIS-ENGINE.md Stage 22
# - generators/bank/consumer.py
# ---

"""Bank event bus for ASE feedback loop."""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("ewgen.bank.events")

PROTOCOL = "ewgen_bank_event_v1"
REDIS_KEY = os.getenv("EWGEN_BANK_EVENTS_REDIS_KEY", "ewgen:bank:events")
JOURNAL_NAME = "bank-events.jsonl"

EVENT_ATOM_UPSERTED = "atom_upserted"
EVENT_ATOM_RETIRED = "atom_retired"
EVENT_STRENGTH_CHANGED = "strength_changed"

KNOWN_EVENT_TYPES = frozenset(
    {
        EVENT_ATOM_UPSERTED,
        EVENT_ATOM_RETIRED,
        EVENT_STRENGTH_CHANGED,
        "project_instance_ready",
    }
)


def _data_dir() -> Path:
    root = Path(
        os.getenv("EWGEN_DATA_DIR")
        or Path(__file__).resolve().parents[2] / "data"
    )
    root.mkdir(parents=True, exist_ok=True)
    return root


def _journal_append(event: Dict[str, Any]) -> None:
    path = _data_dir() / JOURNAL_NAME
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")


def _redis_publish(event: Dict[str, Any]) -> bool:
    url = os.getenv("EWGEN_REDIS_URL") or os.getenv("REDIS_URL")
    if not url:
        return False
    try:
        import redis  # type: ignore

        client = redis.Redis.from_url(url)
        client.lpush(REDIS_KEY, json.dumps(event, sort_keys=True))
        client.ltrim(REDIS_KEY, 0, 9999)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.debug("[STEP] bank_event_redis_skip err=%s", exc)
        return False


def _rabbit_publish(event: Dict[str, Any]) -> bool:
    url = os.getenv("EWGEN_AMQP_URL") or os.getenv("RABBITMQ_URL")
    if not url:
        return False
    try:
        import pika  # type: ignore
    except ImportError as exc:
        logger.debug("[STEP] bank_event_amqp_skip err=%s", exc)
        return False

    try:
        params = pika.URLParameters(url)
        conn = pika.BlockingConnection(params)
        ch = conn.channel()
        queue = os.getenv("EWGEN_BANK_EVENTS_QUEUE", "ewgen.bank.events")
        ch.queue_declare(queue=queue, durable=True)
        ch.basic_publish(
            exchange="",
            routing_key=queue,
            body=json.dumps(event, sort_keys=True).encode("utf-8"),
        )
        conn.close()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.debug("[STEP] bank_event_amqp_skip err=%s", exc)
        return False


def _vector_upsert_stub(event: Dict[str, Any]) -> None:
    if os.getenv("EWGEN_ASE_VECTOR_UPSERT", "0") not in {"1", "true", "on"}:
        return
    stub = _data_dir() / "vector-upsert-journal.jsonl"
    with stub.open("a", encoding="utf-8") as handle:
        handle.write(
            json.dumps(
                {
                    "ts": time.time(),
                    "atom_id": event.get("atom_id"),
                    "capabilities": event.get("capabilities"),
                },
                sort_keys=True,
            )
            + "\n"
        )


def publish_bank_event(
    event: Dict[str, Any],
    *,
    sync_reeval: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Publish BankEvent to journal + optional Redis/RabbitMQ.

    ``sync_reeval`` defaults to True unless ``EWGEN_BANK_SYNC_REEVAL=0``
    (when a background consumer owns reeval).
    """
    payload = {
        "schemaVersion": PROTOCOL,
        "ts": time.time(),
        **event,
    }
    etype = str(payload.get("type") or "")
    if etype and etype not in KNOWN_EVENT_TYPES:
        logger.debug("[STEP] bank_event_unknown_type type=%s", etype)

    channels: List[str] = ["journal"]
    _journal_append(payload)
    if _redis_publish(payload):
        channels.append("redis")
    if _rabbit_publish(payload):
        channels.append("rabbitmq")
    try:
        _vector_upsert_stub(payload)
    except Exception as exc:  # noqa: BLE001
        logger.debug("[STEP] bank_event_vector_skip err=%s", exc)

    if sync_reeval is None:
        flag = os.getenv("EWGEN_BANK_SYNC_REEVAL", "1").strip().lower()
        sync_reeval = flag not in {"0", "false", "off", "no"}
    if sync_reeval:
        try:
            from generators.synthesis.reeval import on_bank_event

            on_bank_event(payload)
        except Exception as exc:  # noqa: BLE001
            logger.debug("[STEP] bank_event_reeval_skip err=%s", exc)

    return {"ok": True, "channels": channels, "event": payload}


def publish_atom_upserted(
    atom_id: str,
    *,
    capabilities: Optional[List[str]] = None,
    source_ref: str = "",
    strength_delta: Optional[float] = None,
    **extra: Any,
) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "type": EVENT_ATOM_UPSERTED,
        "atom_id": atom_id,
        "capabilities": list(capabilities or []),
        "sourceRef": source_ref,
    }
    if strength_delta is not None:
        body["strength_delta"] = strength_delta
    body.update(extra)
    return publish_bank_event(body)


def publish_atom_retired(
    atom_id: str,
    *,
    source_ref: str = "",
    **extra: Any,
) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "type": EVENT_ATOM_RETIRED,
        "atom_id": atom_id,
        "capabilities": [],
        "sourceRef": source_ref,
    }
    body.update(extra)
    return publish_bank_event(body)


def publish_strength_changed(
    atom_id: str,
    *,
    overall: float,
    capabilities: Optional[List[str]] = None,
    source_ref: str = "strength_core",
    **extra: Any,
) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "type": EVENT_STRENGTH_CHANGED,
        "atom_id": atom_id,
        "capabilities": list(capabilities or []),
        "strength_delta": overall,
        "sourceRef": source_ref,
    }
    body.update(extra)
    return publish_bank_event(body)


def recent_events(limit: int = 50) -> List[Dict[str, Any]]:
    path = _data_dir() / JOURNAL_NAME
    if not path.is_file():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    out: List[Dict[str, Any]] = []
    for line in lines[-limit:]:
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out
