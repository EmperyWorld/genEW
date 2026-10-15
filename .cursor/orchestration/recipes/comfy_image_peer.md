# Recipe: comfy_image_peer

## Goal

HTTP peer to LAN ComfyUI for text-to-image (queue → poll → view). No FakeAI.

## Living peer

- Host / LAN: `COMFY_BASE_URL=http://192.168.1.136:31003`
- From podman bridge (same host): `COMFY_BASE_URL=http://host.containers.internal:31003`
  (LAN hairpin to the host's own IP fails with connection refused)
- Probe: `GET {base}/system_stats`
- Queue: `POST {base}/prompt` body `{"prompt": <workflow>}`
- Poll: `GET {base}/history/{prompt_id}`
- Image: `GET {base}/view?filename=&subfolder=&type=output`

## Source parts

| Corpus | Role |
|--------|------|
| `reference/eliteew/packs/studios/comfyui/text_to_image.json` | z-image-turbo workflow |
| `reference/eliteew/packs/studios/comfyui/comfyui_*.py` | Elite client (adapt, don't import) |
| `services/image_studio/` | Working Empery thin peer (prefer extend) |

## Empery layout

```
services/image_studio/                 # or new sibling if needed
  src/integration/comfy_client.py
  workflows/text_to_image.json
  config.py  # COMFY_BASE_URL
```

Workflow inject (z-image-turbo): prompt → node `83:27`, size → `83:13`, seed → `83:3`.

## Assembly steps

1. Prefer extending `image_studio` over inventing a second Comfy client.
2. Never put FakeAI / random PNG stubs in `src/`.
3. Desktop calls `VITE_IMAGE_STUDIO_API_BASE` (default `:8021`), not Comfy directly from the browser.
4. Health must report Comfy reachable + device name when up.
5. Verify: `POST /api/v1/generate` → job completes → `/api/v1/images` returns PNG.

## Out of scope

UGS billing, edit/rotate workflows, websocket Comfy progress UI.
