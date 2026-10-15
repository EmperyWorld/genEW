# Warsmith — fullstack-композитор

**Warsmith** (кузница модулей) — третий трек EWGen после [Fortune Seaker](./FORTUNE_SEAKER.md) и [Scavenger](./SCAVENGER.md).

Не парсит архив заново: **склеивает** готовые bundle из каталогов Seaker (TS/JS) и Scavenger (Python) в единый fullstack-модуль.

---

## Триада собирателей

| Трек | Роль | Каталог |
|------|------|---------|
| Fortune Seaker | Frontend TS/JS | `data/import-catalog.json` |
| Scavenger | Backend Python | `data/scavenger-catalog.json` |
| **Warsmith** | Fullstack compose | `data/warsmith-catalog.json` |

---

## Workflow (MVP)

1. Подготовить **FE bundle** в Fortune Seaker (`POST /api/importer/prepare`).
2. Подготовить **BE bundle** в Scavenger (`POST /api/scavenger/prepare` или merged batch).
3. Открыть вкладку **Warsmith** → выбрать пару с одним `sourceRef` (например `in.zip`).
4. Нажать **«Сковать fullstack-модуль»**.
5. **«В генератор»** → превью с вкладками Frontend / Backend / Integration.

---

## API

| Endpoint | Auth | Описание |
|----------|------|----------|
| `GET /api/warsmith/health` | нет | Статус каталогов |
| `GET /api/warsmith/pair-candidates` | да | Группы FE/BE по `sourceRef` |
| `GET /api/warsmith/suggest-pairs` | да | Ранжированные пары (эвристики) |
| `POST /api/warsmith/compose` | да | Сборка composite module |
| `GET /api/warsmith/catalog` | нет | Список composed modules |
| `GET /api/warsmith/catalog/{id}` | да | Полная запись + hydrated files |
| `GET /api/warsmith/catalog/{id}/export` | да | Fullstack ZIP |
| `POST /api/warsmith/materialize` | да | Запись fullstack в workspace из каталога |
| `GET /api/warsmith/layer-graph` | да | Граф слоёв FE/BE/integration для пары |
| `POST /api/warsmith/sync-lineage` | да | Обновить composite после re-prepare источника |
| `DELETE /api/warsmith/catalog/{id}` | да | Удаление (исходные Seaker/Scavenger не трогает) |

### Compose request

```json
{
  "frontendCatalogId": "uuid-fe",
  "backendCatalogId": "uuid-be",
  "moduleName": "EliteChatStack",
  "allowSourceRefMismatch": false,
  "saveToCatalog": true
}
```

---

## Composite manifest v1

Путь: `manifests/warsmith-<kebab>.manifest.json`

Поля: `schemaVersion`, `moduleName`, `moduleType: fullstack-imported`, `sourceRef`, `layers.frontend`, `layers.backend`, `pairing`, `integration`.

---

## Integration pack

| Артефакт | Назначение |
|----------|------------|
| `.env.example` | `VITE_API_URL`, `EWGEN_API_KEY` |
| `docker-compose.yml` | Frontend + backend services |
| `INTEGRATION.md` | Порядок materialize и snippets |
| `matched-routes.json` | MVP: manual pairing metadata |

Snippets из Seaker/Scavenger **агрегируются**, не дублируются.

---

## Materialize fullstack

Опция `writeToDisk` при compose или `POST /api/warsmith/materialize` из каталога:

| Слой | Путь в workspace |
|------|------------------|
| Frontend | `src/imported/<fe-kebab>/` |
| Backend | `generators/imported_python/<be-kebab>/` |
| Integration | `fullstack/<stack-kebab>/` (.env, docker-compose, INTEGRATION.md) |
| Composite manifest | `manifests/warsmith-<stack-kebab>.manifest.json` |

`registerManifest: true` добавляет запись в `manifests/warsmith-imports.json` (аналог scavenger-imports).

---

## Route contract (фаза 3)

При compose извлекается пересечение `fetch('/api/...')` (FE) и `@router.get('/api/...')` (BE).

Артефакты:

| Файл | Назначение |
|------|------------|
| `manifests/warsmith-*.route-contract.json` | Сводка overlap / frontendOnly / backendOnly |
| `snippets/warsmith-*.msw.handlers.ts` | MSW scaffold (опционально `npm i -D msw`) |
| `tests/generated/warsmith_*_contract_smoke.py` | Pytest smoke scaffold |

---

## Lineage

При re-prepare с `replaceCatalogId` (Seaker/Scavenger) Warsmith автоматически обновляет composite entries, ссылающиеся на этот `catalogId`. В UI Seaker/Scavenger при загрузке записи из каталога показывается баннер «Повторный prepare обновит выбранную запись каталога».

В **WarsmithPanel** кнопка **«Обновить composite по слоям»** вызывает sync для выбранных FE/BE catalogId (если auto-sync не сработал).

Ручной вызов API:

```json
POST /api/warsmith/sync-lineage
{ "catalogType": "importer", "catalogId": "uuid-fe" }
```

---

## Export ZIP

```
EliteChatStack/
  frontend/...
  backend/...
  docker-compose.yml
  .env.example
  manifests/warsmith-elite-chat-stack.manifest.json
  INTEGRATION.md
```

---

## Quality gate

- `sourceRef` должен совпадать (или `allowSourceRefMismatch: true`)
- Оба bundle должны иметь файлы
- Security blocked → compose блокируется
- Дубль `moduleName` в warsmith-catalog → ошибка

---

## Переменные окружения

| Переменная | По умолчанию |
|------------|--------------|
| `EWGEN_WARSMITH_CATALOG_PATH` | `data/warsmith-catalog.json` |

---

## SET-ready compose (чеклист)

Для **dynamic runtime** в SET (реальный UI + BE mount, не metadata-only):

1. **Backend (Scavenger):** preset **SET Backend (routers+services)** — `api/routers`, `services`, `core`, `models`, `schemas`
2. **Frontend:** `src/App.tsx` или `src/main.tsx`, желательно `vite.config` / `package.json`
3. **Compose** в Warsmith → **Установить в SET** (при overlap=0 включите «Разрешить слабый contract»)
4. В SET panel: **Rebuild FE** после install (или `buildFrontend: true` в install request)
5. Проверка: `GET /api/modules/{id}/health` → `ok`, `/app/{id}` → UI или fallback с логом

BE без `APIRouter` → SET mount mode `stub` (только health/contract).

См. [SET.md](./SET.md) — Module Slot v2, API proxy, troubleshooting.

---

## Связанные файлы

- `generators/warsmith/` — backend pipeline
- `routers/warsmith.py` — API
- `src/components/Generator/WarsmithPanel.tsx` — UI
- `tests/test_warsmith_compose.py` — тесты MVP
- `tests/test_warsmith_materialize.py` — materialize + warsmith-imports
- `tests/test_warsmith_contract.py` — route contract + integration validate
- `tests/test_warsmith_lineage.py` — lineage sync
- `tests/test_warsmith_in_zip_integration.py` — in.zip preset (skip без `sravni/in.zip`)
- `e2e/warsmith.spec.ts` — Playwright UI: compose, catalog, materialize, layer graph
