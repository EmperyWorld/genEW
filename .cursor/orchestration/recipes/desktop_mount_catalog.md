# Recipe: desktop_mount_catalog

## Goal

User-facing apps launch from Empery Desktop: window mount + catalog entry. Desktop is the product host; ECC stays ops/autonomy.

## Empery targets

```
apps/empery_desktop/src/shell/mounts/{service}.tsx   # App mount
apps/empery_desktop/src/shell/mounts/registry.ts     # APP_MOUNTS entry (+ import)
.cursor/orchestration/eic/desktop_catalog/{service}.json
services/desktop_shell/  # bootstrap merges overlays; optional POST /api/v1/catalog/apps
```

## Catalog JSON shape

```json
{
  "app_id": "{service}",
  "title": "Human Title",
  "app_component": "{service}",
  "category": "apps",
  "description": "…"
}
```

`app_id` === `app_component` === mount key in `APP_MOUNTS`.

## Assembly steps

1. Prefer scaffold `ServiceDesktopScaffoldAction` — writes mount, patches registry between `// eic:desktop-mount-registry`, drops catalog JSON, may POST live catalog.
2. Mount talks to its service HTTP (or ECC BFF for Autonomous) — never EliteEW packages, never `reference/` imports. Prefer native mounts over ECC iframes.
3. Adapt from recipes/corpus when a pack exists; stub only if no corpus.
4. Icons: optional entry in `apps/empery_desktop/src/shell/icons.tsx`.
5. CORS: service must allow desktop origin `http://127.0.0.1:5174` (and localhost).
6. Verify gates D1/D2/D3 via `verify_service_desktop` (see `verify_gates`).

## Skip

If design/manifest marks UI not required with non-null skip_reason, desktop gate is SKIPPED — document why. Default: UI required.

## Out of scope

Parallel Vite apps per service, App Store megapage, EliteEW desktop import path.
