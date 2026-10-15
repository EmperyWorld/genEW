# Recipe: service_anatomy

## Goal

Every new functional unit is a Standalone Module with honest Empery anatomy. Unregistered service does not exist.

## Mandatory layout

```
services/{service_name}/
  src/api/          # FastAPI routers, lifespan, register()
  src/core/         # Domain models, use cases, ports
  src/data/         # Repositories, schemas (no ORM in core use cases)
  src/integration/  # HTTP peers, AI, DB adapters
  tests/
  manifest.json     # Source of truth (dependencies, publishes, subscribes)
  config.py
  alembic/          # If the service owns persistent state
```

## Laws

1. No business logic in `api/` beyond wiring.
2. Pydantic V2 on public boundaries; domain entities immutable in logic.
3. DI via `ServiceContainer` — never hardcode peer implementations.
4. EventBus: Redis in runtime; `EVENT_BUS_ALLOW_IN_MEMORY` tests only.
5. DB: namespaced `database_manager:{service_name}`; `AUTO_CREATE_TABLES=false` in compose/prod.
6. Errors: boundary → StandardizedErrorResponse; internally `ServiceError`.
7. Security: non-root uid 1000; secrets via env; no FakeAI/demo on default path.
8. Discover: `register(registry)` + `manifest.json` hot discovery.

## Assembly steps

1. Scaffold via create-service / `service_scaffold` — do not invent a parallel layout.
2. Fill `manifest.json` honestly; empty features = incomplete.
3. Implement health `GET /api/v1/health`.
4. Wire compose overlay (`deploy/services/{name}.yml` or compose.reflex) + ECC health base when deployed.
5. Attach UI surface per `desktop_mount_catalog` / ECC UI rules — map alone ≠ done.

## Quick FAIL

Missing anatomy, dishonest manifest, cross-service internals import, bare `database_manager`, FakeAI in `src/`, in-memory EventBus in runtime, unregistered module.
