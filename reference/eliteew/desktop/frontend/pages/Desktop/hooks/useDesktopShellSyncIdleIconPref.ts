/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Opt-in local preference: show cloud sync icon when idle (all changes saved).
 *
 * Invariants:
 * - Default off; stored in localStorage only (no shell_state migration).
 *
 * Related:
 * - components/DesktopSyncStatus.tsx, DesktopSettingsShellSyncPrefsCard.tsx
 */

import { useCallback, useSyncExternalStore } from 'react';
import { STORAGE_KEYS } from '../constants';

function readShowIdleSyncIcon(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return (
			window.localStorage.getItem(STORAGE_KEYS.SHOW_IDLE_SYNC_ICON) === 'true'
		);
	} catch {
		return false;
	}
}

function subscribeShowIdleSyncIcon(onStoreChange: () => void): () => void {
	if (typeof window === 'undefined') return () => {};
	const handler = (event: StorageEvent) => {
		if (event.key === STORAGE_KEYS.SHOW_IDLE_SYNC_ICON) onStoreChange();
	};
	window.addEventListener('storage', handler);
	return () => window.removeEventListener('storage', handler);
}

const idleIconListeners = new Set<() => void>();

function notifyIdleIconListeners(): void {
	for (const listener of idleIconListeners) listener();
}

export function useDesktopShellSyncIdleIconPref(): {
	showIdleSyncIcon: boolean;
	setShowIdleSyncIcon: (value: boolean) => void;
} {
	const showIdleSyncIcon = useSyncExternalStore(
		(onStoreChange) => {
			idleIconListeners.add(onStoreChange);
			return () => idleIconListeners.delete(onStoreChange);
		},
		readShowIdleSyncIcon,
		readShowIdleSyncIcon
	);

	const setShowIdleSyncIcon = useCallback((value: boolean) => {
		try {
			window.localStorage.setItem(
				STORAGE_KEYS.SHOW_IDLE_SYNC_ICON,
				value ? 'true' : 'false'
			);
		} catch {
			// quota / private mode
		}
		notifyIdleIconListeners();
	}, []);

	return { showIdleSyncIcon, setShowIdleSyncIcon };
}

export function subscribeShowIdleSyncIconPref(
	onStoreChange: () => void
): () => void {
	idleIconListeners.add(onStoreChange);
	return () => idleIconListeners.delete(onStoreChange);
}

export { readShowIdleSyncIcon, subscribeShowIdleSyncIcon };
