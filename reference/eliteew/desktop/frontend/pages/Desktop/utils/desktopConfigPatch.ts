/**
 * Shared desktop config PATCH shaping and merge with API response (config save + persist queue flush).
 */

import type { DesktopConfigResponse } from '../services/desktopApi';
import {
	fromApiIconSize,
	fromApiTheme,
	toApiIconSize,
	toApiTheme,
} from '../services/desktopApi';
import type { DesktopConfig } from '../types/desktop.types';
import { WALLPAPERS } from '../constants';
import { parseDesktopAccentFromApi } from '../utils/desktopAccentColor';
import { log } from '@/utils/logger';

/** Rough safety limit for wallpaper data URLs sent to API (characters). */
export const MAX_WALLPAPER_LENGTH = 500_000;

/** True when wallpaper must not be sent in desktop config PATCH (413 guard). */
export function isWallpaperTooLargeForApi(
	wallpaper: string,
	maxChars = MAX_WALLPAPER_LENGTH
): boolean {
	return wallpaper.length > maxChars;
}

export function coerceDesktopWidgetPosition(raw: unknown): {
	x: number;
	y: number;
} {
	if (raw && typeof raw === 'object' && 'x' in raw && 'y' in raw) {
		const o = raw as { x: unknown; y: unknown };
		const x = Number(o.x);
		const y = Number(o.y);
		if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
	}
	return { x: 0, y: 0 };
}

function normalizeDesktopWallpaper(
	primary: string | null | undefined,
	secondary?: string | null
): string {
	const fallback = WALLPAPERS[0]?.style ?? '';
	for (const v of [primary, secondary]) {
		if (typeof v === 'string' && v.trim() !== '') {
			return v.trim();
		}
	}
	return fallback;
}

/**
 * Build JSON body for PATCH /desktop/config from partial UI config updates.
 * Returns null if nothing remains to send (after 413 guard strips wallpaper).
 */
export function buildDesktopConfigApiPatchPayload(
	updates: Partial<DesktopConfig>
): Record<string, unknown> | null {
	const patchPayload: Record<string, unknown> = { ...updates };
	if (
		typeof patchPayload.wallpaper === 'string' &&
		isWallpaperTooLargeForApi(patchPayload.wallpaper)
	) {
		log.warn(
			'Desktop',
			'Wallpaper data URL too large, skipping API persistence to avoid 413'
		);
		delete patchPayload.wallpaper;
	}
	if (updates.theme !== undefined)
		patchPayload.theme = toApiTheme(updates.theme);
	if (updates.icon_size !== undefined)
		patchPayload.icon_size = toApiIconSize(updates.icon_size);
	if (updates.accent !== undefined) patchPayload.accent_color = updates.accent;
	if (updates.liveWallpaper !== undefined)
		patchPayload.live_wallpaper = updates.liveWallpaper;
	if (updates.snap_to_grid !== undefined)
		patchPayload.snap_to_grid = updates.snap_to_grid;
	if (updates.grid_step !== undefined)
		patchPayload.grid_step = updates.grid_step;
	if (updates.widgets_panel_position !== undefined)
		patchPayload.widgets_panel_position = updates.widgets_panel_position;
	if (updates.compact_widgets !== undefined)
		patchPayload.compact_widgets = updates.compact_widgets;
	if (updates.show_widgets_panel !== undefined)
		patchPayload.show_widgets_panel = updates.show_widgets_panel;
	if (updates.wallpaper_history !== undefined)
		patchPayload.wallpapers_history = updates.wallpaper_history;
	delete patchPayload.accent;
	delete patchPayload.wallpaper_history;
	if (Object.keys(patchPayload).length === 0) return null;
	return patchPayload;
}

/** Merge server response into optimistic `newConfig` (same rules as useDesktopStorage.updateConfig). */
export function mergeDesktopConfigWithApiResponse(
	newConfig: DesktopConfig,
	response: DesktopConfigResponse
): DesktopConfig {
	const accentMergeRaw = (
		response.accent_color ??
		newConfig.accent ??
		'purple'
	).trim();
	const accentMergeParsed = parseDesktopAccentFromApi(accentMergeRaw);
	const accentMerged =
		accentMergeParsed.id === 'custom'
			? accentMergeParsed.customHex
			: accentMergeRaw.toLowerCase();

	return {
		...newConfig,
		...response,
		widget_position: coerceDesktopWidgetPosition(
			response.widget_position ?? newConfig.widget_position
		),
		show_widget: false,
		wallpaper: normalizeDesktopWallpaper(
			response.wallpaper,
			newConfig.wallpaper
		),
		wallpaper_history: Array.isArray(response.wallpapers_history)
			? response.wallpapers_history
			: (newConfig.wallpaper_history ?? []),
		theme: fromApiTheme(response.theme),
		icon_size: fromApiIconSize(response.icon_size),
		accent: accentMerged,
		liveWallpaper: response.live_wallpaper ?? newConfig.liveWallpaper,
		snap_to_grid: response.snap_to_grid ?? newConfig.snap_to_grid,
		grid_step: ['small', 'medium', 'large'].includes(response.grid_step ?? '')
			? (response.grid_step as 'small' | 'medium' | 'large')
			: newConfig.grid_step,
		widgets_panel_position: [
			'top-right',
			'top-left',
			'bottom-right',
			'bottom-left',
		].includes(response.widgets_panel_position ?? '')
			? (response.widgets_panel_position as
					| 'top-right'
					| 'top-left'
					| 'bottom-right'
					| 'bottom-left')
			: (newConfig.widgets_panel_position ?? 'top-right'),
		compact_widgets:
			typeof response.compact_widgets === 'boolean'
				? response.compact_widgets
				: (newConfig.compact_widgets ?? false),
		show_widgets_panel:
			typeof response.show_widgets_panel === 'boolean'
				? response.show_widgets_panel
				: (newConfig.show_widgets_panel ?? false),
	};
}
