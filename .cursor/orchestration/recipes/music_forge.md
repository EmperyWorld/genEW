# Recipe: music_forge

## Goal

MusicForge desktop-window app (intent → AceStep 1.5 audio). Assemble from EliteEW corpus + living Comfy; no FakeAI.

## Living peer

- Desktop → `VITE_MUSIC_FORGE_API_BASE` (default `http://127.0.0.1:8023`)
- Service: `services/music_forge` → ComfyUI
- Comfy host: `COMFY_BASE_URL=http://host.containers.internal:31003` (from podman bridge)
- Workflow: `workflows/text_to_music.json` (Elite `music_forge_ace15_mvp.json`)
- Inject: TextEncode `203` (caption/lyrics/instrumental/duration/bpm), Generate `202` (seed/steps/duration), SaveAudioMP3 `207`

## Source parts

`reference/eliteew/packs/music_forge/` — user MusicForge UI corpus (adapt, don't import).

**Out of scope:** Admin megapage, FakeAI audio stubs, DiffRhythm / full ACE edit pipelines.

## Empery layout

```
services/music_forge/
  workflows/text_to_music.json
apps/empery_desktop/src/api/musicForge.ts
apps/empery_desktop/src/shell/mounts/music_forge.tsx
```

## Assembly steps

1. Prefer real Comfy HTTP — never FakeAI / silent WAV stubs in `src/`.
2. Desktop JSON: prompt (+ instrumental) → `/api/v1/generate` → poll `/jobs/{id}` → `/audio`.
3. Health reports Comfy reachable.
4. Verify: queue returns `prompt_id`; completed job yields playable MP3 via `/audio`.

## Related recipes

`service_anatomy`, `desktop_mount_catalog`, `verify_gates`, `comfy_image_peer` (pattern).
