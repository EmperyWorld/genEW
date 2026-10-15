# Recipe: ewrp (Presentation AI)

## Goal

AI presentation peer: create decks via Nervas, style chat, history list + viewing. Assemble from EliteEW EWRP corpus; never invent metrics-only ops_dashboard for presentation intents.

## Living peer

- Desktop → peer port (allocated) / `VITE_*_API_BASE`
- Service: `services/{name}` → EIC Nervas HTTP (`EIC_API_BASE`)
- Create: `POST /api/v1/presentations`
- History: `GET /api/v1/presentations`
- Detail: `GET /api/v1/presentations/{id}`
- Style: `POST /api/v1/style/chat`
- Health: Nervas ready via EIC `/api/v1/health`
- No FakeAI / demo slide stubs in `src/`

## Source parts

`reference/eliteew/packs/ewrp/` — EWRP router/schemas/jobs + slim FE viewer/policy + companion job-start pattern.

**Out of scope:** EWRPGeneratorMain megapage, energy tariffs, EliteEW admin, FakeAI generators.

## Empery layout

```
services/{service_name}/          # presentation_ai scaffold
apps/empery_desktop/src/shell/mounts/{service_name}.tsx
apps/empery_desktop/atoms/{service_name}/   # extract_adapt FE atoms
```

## Assembly steps

1. Resolve `scaffold_profile=presentation_ai` (pack `ewrp`) — refuse generic DomainItem and ops_dashboard steal.
2. Prefer EIC Nervas over inventing a parallel LLM client.
3. Companion presentation atoms only start/reconcile jobs — do not fork slide generators.
4. Desktop journey: create → history → view + style chat.
5. Verify: create returns slides; history lists job; style chat returns assistant text with living Nervas.

## Related recipes

`nervas_llm_peer`, `desktop_mount_catalog`, `service_anatomy`, `verify_gates`, `ewa_companion` (optional chat chrome — not a substitute for presentations API).
