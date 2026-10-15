/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop workspace lifecycle side-effects: sync error to notification center, voice window grace close.
 *
 * Invariants:
 * - Sync progress is shown only via {@link DesktopSyncStatus} (bottom-left chip), not Sonner toasts.
 *
 * Related:
 * - `DesktopSyncStatus.tsx`, `useDesktopStorage.ts`
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { WindowState } from '../types/desktop.types';
import { isLegacyHiddenDesktopAppComponent } from '../utils/desktopAppRegistry';
import {
	translateDesktopStorageSyncError,
	type DesktopStorageSyncErrorCode,
} from '../utils/desktopStorageSyncError';

export function useDesktopWorkspaceLifecycleEffects(params: {
	isSyncing: boolean;
	storageError: DesktopStorageSyncErrorCode | null | undefined;
	notifyDesktop: { error: (title: string, message: string) => void };
	windows: WindowState[];
	closeWindow: (id: string) => void;
}): void {
	const { t } = useTranslation('desktopUi');
	const { isSyncing, storageError, notifyDesktop, windows, closeWindow } =
		params;

	const prevSyncingRef = useRef(false);
	const voiceCloseGracePeriodEndedRef = useRef(false);

	useEffect(() => {
		const prev = prevSyncingRef.current;
		prevSyncingRef.current = isSyncing;
		if (prev && !isSyncing && storageError) {
			const message = translateDesktopStorageSyncError(storageError, t);
			if (message) {
				notifyDesktop.error(t('workspace.syncErrorTitle'), message);
			}
		}
	}, [isSyncing, storageError, notifyDesktop, t]);

	useEffect(() => {
		const VOICE_CLOSE_GRACE_MS = 1500;
		const t = setTimeout(() => {
			voiceCloseGracePeriodEndedRef.current = true;
		}, VOICE_CLOSE_GRACE_MS);
		return () => clearTimeout(t);
	}, []);

	useEffect(() => {
		if (voiceCloseGracePeriodEndedRef.current) return;
		const voiceWindows = windows.filter((w) =>
			isLegacyHiddenDesktopAppComponent(w.appComponent)
		);
		if (voiceWindows.length === 0) return;
		voiceWindows.forEach((w) => {
			closeWindow(w.id);
		});
	}, [windows, closeWindow]);
}
