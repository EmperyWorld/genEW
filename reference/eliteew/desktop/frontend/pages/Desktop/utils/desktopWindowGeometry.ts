/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure window geometry for desktop shell: default/maximized bounds, snap patches, work-area fit.
 *
 * Invariants:
 * - Sizes derive from `readDesktopWorkArea`, not raw viewport, when DOM is available.
 * - Snap layout rects stay aligned with `desktopSnapGeometry.getRectForSnapZone`.
 *
 * Related:
 * - `hooks/useWindowManager.ts`, `utils/desktopSnapGeometry.ts`
 * - `documentation/product/desktop/DESKTOP-WINDOW-MIN-SIZES.md`
 */

import { DESKTOP_LAYOUT } from '../constants';
import type { SnapZone, WindowState } from '../types/desktop.types';
import { getRectForSnapZone, readDesktopWorkArea } from './desktopSnapGeometry';

const TASKBAR_HEIGHT = DESKTOP_LAYOUT.TASKBAR_HEIGHT_PX;
const WINDOW_MARGIN = DESKTOP_LAYOUT.WINDOW_MARGIN_PX;

export type WindowBounds = {
	position: { x: number; y: number };
	size: { width: number; height: number };
};

export type WindowMinSize = {
	minWidth: number;
	minHeight: number;
};

/** Cascade offset for newly opened non-maximized windows. */
export function getDefaultWindowCascadePosition(index: number): {
	x: number;
	y: number;
} {
	return { x: 180 + index * 50, y: 100 + index * 50 };
}

export function getDefaultWindowSize(
	type: 'app' | 'folder',
	appComponent?: string | null
): { width: number; height: number } {
	if (typeof window === 'undefined') {
		if (appComponent === 'EWRP') return { width: 1280, height: 760 };
		if (appComponent === 'NotificationsApp') return { width: 720, height: 640 };
		return type === 'app'
			? { width: 900, height: 600 }
			: { width: 700, height: 450 };
	}
	const wa = readDesktopWorkArea();
	const innerW = wa.width;
	const innerH = wa.height;
	const w = innerW - WINDOW_MARGIN;
	const h = innerH - WINDOW_MARGIN;

	if (type === 'folder') {
		const width = Math.min(Math.max(Math.floor(w * 0.5), 400), 1200);
		const height = Math.min(Math.max(Math.floor(h * 0.6), 300), 900);
		return { width: Math.min(700, width), height: Math.min(450, height) };
	}

	if (appComponent === 'EWRP') {
		const width = Math.max(1024, Math.min(w, innerW - WINDOW_MARGIN));
		const height = Math.max(
			560,
			Math.min(Math.floor(h * 0.9), innerH - WINDOW_MARGIN)
		);
		return { width, height };
	}

	if (appComponent === 'NotificationsApp') {
		const width = Math.min(Math.max(Math.floor(w * 0.48), 560), 920);
		const height = Math.min(Math.max(Math.floor(h * 0.72), 520), 860);
		return { width, height };
	}

	if (appComponent === 'DesktopShellSettings') {
		const width = Math.min(Math.max(Math.floor(w * 0.62), 720), 1040);
		const height = Math.min(Math.max(Math.floor(h * 0.78), 560), 900);
		return { width, height };
	}

	const width = Math.min(Math.max(Math.floor(w * 0.5), 400), 1200);
	const height = Math.min(Math.max(Math.floor(h * 0.6), 300), 900);
	return { width, height };
}

/** Maximized window bounds = work area above the taskbar (`readDesktopWorkArea`). */
export function getMaximizedWindowBounds(): WindowBounds {
	if (typeof window === 'undefined') {
		return {
			position: { x: 0, y: 0 },
			size: { width: 1280, height: 720 - TASKBAR_HEIGHT },
		};
	}

	const wa = readDesktopWorkArea();
	return {
		position: { x: 0, y: 0 },
		size: {
			width: Math.max(320, wa.width),
			height: Math.max(240, wa.height),
		},
	};
}

export function resolveWindowRestoreBounds(
	window: Pick<WindowState, 'type' | 'appComponent' | 'restoreBounds'>,
	workSize: { width: number; height: number }
): WindowBounds {
	const defaultSize = getDefaultWindowSize(window.type, window.appComponent);
	const fallbackBounds: WindowBounds = {
		position: {
			x: Math.max(0, (workSize.width - defaultSize.width) / 2),
			y: Math.max(0, (workSize.height - defaultSize.height) / 2),
		},
		size: defaultSize,
	};
	return window.restoreBounds ?? fallbackBounds;
}

/** Patch fields applied when snapping a window to a grid zone. */
export function buildSnapWindowStatePatch(
	window: WindowState,
	zone: Exclude<SnapZone, null>,
	workSize: { width: number; height: number }
): Pick<
	WindowState,
	| 'position'
	| 'size'
	| 'isMaximized'
	| 'isMinimized'
	| 'isMinimizing'
	| 'restoreBounds'
> {
	const layout = getRectForSnapZone(zone, workSize);
	return {
		position: layout.position,
		size: layout.size,
		isMaximized: layout.isMaximized,
		isMinimized: false,
		isMinimizing: false,
		restoreBounds:
			window.isMaximized && window.restoreBounds
				? window.restoreBounds
				: {
						position: window.position,
						size: window.size,
					},
	};
}

/** Returns updated window state when maximized bounds drift; null if unchanged. */
export function patchMaximizedWindowToWorkAreaBounds(
	window: WindowState,
	bounds: WindowBounds
): WindowState | null {
	if (!window.isMaximized) return null;
	if (
		window.position.x === bounds.position.x &&
		window.position.y === bounds.position.y &&
		window.size.width === bounds.size.width &&
		window.size.height === bounds.size.height
	) {
		return null;
	}
	return {
		...window,
		position: bounds.position,
		size: bounds.size,
	};
}

function clampWindowToWorkArea(
	bounds: WindowBounds,
	workArea: { width: number; height: number },
	minSize: WindowMinSize
): WindowBounds {
	let width = Math.max(
		minSize.minWidth,
		Math.min(bounds.size.width, workArea.width)
	);
	let height = Math.max(
		minSize.minHeight,
		Math.min(bounds.size.height, workArea.height)
	);
	width = Math.min(width, workArea.width);
	height = Math.min(height, workArea.height);
	let x = bounds.position.x;
	let y = bounds.position.y;
	x = Math.min(Math.max(0, x), Math.max(0, workArea.width - width));
	y = Math.min(Math.max(0, y), Math.max(0, workArea.height - height));
	return {
		position: { x, y },
		size: { width, height },
	};
}

/**
 * Fit a visible window into the current work area. Maximized windows are un-maximized
 * using restore bounds (or centered default size) then clamped.
 */
export function fitWindowIntoWorkArea(
	window: WindowState,
	workArea: { width: number; height: number },
	minSize: WindowMinSize
): Pick<WindowState, 'position' | 'size' | 'isMaximized' | 'restoreBounds'> {
	if (window.isMaximized) {
		const { size: workSize } = getMaximizedWindowBounds();
		const rb = resolveWindowRestoreBounds(window, workSize);
		const clamped = clampWindowToWorkArea(rb, workArea, minSize);
		return {
			isMaximized: false,
			restoreBounds: null,
			position: clamped.position,
			size: clamped.size,
		};
	}

	const clamped = clampWindowToWorkArea(
		{ position: window.position, size: window.size },
		workArea,
		minSize
	);
	return {
		position: clamped.position,
		size: clamped.size,
		isMaximized: window.isMaximized,
		restoreBounds: window.restoreBounds,
	};
}
