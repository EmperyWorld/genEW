# VideoStudio reference pack — inventory

| Path | Role |
|------|------|
| `pages/VideoStudio/VideoStudioPage.tsx` | Video Studio page entry / orchestration (I2V flow, pickers, billing hooks) |
| `pages/VideoStudio/videoStudioWorkspace.tsx` | Main workspace UI (prompt, source image, generate, preview) |
| `pages/VideoStudio/videoStudioUi.tsx` | Thin re-exports / VideoStudio-named aliases over CreativeStudio shared UI |
| `pages/VideoStudio/videoStudioGuideData.ts` | In-product guide step data for Video Studio tour |
| `api/video_studio.py` | EliteEW Video Studio API router — image-to-video (Wan 2.2 I2V), UGS billing (reference) |
| `SOURCE.md` | Provenance / absolute source paths |
| `INVENTORY.md` | This file |

## Shared deps (use existing packs — not copied here)

| Location | Role |
|----------|------|
| `packs/studios/chrome/studioChrome.tsx` | Shared Creative Studio desktop chrome (identical to EliteEW CreativeStudio) |
| `packs/studios/chrome/studioSharedUi.tsx` | Shared studio UI primitives |
| `packs/studios/support/useCreativeStudioUgsCosts.ts` | UGS cost hook |
| `packs/studios/support/creativeOutputNonCommercial.ts` | Non-commercial download disclaimer |
| `packs/studios/support/imageResize.ts` | Client image resize before upload |

No dedicated `videoStudio.json` i18n locale file in EliteEW; strings ride desktop / shared namespaces.

## Out of scope

- **Site Studio** — not included.
- **UGS megapage** / full billing UI — not included (only the VideoStudio cost hook usage).
- Image Studio / Marketing Studio / Ultimate variants — not included (see `packs/studios/`).
- EliteEW migrations, Comfy workflow JSON, and API tests — not copied in this atom.
- `__tests__` — none under `VideoStudio/` in source.

## Empery adaptation notes

Empery must adapt / stub:

- `DesktopAppChrome` (and related desktop app shell wiring from `studioChrome`)
- i18n stubs / locale registration (no standalone `videoStudio` JSON in EliteEW)
- EliteEW-specific API base URLs, auth, unified content picker, and UGS billing paths
- Peer imports outside this pack (`CreativeStudioGuideTourModal`, desktop hooks/types, `@/lib/utils`, etc.)
