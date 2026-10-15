/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * React hook: apply inactive-window soft blur class when flag is on and window is inactive.
 *
 * Invariants:
 * - Respects low-GPU mode and minimized/hidden windows; reacts to live toggle change event.
 *
 * Related:
 * - `desktopInactiveWindowBlur.ts`, `EnhancedWindow.tsx`
 * ---
 */

import { useEffect, useMemo, useState } from 'react';
import {
	DESKTOP_INACTIVE_WINDOW_SOFT_BLUR_CHANGE_EVENT,
	isDesktopInactiveWindowSoftBlurEnabled,
} from './desktopInactiveWindowBlur';
import { isDesktopLowGpuModeEnabled } from './desktopLowGpuMode';

export type UseDesktopInactiveWindowSoftBlurParams = {
	isActive: boolean;
	isMinimized: boolean;
	isMinimizing: boolean;
};

export function useDesktopInactiveWindowSoftBlur(
	params: UseDesktopInactiveWindowSoftBlurParams
): boolean {
	const { isActive, isMinimized, isMinimizing } = params;
	const [softBlurEnabled, setSoftBlurEnabled] = useState(() =>
		isDesktopInactiveWindowSoftBlurEnabled()
	);
	const lowGpuMode = useMemo(() => isDesktopLowGpuModeEnabled(), []);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const sync = () => {
			setSoftBlurEnabled(isDesktopInactiveWindowSoftBlurEnabled());
		};
		window.addEventListener(
			DESKTOP_INACTIVE_WINDOW_SOFT_BLUR_CHANGE_EVENT,
			sync
		);
		return () => {
			window.removeEventListener(
				DESKTOP_INACTIVE_WINDOW_SOFT_BLUR_CHANGE_EVENT,
				sync
			);
		};
	}, []);

	return useMemo(
		() =>
			softBlurEnabled &&
			!lowGpuMode &&
			!isActive &&
			!isMinimized &&
			!isMinimizing,
		[softBlurEnabled, lowGpuMode, isActive, isMinimized, isMinimizing]
	);
}
