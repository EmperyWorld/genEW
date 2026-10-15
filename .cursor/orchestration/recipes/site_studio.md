# Recipe: site_studio

## Goal

User Site Studio desktop atom: setup → AI fill → review preview. Assemble from EliteEW journey corpus; never copy Site Studio admin / provisioning megapage.

## Living peer

- Desktop → `VITE_SITE_STUDIO_API_BASE` (default `http://127.0.0.1:8024`)
- Service: `services/site_studio` → EIC Nervas HTTP (`EIC_API_BASE`)
- Preview: `POST /api/v1/preview` `{ title, topic, brief, language }` → HTML document
- Health: Nervas ready via EIC `/api/v1/health`
- No FakeAI HTML stubs in `src/`

## Source parts

`reference/eliteew/packs/site_studio/` — UserSiteStudio journey (setup / ai_fill / review). Adapt chrome; do not import admin.

**Out of scope:** admin megapage, SiteManagerOps, Edge publish, compose provisioning, FakeAI site generators.

## Empery layout

```
services/site_studio/
apps/empery_desktop/src/api/siteStudio.ts
apps/empery_desktop/src/shell/mounts/site_studio.tsx
```

## Assembly steps

1. Prefer EIC Nervas over inventing a parallel LLM client.
2. Keep journey honest: setup → ai_fill → review; publish/runtime later.
3. Sandboxed iframe preview (`srcDoc`); no admin imports.
4. Verify: Generate preview returns HTML with `<html>` and playable iframe.

## Related recipes

`nervas_llm_peer`, `desktop_mount_catalog`, `service_anatomy`, `verify_gates`.
