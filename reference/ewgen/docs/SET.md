# SET — Runtime Platform

**SET** (Suite Empery Toolkit) — четвёртый трек EWGen: живой fullstack-проект в Podman с инвентарём модулей.

Связанные треки: [Warsmith](./WARSMITH.md), [Fortune Seaker](./FORTUNE_SEAKER.md), [Scavenger](./SCAVENGER.md).

**Стандарт подключения модулей:** [SET_MODULE_STANDARD.md](../SET_MODULE_STANDARD.md)  
**SET Adapter** (нормализация перед install) — пятый трек пайплайна.

**Полный пайплайн (zip → SET):** [SET_PIPELINE.md](./SET_PIPELINE.md)

---

## Архитектура

| Слой | Порт | Описание |
|------|------|----------|
| EWGen Control Plane | 8000 / 9190 | API + UI (генератор, Warsmith, SET panel) |
| SET Frontend | 3100 | React shell, навигация по слотам |
| SET Backend | 8100 | FastAPI + dynamic module routers |
| SET Postgres | 5433 | БД runtime |

---

## Быстрый старт

```bash
# 1. Инициализация + запуск (Podman)
./scripts/podman/set-up.sh

# 2. Статус
./scripts/podman/set-status.sh

# 3. Остановка
./scripts/podman/set-down.sh
```

Или через UI: вкладка **SET** → «Инициализировать» → «Запустить».

---

## API

| Endpoint | Auth | Описание |
|----------|------|----------|
| `GET /api/set/health` | нет | Статус подсистемы |
| `GET /api/set/inventory` | нет | Инвентарь слотов |
| `POST /api/set/bootstrap` | да | Создать `set-runtime/` из шаблона |
| `GET /api/set/runtime/status` | нет | Статус контейнеров |
| `POST /api/set/runtime/up` | да | `podman compose up` |
| `POST /api/set/runtime/down` | да | `podman compose down` |
| `GET /api/set/install/preview` | да | Preview route-contract gate |
| `GET /api/set/templates` | нет | Список EWGen fullstack-шаблонов (CRUD, Dashboard) |
| `POST /api/set/adapter/analyze` | да | Анализ Warsmith bundle vs SET Standard |
| `POST /api/set/adapter/pipeline` | да | Analyze → transform → optional install |
| `POST /api/set/adapter/transform` | да | Нормализация → `data/set-adapter-staging/` |
| `GET /api/set/adapter/staging/{moduleId}` | нет | Статус staging bundle |
| `POST /api/set/install-from-staging` | да | Install из adapter staging (рекомендуемый путь) |
| `POST /api/set/install` | да | Прямой install из Warsmith (требует adapter staging при `requireAdapter: true`) |
| `GET /api/set/modules/{id}/runtime` | нет | Runtime manifest v2 (FE/BE build, mount) |
| `GET /api/set/modules/{id}/build-log` | нет | Лог сборки FE/BE |
| `POST /api/set/modules/{id}/rebuild-frontend` | да | Пересобрать Vite dist модуля |
| `POST /api/set/modules/{id}/rebuild-backend` | да | Merge deps + reconcile router + restart |
| `POST /api/set/install-template` | да | Установить EWGen шаблон в SET |
| `POST /api/set/modules/{id}/status` | да | Enable / disable слот |
| `POST /api/set/modules/{id}/uninstall` | да | Удалить слот |
| `POST /api/set/runtime/reload-backend` | да | Перезапуск SET backend (registry) |
| `GET /api/set/lineage/stale` | нет | Слоты, отстающие от Warsmith catalog |
| `POST /api/set/sync-lineage` | да | Пересобрать слот из Warsmith catalog |
| `GET /api/set/migrations/status` | нет | Статус SQL-миграций по слотам |
| `POST /api/set/migrations/apply` | да | Применить pending миграции к SET Postgres |
| `GET /api/set/observability` | нет | Dashboard: runtime, health модулей, миграции, снимки |
| `GET /api/set/runtime/logs` | да | Tail логов Podman-контейнера SET |
| `GET /api/set/modules/{id}/snapshots` | нет | Список снимков для rollback |
| `POST /api/set/modules/{id}/rollback` | да | Восстановить слот из снимка |
| `POST /api/set/shell/upgrade` | да | Обновить shell FE/BE из шаблона + backfill runtime v2 |
| `POST /api/set/backfill-runtime` | да | Создать/обновить `set.module.json` для Warsmith-слотов |
| `POST /api/set/modules/{id}/backfill-runtime` | да | Backfill одного слота |
| `POST /api/set/modules/{id}/reconcile-router` | да | Пересобрать router.py слота |
| `POST /api/set/reconcile-routers` | да | Пересобрать routers всех warsmith-слотов |
| `GET /api/set/smoke` | нет | HTTP smoke: backend, shell modules, CRUD/Dashboard API, frontend |

### Install request

```json
{
  "warsmithCatalogId": "uuid",
  "moduleName": "OptionalOverride",
  "overwrite": false,
  "allowWeakContract": false,
  "buildFrontend": false,
  "buildBackend": true
}
```

