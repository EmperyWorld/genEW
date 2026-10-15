/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure helpers for Quick Search launcher rows, motion variants, and query matching.
 *
 * Invariants:
 * - No React hooks; safe for Vitest import without DOM providers.
 *
 * Related:
 * - `QuickSearchResultsList.tsx`, `useQuickSearchNavigation.ts`
 */

import { cn } from '@/utils/cn';
import {
	desktopShellListItemVariants,
	desktopShellSearchPanelVariants,
} from '../../utils/desktopShellMotion';
import type { DesktopShellMotionSpeed } from '@/types/profile';
import type { DesktopItem } from '../../types/desktop.types';
import type { QuickAction, SearchResult } from './types';

export function quickSearchLauncherTooltipLabel(
	primary: string,
	secondary?: string | null
): string {
	const trimmed = secondary?.trim();
	return trimmed ? `${primary}\n${trimmed}` : primary;
}

export function desktopItemFromAppRowData(
	data: SearchResult | DesktopItem
): DesktopItem {
	return 'item' in data ? data.item : data;
}

export function searchVariantsForMotion(
	reduceMotion: boolean,
	speed: DesktopShellMotionSpeed
) {
	return desktopShellSearchPanelVariants(reduceMotion, speed);
}

export function itemVariantsForMotion(
	reduceMotion: boolean,
	speed: DesktopShellMotionSpeed
) {
	return desktopShellListItemVariants(reduceMotion, speed);
}

export function qsLauncherRowClass(selected: boolean, dense?: boolean): string {
	return cn(
		'flex w-full items-center gap-3 rounded-xl py-2.5 text-left transition-[background-color,color] duration-150 motion-reduce:transition-none',
		dense ? 'px-2' : 'px-3',
		selected
			? 'bg-(--desktop-surface-soft-active) text-(--desktop-text-primary)'
			: 'text-(--desktop-text-secondary) hover:bg-[color-mix(in_srgb,var(--desktop-surface-soft-hover)_72%,transparent)]'
	);
}

export function matchActionQuery(action: QuickAction, q: string): boolean {
	const haystack =
		`${action.label} ${action.description ?? ''} ${action.keywords?.join(' ') ?? ''}`.toLowerCase();
	return haystack.includes(q);
}
