/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Reads and persists `ui.sidebar_collapsed` for Content Manager / folder explorer left rails.
 *
 * Invariants:
 * - Default collapsed when preference is missing (new users).
 * - PATCH goes through profile preferences API (per-user, server-backed).
 *
 * Related:
 * - DesktopExplorerCollapsibleRail.tsx · UserPreferencesAppContext
 */

import { useCallback, useMemo, useState } from 'react';
import { useUserPreferencesApp } from '@/contexts/UserPreferencesAppContext';
import profileService from '@/services/profileService';
import { DEFAULT_UI_PREFERENCES, type UIPreferences } from '@/types/profile';
import { log } from '@/utils/logger';

export function useDesktopFolderExplorerRailCollapsed(): {
	collapsed: boolean;
	toggle: () => void;
	setCollapsed: (next: boolean) => void;
	persisting: boolean;
} {
	const preferencesApp = useUserPreferencesApp();
	const serverCollapsed =
		preferencesApp?.preferences?.ui?.sidebar_collapsed ??
		DEFAULT_UI_PREFERENCES.sidebar_collapsed;
	const [optimisticCollapsed, setOptimisticCollapsed] = useState<
		boolean | null
	>(null);
	const [persisting, setPersisting] = useState(false);

	const collapsed = optimisticCollapsed ?? serverCollapsed;

	const persistCollapsed = useCallback(
		async (next: boolean) => {
			const uiBase: UIPreferences = {
				...DEFAULT_UI_PREFERENCES,
				...preferencesApp?.preferences?.ui,
			};
			setOptimisticCollapsed(next);
			setPersisting(true);
			try {
				const updated = await profileService.updatePreferences({
					ui: { ...uiBase, sidebar_collapsed: next },
				});
				await preferencesApp?.refresh?.(updated);
				setOptimisticCollapsed(null);
			} catch (error) {
				setOptimisticCollapsed(null);
				log.error(
					'Desktop',
					'Failed to persist folder explorer rail collapsed state',
					error instanceof Error ? error : undefined
				);
			} finally {
				setPersisting(false);
			}
		},
		[preferencesApp]
	);

	const setCollapsed = useCallback(
		(next: boolean) => {
			if (next === serverCollapsed) {
				setOptimisticCollapsed(null);
				return;
			}
			void persistCollapsed(next);
		},
		[persistCollapsed, serverCollapsed]
	);

	const toggle = useCallback(() => {
		void persistCollapsed(!collapsed);
	}, [collapsed, persistCollapsed]);

	return useMemo(
		() => ({ collapsed, toggle, setCollapsed, persisting }),
		[collapsed, toggle, setCollapsed, persisting]
	);
}
