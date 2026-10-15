/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * SessionStorage-список недавно просмотренных приложений магазина (порядок MRU).
 *
 * Invariants:
 * - Только UI-сессия; без API. Максимум 8 id, без дубликатов.
 *
 * Related:
 * - AppStore.tsx, AppStoreRecentlyViewedRow.tsx
 */

const APP_STORE_RECENTLY_VIEWED_KEY =
	'eliteew-desktop-app-store-recently-viewed';
const MAX_RECENTLY_VIEWED = 8;

function readRawIds(): string[] {
	if (typeof sessionStorage === 'undefined') return [];
	try {
		const raw = sessionStorage.getItem(APP_STORE_RECENTLY_VIEWED_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(id): id is string => typeof id === 'string' && id.length > 0
		);
	} catch {
		return [];
	}
}

/** MRU ids (newest first). */
export function readRecentlyViewedAppIds(): string[] {
	return readRawIds();
}

/** Push app id to MRU list in sessionStorage. */
export function pushRecentlyViewedAppId(appId: string): void {
	const trimmed = appId.trim();
	if (!trimmed) return;
	const next = [trimmed, ...readRawIds().filter((id) => id !== trimmed)].slice(
		0,
		MAX_RECENTLY_VIEWED
	);
	try {
		sessionStorage.setItem(APP_STORE_RECENTLY_VIEWED_KEY, JSON.stringify(next));
	} catch {
		// ignore quota / private mode
	}
}
