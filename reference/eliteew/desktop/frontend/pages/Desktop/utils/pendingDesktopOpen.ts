/**
 * Queue opening a desktop app window after redirecting from a legacy full-page route.
 */

import { log } from '@/utils/logger';

export const PENDING_DESKTOP_OPEN_KEY = 'eliteew.desktop.pendingOpen';

export type PendingDesktopOpen =
	| { kind: 'ugs'; rawTarget: string }
	| { kind: 'app'; appComponent: string };

export function queuePendingDesktopOpen(payload: PendingDesktopOpen): void {
	try {
		sessionStorage.setItem(PENDING_DESKTOP_OPEN_KEY, JSON.stringify(payload));
	} catch (e) {
		log.warn('pendingDesktopOpen', String(e));
	}
}

export function consumePendingDesktopOpen(): PendingDesktopOpen | null {
	try {
		const raw = sessionStorage.getItem(PENDING_DESKTOP_OPEN_KEY);
		if (!raw) return null;
		sessionStorage.removeItem(PENDING_DESKTOP_OPEN_KEY);
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return null;
		const o = parsed as Record<string, unknown>;
		if (o.kind === 'ugs' && typeof o.rawTarget === 'string') {
			return { kind: 'ugs', rawTarget: o.rawTarget };
		}
		if (o.kind === 'app' && typeof o.appComponent === 'string') {
			return { kind: 'app', appComponent: o.appComponent };
		}
	} catch {
		// ignore
	}
	return null;
}
