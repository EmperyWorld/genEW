# Creative Studio / ImageStudio reference pack — source

Date: 2026-07-23

Copied from EliteEW (absolute paths):

## Chrome (CreativeStudio shared)

- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/CreativeStudio/studioChrome.tsx`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/CreativeStudio/studioSharedUi.tsx`

## Image Studio

- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/ImageStudio/ImageStudioPage.tsx`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/ImageStudio/imageStudioApi.ts`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/ImageStudio/imageStudioHistory.ts`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/ImageStudio/imageStudioGuideData.ts`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/ImageStudio/workspaces/` (entire directory)

## Support

- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/hooks/useCreativeStudioUgsCosts.ts`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/constants/creativeOutputNonCommercial.ts`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/utils/imageResize.ts`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/i18n/locales/en/imageStudio.json`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/i18n/locales/ru/imageStudio.json`

## API routers

- `/home/owned/powered_by_emperyworld/EliteEW/api/routers/image_studio.py`
- `/home/owned/powered_by_emperyworld/EliteEW/api/routers/creative_studio_utils.py`

**Reference only.** Never runtime-import EliteEW or this pack from `apps/`. EliteEW was not modified.

## upstream (P1 enrich 2026-07-24)

- `web/frontend/src/pages/ImageStudio/**` → `upstream_fe/ImageStudio/`
- `api/domains/creative.py` → `upstream_api/`
