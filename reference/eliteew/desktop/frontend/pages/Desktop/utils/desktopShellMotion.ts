/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared framer-motion presets for desktop shell chrome (taskbar, menus, window morph).
 *
 * Invariants:
 * - Start Menu panels no longer consume these variants (plain mount); helpers kept for legacy callers / tests.
 * - Menu/list helpers remain instant (no opacity/scale/y) if still imported.
 * - Other presets honor prefers-reduced-motion via caller checks or instant transitions.
 *
 * Related:
 * - desktopWindowMotionVariants.ts, Taskbar.tsx, QuickSearch.tsx, DesktopWindowMorphChip.tsx
 */

import type { Transition, Variants } from 'framer-motion';
import type {
	DesktopSceneDepth,
	DesktopShellMotionSpeed,
} from '@/types/profile';
import { normalizeDesktopShellMotionSpeed } from '@/types/profile';

/** Aligns with useWindowManager minimize settle timer (normal speed). */
export const DESKTOP_WINDOW_MINIMIZE_MS = 320;

export const DESKTOP_SHELL_MOTION_SPEED_SCALE: Record<
	DesktopShellMotionSpeed,
	number
> = {
	slow: 1.35,
	normal: 1,
	fast: 0.72,
};

export function desktopShellMotionSpeedScale(
	speed: DesktopShellMotionSpeed | string | undefined | null
): number {
	return DESKTOP_SHELL_MOTION_SPEED_SCALE[
		normalizeDesktopShellMotionSpeed(speed)
	];
}

function scaledSpring(
	base: Transition,
	speed: DesktopShellMotionSpeed
): Transition {
	const scale = desktopShellMotionSpeedScale(speed);
	return {
		...base,
		stiffness:
			typeof base.stiffness === 'number'
				? Math.round(base.stiffness / scale)
				: base.stiffness,
		damping:
			typeof base.damping === 'number'
				? Math.round(base.damping / Math.sqrt(scale))
				: base.damping,
		mass: typeof base.mass === 'number' ? base.mass * scale : base.mass,
	};
}

export const DESKTOP_SHELL_SPRING = {
	snappy: { type: 'spring' as const, stiffness: 420, damping: 36, mass: 0.85 },
	shell: { type: 'spring' as const, stiffness: 400, damping: 32, mass: 0.9 },
	window: { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.95 },
} satisfies Record<string, Transition>;

export const DESKTOP_SCENE_PARALLAX_PCT: Record<DesktopSceneDepth, number> = {
	soft: 1.25,
	balanced: 2.5,
	immersive: 4,
};

export function desktopWindowMorphLayoutId(windowId: string): string {
	return `desktop-shell-win-morph-${windowId}`;
}

export function desktopShellInstantTransition(): Transition {
	return { duration: 0.01 };
}

export function desktopShellTransitionDurationSec(
	reduceMotion: boolean,
	speed: DesktopShellMotionSpeed = 'normal',
	baseSec = 0.18
): number {
	if (reduceMotion) {
		return 0;
	}
	return baseSec * desktopShellMotionSpeedScale(speed);
}

export function desktopShellLayoutTransition(
	reduceMotion = false,
	speed: DesktopShellMotionSpeed = 'normal'
): Transition {
	if (reduceMotion) {
		return desktopShellInstantTransition();
	}
	const spring = scaledSpring(DESKTOP_SHELL_SPRING.window, speed);
	return {
		...spring,
		layout: { ...spring },
	};
}

export function desktopShellTaskbarEnterVariants(
	reduceMotion: boolean,
	speed: DesktopShellMotionSpeed = 'normal'
): Variants {
	if (reduceMotion) {
		return {
			hidden: { y: 0, opacity: 1 },
			visible: { y: 0, opacity: 1 },
		};
	}
	return {
		hidden: { y: 64, opacity: 0 },
		visible: {
			y: 0,
			opacity: 1,
			transition: scaledSpring(DESKTOP_SHELL_SPRING.shell, speed),
		},
	};
}

export function desktopShellMenuPanelVariants(
	_reduceMotion: boolean,
	_speed: DesktopShellMotionSpeed = 'normal'
): Variants {
	// Instant show/hide — spring/scale/opacity on Start Menu was a major RDP paint spike.
	return {
		hidden: { opacity: 1, scale: 1, y: 0 },
		visible: {
			opacity: 1,
			scale: 1,
			y: 0,
			transition: { duration: 0 },
		},
		exit: {
			opacity: 1,
			scale: 1,
			y: 0,
			transition: { duration: 0 },
		},
	};
}

export function desktopShellListItemVariants(
	_reduceMotion: boolean,
	_speed: DesktopShellMotionSpeed = 'normal'
): Variants {
	return {
		hidden: { opacity: 1, x: 0 },
		visible: {
			opacity: 1,
			x: 0,
			transition: { duration: 0 },
		},
	};
}

export function desktopShellSearchPanelVariants(
	reduceMotion: boolean,
	speed: DesktopShellMotionSpeed = 'normal'
): Variants {
	if (reduceMotion) {
		return {
			hidden: { opacity: 0 },
			visible: { opacity: 1, transition: { duration: 0 } },
			exit: { opacity: 0, transition: { duration: 0 } },
		};
	}
	return {
		hidden: { opacity: 0, scale: 0.95, y: -20 },
		visible: {
			opacity: 1,
			scale: 1,
			y: 0,
			transition: {
				...scaledSpring(DESKTOP_SHELL_SPRING.shell, speed),
				staggerChildren: 0.05,
			},
		},
		exit: {
			opacity: 0,
			scale: 0.95,
			y: -20,
			transition: { duration: 0.15 },
		},
	};
}

export function desktopShellWindowMinimizeTransition(
	reduceMotion: boolean,
	speed: DesktopShellMotionSpeed = 'normal'
): Transition {
	if (reduceMotion) {
		return { duration: 0.12, ease: 'easeIn' };
	}
	const durationMs = Math.round(
		DESKTOP_WINDOW_MINIMIZE_MS * desktopShellMotionSpeedScale(speed)
	);
	return {
		...scaledSpring(DESKTOP_SHELL_SPRING.window, speed),
		duration: durationMs / 1000,
	};
}
