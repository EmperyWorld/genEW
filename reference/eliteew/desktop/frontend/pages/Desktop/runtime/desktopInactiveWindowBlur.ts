/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Optional inactive-window soft blur flag (localStorage / Vite env); live toggle via change event.
 *
 * Invariants:
 * - Default off (`env ?? false`); low-GPU path disables blur in the hook layer.
 *
 * Related:
 * - `useDesktopInactiveWindowSoftBlur.ts`, `desktopInactiveWindowSoftBlurPerf.ts`
 * - documentation/product/desktop/DESKTOP-WINDOW-RUNTIME-PERFORMANCE.md
 * ---
 */

const STORAGE_KEY = 'elite_desktop_inactive_window_soft_blur';

export const DESKTOP_INACTIVE_WINDOW_SOFT_BLUR_CHANGE_EVENT =
	'elite-desktop-inactive-window-soft-blur-change';

function parseBooleanLike(value: string | null | undefined): boolean | null {
	if (value == null) return null;
	const normalized = value.trim().toLowerCase();
	if (
		normalized === '1' ||
		normalized === 'true' ||
		normalized === 'on' ||
		normalized === 'yes'
	) {
		return true;
	}
	if (
		normalized === '0' ||
		normalized === 'false' ||
		normalized === 'off' ||
		normalized === 'no'
	) {
		return false;
	}
	return null;
}

export function isDesktopInactiveWindowSoftBlurEnabled(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		const fromStorage = parseBooleanLike(
			window.localStorage.getItem(STORAGE_KEY)
		);
		if (fromStorage != null) return fromStorage;
	} catch {
		/* ignore */
	}
	const env = parseBooleanLike(
		(import.meta.env?.VITE_DESKTOP_INACTIVE_WINDOW_SOFT_BLUR as
			| string
			| undefined) ?? undefined
	);
	return env ?? false;
}

export function setDesktopInactiveWindowSoftBlurEnabled(next: boolean): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
	} catch {
		/* ignore localStorage write failures */
	}
	window.dispatchEvent(
		new CustomEvent(DESKTOP_INACTIVE_WINDOW_SOFT_BLUR_CHANGE_EVENT, {
			detail: { enabled: next },
		})
	);
}
