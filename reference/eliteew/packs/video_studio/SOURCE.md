# VideoStudio reference pack — source

Date: 2026-07-23

Copied from EliteEW (absolute paths):

## Video Studio FE atom

- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/VideoStudio/VideoStudioPage.tsx`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/VideoStudio/videoStudioWorkspace.tsx`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/VideoStudio/videoStudioUi.tsx`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/VideoStudio/videoStudioGuideData.ts`

## API router

- `/home/owned/powered_by_emperyworld/EliteEW/api/routers/video_studio.py`

## Shared CreativeStudio chrome — not duplicated

VideoStudio imports only:

- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/CreativeStudio/studioChrome.tsx`
- `/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/pages/CreativeStudio/studioSharedUi.tsx`

These are byte-identical to `reference/eliteew/packs/studios/chrome/` (`studioChrome.tsx`, `studioSharedUi.tsx`). Do not copy again into this pack.

Peer support already in `packs/studios/support/` (not unique to VideoStudio): `useCreativeStudioUgsCosts.ts`, `creativeOutputNonCommercial.ts`, `imageResize.ts`.

**Reference only.** Never runtime-import EliteEW or this pack from `apps/`. EliteEW was not modified.
