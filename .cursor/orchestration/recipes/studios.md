# Recipe: studios

## Goal

Creative / Image Studio as a desktop-window app mount (prompt → ComfyUI generate → canvas).

## Source parts (EliteEW extract pack)

`reference/eliteew/packs/studios/`

| Corpus | Role |
|--------|------|
| `chrome/*` | Shared Creative Studio shell |
| `image/*` | Image Studio product surface + workspaces |
| `api/image_studio.py` | Elite router shape (UGS — do not copy billing) |
| `comfyui/text_to_image.json` | z-image-turbo / Lumina2 workflow |
| `comfyui/comfyui_*.py` | HTTP queue/poll/view reference |

**Out of scope:** Site Studio admin, MarketingCabinet, FakeAI, UGS billing.

## Empery layout

```
services/image_studio/                         # Comfy peer (:8021)
  workflows/text_to_image.json
  src/integration/comfy_client.py
apps/empery_desktop/src/shell/mounts/image_studio.tsx
apps/empery_desktop/src/api/imageStudio.ts     # VITE_IMAGE_STUDIO_API_BASE
```

Env:

- `COMFY_BASE_URL=http://192.168.1.136:31003`
- `VITE_IMAGE_STUDIO_API_BASE=http://127.0.0.1:8021`
- LLM living brain (EIC): `EIC_LLM_BASE_URL=http://192.168.1.111:8080`

API:

- `POST /api/v1/generate` → `{prompt_id}`
- `GET /api/v1/jobs/{prompt_id}` → status + image refs
- `GET /api/v1/images?filename=` → proxy Comfy `/view`

## Assembly steps

1. Read corpus — do not import `reference/` at runtime.
2. Thin Comfy client: `/prompt`, `/history/{id}`, `/view`, `/system_stats`.
3. Inject prompt into workflow nodes `83:27` / size `83:13` / seed `83:3`.
4. Desktop mount polls job and renders image URL — never FakeAI.
5. After generate: **Animate in Video Studio** handoff (blob → `video_studio` Wan I2V).
5. Verify: health shows Comfy reachable; Generate paints canvas.

## Out of scope (later)

VideoStudio, MusicForge, edit/rotate, suggest-prompt via LLM, Site Studio.
