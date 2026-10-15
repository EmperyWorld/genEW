/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared visual field slices for Settings surface chrome facade (`shell` + `chrome`).
 *
 * Invariants:
 * - Single source for accent RGB input and shell style fields derived from `desktopVisualPreferences`.
 *
 * Related:
 * - `useDesktopWorkspaceSettingsSurfaceChromeFacade.ts`, `DesktopWorkspaceContent.tsx`
 */

import type { DesktopConfig } from '../types/desktop.types';
import type { DesktopWorkspaceVisualPreferenceState } from '../hooks/useDesktopWorkspaceVisualProfileBridge';

export type DesktopWorkspaceSettingsSharedVisualSlicesInput = {
	desktopVisualPreferences: DesktopWorkspaceVisualPreferenceState;
	desktopWindowStyle: DesktopWorkspaceVisualPreferenceState['desktop_window_style'];
	accent: DesktopConfig['accent'];
	accentCustomHex: string;
};

export type DesktopWorkspaceSettingsSharedVisualSlices = {
	accentRgb: {
		desktopAccentFollowsWindowStyle: boolean;
		desktopWindowStyle: DesktopWorkspaceVisualPreferenceState['desktop_window_style'];
		accent: DesktopConfig['accent'];
		accentCustomHex: string;
	};
	shellStyles: {
		desktopAccentFollowsWindowStyle: boolean;
		desktopWidgetsStyle: DesktopWorkspaceVisualPreferenceState['desktop_widgets_style'];
		desktopPanelOpacity: number;
		reduceBackdropBlur: boolean;
	};
	mainSurfaceStudio: {
		desktopFontBody: DesktopWorkspaceVisualPreferenceState['desktop_font_body'];
		desktopFontDisplay: DesktopWorkspaceVisualPreferenceState['desktop_font_display'];
		desktopSceneDepth: DesktopWorkspaceVisualPreferenceState['desktop_scene_depth'];
		wallpaperCrossfadeEnabled: boolean;
		styledTooltips: boolean;
	};
	shellMotion: {
		desktopShellReduceMotion: boolean;
		desktopShellParallaxEnabled: boolean;
		desktopShellParallaxIntensity: DesktopWorkspaceVisualPreferenceState['desktop_shell_parallax_intensity'];
		desktopShellWindowMorphEnabled: boolean;
		desktopShellMotionSpeed: DesktopWorkspaceVisualPreferenceState['desktop_shell_motion_speed'];
	};
};

export function buildDesktopWorkspaceSettingsSharedVisualSlices(
	input: DesktopWorkspaceSettingsSharedVisualSlicesInput
): DesktopWorkspaceSettingsSharedVisualSlices {
	const desktopAccentFollowsWindowStyle =
		input.desktopVisualPreferences.desktop_accent_follows_window_style;
	return {
		accentRgb: {
			desktopAccentFollowsWindowStyle,
			desktopWindowStyle: input.desktopWindowStyle,
			accent: input.accent,
			accentCustomHex: input.accentCustomHex,
		},
		shellStyles: {
			desktopAccentFollowsWindowStyle,
			desktopWidgetsStyle: input.desktopVisualPreferences.desktop_widgets_style,
			desktopPanelOpacity: input.desktopVisualPreferences.desktop_panel_opacity,
			reduceBackdropBlur:
				input.desktopVisualPreferences.desktop_reduce_backdrop_blur === true,
		},
		mainSurfaceStudio: {
			desktopFontBody: input.desktopVisualPreferences.desktop_font_body,
			desktopFontDisplay: input.desktopVisualPreferences.desktop_font_display,
			desktopSceneDepth: input.desktopVisualPreferences.desktop_scene_depth,
			wallpaperCrossfadeEnabled:
				input.desktopVisualPreferences.desktop_wallpaper_crossfade_enabled !==
				false,
			styledTooltips:
				input.desktopVisualPreferences.desktop_styled_tooltips !== false,
		},
		shellMotion: {
			desktopShellReduceMotion:
				input.desktopVisualPreferences.desktop_shell_reduce_motion === true,
			desktopShellParallaxEnabled:
				input.desktopVisualPreferences.desktop_shell_parallax_enabled !== false,
			desktopShellParallaxIntensity:
				input.desktopVisualPreferences.desktop_shell_parallax_intensity,
			desktopShellWindowMorphEnabled:
				input.desktopVisualPreferences.desktop_shell_window_morph_enabled !==
				false,
			desktopShellMotionSpeed:
				input.desktopVisualPreferences.desktop_shell_motion_speed,
		},
	};
}
