/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop welcome tour persistence helpers; launch is manual (taskbar / settings).
 *
 * Invariants:
 * - Does not auto-open on first visit; operator starts via `onOpenDesktopWelcomeTour`.
 * - `persistDesktopOnboardingDismissed` still records completion after manual run.
 *
 * Related:
 * - components/DesktopWelcomeScreen.tsx
 * - components/TaskbarRightToolbar.tsx
 */

import { STORAGE_KEYS } from '../constants';

export function readDesktopOnboardingDismissed(): boolean {
	if (typeof window === 'undefined') return true;
	try {
		return (
			window.localStorage.getItem(STORAGE_KEYS.ONBOARDING_DISMISSED) === '1'
		);
	} catch {
		return true;
	}
}

export function persistDesktopOnboardingDismissed(): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(STORAGE_KEYS.ONBOARDING_DISMISSED, '1');
	} catch {
		// ignore quota / private mode
	}
}

/** @deprecated Auto-start removed — kept as no-op for stable import sites. */
export function useDesktopWelcomeOnboarding(_params: {
	storageLoading: boolean;
	showWelcome: boolean;
	setShowWelcome: (value: boolean) => void;
}): void {
	// Manual launch only (taskbar «Экскурсия»).
}
