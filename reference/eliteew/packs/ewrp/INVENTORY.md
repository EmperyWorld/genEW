# EWRP pack — inventory

| Path | Role |
|------|------|
| `upstream_api/routers/ewrp.py` | HTTP surface: create / jobs / status / slides / pdf |
| `upstream_api/schemas/ewrp.py` | Request/response contracts |
| `upstream_api/models/ewrp.py` | ORM shape for jobs |
| `upstream_api/migrations/ewrp_create_table.sql` | Jobs table seed SQL |
| `upstream_api/services/ewrp_create_service.py` | Thin create entry |
| `upstream_api/services/ewrp_status_service.py` | Status / progress |
| `upstream_api/services/ewrp_*.py` | Prompts, templates, bullets, mega service (slim on adapt) |
| `upstream_api/companion/*` | Companion starts EWRP jobs — does **not** reimplement generation |
| `upstream_fe/EWRP/*` | Viewer, status, client policy helpers (not GeneratorMain) |
| `upstream_fe/services/ewrpApi.ts` | FE HTTP client |
| `desktop_mount/*.snippet.tsx` | Desktop mount wiring pattern |
| `secondary_ewgen/**` | EWGen docs/viewer secondary corpus |
| `templates/**` | Empery-shaped peer contract (post-copy edits) |
| `SOURCE.md` | Provenance |
| `INVENTORY.md` | This file |

## Empery adaptation law

1. Map EliteEW `/ewrp` routes → Empery `/api/v1/presentations*` (+ style chat).
2. Nervas via EIC HTTP (`NervasProvider` / peer client) — never FakeAI in `src/`.
3. Companion presentation code: **start jobs + reconcile**, never duplicate slide generators.
4. Strip EliteEW `users` FK / energy credits for first Empery capsule; keep job + slides_json + history.
5. Desktop: mount with create → history list → slide/HTML viewer + style chat — adapt chrome from Empery Desktop, not EliteEW `DesktopAppChrome`.
