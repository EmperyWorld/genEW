/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Global pointer safety net for Meta Quest Browser: dismiss sticky hover chrome when the laser
 * leaves the taskbar or releases without a proper `pointerleave`.
 *
 * Invariants:
 * - No-op outside `isDesktopLaserPointerEnvironment()`.
 * - Dispatches `DESKTOP_LASER_POINTER_DISMISS_EVENT` for **hover** chrome only (previews/tooltips), not click toggles.
 *
 * Related:
 * - utils/desktopLaserPointerEnvironment.ts
 * - utils/subscribeDocumentVisibleSync.ts
 */
import { useEffect, useRef } from 'react';
import {
	dismissDesktopLaserPointerHoverChrome,
	isDesktopLaserPointerEnvironment,
} from '@/pages/Desktop/utils/desktopLaserPointerEnvironment';
import { subscribeDocumentHiddenSync } from '@/pages/Desktop/utils/subscribeDocumentVisibleSync';
import { isOverDesktopTaskbarDismissSafeZone } from '@/pages/Desktop/utils/desktopTaskbarDismissSafeZone';

/** Mount once on the desktop shell (Taskbar). */
export function useDesktopLaserPointerSafetyNet(): void {
	const wasOverSafeZoneRef = useRef(false);

	useEffect(() => {
		if (!isDesktopLaserPointerEnvironment()) return;

		const dismissHoverChrome = () => {
			dismissDesktopLaserPointerHoverChrome();
		};

		const onPointerMove = (event: PointerEvent) => {
			const target = document.elementFromPoint(event.clientX, event.clientY);
			const over = isOverDesktopTaskbarDismissSafeZone(target);
			if (wasOverSafeZoneRef.current && !over) {
				dismissHoverChrome();
			}
			wasOverSafeZoneRef.current = over;

			if (
				event.clientX <= 0 ||
				event.clientY <= 0 ||
				event.clientX >= window.innerWidth - 1 ||
				event.clientY >= window.innerHeight - 1
			) {
				dismissHoverChrome();
			}
		};

		window.addEventListener('pointermove', onPointerMove, { passive: true });
		window.addEventListener('blur', dismissHoverChrome);
		const unsubHidden = subscribeDocumentHiddenSync(dismissHoverChrome);

		return () => {
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('blur', dismissHoverChrome);
			unsubHidden();
		};
	}, []);
}
