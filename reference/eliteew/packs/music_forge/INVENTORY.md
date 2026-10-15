# MusicForge reference pack — inventory

| Path | Role |
|------|------|
| `pages/MusicForge/MusicForgeApp.tsx` | User MusicForge desktop app entry — mode/language/duration, create/cancel/monitor runs |
| `pages/MusicForge/MusicForgeWorkflow.tsx` | Backend-owned step snapshot UI (progress / workflow stages) |
| `pages/MusicForge/MusicForgeResultCard.tsx` | Terminal result card — audio, feedback, library / deep-link actions |
| `pages/MusicForge/musicForgeUiHelpers.ts` | Duration clamp, idea-length hint, API error mapping helpers |
| `pages/MusicForge/musicForgeTestI18n.tsx` | Test-only i18n provider wiring (`desktopUi` locale) — reference for stubs |
| `services/musicForge/musicForgeApi.ts` | FE API client — capabilities, create/get/cancel, SSE+poll monitor |
| `openapi/pilot/music-forge.openapi.json` | Pilot OpenAPI contract for MusicForge HTTP surface |
| `api/music_forge.py` | Thin user FastAPI router (async runs, capabilities, feedback, SSE) — not admin |
| `SOURCE.md` | Provenance / absolute source paths |
| `INVENTORY.md` | This file |

## Out of scope (skipped)

- **Admin MusicForge megapage** — `pages/Admin/musicForge/**`, `music_forge_admin.py`
- `__tests__` under user pages / services (present in EliteEW; not copied)
- Full pipeline, schemas, Comfy, migrations, companion orchestration

## Empery adaptation notes

Empery must adapt / stub:

- `DesktopAppChrome` (`DesktopAppButton`, `DesktopAppPanel`, inputs, selects, content wrapper)
- i18n — `react-i18next` / `desktopUi` namespace (and test helper locale wiring)
- EliteEW desktop peers: `MusicLibraryContext`, `desktopDeepLink`, `@/utils/cn`, `@/services/api/client`
- Auth / session / API base URLs for the MusicForge client and router

**FakeAI forbidden** on Empery runtime path — do not introduce FakeAI / demo stubs into `services/*/src/` when porting. Use real Nervas / ports or tests-only fakes under `tests/fakes`.
