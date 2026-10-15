/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Compute deterministic clock update cadence for taskbar time rendering.
 *
 * Invariants:
 * - Initial delay is always in range 1..tickMs.
 * - Minute mode aligns updates to minute boundaries (hh:mm:00.000).
 *
 * Related:
 * - components/TaskbarClock.tsx
 */

import { DESKTOP_POLLING } from '@/pages/Desktop/constants';

const MINUTE_MS = 60_000;

export function getTaskbarClockTickMs(showSeconds: boolean): number {
	return showSeconds ? DESKTOP_POLLING.CLOCK_MS : MINUTE_MS;
}

type GetTaskbarClockInitialDelayArgs = {
	showSeconds: boolean;
	now?: Date;
};

export function getTaskbarClockInitialDelayMs({
	showSeconds,
	now = new Date(),
}: GetTaskbarClockInitialDelayArgs): number {
	const tickMs = getTaskbarClockTickMs(showSeconds);
	const elapsedMs = showSeconds
		? now.getMilliseconds()
		: now.getSeconds() * 1000 + now.getMilliseconds();
	const remainder = elapsedMs % tickMs;
	const delay = remainder === 0 ? tickMs : tickMs - remainder;
	return Math.max(1, Math.min(tickMs, delay));
}
