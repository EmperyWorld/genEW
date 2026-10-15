/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared Tailwind class strings for App Store compact rows and shell typography.
 *
 * Invariants:
 * - Presentation only; no runtime logic.
 *
 * Related:
 * - AppStoreFeaturedRow.tsx, AppStoreRecentlyViewedRow.tsx, AppStoreRelatedAppsRow.tsx
 * - AppStoreCatalogCard.tsx, AppStore.tsx, AppStoreCard.tsx
 * - AppStoreKeyboardHints.tsx, AppStoreCategoryJumpNav.tsx, appStore/AppStoreInstallStatusBar.tsx
 * - DesktopWorkspaceAppStoreLayer.tsx
 */

import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { cn } from '@/utils/cn';

export const appStoreCompactCardTitleClass = cn(
	DESKTOP_TYPOGRAPHY.subtitle,
	'truncate text-sm tracking-tight text-(--desktop-text-primary)'
);

export const appStoreHorizontalScrollListClass =
	'-mx-1 flex list-none gap-3 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] snap-x snap-mandatory [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgb(var(--desktop-fg-primary-rgb)/0.12)]';

export const appStoreCompactCardOpenDetailsClass = cn(
	DESKTOP_TYPOGRAPHY.captionInherit,
	'inline-flex items-center font-medium text-[rgb(var(--desktop-accent-rgb)/0.88)] transition-colors'
);

export const appStoreCompactInstalledBadgeClass =
	'mt-0.5 border-[color-mix(in_srgb,rgb(16_185_129)_38%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,var(--desktop-surface-soft)_88%,rgb(16_185_129)_12%)] px-1.5 py-0 text-[color-mix(in_srgb,rgb(16_185_129)_48%,var(--desktop-text-primary))]';

export const appStoreCatalogCardActionClass = cn(
	DESKTOP_TYPOGRAPHY.captionInherit,
	'h-8 min-h-8 px-3'
);

export const appStoreCatalogCardGhostActionClass = cn(
	appStoreCatalogCardActionClass,
	'gap-1 px-2 text-(--desktop-text-muted)'
);

export const appStoreDescriptionToggleClass = cn(
	DESKTOP_TYPOGRAPHY.captionInherit,
	'mt-2.5 font-semibold tracking-wide text-[rgb(var(--desktop-accent-rgb)/0.95)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.4)] focus-visible:ring-offset-2 focus-visible:ring-offset-(--desktop-surface-panel-strong) rounded'
);

export const appStoreInstalledBadgeClass =
	'border-[color-mix(in_srgb,rgb(16_185_129)_38%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,var(--desktop-surface-soft)_88%,rgb(16_185_129)_12%)] text-[color-mix(in_srgb,rgb(16_185_129)_48%,var(--desktop-text-primary))]';

export const appStoreNewBadgeClass =
	'border-[color-mix(in_srgb,rgb(59_130_246)_40%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,var(--desktop-surface-soft)_88%,rgb(59_130_246)_14%)] text-[color-mix(in_srgb,rgb(59_130_246)_70%,var(--desktop-text-primary))]';

export const appStoreMaintenanceBadgeClass =
	'border-[color-mix(in_srgb,rgb(245_158_11)_42%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,var(--desktop-surface-soft)_88%,rgb(245_158_11)_12%)] text-[color-mix(in_srgb,rgb(245_158_11)_58%,var(--desktop-text-primary))]';

export const appStoreSystemBadgeClass =
	'border-[rgb(var(--desktop-accent-rgb)/0.28)] bg-[rgb(var(--desktop-accent-rgb)/0.1)] text-(--desktop-text-primary)';

export const appStoreFactoryBadgeClass =
	'border-[color-mix(in_srgb,rgb(234_179_8)_42%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,var(--desktop-surface-soft)_88%,rgb(234_179_8)_12%)] text-[color-mix(in_srgb,rgb(234_179_8)_55%,var(--desktop-text-primary))]';

export const appStoreCompactNewBadgeClass = cn(
	appStoreNewBadgeClass,
	'mt-0.5 px-1.5 py-0'
);

export const appStoreNavTitleClass = cn(
	DESKTOP_TYPOGRAPHY.subtitle,
	'text-sm tracking-tight text-(--desktop-text-primary)'
);

export const appStoreMobileCatalogTitleClass = cn(
	appStoreNavTitleClass,
	'truncate'
);

