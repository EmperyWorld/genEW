# Recipe: desktop_shell_kernel

## Goal

Thin product desktop host: icons, windows, installed apps list, shell bootstrap.
Ops/autonomy stay in ECC; desktop is the user/product shell.

## Source parts (EliteEW extract)

- FE contracts: `reference/eliteew/desktop/frontend/pages/Desktop/types/`
- FE entry: `DesktopWorkspace.tsx`, `DesktopWorkspaceContent.tsx`
- FE state: `hooks/useDesktopState.ts`, `context/DesktopStateContext.tsx`, window contexts
- API bootstrap: `schemas/desktop_shell_bootstrap.py`, `services/desktop_shell_bootstrap_service.py`
- Items/store: `routers/desktop_items.py`, `routers/desktop_store.py`, `models/desktop.py`

## Empery layout

```
services/desktop_shell/     # runtime module (registry + health)
apps/empery_desktop/        # product UI host
```

## Assembly steps

1. Keep domain models in `desktop_shell/src/core` (Pydantic), not EliteEW ORM imports.
2. Map bootstrap envelope to a minimal Empery schema (`schema_version`, `installed.app_ids`, `desktop_config`, `items`).
3. Desktop UI talks only to ECC BFF or `desktop_shell` HTTP — never EliteEW `api.*` packages.
4. App modules mount via `appComponent` / registry ids; new apps come from autonomy recipes later.
5. Shell chrome (slice 2): `useWindowManager`, `WindowTitleBar`, `DesktopWindow`, `Taskbar`, `StartMenu` in `apps/empery_desktop/src/shell/` — contracts from EliteEW, Empery-owned code.
6. Create-service scaffold (slice 3): `ServiceDesktopScaffoldAction` writes
   `apps/empery_desktop/src/shell/mounts/{service}.tsx`, patches `mounts/registry.ts`,
   and drops `.cursor/orchestration/eic/desktop_catalog/{service}.json` (+ live POST).
7. Verify: health live + desktop UI route renders shell + registry lists `desktop_shell`
   + new service appears in catalog/start menu.
8. Verifier gate `verify_service_desktop` (D1 mount, D2 registry, D3 catalog) — FAILED
   blocks PASSED the same way as missing ECC UI.

## Out of scope for this recipe

Keycloak, GAF chat, App Store admin, Site Studio, voice/video.
Snap zones, session restore persistence, full App Store — later slices.
