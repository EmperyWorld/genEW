/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Deep-link URL для карточки приложения в desktop App Store (`#desktop/store/{appId}`).
 *
 * Invariants:
 * - Только клиентская сборка URL; hash-контракт — desktopStoreHash.ts.
 *
 * Related:
 * - desktopStoreHash.ts, AppStoreCard.tsx
 * - @/utils/clipboard (safeCopyToClipboard)
 */

import { safeCopyToClipboard } from '@/utils/clipboard';
import { buildDesktopStoreHashFragment } from './desktopStoreHash';

/** Full page URL with store app hash (current origin + path + search). */
export function buildAppStoreAppDeepLink(appId: string): string {
	const trimmed = appId.trim();
	if (typeof window === 'undefined' || !trimmed) {
		return `#${buildDesktopStoreHashFragment(trimmed || null)}`;
	}
	const hash = buildDesktopStoreHashFragment(trimmed);
	return `${window.location.origin}${window.location.pathname}${window.location.search}#${hash}`;
}

/** Copy deep link; returns false when clipboard API unavailable or denied. */
export async function copyAppStoreAppDeepLink(appId: string): Promise<boolean> {
	const url = buildAppStoreAppDeepLink(appId);
	return safeCopyToClipboard(url);
}
