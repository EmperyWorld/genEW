/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Keyboard navigation helpers for Settings Center tablist (roving focus pattern).
 *
 * Invariants:
 * - Tab order matches `DESKTOP_SETTINGS_TAB_ORDER` in `desktopSettingsShared.types.ts`.
 *
 * Related:
 * - `DesktopSettingsPanel.tsx`
 */

import {
	ADVANCED_TAB_IDS,
	PRIMARY_TAB_ORDER,
	type TabId,
} from './desktopSettingsShared.types';

/** Resolve next tab inside the active navigation tier; null if key is not handled. */
export function resolveDesktopSettingsTabFromKeyboard(
	activeTab: TabId,
	key: string,
	primaryOrder: readonly TabId[] = PRIMARY_TAB_ORDER,
	advancedOrder: readonly TabId[] = ADVANCED_TAB_IDS
): TabId | null {
	const order = primaryOrder.includes(activeTab) ? primaryOrder : advancedOrder;
	const currentIndex = order.indexOf(activeTab);
	if (currentIndex === -1) return null;

	if (key === 'ArrowRight' || key === 'ArrowDown') {
		return order[(currentIndex + 1) % order.length] ?? null;
	}
	if (key === 'ArrowLeft' || key === 'ArrowUp') {
		return order[(currentIndex - 1 + order.length) % order.length] ?? null;
	}
	if (key === 'Home') {
		return order[0] ?? null;
	}
	if (key === 'End') {
		return order[order.length - 1] ?? null;
	}
	return null;
}

/** Digits 1–3 select primary tabs; 4–5 are available only while advanced is open. */
export function resolveDesktopSettingsTabFromDigitKey(
	key: string,
	advancedExpanded: boolean,
	primaryOrder: readonly TabId[] = PRIMARY_TAB_ORDER,
	advancedOrder: readonly TabId[] = ADVANCED_TAB_IDS
): TabId | null {
	if (key.length !== 1 || key < '1' || key > '9') return null;
	const idx = Number.parseInt(key, 10) - 1;
	if (idx < primaryOrder.length) return primaryOrder[idx] ?? null;
	if (!advancedExpanded) return null;
	return advancedOrder[idx - primaryOrder.length] ?? null;
}

export function isDesktopSettingsTextEntryTarget(
	target: EventTarget | null
): boolean {
	const el = target;
	if (
		el instanceof HTMLInputElement ||
		el instanceof HTMLTextAreaElement ||
		el instanceof HTMLSelectElement
	) {
		return true;
	}
	if (el instanceof HTMLElement && el.isContentEditable) {
		return true;
	}
	return false;
}
