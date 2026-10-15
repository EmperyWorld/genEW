/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Short open guard after a click-toggle popover opens — suppresses ghost `mousedown` /
 * backdrop clicks on Meta Quest Browser right after open.
 *
 * Invariants:
 * - Guard arms when `isOpen` becomes true; clears after `delayMs` or on close/unmount.
 *
 * Related:
 * - utils/desktopShellOutsideDismiss.ts
 * - components/StartMenu.tsx
 * - components/TaskbarPinnedAndWindowsStrip.tsx
 */
import { useEffect, useRef, type RefObject } from 'react';
import { DEFAULT_DESKTOP_POPOVER_OPEN_GUARD_MS } from '@/pages/Desktop/utils/desktopShellOutsideDismiss';

/** Returns a ref read synchronously in pointer handlers (`ref.current`). */
export function useDesktopPopoverOpenGuard(
	isOpen: boolean,
	delayMs: number = DEFAULT_DESKTOP_POPOVER_OPEN_GUARD_MS
): RefObject<boolean> {
	const guardRef = useRef(false);

	useEffect(() => {
		if (!isOpen) {
			guardRef.current = false;
			return;
		}
		guardRef.current = true;
		const guardTimer = window.setTimeout(() => {
			guardRef.current = false;
		}, delayMs);
		return () => window.clearTimeout(guardTimer);
	}, [delayMs, isOpen]);

	return guardRef;
}
