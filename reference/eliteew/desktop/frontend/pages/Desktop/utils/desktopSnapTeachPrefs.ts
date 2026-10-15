/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Persist dismiss state for first-run desktop window snap teaching overlay (plan 02/20 R02).
 *
 * Invariants:
 * - localStorage only; no server sync required for onboarding hint.
 *
 * Related:
 * - components/DesktopSnapTeachOverlay.tsx, SnapPreview.tsx
 */

export const DESKTOP_SNAP_TEACH_STORAGE_KEY = 'elite_desktop_snap_teach_dismissed_v1';

export function isDesktopSnapTeachDismissed(): boolean {
	if (typeof localStorage === 'undefined') return true;
	try {
		return localStorage.getItem(DESKTOP_SNAP_TEACH_STORAGE_KEY) === '1';
	} catch {
		return true;
	}
}

export function dismissDesktopSnapTeach(): void {
	try {
		localStorage.setItem(DESKTOP_SNAP_TEACH_STORAGE_KEY, '1');
	} catch {
		/* ignore */
	}
}

export function resetDesktopSnapTeachForTests(): void {
	try {
		localStorage.removeItem(DESKTOP_SNAP_TEACH_STORAGE_KEY);
	} catch {
		/* ignore */
	}
}
