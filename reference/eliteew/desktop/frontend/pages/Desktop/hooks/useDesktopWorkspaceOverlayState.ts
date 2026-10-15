/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Local shell overlays (task switcher, quick search, shortcuts help, session chip, app store modal).
 *
 * Invariants:
 * - Primary overlays are mutually exclusive: task switcher, quick search, and App Store.
 * - Help/session overlays are stackable and do not steal primary overlay ownership.
 *
 * Related:
 * - components/DesktopWorkspaceOverlays.tsx
 * - components/DesktopModalsLayer.tsx
 */

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';

export type DesktopWorkspaceOverlaySnapshot = {
	showTaskSwitcher: boolean;
	showQuickSearch: boolean;
	showShortcutsHelp: boolean;
	showSessionInfoPanel: boolean;
	showAppStore: boolean;
	appStoreDetailId: string | null;
};

const initialOverlay: DesktopWorkspaceOverlaySnapshot = {
	showTaskSwitcher: false,
	showQuickSearch: false,
	showShortcutsHelp: false,
	showSessionInfoPanel: false,
	showAppStore: false,
	appStoreDetailId: null,
};

function patch<K extends keyof DesktopWorkspaceOverlaySnapshot>(
	prev: DesktopWorkspaceOverlaySnapshot,
	key: K,
	value: DesktopWorkspaceOverlaySnapshot[K]
): DesktopWorkspaceOverlaySnapshot {
	return { ...prev, [key]: value };
}

function closePrimaryOverlays(
	prev: DesktopWorkspaceOverlaySnapshot
): DesktopWorkspaceOverlaySnapshot {
	return {
		...prev,
		showTaskSwitcher: false,
		showQuickSearch: false,
		showAppStore: false,
		appStoreDetailId: null,
	};
}

export type UseDesktopWorkspaceOverlayStateReturn =
	DesktopWorkspaceOverlaySnapshot & {
		setShowTaskSwitcher: Dispatch<SetStateAction<boolean>>;
		setShowQuickSearch: Dispatch<SetStateAction<boolean>>;
		setShowShortcutsHelp: Dispatch<SetStateAction<boolean>>;
		setShowSessionInfoPanel: Dispatch<SetStateAction<boolean>>;
		setShowAppStore: Dispatch<SetStateAction<boolean>>;
		setAppStoreDetailId: Dispatch<SetStateAction<string | null>>;
		/** Clears detail id and closes app store modal. */
		closeAppStoreModal: () => void;
		/** Opens store; optional catalog detail id (hash / deep link). */
		openAppStore: (detailId?: string | null) => void;
	};

export function useDesktopWorkspaceOverlayState(): UseDesktopWorkspaceOverlayStateReturn {
	const [snap, setSnap] =
		useState<DesktopWorkspaceOverlaySnapshot>(initialOverlay);

	const setShowTaskSwitcher = useCallback((v: SetStateAction<boolean>) => {
		setSnap((prev) => {
			const nextValue = typeof v === 'function' ? v(prev.showTaskSwitcher) : v;
			return nextValue
				? {
						...closePrimaryOverlays(prev),
						showTaskSwitcher: true,
					}
				: patch(prev, 'showTaskSwitcher', false);
		});
	}, []);

	const setShowQuickSearch = useCallback((v: SetStateAction<boolean>) => {
		setSnap((prev) => {
			const nextValue = typeof v === 'function' ? v(prev.showQuickSearch) : v;
			return nextValue
				? {
						...closePrimaryOverlays(prev),
						showQuickSearch: true,
					}
				: patch(prev, 'showQuickSearch', false);
		});
	}, []);

	const setShowShortcutsHelp = useCallback((v: SetStateAction<boolean>) => {
		setSnap((prev) =>
			patch(
				prev,
				'showShortcutsHelp',
				typeof v === 'function' ? v(prev.showShortcutsHelp) : v
			)
		);
	}, []);

	const setShowSessionInfoPanel = useCallback((v: SetStateAction<boolean>) => {
		setSnap((prev) =>
			patch(
				prev,
				'showSessionInfoPanel',
				typeof v === 'function' ? v(prev.showSessionInfoPanel) : v
			)
		);
	}, []);

	const setShowAppStore = useCallback((v: SetStateAction<boolean>) => {
		setSnap((prev) => {
			const nextValue = typeof v === 'function' ? v(prev.showAppStore) : v;
			if (nextValue) {
				return { ...closePrimaryOverlays(prev), showAppStore: true };
			}
			return {
				...prev,
				showAppStore: false,
				appStoreDetailId: null,
			};
		});
	}, []);

	const setAppStoreDetailId = useCallback(
		(v: SetStateAction<string | null>) => {
			setSnap((prev) =>
				patch(
					prev,
					'appStoreDetailId',
					typeof v === 'function' ? v(prev.appStoreDetailId) : v
				)
			);
		},
		[]
	);

	const closeAppStoreModal = useCallback(() => {
		setSnap((prev) =>
			prev.showAppStore === false && prev.appStoreDetailId == null
				? prev
				: { ...prev, showAppStore: false, appStoreDetailId: null }
		);
	}, []);

	const openAppStore = useCallback((detailId: string | null = null) => {
		setSnap((prev) => ({
			...closePrimaryOverlays(prev),
			showAppStore: true,
			appStoreDetailId: detailId,
		}));
	}, []);

	return {
		showTaskSwitcher: snap.showTaskSwitcher,
		showQuickSearch: snap.showQuickSearch,
		showShortcutsHelp: snap.showShortcutsHelp,
		showSessionInfoPanel: snap.showSessionInfoPanel,
		showAppStore: snap.showAppStore,
		appStoreDetailId: snap.appStoreDetailId,
		setShowTaskSwitcher,
		setShowQuickSearch,
		setShowShortcutsHelp,
		setShowSessionInfoPanel,
		setShowAppStore,
		setAppStoreDetailId,
		closeAppStoreModal,
		openAppStore,
	};
}