export const appStoreSectionHeadingClass = cn(
	DESKTOP_TYPOGRAPHY.subtitle,
	'text-sm leading-snug tracking-[-0.02em] text-(--desktop-text-primary)'
);

export const appStorePageHeaderTitleClass = cn(
	DESKTOP_TYPOGRAPHY.subtitle,
	'text-sm tracking-[-0.02em] text-(--desktop-text-primary) md:text-base'
);

export const appStorePremiumHeroLeadClass = cn(
	DESKTOP_TYPOGRAPHY.body,
	'mt-2 max-w-xl leading-6 md:text-[15px]'
);

export const appStoreDetailSectionTitleClass = cn(
	DESKTOP_TYPOGRAPHY.subtitle,
	'mb-3 border-b border-(--desktop-border-subtle)/60 pb-2 text-sm tracking-tight'
);

export const appStoreDetailInlineHeadingClass = cn(
	DESKTOP_TYPOGRAPHY.subtitle,
	'mb-2 text-sm'
);

export const appStoreNeutralBadgeClass =
	'border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-secondary)';

export const appStoreShortcutBadgeClass =
	'border-[color-mix(in_srgb,rgb(59_130_246)_38%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,var(--desktop-surface-soft)_88%,rgb(59_130_246)_12%)] text-[color-mix(in_srgb,rgb(59_130_246)_52%,var(--desktop-text-primary))]';

export const appStoreAccentSoftBadgeClass =
	'border-[rgb(var(--desktop-accent-rgb)/0.28)] bg-[rgb(var(--desktop-accent-rgb)/0.08)] text-(--desktop-text-primary)';

export const appStoreDetailErrorPanelClass =
	'border-[color-mix(in_srgb,rgb(248_113_113)_35%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,var(--desktop-surface-soft)_82%,rgb(248_113_113)_18%)] px-5 py-4 text-[color-mix(in_srgb,rgb(252_165_165)_52%,var(--desktop-text-primary))] shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.06)] ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.06)]';

export const appStoreCatalogInstallErrorPanelClass =
	'rounded-lg border border-[color-mix(in_srgb,rgb(248_113_113)_38%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,rgb(248_113_113)_10%,var(--desktop-surface-soft))] px-3 py-2 text-(--desktop-text-primary)';

export const appStoreMaintenanceNotePanelClass =
	'rounded-xl border border-[color-mix(in_srgb,rgb(245_158_11)_38%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,var(--desktop-surface-soft)_88%,rgb(245_158_11)_10%)] px-3 py-2.5 shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)] ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]';

export const appStoreFactoryNotePanelClass =
	'rounded-xl border border-[color-mix(in_srgb,rgb(234_179_8)_42%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,var(--desktop-surface-soft)_90%,rgb(234_179_8)_10%)] px-3 py-2.5 shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)] ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]';

export const appStoreModalTitleClass = cn(
	DESKTOP_TYPOGRAPHY.subtitle,
	'tracking-[-0.02em] text-(--desktop-text-primary) md:text-xl'
);

export const appStoreDetailInstalledStatusClass = cn(
	DESKTOP_TYPOGRAPHY.body,
	'flex items-center gap-2 text-[color-mix(in_srgb,rgb(16_185_129)_58%,var(--desktop-text-secondary))]'
);

export const appStoreRailOverlineLabelClass = cn(
	DESKTOP_TYPOGRAPHY.captionInherit,
	'font-semibold uppercase tracking-[0.1em] text-(--desktop-text-dim)'
);

export const appStoreRailOverlineLabelBlockClass = cn(
	appStoreRailOverlineLabelClass,
	'mb-2'
);

export const appStoreAdminPreviewLabelClass = cn(
	DESKTOP_TYPOGRAPHY.small,
	'mb-3 font-semibold uppercase tracking-[0.12em] text-(--desktop-text-dim)'
);

export const appStoreRailHintListClass = cn(
	DESKTOP_TYPOGRAPHY.meta,
	'space-y-1.5 text-(--desktop-text-muted)'
);

export const appStoreCategoryJumpMobileScrollClass =
	'-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgb(var(--desktop-fg-primary-rgb)/0.12)]';

export const appStoreInstallStatusBarClass =
	'mb-5 flex items-center gap-3 rounded-(--desktop-radius-frame) border border-(--desktop-border-subtle)/55 border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.55)] bg-[color-mix(in_srgb,var(--desktop-surface-soft)_82%,rgb(var(--desktop-accent-rgb)/0.08))] px-3 py-2.5 shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)] ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]';

