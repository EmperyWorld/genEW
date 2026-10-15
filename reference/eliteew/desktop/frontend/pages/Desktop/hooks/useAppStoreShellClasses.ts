/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Токены пресета «Стиль окон» для магазина приложений — parity с Marketing Cabinet.
 *
 * Invariants:
 * - Только className-строки; без побочных эффектов.
 *
 * Related:
 * - appStoreDesktopVars.css, AppStore.tsx, useMarketingShellClasses.ts
 */

import { DESKTOP_CHROME_FOCUS_VISIBLE } from '@/pages/Desktop/components/DesktopAppChrome';
import { useDesktopShellFrame } from '@/pages/Desktop/context/DesktopShellFrameContext';
import {
	getDesktopShellContentPanelClassName,
	getDesktopShellHeaderStripClassName,
	getDesktopShellNavRailClassName,
	getDesktopShellToolbarClusterClassName,
	getDesktopShellToolbarClusterInsetControlClassName,
} from '@/pages/Desktop/utils/desktopVisualSystem';
import { cn } from '@/utils/cn';
import { useMemo } from 'react';

export function useAppStoreShellClasses() {
	const shellFrame = useDesktopShellFrame();
	return useMemo(
		() => ({
			shellFrame,
			contentPanel: getDesktopShellContentPanelClassName(shellFrame),
			navRail: cn(
				getDesktopShellNavRailClassName(shellFrame),
				'shadow-(--mc-nav-rail-inset)'
			),
			headerStrip: getDesktopShellHeaderStripClassName(shellFrame),
			toolbarCluster: getDesktopShellToolbarClusterClassName(shellFrame),
			toolbarInset:
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
			searchInput: cn(
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				DESKTOP_CHROME_FOCUS_VISIBLE
			),
			insetIconTile: cn(
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				'flex h-9 w-9 shrink-0 items-center justify-center rounded-(--desktop-radius)'
			),
			filterStrip:
				'flex flex-wrap gap-2 rounded-(--desktop-radius) border border-(--desktop-border-subtle)/80 bg-(--desktop-surface-soft)/40 p-2',
			sectionPanelShadow: 'shadow-(--mc-section-panel-shadow)',
			mainColumnBg: 'bg-(--mc-main-bg-gradient)',
			premiumHero: cn(
				getDesktopShellContentPanelClassName(shellFrame),
				'relative overflow-hidden rounded-(--desktop-radius-frame) border border-(--desktop-border-subtle)/70 bg-(--as-premium-hero-bg) shadow-(--as-premium-card-glow)'
			),
			premiumMetricCard:
				'rounded-(--desktop-radius) border border-(--desktop-border-subtle)/70 bg-(--as-premium-panel-bg) px-3 py-2.5 shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)] ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]',
			premiumActionPanel:
				'rounded-(--desktop-radius-frame) border border-(--desktop-border-subtle)/70 bg-(--as-premium-action-bg) shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)] ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]',
			statusChip:
				'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-(--desktop-border-subtle)/60 bg-(--desktop-surface-soft)/50 text-(--desktop-text-secondary)',
			sidebarNavRow:
				'relative flex h-9 min-h-9 shrink-0 items-center gap-2 overflow-hidden rounded-(--desktop-radius) px-2.5 py-0 text-left text-sm max-lg:w-auto max-lg:rounded-full max-lg:px-3 lg:w-full',
			sidebarNavIcon: cn(
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				'flex h-7 w-7 shrink-0 items-center justify-center rounded-(--desktop-radius)'
			),
			sidebarToggle:
				'h-8 min-h-8 w-full justify-start px-2.5 text-xs font-medium leading-none',
			sidebarToggleGroup: 'mt-2 flex flex-col gap-1',
		}),
		[shellFrame]
	);
}
