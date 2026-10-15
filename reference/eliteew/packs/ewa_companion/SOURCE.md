# EWA CompanionSlim reference pack — source

Date: 2026-07-23

Copied from EliteEW (absolute paths under
`/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/`):

## slim/

- `features/ewa/companionUx/CompanionSlimChatDock.tsx`
- `features/ewa/companionUx/CompanionChatMainColumn.tsx`
- `features/ewa/companionUx/useCompanionChatSurfaceBundle.ts`
- `features/ewa/companionUx/useCompanionEmbeddedDocumentSurface.ts`
- `features/ewa/companionUx/companionChatOrchestrationShared.ts`

## surface/

- `features/ewa/companionOutputSurface/companionSurfaceUi.ts`
- `features/ewa/companionOutputSurface/types.ts`
- `features/ewa/companionOutputSurface/companionOutputSurfaceState.ts`
- `features/ewa/companionOutputSurface/useCompanionOutputSurfaceHandlers.ts`

## desktop_mount/

- `features/ewa/EwaDesktopApp.tsx`
- `pages/Desktop/utils/desktopWindowDisplayTitle.ts`
- `pages/Desktop/utils/buildEwaCompanionShellContext.ts`
- `pages/Desktop/components/desktopWindowAppContent.tsx` → snippet only:
  `desktop_mount/desktopWindowAppContent.EwaApp.snippet.tsx`
  (lazy `EwaApp` import + `case 'EwaApp'` mount)

## services/

- `services/ewa/ewaCompanionProfileApi.ts`

## support/

- `features/ewa/ewaCompanionLoadStall.ts`
- `features/ewa/ewaPersonaCatalog.ts`
- `features/ewa/companionPremiumPrimitives.tsx`

## Missing

None — all listed sources were present at copy time.

**EliteEW was not modified** (read-only `cp` / snippet extract).

**Reference only.** Never runtime-import EliteEW or this pack from `apps/`.

## upstream_fe / upstream_api (P1 enrich 2026-07-24)

Copied from live EliteEW (RO) — do not edit EliteEW in place:

- `web/frontend/src/features/ewa/EwaCompanionChatPanel.tsx` → `upstream_fe/`
- `web/frontend/src/features/ewa/EwaCompanionChatMarkdown.tsx` → `upstream_fe/`
- `web/frontend/src/features/desktop-ai-chat/DesktopAiChatApp.tsx` → `upstream_fe/`
- `api/ewa_platform/gateways/routers/companion_chat.py` → `upstream_api/gateways/`
- `api/domains/chat.py` → `upstream_api/`

See `.cursor/orchestration/recipes/atom_catalog.yaml` pack `ewa_companion`.
