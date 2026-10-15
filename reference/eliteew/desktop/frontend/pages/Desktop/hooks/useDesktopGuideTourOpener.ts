/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Registers an app's guided-tour opener with the desktop window title bar.
 *
 * Invariants:
 * - No-op outside `DesktopGuideTourOpenerProvider` (non-desktop embeds).
 * - `open` is held in a ref so parent re-renders do not re-register via unstable callback identity.
 *
 * Related:
 * - context/DesktopGuideTourOpenerContext.tsx, WindowTitleBar.tsx
 */

import { useEffect, useRef } from 'react';

import { useDesktopGuideTourOpenerContext } from '../context/DesktopGuideTourOpenerContext';

/** Registers `open` with the desktop window chrome title-bar excursion control. */
export function useDesktopGuideTourOpener(
	open: () => void,
	options?: { enabled?: boolean }
): void {
	const ctx = useDesktopGuideTourOpenerContext();
	const enabled = options?.enabled ?? true;
	const openRef = useRef(open);
	openRef.current = open;

	useEffect(() => {
		if (!ctx || !enabled) {
			return;
		}
		const stableOpener = () => {
			openRef.current();
		};
		ctx.registerGuideTourOpener(stableOpener);
		return () => ctx.unregisterGuideTourOpener();
	}, [ctx, enabled]);
}
