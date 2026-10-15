# EWA CompanionSlim reference pack — inventory

| Path | Role |
|------|------|
| `slim/CompanionSlimChatDock.tsx` | Slim companion chat dock UI |
| `slim/CompanionChatMainColumn.tsx` | Main chat column layout for companion surface |
| `slim/useCompanionChatSurfaceBundle.ts` | Hook bundling chat surface state/props |
| `slim/useCompanionEmbeddedDocumentSurface.ts` | Hook for embedded document surface in chat |
| `slim/companionChatOrchestrationShared.ts` | Shared orchestration helpers for companion chat |
| `surface/companionSurfaceUi.ts` | Output-surface UI helpers |
| `surface/types.ts` | Companion output surface types |
| `surface/companionOutputSurfaceState.ts` | Output surface state helpers |
| `surface/useCompanionOutputSurfaceHandlers.ts` | Handlers for output surface interactions |
| `desktop_mount/EwaDesktopApp.tsx` | Desktop window root for EWA companion |
| `desktop_mount/desktopWindowDisplayTitle.ts` | Window title resolution for desktop apps |
| `desktop_mount/buildEwaCompanionShellContext.ts` | Shell context builder for EWA companion |
| `desktop_mount/desktopWindowAppContent.EwaApp.snippet.tsx` | Mount-case snippet (`case 'EwaApp'`) |
| `services/ewaCompanionProfileApi.ts` | Companion profile API client (reference) |
| `support/ewaCompanionLoadStall.ts` | Load-stall / timeout helpers |
| `support/ewaPersonaCatalog.ts` | Persona catalog constants/data |
| `support/companionPremiumPrimitives.tsx` | Premium UI primitives for companion chrome |
| `SOURCE.md` | Provenance / absolute source paths |
| `INVENTORY.md` | This file |

## Out of scope

- **admin** — EWA admin surfaces not included
- **full companionUx megapage** — only Slim + shared orchestration hooks above
- **EWDesk** — not included
- **FakeAI / demo stubs** — not included

## Empery adaptation notes

Empery must adapt / stub:

- Desktop window chrome (`DesktopAppContentWrapper`, window payload callbacks)
- i18n / persona catalog wiring
- Companion profile API → Empery service BFF / Nervas path
- EventBus / identity gates (no EliteEW peer imports)
