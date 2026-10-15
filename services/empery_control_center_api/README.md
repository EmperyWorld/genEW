# empery_control_center_api

Empery Control Center backend — Command Gateway, file job queue, EventBus→WebSocket streamer, registry/audit state provider.

## Run

```bash
# From repo root
uvicorn services.empery_control_center_api.src.api.main:create_app --factory --host 0.0.0.0 --port 8006
```

Env knobs: `ECC_API_HOST`, `ECC_API_PORT` (default `8006`), `ECC_ORCHESTRATION_ROOT`, `ECC_EVENT_SUBSCRIBE_TOPICS`, `ECC_MAX_AUDIT_LINES`, `ECC_JOB_CLAIM_TTL_SECONDS`, `LOG_LEVEL`.

## Tests

```bash
pytest services/empery_control_center_api/tests -q
```

## FE endpoint paths (`/api/v1`)

| Method | Path |
|--------|------|
| GET | `/health` |
| GET | `/health/services` |
| POST | `/commands` |
| POST | `/commands/plan` \| `/implement` \| `/verify` \| `/evolve` |
| GET | `/jobs` |
| GET | `/jobs/{id}` |
| POST | `/jobs/{id}/claim` |
| PATCH | `/jobs/{id}` |
| POST | `/jobs/{id}/cancel` |
| GET | `/registry` |
| POST | `/registry/refresh` |
| GET | `/audit` |
| GET | `/orchestration/paths` |
| WS | `/ws/events` |

Defaults for UI: `http://localhost:8006`, `ws://localhost:8006/api/v1/ws/events`.

**Note:** Agents are not spawned in-process. Production path = enqueue (`mode=agent`) → EIC Hands / Autonomous. Cursor claim is salvage only (`EMPERY_CURSOR_SALVAGE=1`). The former `run-demo` stub runner is removed.
