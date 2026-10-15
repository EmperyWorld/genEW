# Recipe: video_studio

## Goal

Video Studio desktop-window app (source image + motion prompt → Wan 2.2 I2V). Assemble from EliteEW corpus + living Comfy; no FakeAI.

## Living peer

- Desktop → `VITE_VIDEO_STUDIO_API_BASE` (default `http://127.0.0.1:8022`)
- Service: `services/video_studio` → ComfyUI
- Comfy host: `COMFY_BASE_URL=http://host.containers.internal:31003` (from podman bridge)
- Workflow: `workflows/image_to_video.json` (Elite `video_wan2_2_14B_image.json`)
- Inject: LoadImage `97`, positive `129:93`, negative `129:89`, seed `129:86`, size/length `129:98`, SaveVideo `108`
- Upload: `POST Comfy /upload/image` then queue

## Source parts

`reference/eliteew/packs/video_studio/`

| Corpus | Role |
|--------|------|
| `pages/VideoStudio/*` | Product surface (adapt chrome) |
| `api/video_studio.py` | Elite router shape (multipart I2V) |

**Out of scope:** FakeAI video stubs, UGS billing, Site Studio, MusicForge.

## Empery layout

```
services/video_studio/
  workflows/image_to_video.json
  src/integration/comfy_client.py
apps/empery_desktop/src/api/videoStudio.ts
apps/empery_desktop/src/shell/mounts/video_studio.tsx
```

## Assembly steps

1. Prefer real Comfy HTTP — never FakeAI / silent MP4 in `src/`.
2. Desktop multipart: image file + prompt → `/api/v1/generate` → poll `/jobs/{id}` → `/videos`.
3. Accept Image Studio handoff (`studioHandoff.offerImageToVideo` → launch `video_studio`).
4. Health reports Comfy reachable.
5. Verify: queue returns `prompt_id`; completed job yields playable video via `/videos`.
   Handoff: Image Studio **Animate** pre-fills source image + motion hint.

## Related recipes

`studios`, `comfy_image_peer` (pattern), `service_anatomy`, `desktop_mount_catalog`, `verify_gates`.
