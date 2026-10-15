/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Arrow/Home/End navigation between notification cards in hub feeds (panel + window).
 *
 * Invariants:
 * - No-op when disabled, feed empty, or focus is in a text field.
 * - Targets elements marked with `data-notification-hub-item`.
 *
 * Related:
 * - components/NotificationHubBody.tsx
 * - components/notificationHub/NotificationHubItem.tsx
 */

import { useEffect, type RefObject } from 'react';

const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

function isTextEntryTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return Boolean(target.closest('input, textarea, [contenteditable="true"]'));
}

/** Roving keyboard nav for notification hub lists (panel flyout and full window). */
export function useNotificationHubItemKeyboardNav(
	feedRef: RefObject<HTMLElement | null>,
	enabled: boolean,
	itemCount: number
): void {
	useEffect(() => {
		if (!enabled || itemCount === 0) return;

		const onKeyDown = (event: KeyboardEvent) => {
			if (!NAV_KEYS.has(event.key)) return;
			if (
				isTextEntryTarget(event.target) ||
				isTextEntryTarget(document.activeElement)
			) {
				return;
			}

			const root = feedRef.current;
			if (!root) return;

			const items = root.querySelectorAll<HTMLElement>(
				'[data-notification-hub-item]'
			);
			if (items.length === 0) return;

			const list = Array.from(items);
			const active = document.activeElement as HTMLElement;
			const currentIndex = list.indexOf(active);

			if (event.key === 'Home') {
				event.preventDefault();
				list[0]?.focus();
				return;
			}
			if (event.key === 'End') {
				event.preventDefault();
				list[list.length - 1]?.focus();
				return;
			}
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				const nextIndex =
					currentIndex < 0 ? 0 : Math.min(currentIndex + 1, list.length - 1);
				list[nextIndex]?.focus();
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				const nextIndex =
					currentIndex < 0 ? list.length - 1 : Math.max(currentIndex - 1, 0);
				list[nextIndex]?.focus();
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [enabled, feedRef, itemCount]);
}

/** @deprecated Alias for `useNotificationHubItemKeyboardNav`. */
export const useNotificationHubPanelItemKeyboardNav =
	useNotificationHubItemKeyboardNav;
