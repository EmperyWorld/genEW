/**
 * Framer Motion variants for desktop windows — springy by default,
 * minimal movement when prefers-reduced-motion (desktop_brand_style / a11y).
 */
import type { Variants } from 'framer-motion';
import {
	desktopShellInstantTransition,
	desktopShellWindowMinimizeTransition,
} from './desktopShellMotion';

const REDUCED_TRANSITION = desktopShellInstantTransition();

/** Outer window shell (open / close / minimize / drag affordance). */
export function getDesktopWindowFrameVariants(
	reduceMotion: boolean,
	speed: import('@/types/profile').DesktopShellMotionSpeed = 'normal'
): Variants {
	if (reduceMotion) {
		return {
			initial: { opacity: 0, scale: 1, y: 0 },
			animate: {
				opacity: 1,
				scale: 1,
				y: 0,
				transition: REDUCED_TRANSITION,
			},
			exit: {
				opacity: 0,
				scale: 1,
				y: 0,
				transition: { duration: 0.12, ease: 'easeIn' },
			},
			focus: { scale: 1 },
			minimized: {
				opacity: 0,
				scale: 0.88,
				y: 24,
				transition: desktopShellWindowMinimizeTransition(true, speed),
			},
			drag: { scale: 1 },
		};
	}
	return {
		initial: {
			opacity: 0,
			scale: 0.985,
			y: 8,
		},
		animate: {
			opacity: 1,
			scale: 1,
			y: 0,
			transition: desktopShellWindowMinimizeTransition(false, speed),
		},
		exit: {
			opacity: 0,
			scale: 0.98,
			y: 6,
			transition: { duration: 0.12, ease: 'easeIn' },
		},
		focus: {
			scale: 1,
		},
		minimized: {
			opacity: 0,
			scale: 0.82,
			y: 48,
			transition: desktopShellWindowMinimizeTransition(false, speed),
		},
		drag: {
			scale: 1,
		},
	};
}

/** Inner content fade (folder / app chrome). */
export function getDesktopWindowContentVariants(
	reduceMotion: boolean
): Variants {
	if (reduceMotion) {
		return {
			initial: { opacity: 0 },
			animate: {
				opacity: 1,
				transition: REDUCED_TRANSITION,
			},
		};
	}
	return {
		initial: { opacity: 0 },
		animate: {
			opacity: 1,
			transition: { duration: 0.18, delay: 0.04 },
		},
	};
}
