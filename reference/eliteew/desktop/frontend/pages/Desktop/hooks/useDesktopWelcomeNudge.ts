/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * First-run non-blocking welcome nudge visibility (banner before manual tour).
 *
 * Invariants:
 * - Respects ONBOARDING_DISMISSED; no auto-modal.
 * - Session dismiss hides until next visit (sessionStorage).
 *
 * Related:
 * - components/DesktopWelcomeNudgeBanner.tsx, useDesktopWelcomeOnboarding.ts
 */

import { useCallback, useSyncExternalStore } from 'react';
import { readDesktopOnboardingDismissed } from './useDesktopWelcomeOnboarding';

const SESSION_DISMISS_KEY = 'eliteew-desktop-welcome-nudge-dismissed-session';

function readSessionDismissed(): boolean {
	if (typeof window === 'undefined') return true;
	try {
		return (
			window.sessionStorage.getItem(SESSION_DISMISS_KEY) === '1' ||
			readDesktopOnboardingDismissed()
		);
	} catch {
		return true;
	}
}

const nudgeListeners = new Set<() => void>();

function notifyNudgeListeners(): void {
	for (const listener of nudgeListeners) listener();
}

export function useDesktopWelcomeNudge(shellHydrated: boolean): {
	showNudge: boolean;
	dismissNudge: () => void;
} {
	const dismissed = useSyncExternalStore(
		(onStoreChange) => {
			nudgeListeners.add(onStoreChange);
			return () => nudgeListeners.delete(onStoreChange);
		},
		readSessionDismissed,
		readSessionDismissed
	);

	const dismissNudge = useCallback(() => {
		try {
			window.sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
		} catch {
			// ignore
		}
		notifyNudgeListeners();
	}, []);

	const showNudge = shellHydrated && !dismissed;

	return { showNudge, dismissNudge };
}
