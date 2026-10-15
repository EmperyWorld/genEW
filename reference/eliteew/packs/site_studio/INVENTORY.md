# Site Studio (UserSiteStudio desktop) reference pack — inventory

| Path | Role |
|------|------|
| `desktop/index.ts` | Feature barrel (`UserSiteStudioApp` default export) |
| `desktop/UserSiteStudioApp.tsx` | Thin Desktop orchestrator (controller + view) |
| `desktop/userSiteStudioAppModel.ts` | Props, form/draft model, tab helpers |
| `desktop/useUserSiteStudioAppController.tsx` | Main controller / VM (DesktopAppChrome focus classes) |
| `desktop/UserSiteStudioAppView.tsx` | View composition (imports tabs/panels not in pack) |
| `desktop/useUserSiteStudioAppHandlers.tsx` | Action handlers bundle |
| `desktop/useUserSiteStudioAppEffects.tsx` | Lifecycle / polling effects |
| `desktop/useUserSiteStudioAppApplyHandlers.tsx` | Apply / mutate handlers |
| `desktop/useUserSiteStudioAppVoice.tsx` | Voice / STT wiring for form targets |
| `desktop/siteStudioUserError.ts` | User-facing error message mapping |
| `desktop/api.ts` | Typed Site Studio desktop HTTP client |
| `desktop/siteStudioUserJourney.ts` | Journey / checklist step model |
| `desktop/siteStudioGuideConstants.ts` | Spotlight guide step defs / tab map |
| `desktop/components/siteStudioRuntimeGuards.ts` | Runtime readiness / pending-status guards |
| `shared/constants/api.ts` | Storefront-relative API endpoint constants |
| `shared/constants/siteDefaults.ts` | Site default constants |
| `shared/types/api.ts` | Shared API response / error types |
| `shared/types/auth.ts` | Auth-related shared types |
| `shared/types/user.ts` | User shared types |
| `shared/utils/imageUrl.ts` | Image URL helpers |
| `shared/utils/themeUtils.ts` | Theme utility helpers |
| `shared/utils/contentSectionAliases.ts` | Content section alias map |
| `desktop_mount/index.ts` | Desktop apps barrel → feature `UserSiteStudioApp` |
| `desktop_mount/UserSiteStudioApp.tsx` | Thin re-export for Desktop lazy load |
| `desktop_mount/desktopWindowAppContent.UserSiteStudio.snippet.tsx` | Mount-case snippet (`UserSiteStudio`) |
| `SOURCE.md` | Provenance / absolute source paths |
| `INVENTORY.md` | This file |

## Out of scope

- **`features/site-studio/admin/**`** — admin megapage excluded entirely (~24k LOC)
- **Desktop tabs / panels / ImperorG / SiteManagerOps** — see `SOURCE.md` path list (desktop alone >15k)
- **Heavy tests / golden / contract fixtures** under `desktop/__tests__/` and `*.test.*`
- **Admin-leaning shared** (`adminRoutes`, `types/admin`, `themePresets`, product/order slices, etc.)
- **`SiteStudioAdminShell.tsx`** — embedded admin shell; not copied

## Empery adaptation notes

Empery must adapt / stub:

- **`DesktopAppChrome`** / desktop visual system (`DESKTOP_CHROME_FOCUS_VISIBLE`, shell panel classes, window portal z-index, guide-tour opener)
- Desktop window mount (`DesktopAppContentWrapper` if wrapping; `UserSiteStudioDesktopMount` Professional Worlds draft handoff)
- i18n (`react-i18next`) and guided-tour (`SpotlightGuideModal`, step builders)
- API client (`apiClient` / `apiFetchWithAuth`, UGS stream registry) → Empery BFF / service ports
- Voice STT (`@/voice-core`) and Professional Worlds cross-app draft modules
- Tabs / panels listed out of scope — reimplement or pull later as separate packs

## Cap rationale

Desktop source (excl. tests) ≈ **14k LOC**; full folder with tests ≈ **17.5k**. Pack keeps orchestrator + essential shared ≈ **~4.7k LOC** so Empery can adapt the Desktop window atom without the admin megapage or SiteManager/ImperorG surface.
