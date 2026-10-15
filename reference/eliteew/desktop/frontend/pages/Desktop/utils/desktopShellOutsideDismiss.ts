/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure outside-click policies for desktop shell popovers (Start menu, pinned apps modal).
 * Shared logic avoids Quest Browser ghost `mousedown` regressions.
 *
 * Invariants:
 * - Open-click guard and toggle triggers never close on the same pointer sequence that opened.
 *
 * Related:
 * - components/StartMenu.tsx
 * - components/TaskbarPinnedAndWindowsStrip.tsx
 * - components/NotificationCenter.tsx
 * - components/TaskbarTrayGafCluster.tsx
 */

export const DESKTOP_START_MENU_TOGGLE_SELECTOR = '[data-start-menu-toggle]';
export const DESKTOP_NOTIFICATION_TOGGLE_SELECTOR =
	'[data-notification-toggle]';
export const DESKTOP_TRAY_TOGGLE_SELECTOR = '[data-tray-toggle]';
export const DESKTOP_TRAY_POPUP_SELECTOR = '[data-tray-popup]';
export const DESKTOP_CLOCK_TOGGLE_SELECTOR = '[data-clock-toggle]';
export const DESKTOP_VOLUME_POPUP_SELECTOR = '[data-volume-mini-popup]';
export const DESKTOP_ICON_SELECTOR = '[data-desktop-icon]';
export const DESKTOP_ASSISTANT_SELECTION_RAIL_SELECTOR =
	'[data-assistant-selection-rail]';
export const DESKTOP_ENHANCED_CONTEXT_MENU_SELECTOR =
	'[data-desktop-enhanced-context-menu]';

export const DEFAULT_DESKTOP_POPOVER_OPEN_GUARD_MS = 320;

export type TaskbarPopoverOutsideDismissInput = {
	openClickGuardActive: boolean;
	target: Element | null;
	panelRoot: HTMLElement | null;
	toggleSelector: string;
	nestedMenuRoot?: HTMLElement | null;
};

/** Shared outside-click policy for taskbar click-toggle flyouts. */
export function shouldCloseTaskbarPopoverOnOutsidePointer(
	input: TaskbarPopoverOutsideDismissInput
): boolean {
	if (input.openClickGuardActive) return false;
	const target = input.target;
	if (!target) return false;
	if (input.nestedMenuRoot?.contains(target)) return false;
	if (target.closest(input.toggleSelector)) return false;
	if (input.panelRoot && !input.panelRoot.contains(target)) return true;
	return false;
}

export type StartMenuOutsideDismissInput = {
	openClickGuardActive: boolean;
	target: Element | null;
	panelRoot: HTMLElement | null;
	appContextMenuRoot: HTMLElement | null;
};

/** Whether Start menu should close from an outside `mousedown`. */
export function shouldCloseStartMenuOnOutsidePointer(
	input: StartMenuOutsideDismissInput
): boolean {
	return shouldCloseTaskbarPopoverOnOutsidePointer({
		openClickGuardActive: input.openClickGuardActive,
		target: input.target,
		panelRoot: input.panelRoot,
		toggleSelector: DESKTOP_START_MENU_TOGGLE_SELECTOR,
		nestedMenuRoot: input.appContextMenuRoot,
	});
}

export type NotificationCenterOutsideDismissInput = {
	openClickGuardActive: boolean;
	target: Element | null;
	panelRoot: HTMLElement | null;
};

/** Whether notification center should close from an outside `mousedown`. */
export function shouldCloseNotificationCenterOnOutsidePointer(
	input: NotificationCenterOutsideDismissInput
): boolean {
	return shouldCloseTaskbarPopoverOnOutsidePointer({
		openClickGuardActive: input.openClickGuardActive,
		target: input.target,
		panelRoot: input.panelRoot,
		toggleSelector: DESKTOP_NOTIFICATION_TOGGLE_SELECTOR,
	});
}

export type TrayOutsideDismissInput = {
	openClickGuardActive: boolean;
	target: Element | null;
	trayToggleRoot: HTMLElement | null;
};

