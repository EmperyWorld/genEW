/**
 * Compact import/export bundle for desktop visual style (themes, shell styles,
 * wallpapers) and optional shell slices (workspace_profiles, window_layout_presets) in v2.
 * Oversized wallpaper data URLs are replaced on export with a builtin reference.
 */

import type { DesktopWorkspaceVisualPreferenceState } from '../hooks/useDesktopWorkspaceVisualProfileBridge';
import type { DesktopConfig } from '../types/desktop.types';
import {
	builtinDesktopWallpaperPath,
	DEFAULT_DESKTOP_WALLPAPER_STYLE,
} from '../constants/wallpapers';
import {
	clampDesktopPanelOpacity,
	type DesktopSceneDepth,
	type DesktopWindowStyle,
	normalizeDesktopIconStyle,
	normalizeDesktopTaskbarStyle,
	normalizeDesktopWidgetsStyle,
	normalizeDesktopFontBody,
	normalizeDesktopFontDisplay,
	normalizeDesktopSceneDepth,
	normalizeDesktopShellMotionSpeed,
	normalizeDesktopShellParallaxIntensity,
} from '@/types/profile';
import { clampDesktopUiScale } from './desktopUiScale';

export const DESKTOP_VISUAL_PROFILE_PACK_KIND =
	'eliteew.desktopVisualProfilePack' as const;

/** Bundles written by the app today use this version; parsers also accept `1`. */
export const DESKTOP_VISUAL_PROFILE_PACK_VERSION = 2 as const;

/** Large inline wallpapers are omitted on export (> this many chars). */
const MAX_INLINE_WALLPAPER_CHARS = 48_000;

const MAX_PACK_WORKSPACE_PROFILES = 24;
const MAX_PACK_LAYOUT_PRESETS = 96;

export type DesktopVisualProfilePackShellSlices = {
	workspace_profiles?: { profiles: Record<string, unknown>[] };
	window_layout_presets?: Record<string, unknown>[];
};

