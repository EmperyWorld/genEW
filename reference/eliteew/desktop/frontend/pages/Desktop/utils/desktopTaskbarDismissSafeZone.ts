/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Hit-test helpers for Meta Quest laser-pointer safety net: decide whether pointer
 * coordinates are over taskbar chrome that should not trigger hover dismiss.
 *
 * Invariants:
 * - Click-toggle surfaces (Start panel, pinned menu, notifications, tray) stay in the safe zone while open.
 *
 * Related:
 * - hooks/useDesktopLaserPointerSafetyNet.ts
 * - utils/desktopLaserPointerEnvironment.ts
 */

/** True when `target` is inside taskbar hover/toggle chrome protected from laser dismiss. */
export function isOverDesktopTaskbarDismissSafeZone(
	target: Element | null
): boolean {
	if (!target) return false;
	return (
		target.closest('[data-desktop-taskbar-strip]') != null ||
		target.closest('[data-taskbar-flyout]') != null ||
		target.closest('#start-menu-panel') != null ||
		target.closest('#notification-center-panel') != null ||
		target.closest('[data-taskbar-pinned-menu]') != null ||
		target.closest('[data-tray-popup]') != null ||
		target.closest('[role="tooltip"]') != null
	);
}