/** Whether system tray should close from an outside pointer down. */
export function shouldCloseTrayOnOutsidePointer(
	input: TrayOutsideDismissInput
): boolean {
	if (input.openClickGuardActive) return false;
	const target = input.target;
	if (!target) return false;
	if (target.closest(DESKTOP_TRAY_TOGGLE_SELECTOR)) return false;
	if (target.closest(DESKTOP_TRAY_POPUP_SELECTOR)) return false;
	if (input.trayToggleRoot?.contains(target)) return false;
	return true;
}

export type ClockMenuOutsideDismissInput = {
	openClickGuardActive: boolean;
	target: Element | null;
	panelRoot: HTMLElement | null;
};

/** Whether taskbar clock menu should close from an outside pointer down. */
export function shouldCloseClockMenuOnOutsidePointer(
	input: ClockMenuOutsideDismissInput
): boolean {
	return shouldCloseTaskbarPopoverOnOutsidePointer({
		openClickGuardActive: input.openClickGuardActive,
		target: input.target,
		panelRoot: input.panelRoot,
		toggleSelector: DESKTOP_CLOCK_TOGGLE_SELECTOR,
	});
}

export type VolumeMenuOutsideDismissInput = {
	openClickGuardActive: boolean;
	target: Element | null;
};

/** Whether volume context menu should close from an outside pointer down. */
export function shouldCloseVolumeMenuOnOutsidePointer(
	input: VolumeMenuOutsideDismissInput
): boolean {
	if (input.openClickGuardActive) return false;
	const target = input.target;
	if (!target) return false;
	if (target.closest(DESKTOP_VOLUME_POPUP_SELECTOR)) return false;
	return true;
}

/** Whether pinned-apps modal backdrop click should close the panel. */
export function shouldDismissPinnedMenuBackdrop(
	openClickGuardActive: boolean
): boolean {
	return !openClickGuardActive;
}

export type DesktopIconSelectionOutsideDismissInput = {
	target: Element | null;
};

/** Whether root desktop icon selection should clear from an outside pointer down. */
export function shouldClearDesktopIconSelectionOnPointerDown(
	input: DesktopIconSelectionOutsideDismissInput
): boolean {
	const { target } = input;
	if (!target) return false;
	if (target.closest(DESKTOP_ICON_SELECTOR)) return false;
	if (target.closest(DESKTOP_ASSISTANT_SELECTION_RAIL_SELECTOR)) return false;
	if (target.closest(DESKTOP_ENHANCED_CONTEXT_MENU_SELECTOR)) return false;
	return true;
}

const DESKTOP_ICON_KEYBOARD_NAV_KEYS = new Set([
	'ArrowRight',
	'ArrowDown',
	'ArrowLeft',
	'ArrowUp',
	'Enter',
	'F2',
	'ContextMenu',
	'Tab',
]);

const DESKTOP_ICON_SELECTION_CLIPBOARD_KEYS = new Set(['c', 'x', 'v', 'a']);

export type DesktopIconSelectionKeyDismissInput = {
	event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'target'>;
	renamingId: string | null;
	deferToFocusedSurface: boolean;
};

/** Whether root desktop icon selection should clear from a keydown outside icon nav/clipboard. */
export function shouldClearDesktopIconSelectionOnKeyDown(
	input: DesktopIconSelectionKeyDismissInput
): boolean {
	if (input.renamingId != null) return false;
	if (input.deferToFocusedSurface) return true;

	const { event } = input;
	const key = event.key;
	if (key === 'Escape') return false;

	const modCombo = event.ctrlKey || event.metaKey;
	if (
		modCombo &&
		DESKTOP_ICON_SELECTION_CLIPBOARD_KEYS.has(key.toLowerCase())
	) {
		return false;
	}
	if (key === 'Delete' || key === 'F2') return false;

	const target = event.target instanceof Element ? event.target : null;
	if (target?.closest(DESKTOP_ASSISTANT_SELECTION_RAIL_SELECTOR)) {
		return false;
	}
	if (
		target?.closest(DESKTOP_ICON_SELECTOR) &&
		DESKTOP_ICON_KEYBOARD_NAV_KEYS.has(key)
	) {
		return false;
	}
	if (target?.closest(DESKTOP_ENHANCED_CONTEXT_MENU_SELECTOR)) {
		return false;
	}

	return true;
}
