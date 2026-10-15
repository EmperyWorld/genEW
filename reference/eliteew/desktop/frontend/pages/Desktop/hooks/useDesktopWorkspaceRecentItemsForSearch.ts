import { useMemo, useCallback } from 'react';
import type { DesktopItem } from '../types/desktop.types';
import { useDesktopRecentApps } from './useDesktopRecentApps';

/**
 * MRU desktop items for Quick Search / task switcher lists (memoized from displayItems).
 */
export function useDesktopWorkspaceRecentItemsForSearch(
	displayItems: DesktopItem[],
	activeDesktopId: string,
	persistSubjectKey?: string | null
) {
	const { recentItems: getRecentDesktopItems, recordRecentApp: recordRaw } =
		useDesktopRecentApps(undefined, persistSubjectKey);
	const recordRecentApp = useCallback(
		(appId: string) => recordRaw(appId, activeDesktopId),
		[recordRaw, activeDesktopId]
	);
	const recordRecentAppOnVirtualDesktop = useCallback(
		(appId: string, virtualDesktopId: string) => {
			const vd = virtualDesktopId.trim();
			if (!vd) return;
			recordRaw(appId, vd);
		},
		[recordRaw]
	);
	const recentItemsForSearch = useMemo(
		() => getRecentDesktopItems(displayItems),
		[displayItems, getRecentDesktopItems]
	);
	return {
		recentItemsForSearch,
		recordRecentApp,
		recordRecentAppOnVirtualDesktop,
	};
}
