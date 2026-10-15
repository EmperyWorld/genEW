/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * State contract for taskbar window strip flyouts: full dismiss (Escape) vs hover-only
 * dismiss (Quest laser safety net).
 *
 * Invariants:
 * - `closeHoverFlyouts` never clears overflow/group click menus.
 *
 * Related:
 * - components/TaskbarPinnedAndWindowsStrip.tsx
 * - components/Taskbar.tsx
 */

export type TaskbarWindowFlyoutState = {
	overflowMenuOpen: boolean;
	groupMenuOpen: string | null;
	hoveredWin: string | null;
	showPreviewForWin: string | null;
};

export const TASKBAR_WINDOW_FLYOUT_INITIAL: TaskbarWindowFlyoutState = {
	overflowMenuOpen: false,
	groupMenuOpen: null,
	hoveredWin: null,
	showPreviewForWin: null,
};

/** Escape / explicit full dismiss — overflow, group menu, and hover previews. */
export function closeTaskbarWindowFlyouts(
	_current: TaskbarWindowFlyoutState
): TaskbarWindowFlyoutState {
	return {
		overflowMenuOpen: false,
		groupMenuOpen: null,
		hoveredWin: null,
		showPreviewForWin: null,
	};
}

/** Quest laser dismiss — hover previews only; click toggles stay open. */
export function closeTaskbarWindowHoverFlyouts(
	current: TaskbarWindowFlyoutState
): TaskbarWindowFlyoutState {
	return {
		...current,
		hoveredWin: null,
		showPreviewForWin: null,
	};
}

export type TaskbarPinnedAndWindowsStripDismissHandle = {
	closeFlyouts: () => void;
	closeHoverFlyouts: () => void;
};

/** Taskbar laser-pointer event handler contract (hover chrome only). */
export function dismissTaskbarLaserPointerHoverChrome(
	strip: TaskbarPinnedAndWindowsStripDismissHandle | null | undefined
): void {
	strip?.closeHoverFlyouts();
}
