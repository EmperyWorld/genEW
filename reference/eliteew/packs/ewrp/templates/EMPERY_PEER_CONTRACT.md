# Empery peer contract — `presentation_ai` (from EWRP)

Post-copy template. Hands / Assembler must emit this surface (not bare `/metrics`).

## Product journey

1. **Create** — topic + style brief + slide count → queued presentation job  
2. **Generate** — Nervas outlines slides (title + bullets); persist history  
3. **History dashboard** — list past presentations; open one for viewing  
4. **Style chat** — multi-turn chat that refines style notes (does not replace create)

## HTTP (Empery)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/health` | Peer + Nervas readiness |
| POST | `/api/v1/presentations` | Create job `{ title, topic, style_brief, num_slides, language }` |
| GET | `/api/v1/presentations` | History (newest first) |
| GET | `/api/v1/presentations/{id}` | Detail + `slides[]` |
| POST | `/api/v1/style/chat` | `{ presentation_id?, messages[] }` → style advice via Nervas |

## Domain (minimal)

```
PresentationJob:
  id, title, topic, style_brief, num_slides, status, progress,
  slides: [{ title, bullets[] }], error_message?, created_at
```

Status: `queued | generating | ready | failed`

## Desktop mount (D1)

- Peer base via `peerApiBase(port)`
- Form → POST presentations
- History list → GET presentations / select → GET detail
- Viewer: slide titles + bullets (HTML/PDF later)
- Style chat panel → POST style/chat
- Must **not** be metrics-only ops_dashboard

## Forbidden as product path

- `/api/v1/metrics` as the only feature
- FakeAI / FakeNervas in `src/`
- Reimplementing EliteEW energy / tariff / admin megapage
- Runtime import of `reference/eliteew`

## Extract roots

`reference/eliteew/packs/ewrp/` — prefer `templates/` + thin create/status + FE viewer/policy over `ewrp_service.py` mega.
