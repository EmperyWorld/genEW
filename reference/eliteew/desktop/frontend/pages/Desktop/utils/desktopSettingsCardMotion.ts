/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared Framer Motion props for Desktop Settings Center form cards.
 *
 * Related:
 * - DesktopSettingsVisualStudioSection.tsx
 */

import type { Transition } from 'framer-motion';

const EASE_OUT: Transition['ease'] = [0.16, 1, 0.3, 1];

export function desktopSettingsCardMotionProps(
	delaySec = 0,
	reduceMotion = false
): {
	initial: { opacity: number; y: number };
	animate: { opacity: number; y: number };
	transition: Transition;
} {
	if (reduceMotion) {
		return {
			initial: { opacity: 1, y: 0 },
			animate: { opacity: 1, y: 0 },
			transition: { duration: 0 },
		};
	}
	return {
		initial: { opacity: 0, y: 10 },
		animate: { opacity: 1, y: 0 },
		transition: { duration: 0.22, ease: EASE_OUT, delay: delaySec },
	};
}
