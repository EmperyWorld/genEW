/**
 * Curated desktop style presets + {@link useDesktopWorkspaceShellSettingsBridgeAssembly}
 * in one place so DesktopWorkspaceContent stays thinner.
 */

import { useCallback } from 'react';
import type { DesktopCuratedStyleSet } from '../constants/desktopCuratedStyleSets';
import type { DesktopWorkspaceShellSettingsBridgeAssemblyParams } from './useDesktopWorkspaceShellSettingsBridgeAssembly';
import { useDesktopWorkspaceShellSettingsBridgeAssembly } from './useDesktopWorkspaceShellSettingsBridgeAssembly';
import type {
	DesktopVisualPreferencePersistOptions,
	DesktopWorkspaceVisualPreferenceState,
} from './useDesktopWorkspaceVisualProfileBridge';

export type UseDesktopWorkspaceShellSettingsIntegrationParams = Omit<
	DesktopWorkspaceShellSettingsBridgeAssemblyParams,
	'curatedPresets'
> & {
	applyCuratedDesktopConfigPreset: (
		set: DesktopCuratedStyleSet
	) => void | Promise<void>;
	updateDesktopVisualPreferences: (
		updates: Partial<DesktopWorkspaceVisualPreferenceState>,
		options?: DesktopVisualPreferencePersistOptions
	) => void | Promise<void>;
	/**
	 * When false, curated style apply updates local preferences only (no profile PATCH until commit).
	 * Default true.
	 */
	profilePatchRemote?: boolean;
};

export function useDesktopWorkspaceShellSettingsIntegration(
	params: UseDesktopWorkspaceShellSettingsIntegrationParams
): ReturnType<typeof useDesktopWorkspaceShellSettingsBridgeAssembly> {
	const {
		applyCuratedDesktopConfigPreset,
		updateDesktopVisualPreferences,
		profilePatchRemote = true,
		...bridgeRest
	} = params;

	const applyCuratedDesktopPreset = useCallback(
		async (set: DesktopCuratedStyleSet) => {
			const ws = set.windowStyle;
			const visualPatch: Partial<DesktopWorkspaceVisualPreferenceState> = {
				desktop_accent_follows_window_style: set.accentFollows,
				desktop_window_style: ws,
				desktop_taskbar_style: set.taskbarStyle ?? ws,
				desktop_icon_style: set.iconStyle ?? ws,
				desktop_widgets_style: set.widgetsStyle ?? ws,
			};
			if (set.fontBody) {
				visualPatch.desktop_font_body = set.fontBody;
			}
			if (set.fontDisplay) {
				visualPatch.desktop_font_display = set.fontDisplay;
			}
			if (set.sceneDepth) {
				visualPatch.desktop_scene_depth = set.sceneDepth;
			}
			if (set.wallpaperCrossfadeEnabled !== undefined) {
				visualPatch.desktop_wallpaper_crossfade_enabled =
					set.wallpaperCrossfadeEnabled;
			}
			if (set.styledTooltips !== undefined) {
				visualPatch.desktop_styled_tooltips = set.styledTooltips;
			}
			await updateDesktopVisualPreferences(visualPatch, {
				persist: profilePatchRemote,
			});
			applyCuratedDesktopConfigPreset(set);
		},
		[
			applyCuratedDesktopConfigPreset,
			profilePatchRemote,
			updateDesktopVisualPreferences,
		]
	);

	return useDesktopWorkspaceShellSettingsBridgeAssembly({
		...bridgeRest,
		curatedPresets: {
			onApplyCuratedStyleSet: applyCuratedDesktopPreset,
		},
	});
}
