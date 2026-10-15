# EWRP / Presentation AI reference pack — source

Date: 2026-07-26

Copied from EliteEW (read-only `cp` / snippet extract). **EliteEW was not modified.**

**Reference only.** Never runtime-import EliteEW or this pack from `apps/` / `services/*/src` as a live dependency. Hands **extract_adapt** → rewrite to Empery anatomy.

Primary root: `/home/owned/powered_by_emperyworld/EliteEW/`

Secondary (EWGen trash, UI/docs only):  
`/home/owned/powered_by_emperyworld/trash/20260718-015129/EWGen/`

## upstream_api/

| Pack path | EliteEW source |
|-----------|----------------|
| `routers/ewrp.py` | `api/routers/ewrp.py` |
| `models/ewrp.py` | `api/models/ewrp.py` |
| `schemas/ewrp.py` | `api/schemas/ewrp.py` |
| `migrations/ewrp_create_table.sql` | `api/migrations/ewrp_create_table.sql` |
| `migrations/desktop_app_catalog_ewrp.sql` | `api/migrations/desktop_app_catalog_ewrp.sql` |
| `services/ewrp_create_service.py` | `api/services/ewrp_create_service.py` |
| `services/ewrp_status_service.py` | `api/services/ewrp_status_service.py` |
| `services/ewrp_templates.py` | `api/services/ewrp_templates.py` |
| `services/ewrp_prompt_utils.py` | `api/services/ewrp_prompt_utils.py` |
| `services/ewrp_slide_bullets.py` | `api/services/ewrp_slide_bullets.py` |
| `services/ewrp_service.py` | `api/services/ewrp_service.py` (mega — slim on adapt) |
| `services/presentation_content_generator_service.py` | `api/services/presentation_content_generator_service.py` |
| `companion/companion_presentation_generation.py` | `api/ewa_platform/companion/orchestration/companion_presentation_generation.py` |
| `companion/presentation_run_reconcile.py` | `api/ewa_platform/companion/jobs/presentation_run_reconcile.py` |

## upstream_fe/

| Pack path | EliteEW source |
|-----------|----------------|
| `EWRP/EWRPGenerator.tsx` | `web/frontend/src/components/EWRP/EWRPGenerator.tsx` (re-export entry) |
| `EWRP/EwrpPdfPresentationViewer.tsx` | …/EwrpPdfPresentationViewer.tsx |
| `EWRP/EwrpPresentationsMiniStatusBar.tsx` | …/EwrpPresentationsMiniStatusBar.tsx |
| `EWRP/ewrpClientJobPolicy.ts` | …/ewrpClientJobPolicy.ts |
| `EWRP/ewrpHttpErrors.ts` | …/ewrpHttpErrors.ts |
| `EWRP/ewrpHistoryRowEnergyLabels.ts` | …/ewrpHistoryRowEnergyLabels.ts |
| `EWRP/ewrpIdempotency.ts` | …/ewrpIdempotency.ts |
| `EWRP/ewrpPipelineStatusStep.ts` | …/ewrpPipelineStatusStep.ts |
| `EWRP/EwrpPipelineSteps.tsx` | …/EwrpPipelineSteps.tsx |
| `EWRP/EwrpStatusPhaseChip.tsx` | …/EwrpStatusPhaseChip.tsx |
| `EWRP/ewrpGuideConstants.ts` | …/ewrpGuideConstants.ts |
| `services/ewrpApi.ts` | `web/frontend/src/services/ewrpApi.ts` |

## desktop_mount/

- Snippet from `pages/Desktop/components/desktopWindowAppContent.tsx` →  
  `desktopWindowAppContent.EWRP.snippet.tsx` (`EwrpDesktopMount` + `case 'EWRP'|'Presentations'`)

## secondary_ewgen/

Optional prompts/viewer docs — **not** the Empery happy path (EliteEW EWRP is primary).

## Out of scope (not copied)

- `components/EWRP/EWRPGeneratorMain.tsx` (~5.4k LOC megapage)
- Admin / energy tariff / web-search quality migrations beyond create + catalog
- Full EliteEW auth/users FK surface (adapt to Empery IdentityVerifier)
- Runtime `import reference/`

## Empery profile

Recipe stem: `ewrp` → Hands `scaffold_profile=presentation_ai`  
See `templates/EMPERY_PEER_CONTRACT.md` (edited after copy).
