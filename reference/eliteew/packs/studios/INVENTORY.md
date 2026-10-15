# Creative Studio / ImageStudio reference pack — inventory

| Path | Role |
|------|------|
| `chrome/studioChrome.tsx` | Shared Creative Studio desktop chrome shell |
| `chrome/studioSharedUi.tsx` | Shared studio UI primitives / layout helpers |
| `image/ImageStudioPage.tsx` | Image Studio page entry / orchestration |
| `image/imageStudioApi.ts` | Image Studio frontend API client |
| `image/imageStudioHistory.ts` | Local / client history helpers |
| `image/imageStudioGuideData.ts` | In-product guide content data |
| `image/workspaces/constants.ts` | Workspace shared constants |
| `image/workspaces/types.ts` | Workspace shared types |
| `image/workspaces/index.ts` | Workspaces barrel exports |
| `image/workspaces/TextToImageWorkspace.tsx` | Text-to-image workspace UI |
| `image/workspaces/EditWorkspace.tsx` | Edit / transform workspace UI |
| `image/workspaces/RotateWorkspace.tsx` | Rotate workspace UI |
| `image/workspaces/HistoryWorkspace.tsx` | History workspace UI |
| `support/useCreativeStudioUgsCosts.ts` | UGS cost hook for Creative Studio |
| `support/creativeOutputNonCommercial.ts` | Non-commercial output disclaimer constants |
| `support/imageResize.ts` | Client-side image resize utility |
| `support/i18n/en/imageStudio.json` | English Image Studio i18n strings |
| `support/i18n/ru/imageStudio.json` | Russian Image Studio i18n strings |
| `api/image_studio.py` | EliteEW Image Studio API router (reference) |
| `api/creative_studio_utils.py` | Shared Creative Studio API utilities (reference) |
| `comfyui/text_to_image.json` | z-image-turbo / Lumina2 workflow template |
| `comfyui/comfyui_client_core.py` | Elite Comfy HTTP client (reference) |
| `comfyui/comfyui_execution.py` | Elite Comfy queue/poll/view (reference) |
| `comfyui/SOURCE.md` | Comfy corpus provenance |
| `SOURCE.md` | Provenance / absolute source paths |
| `INVENTORY.md` | This file |

## Out of scope

- **Site Studio** — not included.
- **Marketing Studio** — not included.
- **Ultimate** studio variants — not included.
- `ImageStudio/__tests__/` — tests not copied (not in requested corpus).
- `CreativeStudioGuideTourModal` — not present in EliteEW `CreativeStudio/` (only `studioChrome.tsx` + `studioSharedUi.tsx` existed).

## Empery adaptation notes

Empery must adapt / stub:

- `DesktopAppChrome` (and related desktop app shell wiring)
- i18n stubs / locale registration (`imageStudio` namespace)
- EliteEW-specific API base URLs, auth, and UGS billing paths
- Any peer imports outside this pack (routing, theme, toast, etc.)
