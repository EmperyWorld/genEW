/**
 * Hash routes for the desktop App Store: `#desktop/store` and `#desktop/store/{appId}`.
 */

export const DESKTOP_STORE_HASH_PREFIX = 'desktop/store';

/** Pure parser for `#desktop/store/{id}` (fragment without leading `#`). Exported for tests. */
export function parseDesktopStoreAppIdFromHashFragment(
	hashFragment: string
): string | null {
	const base = hashFragment.split('?')[0]?.trim() ?? '';
	const prefix = `${DESKTOP_STORE_HASH_PREFIX}/`;
	if (!base.startsWith(prefix)) return null;
	const rest = base.slice(prefix.length);
	if (!rest) return null;
	try {
		return decodeURIComponent(rest);
	} catch {
		return rest;
	}
}

/** Build hash fragment (without `#`) for store vitrine or app detail deep link. */
export function buildDesktopStoreHashFragment(appId?: string | null): string {
	const trimmed = appId?.trim();
	if (trimmed) {
		return `${DESKTOP_STORE_HASH_PREFIX}/${encodeURIComponent(trimmed)}`;
	}
	return DESKTOP_STORE_HASH_PREFIX;
}
