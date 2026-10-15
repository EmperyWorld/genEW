/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Resolve effective desktop shell motion prefs from profile UI, accessibility, and OS.
 *
 * Invariants:
 * - Parallax and morph disable when effective reduce motion is true.
 *
 * Related:
 * - desktopShellMotion.ts, DesktopShellMotionPrefsContext.tsx
 */

import type {
	AccessibilityPreferences,
	DesktopShellMotionSpeed,
	DesktopShellParallaxIntensity,
	UIPreferences,
} from '@/types/profile';
import {
	normalizeDesktopShellMotionSpeed,
	normalizeDesktopShellParallaxIntensity,
} from '@/types/profile';
import {
	DESKTOP_WINDOW_MINIMIZE_MS,
	desktopShellMotionSpeedScale,
} from './desktopShellMotion';

export type DesktopShellMotionPrefs = {
	reduceMotion: boolean;
	parallaxEnabled: boolean;
	parallaxIntensityScale: number;
	morphEnabled: boolean;
	speed: DesktopShellMotionSpeed;
	minimizeMs: number;
	speedScale: number;
};

export const DESKTOP_SHELL_PARALLAX_INTENSITY_SCALE: Record<
	DesktopShellParallaxIntensity,
	number
> = {
	subtle: 0.65,
	normal: 1,
	strong: 1.4,
};

export function resolveDesktopShellMinimizeMs(
	speed: DesktopShellMotionSpeed,
	reduceMotion: boolean
): number {
	if (reduceMotion) {
		return 120;
	}
	return Math.round(
		DESKTOP_WINDOW_MINIMIZE_MS * desktopShellMotionSpeedScale(speed)
	);
}

export type ResolveDesktopShellMotionInput = {
	ui: Pick<
		UIPreferences,
		| 'animations_enabled'
		| 'desktop_shell_reduce_motion'
		| 'desktop_shell_parallax_enabled'
		| 'desktop_shell_parallax_intensity'
		| 'desktop_shell_window_morph_enabled'
		| 'desktop_shell_motion_speed'
	>;
	accessibility?: AccessibilityPreferences | null;
	systemReduceMotion?: boolean;
};

export function resolveDesktopShellMotionPrefs(
	input: ResolveDesktopShellMotionInput
): DesktopShellMotionPrefs {
	const speed = normalizeDesktopShellMotionSpeed(
		input.ui.desktop_shell_motion_speed
	);
	const parallaxIntensity = normalizeDesktopShellParallaxIntensity(
		input.ui.desktop_shell_parallax_intensity
	);
	const reduceMotion =
		input.systemReduceMotion === true ||
		input.accessibility?.reduce_motion === true ||
		input.ui.animations_enabled === false ||
		input.ui.desktop_shell_reduce_motion === true;
	const parallaxEnabled =
		!reduceMotion && input.ui.desktop_shell_parallax_enabled !== false;
	const morphEnabled =
		!reduceMotion && input.ui.desktop_shell_window_morph_enabled !== false;
	const speedScale = desktopShellMotionSpeedScale(speed);

	return {
		reduceMotion,
		parallaxEnabled,
		parallaxIntensityScale:
			DESKTOP_SHELL_PARALLAX_INTENSITY_SCALE[parallaxIntensity],
		morphEnabled,
		speed,
		minimizeMs: resolveDesktopShellMinimizeMs(speed, reduceMotion),
		speedScale,
	};
}
