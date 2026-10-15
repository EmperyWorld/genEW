/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Brief «saved» pulse after syncing→idle transition for DesktopSyncStatus micro-feedback.
 *
 * Invariants:
 * - Does not pulse when PATCH never ran (pure idle without prior sync).
 * - Clears on error/offline/conflict states.
 *
 * Related:
 * - components/DesktopSyncStatus.tsx
 */

import { useEffect, useRef, useState } from 'react';

const SAVED_PULSE_MS = 2000;

export function useDesktopSyncSavedPulse(isSyncing: boolean): boolean {
	const [showSavedPulse, setShowSavedPulse] = useState(false);
	const wasSyncingRef = useRef(false);
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		if (isSyncing) {
			wasSyncingRef.current = true;
			if (timerRef.current != null) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			setShowSavedPulse(false);
			return;
		}

		if (!wasSyncingRef.current) return;

		wasSyncingRef.current = false;
		setShowSavedPulse(true);
		if (timerRef.current != null) window.clearTimeout(timerRef.current);
		timerRef.current = window.setTimeout(() => {
			setShowSavedPulse(false);
			timerRef.current = null;
		}, SAVED_PULSE_MS);

		return () => {
			if (timerRef.current != null) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [isSyncing]);

	return showSavedPulse;
}
