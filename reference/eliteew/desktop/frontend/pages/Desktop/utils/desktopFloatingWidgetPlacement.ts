/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Viewport placement helpers for the floating desktop widget: keep free-positioned widget
 * inside the work area and out of the desktop icon grid hit zone.
 *
 * Invariants:
 * - Preset-corner layout (CSS top-right) is handled in the widget shell; these helpers apply to free viewport coords only.
 * - Icon layout coordinates are converted via `DesktopWorkArea.layoutScale` and shell offsets.
 *
 * Related:
 * - `components/DesktopWorkspaceFloatingWidget.tsx`
 * - `utils/desktopSnapGeometry.ts`
 */

import {
	DESKTOP_FLOATING_WIDGET_VIEWPORT_SIZE,
	DESKTOP_ICON_SIZES,
	type IconSizePreference,
} from '../constants';
import type { DesktopItem } from '../types/desktop.types';
import type { DesktopWorkArea } from './desktopSnapGeometry';

export type ViewportRect = {
	left: number;
	top: number;
	right: number;
	bottom: number;
};

export type ViewportSize = {
	width: number;
	height: number;
	taskbarPx: number;
	pad?: number;
};

function rectsOverlap(a: ViewportRect, b: ViewportRect): boolean {
	return !(
		a.right <= b.left ||
		a.left >= b.right ||
		a.bottom <= b.top ||
		a.top >= b.bottom
	);
}

/** Bounding box of all desktop icons in viewport coordinates (for pointer hit tests). */
export function computeDesktopIconReservedViewportBounds(
	items: Pick<DesktopItem, 'position'>[],
	iconSize: IconSizePreference,
	workArea: DesktopWorkArea,
	pad = 12
): ViewportRect | null {
	if (items.length === 0) return null;
	const dims = DESKTOP_ICON_SIZES[iconSize];
	const scale = workArea.layoutScale;
	const iconW = dims.width * scale;
	const iconH = dims.height * scale;
	let right = workArea.offsetLeft;
	let bottom = workArea.offsetTop;
	for (const item of items) {
		right = Math.max(
			right,
			workArea.offsetLeft + item.position.x * scale + iconW
		);
		bottom = Math.max(
			bottom,
			workArea.offsetTop + item.position.y * scale + iconH
		);
	}
	return {
		left: workArea.offsetLeft,
		top: workArea.offsetTop,
		right: right + pad,
		bottom: bottom + pad,
	};
}

function widgetRectAt(
	x: number,
	y: number,
	width: number,
	height: number
): ViewportRect {
	return { left: x, top: y, right: x + width, bottom: y + height };
}

function fitsViewport(rect: ViewportRect, viewport: ViewportSize): boolean {
	const pad = viewport.pad ?? 8;
	const maxRight = viewport.width - pad;
	const maxBottom = viewport.height - viewport.taskbarPx - pad;
	return (
		rect.left >= pad &&
		rect.top >= pad &&
		rect.right <= maxRight &&
		rect.bottom <= maxBottom
	);
}

/** Clamp widget top-left into viewport margins. */
export function clampFloatingWidgetToViewport(
	x: number,
	y: number,
	widgetWidth: number,
	widgetHeight: number,
	viewport: ViewportSize
): { x: number; y: number } {
	const pad = viewport.pad ?? 8;
	const maxX = Math.max(pad, viewport.width - widgetWidth - pad);
	const maxY = Math.max(
		pad,
		viewport.height - viewport.taskbarPx - widgetHeight - pad
	);
	return {
		x: Math.min(Math.max(pad, x), maxX),
		y: Math.min(Math.max(pad, y), maxY),
	};
}

/**
 * Resolve free widget position: viewport clamp, then nudge out of icon reserved zone.
 * Falls back to top-right band when the icon grid occupies most of the left side.
 */
export function resolveFloatingWidgetViewportPosition(params: {
	x: number;
	y: number;
	widgetWidth?: number;
	widgetHeight?: number;
	viewport: ViewportSize;
	iconReserved?: ViewportRect | null;
}): { x: number; y: number } {
	const widgetWidth =
		params.widgetWidth ?? DESKTOP_FLOATING_WIDGET_VIEWPORT_SIZE.width;
	const widgetHeight =
		params.widgetHeight ?? DESKTOP_FLOATING_WIDGET_VIEWPORT_SIZE.height;
	const pad = params.viewport.pad ?? 8;

	const { x, y } = clampFloatingWidgetToViewport(
		params.x,
		params.y,
		widgetWidth,
		widgetHeight,
		params.viewport
	);

	const reserved = params.iconReserved;
	if (!reserved) return { x, y };

	const overlaps = () =>
		rectsOverlap(widgetRectAt(x, y, widgetWidth, widgetHeight), reserved);

	if (!overlaps()) return { x, y };

	const candidates: { x: number; y: number }[] = [
		{ x: reserved.right, y },
		{ x, y: reserved.bottom },
		{
			x: params.viewport.width - widgetWidth - 20,
			y: 64,
		},
		{
			x: Math.max(pad, params.viewport.width - widgetWidth - pad),
			y: pad,
		},
	];

	for (const candidate of candidates) {
		const clamped = clampFloatingWidgetToViewport(
			candidate.x,
			candidate.y,
			widgetWidth,
			widgetHeight,
			params.viewport
		);
		const rect = widgetRectAt(clamped.x, clamped.y, widgetWidth, widgetHeight);
		if (fitsViewport(rect, params.viewport) && !rectsOverlap(rect, reserved)) {
			return clamped;
		}
	}

	return { x, y };
}