`buildFrontend: false` по умолчанию — сборка FE через кнопку **Rebuild FE** в SET panel.

---

## Директории

| Путь | В git | Назначение |
|------|-------|------------|
| `templates/set-base/` | да | Шаблон shell |
| `set-runtime/` | нет | Материализованный runtime |
| `data/set-inventory.json` | нет | Инвентарь модулей |

---

## Module Slot v2 (Dynamic Warsmith runtime)

Каждый Warsmith-слот получает `modules/{id}/set.module.json`:

| Поле | Описание |
|------|----------|
| `runtime.fe.buildStatus` | `pending` \| `ready` \| `failed` |
| `runtime.be.mountMode` | `scavenger` \| `stub` |
| `runtime.apiBridge` | Proxy `/api/modules/{id}/proxy/*` для FE |
| `contract.runtimeGrade` | A/B/C по overlap + routers |

- **BE prefix:** `/api/modules/{moduleId}/...`
- **FE static:** `/app/{moduleId}/*` → `frontend/dist` (после Vite build)
- **API proxy:** `/api/modules/{moduleId}/proxy/{path}` → module BE routes
- **Registry:** `set-runtime/modules/registry.json`

Встроенный `demo-hello` и авто-установка `Sample*` **удалены**. Bootstrap
создаёт пустой shell; модули ставятся явно (Warsmith / Factory /
`POST /api/set/install-template`). Кнопка «Установить демо-модули» в ASE
`SetPanel` снята; `POST /api/set/install-standard-modules` остаётся no-op
для совместимости.

---

## Фазы

- **Фаза 0:** shell, bootstrap, Podman, inventory, install из Warsmith
- **Фаза 1:** route-contract gate, registry sync, enable/disable/uninstall, кнопка в WarsmithPanel
- **Фаза 2:** lineage sync, EWGen CRUD/Dashboard шаблоны, scavenger router mount
- **Фаза 3:** SQL migrations, observability dashboard, container logs, install rollback
- **Фаза 4:** CRUD/Dashboard шаблоны читают/пишут в Postgres после миграций
- **Фаза 5:** Warsmith shell panel — contract metadata, matched routes, deep-link в EWGen
- **Фаза 6:** shell upgrade, router reconcile, E2E smoke SET tab
- **Фаза 7:** HTTP stack smoke (`GET /api/set/smoke`, `./scripts/podman/set-smoke.sh`)
- **Фаза 8+:** Dynamic Warsmith runtime — `entry_detect`, `set.module.json`, FE Vite build, API proxy, `WarsmithModuleHost`

Полный план: `.cursor/plans/set_runtime_platform.plan.md` (фазы 0–7), `.cursor/plans/set_warsmith_dynamic_runtime.plan.md` (фазы 8+)

### CRUD / Dashboard UI

Шаблоны `ewgen-template` (например CRUD/Dashboard после явного install)
открывают полноценный UI (`CrudModuleView`, `DashboardModuleView`), если shell актуален.

Если видите заглушку «Full UI integration — phase 2»:

1. **SET → Обновить shell** (или `POST /api/set/shell/upgrade`)
2. **Применить миграции** (таблицы Postgres для CRUD/Dashboard)
3. Перезагрузите страницу модуля на `:3100`

`degraded` health у CRUD обычно значит, что миграции не применены к `ewgen_set`.

### Warsmith slot в SET shell

- **`fe.buildStatus === ready`:** `WarsmithModuleHost` (iframe `/app/{id}/index.html`)
- **Иначе:** fallback `WarsmithModuleView` — health, mount mode, overlap, build log + ссылка в EWGen

Registry синхронизирует `runtime`, `stats` и `contract`; live BE — через `/api/modules/{id}/contract`.

#### Troubleshooting

| Симптом | Причина | Действие |
|---------|---------|----------|
| Stub router, Routers 0 | BE без `APIRouter` | Scavenger preset **SET Backend (routers+services)** |
| FE build failed | monorepo deps / нет entry | Rebuild FE, проверить `modules/{id}/.set/fe-build.log` |
| Health degraded | import errors | Rebuild BE, `requirements.modules.txt` |
| Overlap 0, grade C | FE/BE path mismatch | API proxy + contract v2 в EWGen |

Переменная `VITE_EWGEN_URL` (по умолчанию `http://localhost:9190`) — ссылка на EWGen Warsmith.

### Postgres healthcheck

БД создаётся как `ewgen_set` (`SET_DB_NAME`), не `set`. Healthcheck в `compose.yaml` использует
`pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` — иначе в логах каждые 10 с будет
`FATAL: database "set" does not exist`.

После обновления шаблона: `SET → Обновить shell` или пересоздайте контейнер БД:

```bash
cd set-runtime && podman compose up -d db --force-recreate
```

### Stack smoke

```bash
./scripts/podman/set-smoke.sh
```

Проверяет backend health, shell modules, CRUD/Dashboard API, а для Warsmith-слотов с `runtime`:
`GET /api/modules/{id}/runtime`, static FE (`/app/{id}/index.html` при `buildStatus: ready`), API proxy.

Или в UI: **SET → Smoke test → Запустить smoke**.
