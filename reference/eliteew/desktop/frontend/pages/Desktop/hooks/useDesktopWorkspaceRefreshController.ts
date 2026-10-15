/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop workspace refresh: soft sync from API vs user-facing full page reload (F5 / command palette).
 *
 * Invariants:
 * - `syncWorkspaceFromServer` only refetches desktop storage and closes legacy hidden voice windows.
 * - `performWorkspaceRefresh` is a hard navigation reload (cache-bust query) — same as browser F5 expectation.
 * - `workspaceRefreshImplRef` always points at soft sync for persistence-shell retry paths.
 *
 * Related:
 * - `utils/staleBundleReload.ts`
 * - `utils/desktopWorkspaceRefresh.ts`
 */

import { useCallback, useLayoutEffect, type MutableRefObject } from 'react';
import { performManualHardPageReload } from '@/utils/staleBundleReload';
import type { WindowState } from '../types/desktop.types';
import { collectLegacyVoiceWindowIds } from '../utils/desktopWorkspaceRefresh';

export function useDesktopWorkspaceRefreshController(params: {
	workspaceRefreshImplRef: MutableRefObject<(() => void) | null>;
	refreshStorage: () => void;
	windows: WindowState[];
	closeWindow: (id: string) => void;
	/** Optional: e.g. reload GET /desktop/recent-content-feed after storage sync */
	onAfterWorkspaceRefresh?: () => void;
}) {
	const {
		workspaceRefreshImplRef,
		refreshStorage,
		windows,
		closeWindow,
		onAfterWorkspaceRefresh,
	} = params;

	const syncWorkspaceFromServer = useCallback(() => {
		void refreshStorage();
		for (const id of collectLegacyVoiceWindowIds(windows)) {
			closeWindow(id);
		}
		onAfterWorkspaceRefresh?.();
	}, [refreshStorage, windows, closeWindow, onAfterWorkspaceRefresh]);

	const performWorkspaceRefresh = useCallback(() => {
		performManualHardPageReload('manual_user');
	}, []);

	useLayoutEffect(() => {
		workspaceRefreshImplRef.current = syncWorkspaceFromServer;
	}, [syncWorkspaceFromServer, workspaceRefreshImplRef]);

	return { performWorkspaceRefresh, syncWorkspaceFromServer };
}
