/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Run a callback on an interval and immediately when the tab becomes visible again.
 *
 * Invariants:
 * - When `enabled` is false, no timers or listeners remain attached.
 * - Callback always reads the latest closure via ref (safe for countdown/elapsed UI).
 *
 * Related:
 * - components/AssistantApp.tsx
 * - components/notificationHub/useTimeTick.ts
 */

import { useEffect, useRef } from 'react';
import { subscribeDocumentVisibleSync } from '../utils/subscribeDocumentVisibleSync';

/**
 * Interval helper for second-level UI timers (rate limits, stream elapsed, etc.).
 * Background tabs may throttle `setInterval`; visibility return triggers an immediate refresh.
 */
export function useVisibilityAwareInterval(
	callback: () => void,
	intervalMs: number,
	enabled: boolean
): void {
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	useEffect(() => {
		if (!enabled) return;

		const run = () => {
			callbackRef.current();
		};

		run();
		const intervalId = window.setInterval(run, intervalMs);
		const unsubscribeVisible = subscribeDocumentVisibleSync(run);

		return () => {
			window.clearInterval(intervalId);
			unsubscribeVisible();
		};
	}, [enabled, intervalMs]);
}
