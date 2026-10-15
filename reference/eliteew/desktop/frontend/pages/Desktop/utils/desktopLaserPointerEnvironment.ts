/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Detect Meta Quest / VR browser laser-pointer environments where CSS `:hover` and
 * `pointerleave` are unreliable despite reporting `(pointer: fine)`.
 *
 * Invariants:
 * - Root marker class is idempotent; read via `isDesktopLaserPointerEnvironment()` after bootstrap.
 *
 * Related:
 * - hooks/useFinePointerHover.ts
 * - hooks/useDesktopLaserPointerSafetyNet.ts
 * - styles/index.css (`fine-hover` variant)
 */

/** Applied on `<html>` when laser-pointer safety net is active. */
export const DESKTOP_LASER_POINTER_ROOT_CLASS = 'desktop-laser-pointer';

/** Window event: force-dismiss hover tooltips / taskbar flyouts. */
export const DESKTOP_LASER_POINTER_DISMISS_EVENT =
	'desktop-laser-pointer-dismiss';

export function detectDesktopLaserPointerEnvironment(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent || '';
	if (/OculusBrowser|Oculus Quest|Quest 2|Quest 3|Meta Quest/i.test(ua)) {
		return true;
	}
	if (/Android/i.test(ua) && /Oculus|Meta Quest|Quest|VR/i.test(ua)) {
		return true;
	}
	return false;
}

export function markDesktopLaserPointerRoot(): boolean {
	if (typeof document === 'undefined') return false;
	const active = detectDesktopLaserPointerEnvironment();
	if (active) {
		document.documentElement.classList.add(DESKTOP_LASER_POINTER_ROOT_CLASS);
	}
	return active;
}

export function isDesktopLaserPointerEnvironment(): boolean {
	if (typeof document === 'undefined') {
		return detectDesktopLaserPointerEnvironment();
	}
	return (
		document.documentElement.classList.contains(
			DESKTOP_LASER_POINTER_ROOT_CLASS
		) || detectDesktopLaserPointerEnvironment()
	);
}

export function dismissDesktopLaserPointerHoverChrome(): void {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(new CustomEvent(DESKTOP_LASER_POINTER_DISMISS_EVENT));
}
