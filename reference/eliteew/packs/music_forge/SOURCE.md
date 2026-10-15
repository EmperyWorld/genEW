# MusicForge reference pack — source

Date: 2026-07-23

Copied from EliteEW (absolute paths). **Reference only.** Never runtime-import EliteEW or this pack from `apps/`. EliteEW was not modified.

## User app (pages)

- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/MusicForge/MusicForgeApp.tsx`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/MusicForge/MusicForgeWorkflow.tsx`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/MusicForge/MusicForgeResultCard.tsx`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/MusicForge/musicForgeUiHelpers.ts`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/MusicForge/musicForgeTestI18n.tsx`

## API client

- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/services/musicForge/musicForgeApi.ts`

## OpenAPI (pilot)

- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/openapi/pilot/music-forge.openapi.json`

## API router (user, thin)

- `/home/owned/powered_by_emperyworld/EliteEW/api/routers/music_forge.py`

## Explicitly not copied

- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/Admin/musicForge/**` (Admin megapage)
- `/home/owned/powered_by_emperyworld/EliteEW/api/routers/music_forge_admin.py`
- `pages/MusicForge/__tests__/**` and `services/musicForge/__tests__/**` (skipped; not tiny as a set)
- Pipeline / schemas / migrations under `api/services/music_forge/`, `api/schemas/music_forge.py`
