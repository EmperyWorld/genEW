# Site Studio (UserSiteStudio desktop) reference pack — source

Date: 2026-07-23

Copied from EliteEW (absolute paths under
`/home/owned/powered_by_emperyworld/EliteEW/web/frontend/src/`).

**Scope note:** `features/site-studio/desktop/` alone is ~14k LOC (excl. tests), so this pack
copies only the **UserSiteStudio orchestrator atom** (entry + core modules + one runtime-guard
helper) plus thin essential `shared/` helpers and the Desktop mount snippet. Tabs, panels,
ImperorG, SiteManagerOps, tests, and the entire **admin megapage** are out of scope (paths below).

## desktop/ — UserSiteStudio orchestrator atom

- `features/site-studio/desktop/index.ts`
- `features/site-studio/desktop/UserSiteStudioApp.tsx`
- `features/site-studio/desktop/userSiteStudioAppModel.ts`
- `features/site-studio/desktop/useUserSiteStudioAppController.tsx`
- `features/site-studio/desktop/UserSiteStudioAppView.tsx`
- `features/site-studio/desktop/useUserSiteStudioAppHandlers.tsx`
- `features/site-studio/desktop/useUserSiteStudioAppEffects.tsx`
- `features/site-studio/desktop/useUserSiteStudioAppApplyHandlers.tsx`
- `features/site-studio/desktop/useUserSiteStudioAppVoice.tsx`
- `features/site-studio/desktop/siteStudioUserError.ts`
- `features/site-studio/desktop/api.ts`
- `features/site-studio/desktop/siteStudioUserJourney.ts`
- `features/site-studio/desktop/siteStudioGuideConstants.ts`
- `features/site-studio/desktop/components/siteStudioRuntimeGuards.ts`

## shared/ — essential non-admin helpers

- `features/site-studio/shared/constants/api.ts`
- `features/site-studio/shared/constants/siteDefaults.ts`
- `features/site-studio/shared/types/api.ts`
- `features/site-studio/shared/types/auth.ts`
- `features/site-studio/shared/types/user.ts`
- `features/site-studio/shared/utils/imageUrl.ts`
- `features/site-studio/shared/utils/themeUtils.ts`
- `features/site-studio/shared/utils/contentSectionAliases.ts`

## desktop_mount/

- `pages/Desktop/apps/UserSiteStudio/index.ts`
- `pages/Desktop/apps/UserSiteStudio/UserSiteStudioApp.tsx`
- `pages/Desktop/components/desktopWindowAppContent.tsx` → snippet only:
  `desktop_mount/desktopWindowAppContent.UserSiteStudio.snippet.tsx`
  (lazy `UserSiteStudioApp` import + `UserSiteStudioDesktopMount` + `case 'UserSiteStudio'`)

## Out of scope (not copied) — with EliteEW paths

### Admin megapage (excluded entirely)

- `features/site-studio/admin/**` (~24k LOC) — **do not copy**

### Desktop remainder (desktop folder >15k; truncated pack)

Relative to `features/site-studio/desktop/`:

- `UserSiteStudioSetupTab.tsx`
- `UserSiteStudioContentTab.tsx`
- `UserSiteStudioMediaTab.tsx`
- `UserSiteStudioAiTab.tsx`
- `SiteStudioAdminShell.tsx`
- `api-imperorg.ts`
- `siteManagerUserStatus.ts`
- `components/SiteStudioHeader.tsx`
- `components/SiteStudioFirstRunPanel.tsx`
- `components/SiteStudioGuidedCockpit.tsx`
- `components/SiteStudioChecklist.tsx`
- `components/SiteStudioDraftCard.tsx`
- `components/SiteStudioLaunchPanel.tsx`
- `components/SiteStudioRuntimePanel.tsx`
- `components/SiteStudioDangerZone.tsx`
- `components/SiteStudioDomainBindingsPanel.tsx`
- `components/SiteStudioEdgeVisitorPanel.tsx`
- `components/SiteStudioImagePreview.tsx`
- `components/SiteStudioOperatorDiagnosticsCard.tsx`
- `components/siteStudioRuntimeShared.ts`
- `components/SiteManagerOpsPanel.tsx`
- `components/SiteManagerOpsAtoms.tsx`
- `components/SiteManagerSiteCards.tsx`
- `components/SiteManagerDrilldownPanel.tsx`
- `components/ImperorG/**`
- `__tests__/**` and `*.test.*` (incl. golden / contract fixtures)

### Shared remainder (admin-leaning / heavy)

Relative to `features/site-studio/shared/`:

- `constants/adminRoutes.ts`
- `constants/themePresets.ts`
- `constants/productCollections.ts`
- `types/admin.ts`
- `types/product.ts`
- `types/order.ts`
- `types/consultation.ts`
- `types/masterclass.ts`
- `store/slices/siteSettingsSlice.ts`
- `utils/productImages.ts`
- `utils/__tests__/**`

### Assets / other

- `features/site-studio/assets/**` — not copied

**EliteEW was not modified** (read-only `cp` / snippet extract).

**Reference only.** Never runtime-import EliteEW or this pack from `apps/`.