export const appStoreInstallStatusBarLabelClass = cn(
	DESKTOP_TYPOGRAPHY.shellCopy13,
	'min-w-0 truncate font-medium text-(--desktop-text-primary)'
);

export const appStoreDetailInsetPanelClass =
	'rounded-xl border border-(--desktop-border-subtle)/70 bg-(--as-premium-panel-bg) px-4 py-3 shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)] ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]';

export const appStoreDetailExpansionPanelClass = cn(
	DESKTOP_TYPOGRAPHY.body,
	appStoreDetailInsetPanelClass,
	'mb-6'
);

export const appStoreDetailQuickFactLabelClass = appStoreRailOverlineLabelClass;

export const appStoreDetailQuickFactValueClass = cn(
	DESKTOP_TYPOGRAPHY.body,
	'mt-1 font-semibold text-(--desktop-text-primary)'
);

export const appStoreDetailQuickFactValueMutedClass = cn(
	DESKTOP_TYPOGRAPHY.body,
	'mt-1 font-medium leading-snug text-(--desktop-text-secondary)'
);

export const appStoreDetailNoteTextClass = cn(
	DESKTOP_TYPOGRAPHY.shellCopy13,
	'leading-relaxed text-(--desktop-text-secondary)'
);

export const appStoreDetailTagsPanelClass =
	'flex flex-wrap gap-2 rounded-xl border border-(--desktop-border-subtle)/60 bg-(--as-premium-panel-bg) p-3 shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)] ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]';

export const appStoreDetailCollapsiblePanelClass =
	'mb-6 rounded-xl border border-(--desktop-border-subtle)/75 bg-(--as-premium-panel-bg) shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)] ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.06)] [&_summary::-webkit-details-marker]:hidden';

export const appStoreDetailCollapsibleSummaryClass = cn(
	DESKTOP_TYPOGRAPHY.body,
	'flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 font-medium text-(--desktop-text-secondary) transition-colors hover:bg-[color-mix(in_srgb,var(--desktop-surface-soft)_88%,transparent)] hover:text-(--desktop-text-primary)'
);

export const appStoreDetailCollapsibleBodyClass = cn(
	DESKTOP_TYPOGRAPHY.body,
	'border-t border-(--desktop-border-subtle)/70 px-4 pb-4 pt-3'
);

export const appStoreDetailLoadingHeroFrameClass =
	'overflow-hidden border-b border-(--desktop-border-subtle)/55 bg-[color-mix(in_srgb,var(--desktop-surface-soft)_58%,transparent)] shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.06)] ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]';

export const appStoreDetailLoadingBodyFrameClass =
	'rounded-xl border border-(--desktop-border-subtle)/50 bg-[color-mix(in_srgb,var(--desktop-surface-soft)_42%,transparent)] p-4 ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.04)]';

export const appStoreShellDetailSuspenseHeroClass =
	'overflow-hidden rounded-(--desktop-radius-frame) border border-(--desktop-border-subtle)/60 bg-[color-mix(in_srgb,var(--desktop-surface-soft)_55%,transparent)] shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)] ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]';

export const appStoreShellDetailSuspenseBodyClass =
	'space-y-3 rounded-(--desktop-radius-section) border border-(--desktop-border-subtle)/50 bg-[color-mix(in_srgb,var(--desktop-surface-soft)_40%,transparent)] p-4 ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.04)]';

export const appStoreDetailActionBarClass =
	'sticky bottom-0 -mx-5 mt-8 flex flex-col gap-4 border-t border-(--desktop-border-subtle)/70 bg-(--as-premium-action-bg) px-5 pb-5 pt-4 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:-mx-6 md:px-6 md:pb-6';

export const appStoreDetailSystemStatusClass = cn(
	DESKTOP_TYPOGRAPHY.body,
	'flex items-center gap-2 text-[rgb(var(--desktop-accent-rgb)/0.92)]'
);

export const appStoreDetailFactoryStatusClass = cn(
	DESKTOP_TYPOGRAPHY.body,
	'flex items-center gap-2 text-[color-mix(in_srgb,rgb(234_179_8)_72%,var(--desktop-text-secondary))]'
);

export const appStoreWalletBalanceClass = cn(
	DESKTOP_TYPOGRAPHY.subtitle,
	'text-base tabular-nums'
);
