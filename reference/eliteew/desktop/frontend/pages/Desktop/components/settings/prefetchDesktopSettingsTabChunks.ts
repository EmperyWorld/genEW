/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Idle prefetch of lazy Settings Center tab chunks after panel opens.
 *
 * Invariants:
 * - Idempotent per page session; skips active tab chunk.
 * - Neighbor tabs prefetch before distant tabs; pending idle work aborts on close.
 *
 * Related:
 * - `DesktopSettingsPanel.tsx`
 */

import {
	DESKTOP_SETTINGS_TAB_ORDER,
	type TabId,
} from './desktopSettingsShared.types';

/** @deprecated Use `DESKTOP_SETTINGS_TAB_ORDER`. */
export { DESKTOP_SETTINGS_TAB_ORDER as DESKTOP_SETTINGS_TAB_PREFETCH_ORDER };

const prefetched = new Set<TabId>();

const TAB_IMPORTS: Record<Exclude<TabId, never>, () => Promise<unknown>> = {
	personalize: () => import('./DesktopSettingsPersonalizeTab'),
	icons: () => import('./DesktopSettingsIconsTab'),
	chrome: () => import('./DesktopSettingsChromeTab'),
	shell: () => import('./DesktopSettingsShellTab'),
	performance: () => import('./DesktopSettingsPerformanceTab'),
};

let abortGeneration = 0;
let idleHandle: number | ReturnType<typeof setTimeout> | null = null;

function clearPendingIdle(): void {
	if (idleHandle === null) return;
	if (typeof window.cancelIdleCallback === 'function') {
		window.cancelIdleCallback(idleHandle as number);
	} else {
		window.clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
	}
	idleHandle = null;
}

function runIdle(task: () => void): void {
	if (typeof window.requestIdleCallback === 'function') {
		idleHandle = window.requestIdleCallback(() => task(), { timeout: 2500 });
		return;
	}
	idleHandle = window.setTimeout(task, 400);
}

/** Neighbors of `activeTab` first, then tabs sorted by distance in tab order. */
export function buildDesktopSettingsTabPrefetchOrder(
	activeTab: TabId
): TabId[] {
	const order = DESKTOP_SETTINGS_TAB_ORDER;
	const activeIndex = order.indexOf(activeTab);
	const candidates = order.filter((tab) => tab !== activeTab);
	if (activeIndex === -1) return candidates;

	return [...candidates].sort((a, b) => {
		const distanceA = Math.abs(order.indexOf(a) - activeIndex);
		const distanceB = Math.abs(order.indexOf(b) - activeIndex);
		if (distanceA !== distanceB) return distanceA - distanceB;
		return order.indexOf(a) - order.indexOf(b);
	});
}

async function prefetchTabsInOrder(
	tabs: TabId[],
	generation: number
): Promise<void> {
	for (const tab of tabs) {
		if (generation !== abortGeneration) return;
		if (prefetched.has(tab)) continue;
		prefetched.add(tab);
		try {
			await TAB_IMPORTS[tab]();
		} catch {
			prefetched.delete(tab);
		}
	}
}

/** Abort scheduled or in-flight prefetch (panel close / tests). */
export function cancelDesktopSettingsTabChunkPrefetch(): void {
	abortGeneration += 1;
	clearPendingIdle();
}

/** Warm lazy tab chunks after Settings Center opens (except the active tab). */
export function prefetchDesktopSettingsTabChunks(activeTab: TabId): void {
	clearPendingIdle();
	const generation = abortGeneration;
	const order = buildDesktopSettingsTabPrefetchOrder(activeTab);
	runIdle(() => {
		idleHandle = null;
		void prefetchTabsInOrder(order, generation);
	});
}

/** Reset prefetch cache (tests). */
export function resetDesktopSettingsTabChunkPrefetchForTests(): void {
	cancelDesktopSettingsTabChunkPrefetch();
	prefetched.clear();
}
