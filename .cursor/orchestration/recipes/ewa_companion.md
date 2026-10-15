# Recipe: ewa_companion

## Goal

EWA Companion slim chat dock on desktop, backed by live Nervas (EIC → LLM). No FakeAI.

## Living peer

- Desktop → `VITE_EIC_API_BASE` (default `http://127.0.0.1:8007`)
- Chat: `POST /api/v1/nervas/chat` body `{ messages: [{role, content}, ...] }`
- Health: `GET /api/v1/health` → `nervas.ready`
- LLM: `EIC_LLM_BASE_URL=http://192.168.1.111:8080`, `EIC_USE_FAKE_NERVAS=false`
- CORS: `EIC_CORS_ORIGINS` must include `http://127.0.0.1:5174`

## Source parts

`reference/eliteew/packs/ewa_companion/` — CompanionSlim UI corpus (adapt, don't import).

## Empery layout

```
apps/empery_desktop/src/api/ewaCompanion.ts
apps/empery_desktop/src/shell/mounts/ewa_companion.tsx
services/empery_intelligence_core/   # Nervas routes (existing)
```

## Assembly steps

1. Prefer EIC Nervas HTTP — do not invent a parallel FakeAI chat service.
2. Keep system prompt short; preserve multi-turn history in the mount.
3. Surface nervas readiness in the window chrome.
4. Verify: Send → assistant reply with `backend=local_llama` against living brain.

## Out of scope

Full companionUx megapage, EWA admin, streaming SSE (add later), FakeNervas.
