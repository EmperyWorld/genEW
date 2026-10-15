/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared relative-time labels for desktop shell surfaces (clipboard history, notifications).
 *
 * Invariants:
 * - Uses i18n keys under `notificationHub.timeAgo` (count-based pluralization).
 *
 * Related:
 * - components/notificationHub/NotificationHubItem.tsx
 * - components/ClipboardManager.tsx
 */

import type { TFunction } from 'i18next';

/** Format elapsed time since `date` using `notificationHub.timeAgo` keys. */
export function formatDesktopRelativeTimeAgo(
	date: Date,
	t: TFunction<'desktopUi', 'notificationHub'>,
	nowMs: number = Date.now()
): string {
	const seconds = Math.floor((nowMs - date.getTime()) / 1000);
	if (seconds < 60) return t('timeAgo.justNow');
	if (seconds < 3600) {
		return t('timeAgo.minutes', { count: Math.floor(seconds / 60) });
	}
	if (seconds < 86400) {
		return t('timeAgo.hours', { count: Math.floor(seconds / 3600) });
	}
	return t('timeAgo.days', { count: Math.floor(seconds / 86400) });
}