export type DesktopVisualProfilePackPayload = {
	kind: typeof DESKTOP_VISUAL_PROFILE_PACK_KIND;
	version: 1 | typeof DESKTOP_VISUAL_PROFILE_PACK_VERSION;
	exportedAt: string;
	config: Pick<
		DesktopConfig,
		| 'theme'
		| 'wallpaper'
		| 'accent'
		| 'icon_size'
		| 'snap_to_grid'
		| 'grid_step'
	>;
	visual: DesktopWorkspaceVisualPreferenceState;
	droppedHeavyWallpaper?: boolean;
	shell?: DesktopVisualProfilePackShellSlices;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildOptionalShellPayload(
	shell: DesktopVisualProfilePackShellSlices | undefined
): DesktopVisualProfilePackShellSlices | undefined {
	if (!shell) return undefined;
	const profiles = shell.workspace_profiles?.profiles;
	const presets = shell.window_layout_presets;
	const trimmedProfiles =
		Array.isArray(profiles) && profiles.length > 0
			? profiles.filter(isRecord).slice(0, MAX_PACK_WORKSPACE_PROFILES)
			: [];
	const trimmedPresets =
		Array.isArray(presets) && presets.length > 0
			? presets.filter(isRecord).slice(0, MAX_PACK_LAYOUT_PRESETS)
			: [];
	if (trimmedProfiles.length === 0 && trimmedPresets.length === 0)
		return undefined;
	const out: DesktopVisualProfilePackShellSlices = {};
	if (trimmedProfiles.length > 0) {
		out.workspace_profiles = { profiles: trimmedProfiles };
	}
	if (trimmedPresets.length > 0) {
		out.window_layout_presets = trimmedPresets;
	}
	return out;
}

function parseOptionalShell(
	parsed: Record<string, unknown>,
	fileVersion: number
): DesktopVisualProfilePackShellSlices | undefined {
	if (fileVersion < 2) return undefined;
	const shell = parsed.shell;
	if (!isRecord(shell)) return undefined;
	const out: DesktopVisualProfilePackShellSlices = {};
	const wp = shell.workspace_profiles;
	if (isRecord(wp) && Array.isArray(wp.profiles)) {
		const profiles = wp.profiles
			.filter(isRecord)
			.slice(0, MAX_PACK_WORKSPACE_PROFILES);
		if (profiles.length > 0) {
			out.workspace_profiles = { profiles };
		}
	}
	const wl = shell.window_layout_presets;
	if (Array.isArray(wl)) {
		const rows = wl.filter(isRecord).slice(0, MAX_PACK_LAYOUT_PRESETS);
		if (rows.length > 0) {
			out.window_layout_presets = rows;
		}
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

export function buildDesktopVisualProfilePackJson(input: {
	config: DesktopConfig;
	visual: DesktopWorkspaceVisualPreferenceState;
	shell?: DesktopVisualProfilePackShellSlices;
}): string {
	let wallpaper = input.config.wallpaper ?? DEFAULT_DESKTOP_WALLPAPER_STYLE;
	let droppedHeavyWallpaper = false;
	if (
		wallpaper.length > MAX_INLINE_WALLPAPER_CHARS &&
		wallpaper.startsWith('data:')
	) {
		wallpaper = builtinDesktopWallpaperPath(1);
		droppedHeavyWallpaper = true;
	}

	const shellPayload = buildOptionalShellPayload(input.shell);

	const payload: DesktopVisualProfilePackPayload = {
		kind: DESKTOP_VISUAL_PROFILE_PACK_KIND,
		version: DESKTOP_VISUAL_PROFILE_PACK_VERSION,
		exportedAt: new Date().toISOString(),
		config: {
			theme:
				input.config.theme === 'light' ||
				input.config.theme === 'auto' ||
				input.config.theme === 'dark'
					? input.config.theme
					: 'dark',
			wallpaper,
			accent: input.config.accent,
			icon_size:
				input.config.icon_size === 'small' || input.config.icon_size === 'large'
					? input.config.icon_size
					: 'medium',
			snap_to_grid: input.config.snap_to_grid === true,
			grid_step:
				input.config.grid_step === 'small' || input.config.grid_step === 'large'
					? input.config.grid_step
					: 'medium',
		},
		visual: input.visual,
		...(droppedHeavyWallpaper ? { droppedHeavyWallpaper: true } : {}),
		...(shellPayload ? { shell: shellPayload } : {}),
	};

	return `${JSON.stringify(payload, null, 2)}\n`;
}

export type ParseDesktopVisualProfilePackResult =
	| {
			ok: true;
			data: {
				config: Pick<
					DesktopConfig,
					| 'theme'
					| 'wallpaper'
					| 'accent'
					| 'icon_size'
					| 'snap_to_grid'
					| 'grid_step'
				>;
				visual: DesktopWorkspaceVisualPreferenceState;
				shell?: DesktopVisualProfilePackShellSlices;
			};
	  }
	| { ok: false; error: string };

export function parseDesktopVisualProfilePack(
	json: string
): ParseDesktopVisualProfilePackResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json) as unknown;
	} catch {
		return { ok: false, error: 'invalid_json' };
	}
	if (!isRecord(parsed)) return { ok: false, error: 'not_an_object' };
	if (parsed.kind !== DESKTOP_VISUAL_PROFILE_PACK_KIND) {
		return { ok: false, error: 'wrong_kind' };
	}
	const version = parsed.version;
	if (version !== 1 && version !== DESKTOP_VISUAL_PROFILE_PACK_VERSION) {
		return { ok: false, error: 'unsupported_version' };
	}
	const fileVersion = version === DESKTOP_VISUAL_PROFILE_PACK_VERSION ? 2 : 1;
	const cfg = parsed.config;
	const vis = parsed.visual;
	if (!isRecord(cfg) || !isRecord(vis)) {
		return { ok: false, error: 'missing_config_or_visual' };
	}

	const themeRaw = String(cfg.theme ?? 'dark').toLowerCase();
	const theme: DesktopConfig['theme'] =
		themeRaw === 'light' || themeRaw === 'auto' ? themeRaw : 'dark';

	const wallpaper =
		typeof cfg.wallpaper === 'string'
			? cfg.wallpaper.slice(0, 520_000)
			: DEFAULT_DESKTOP_WALLPAPER_STYLE;

	const accent =
		cfg.accent === undefined || cfg.accent === null
			? undefined
			: typeof cfg.accent === 'string'
				? cfg.accent.slice(0, 64)
				: undefined;

	const iconSizeRaw = String(cfg.icon_size ?? 'medium').toLowerCase();
	const icon_size: DesktopConfig['icon_size'] =
		iconSizeRaw === 'small' || iconSizeRaw === 'large' ? iconSizeRaw : 'medium';

	const gridRaw = String(cfg.grid_step ?? 'medium').toLowerCase();
	const grid_step: NonNullable<DesktopConfig['grid_step']> =
		gridRaw === 'small' || gridRaw === 'large' ? gridRaw : 'medium';

	const depthRaw = String(vis.desktop_scene_depth ?? 'balanced').toLowerCase();
	const desktop_scene_depth: DesktopSceneDepth =
		normalizeDesktopSceneDepth(depthRaw);

	const desktop_font_body = normalizeDesktopFontBody(
		String(vis.desktop_font_body ?? 'manrope')
	);
	const desktop_font_display = normalizeDesktopFontDisplay(
		String(vis.desktop_font_display ?? 'system')
	);

	const visual: DesktopWorkspaceVisualPreferenceState = {
		desktop_open_apps_maximized: vis.desktop_open_apps_maximized === true,
		desktop_floating_widget_visible:
			vis.desktop_floating_widget_visible === true,
		desktop_icon_style: normalizeDesktopIconStyle(
			String(vis.desktop_icon_style ?? 'prism')
		),
		desktop_scene_depth,
		desktop_font_body,
		desktop_font_display,
		desktop_wallpaper_crossfade_enabled:
			vis.desktop_wallpaper_crossfade_enabled !== false,
		desktop_styled_tooltips: vis.desktop_styled_tooltips !== false,
		desktop_shell_reduce_motion: vis.desktop_shell_reduce_motion === true,
		desktop_shell_parallax_enabled:
			vis.desktop_shell_parallax_enabled !== false,
		desktop_shell_parallax_intensity: normalizeDesktopShellParallaxIntensity(
			typeof vis.desktop_shell_parallax_intensity === 'string'
				? vis.desktop_shell_parallax_intensity
				: undefined
		),
		desktop_shell_window_morph_enabled:
			vis.desktop_shell_window_morph_enabled !== false,
		desktop_shell_motion_speed: normalizeDesktopShellMotionSpeed(
			typeof vis.desktop_shell_motion_speed === 'string'
				? vis.desktop_shell_motion_speed
				: undefined
		),
		desktop_taskbar_style: normalizeDesktopTaskbarStyle(
			String(vis.desktop_taskbar_style ?? 'glass')
		),
		desktop_window_style: normalizeDesktopTaskbarStyle(
			String(vis.desktop_window_style ?? 'glass')
		) as DesktopWindowStyle,
		desktop_accent_follows_window_style:
			vis.desktop_accent_follows_window_style === true,
		desktop_widgets_style: normalizeDesktopWidgetsStyle(
			String(vis.desktop_widgets_style ?? 'glass')
		),
		desktop_panel_opacity: clampDesktopPanelOpacity(
			typeof vis.desktop_panel_opacity === 'number'
				? vis.desktop_panel_opacity
				: 1
		),
		desktop_ui_scale: clampDesktopUiScale(
			typeof vis.desktop_ui_scale === 'number' ? vis.desktop_ui_scale : 1
		),
		desktop_reduce_backdrop_blur: vis.desktop_reduce_backdrop_blur === true,
	};

	const shellSlice = parseOptionalShell(parsed, fileVersion);

	return {
		ok: true,
		data: {
			config: {
				theme,
				wallpaper,
				accent,
				icon_size,
				snap_to_grid: cfg.snap_to_grid === true,
				grid_step,
			},
			visual,
			...(shellSlice ? { shell: shellSlice } : {}),
		},
	};
}
