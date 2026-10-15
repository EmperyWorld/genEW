/**
 * Coerce full-page routes into desktop shell + pending window (desktop-only mode).
 */

import { STUDIO_GU_INITIAL_MODE_KEY } from '../../StudioGU/transcription/studioTranscriptionConstants';
import {
	getPendingAppComponentForLegacyPage,
	isUgsLegacyPage,
	SYSTEM_FULL_PAGE_ROUTES,
} from './desktopOnlyLegacyRoutes';
import { SOCIAL_HUB_INITIAL_TAB_KEY } from './socialHubConstants';
import {
	queuePendingDesktopOpen,
	type PendingDesktopOpen,
} from './pendingDesktopOpen';

export function shouldStayFullPageShell(page: string): boolean {
	return SYSTEM_FULL_PAGE_ROUTES.has(page);
}

/**
 * If `page` is a legacy full-page app route, queues open action and returns `desktop`.
 * Otherwise returns the same page.
 */
export function coercePageToDesktopShell(
	page: string,
	rawHash: string
): { page: string; pending: PendingDesktopOpen | null } {
	if (shouldStayFullPageShell(page) || page === 'desktop') {
		return { page, pending: null };
	}

	const pending = buildPendingOpenForLegacyPage(page, rawHash);
	if (page === 'audio-transcription') {
		try {
			sessionStorage.setItem(STUDIO_GU_INITIAL_MODE_KEY, 'transcription');
		} catch {
			// ignore
		}
	}
	if (page === 'user-profile') {
		try {
			sessionStorage.setItem(SOCIAL_HUB_INITIAL_TAB_KEY, 'profile');
		} catch {
			// ignore
		}
	}
	queuePendingDesktopOpen(pending);
	return { page: 'desktop', pending };
}

export function buildPendingOpenForLegacyPage(
	page: string,
	rawHash: string
): PendingDesktopOpen {
	if (isUgsLegacyPage(page)) {
		const target = rawHash?.trim() || page;
		return { kind: 'ugs', rawTarget: target };
	}

	const app = getPendingAppComponentForLegacyPage(page) ?? 'UGS';
	return { kind: 'app', appComponent: app };
}

/**
 * Replace window hash with #/desktop without adding history entry.
 */
export function replaceHashWithDesktop(): void {
	if (typeof window === 'undefined') return;
	const base = `${window.location.pathname}${window.location.search}`;
	window.history.replaceState(null, '', `${base}#/desktop`);
}
