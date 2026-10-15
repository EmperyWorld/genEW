/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure immutable window-list geometry commits for desktop window manager: drag position,
 * resize, maximize toggle, work-area sync, and fit-into-work-area batch patches.
 *
 * Invariants:
 * - Returns the same array reference when the target window is unchanged (early exit).
 * - Maximized bounds use `getMaximizedWindowBounds` / `readDesktopWorkArea`, not raw viewport.
 *
 * Related:
 * - `hooks/useWindowManager.ts`, `utils/desktopWindowGeometry.ts`
 * - `documentation/product/desktop/DESKTOP-STATE-PERSISTENCE.md`
 */

import type { WindowState } from '../types/desktop.types';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';
import { getDesktopWindowMinSize } from '../utils/desktopWindowMinSizeRegistry';
import {
	fitWindowIntoWorkArea,
	getMaximizedWindowBounds,
	patchMaximizedWindowToWorkAreaBounds,
	resolveWindowRestoreBounds,
	type WindowBounds,
} from '../utils/desktopWindowGeometry';

/** Point-update one window position; no-op when coordinates match. */
export function commitWindowListPosition(
	windows: WindowState[],
	id: string,
	x: number,
	y: number
): WindowState[] {
	const index = windows.findIndex((window) => window.id === id);
	if (index < 0) return windows;
	const target = windows[index];
	if (target.position.x === x && target.position.y === y) {
		return windows;
	}
	const next = windows.slice();
	next[index] = {
		...target,
		position: { x, y },
	};
	return next;
}

/** Point-update one window size; no-op when dimensions match. */
export function commitWindowListSize(
	windows: WindowState[],
	id: string,
	width: number,
	height: number
): WindowState[] {
	const index = windows.findIndex((window) => window.id === id);
	if (index < 0) return windows;
	const target = windows[index];
	if (target.size.width === width && target.size.height === height) {
		return windows;
	}
	const next = windows.slice();
	next[index] = {
		...target,
		size: { width, height },
	};
	return next;
}

/** Toggle maximize / restore for one window in the list. */
export function toggleWindowListMaximized(
	windows: WindowState[],
	id: string
): WindowState[] {
	return windows.map((window) => {
		if (window.id !== id) {
			return window;
		}

		if (!window.isMaximized) {
			const { position: maxPos, size: maxSize } = getMaximizedWindowBounds();
			return {
				...window,
				isMaximized: true,
				isMinimized: false,
				isMinimizing: false,
				restoreBounds: {
					position: window.position,
					size: window.size,
				},
				position: maxPos,
				size: maxSize,
			};
		}

		const { size: workSize } = getMaximizedWindowBounds();
		const restoreBounds = resolveWindowRestoreBounds(window, workSize);
		const min = getDesktopWindowMinSize(window);
		const clamped = fitWindowIntoWorkArea(
			{
				...window,
				isMaximized: false,
				position: restoreBounds.position,
				size: restoreBounds.size,
			},
			workSize,
			min
		);

		return {
			...window,
			isMaximized: false,
			isMinimized: false,
			isMinimizing: false,
			position: clamped.position,
			size: clamped.size,
			restoreBounds: null,
		};
	});
}

/** Re-align maximized windows when `#desktop-main` work area changes. */
export function syncMaximizedWindowsList(
	windows: WindowState[],
	bounds: WindowBounds = getMaximizedWindowBounds()
): WindowState[] {
	let changed = false;
	const next = windows.map((window) => {
		const patched = patchMaximizedWindowToWorkAreaBounds(window, bounds);
		if (!patched) return window;
		changed = true;
		return patched;
	});
	return changed ? next : windows;
}

/** Fit visible windows into the current desktop work area (optional predicate). */
export function commitWindowsIntoWorkArea(
	windows: WindowState[],
	workArea: { width: number; height: number } = readDesktopWorkArea(),
	predicate?: (window: WindowState) => boolean
): WindowState[] {
	return windows.map((window) => {
		if (predicate && !predicate(window)) return window;
		if (window.isMinimized) return window;
		const min = getDesktopWindowMinSize(window);
		const patch = fitWindowIntoWorkArea(window, workArea, min);
		return { ...window, ...patch };
	});
}
