/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Build `shellClusterRest` for {@link useDesktopWorkspaceSurfaceChromeBundle} from flat workspace slices.
 *
 * Invariants:
 * - Handler keys injected by surface chrome bundle stay out of this object.
 * - Widget panel PATCH callbacks are stable (`useCallback`).
 *
 * Related:
 * - `DesktopWorkspaceContent.tsx`, `useDesktopWorkspaceShellSettingsIntegrationCluster.ts`
 */

import { useCallback, useMemo } from 'react';
import type { DesktopSettingsCenterBridge } from '../types/desktopSettingsCenterBridge.types';
import type {
	DesktopConfig,
	WidgetsPanelPosition,
} from '../types/desktop.types';
import type {
	DesktopExpansionSettings,
	DesktopUserVisualStylePreset,
} from '../types/desktopExpansion.types';
import type { DesktopCuratedStyleSet } from '../constants/desktopCuratedStyleSets';
import type { DesktopWorkspaceVisualPreferenceState } from './useDesktopWorkspaceVisualProfileBridge';
import type { DesktopWorkspaceSurfaceChromeShellClusterRest } from './useDesktopWorkspaceSurfaceChromeBundle';
import { normalizeDesktopWidgetsPanelPosition } from '../utils/normalizeDesktopWidgetsPanelPosition';
import type { TabId } from '../components/settings/desktopSettingsShared.types';
import type { DesktopStorageConfigSaveErrorCode } from '../utils/desktopStorageSyncError';

type DesktopVisualPreferencePersistOptions = {
	persist?: boolean;
};

export type DesktopWorkspaceShellSettingsClusterInputParams = {
	applyCuratedDesktopConfigPreset: (
		set: DesktopCuratedStyleSet
	) => void | Promise<void>;
	updateDesktopVisualPreferences: (
		updates: Partial<DesktopWorkspaceVisualPreferenceState>,
		options?: DesktopVisualPreferencePersistOptions
	) => void | Promise<void>;
	updateConfig: (
		patch: Partial<DesktopConfig>,
		options?: { persistRemote?: boolean }
	) => Promise<void> | void;
	config: DesktopConfig | null | undefined;
	isOnline: boolean;
	isConfigSaving: boolean;
	isProfileSaving: boolean;
	configSaveError: DesktopStorageConfigSaveErrorCode | null;
	activeTab: TabId;
	onActiveTabChange: (tab: TabId) => void;
	theme: DesktopConfig['theme'];
	onThemeChange: (theme: DesktopConfig['theme']) => void;
	accent: DesktopConfig['accent'];
	accentCustomHex: string;
	onAccentChange: (accent: DesktopConfig['accent']) => void;
	onAccentCustomHexChange: (hex: string) => void;
	wallpaper: string;
	iconSize: DesktopConfig['icon_size'];
	snapToGridEnabled: boolean;
	gridStep: DesktopConfig['grid_step'];
	desktopIconStyle: DesktopWorkspaceVisualPreferenceState['desktop_icon_style'];
	desktopTaskbarStyle: DesktopWorkspaceVisualPreferenceState['desktop_taskbar_style'];
	desktopWindowStyle: DesktopWorkspaceVisualPreferenceState['desktop_window_style'];
	desktopAccentFollowsWindowStyle: boolean;
	desktopFloatingWidgetVisible: boolean;
	desktopOpenAppsMaximized: boolean;
	desktopWidgetsStyle: DesktopWorkspaceVisualPreferenceState['desktop_widgets_style'];
	desktopPanelOpacity: number;
	desktopUiScale: number;
	desktopSceneDepth: DesktopWorkspaceVisualPreferenceState['desktop_scene_depth'];
	desktopFontBody: DesktopWorkspaceVisualPreferenceState['desktop_font_body'];
	desktopFontDisplay: DesktopWorkspaceVisualPreferenceState['desktop_font_display'];
	desktopWallpaperCrossfadeEnabled: boolean;
	desktopStyledTooltips: boolean;
	desktopShellReduceMotion: boolean;
	desktopShellParallaxEnabled: boolean;
	desktopShellParallaxIntensity: DesktopWorkspaceVisualPreferenceState['desktop_shell_parallax_intensity'];
	desktopShellWindowMorphEnabled: boolean;
	desktopShellMotionSpeed: DesktopWorkspaceVisualPreferenceState['desktop_shell_motion_speed'];
	expansionSettings: DesktopExpansionSettings;
	settingsCenterBridge: DesktopSettingsCenterBridge;
	performance: DesktopWorkspaceSurfaceChromeShellClusterRest['performance'];
	profilePatchRemote: boolean;
	personalizationStagingActive: boolean;
	onPersonalizationStagingStart: () => void;
	onPersonalizationStagingCommit: () => void | Promise<void>;
	onPersonalizationStagingCancel: () => void;
	onApplyUserVisualStylePreset: (
		preset: DesktopUserVisualStylePreset
	) => void | Promise<void>;
	onExportPersonalizationPackJson: () => string;
	onImportPersonalizationPackJson: (
		json: string
	) => Promise<
		{ ok: true; shellSlicesApplied: boolean } | { ok: false; error: string }
	>;
	workspaceProfilesShellContext: DesktopWorkspaceSurfaceChromeShellClusterRest['workspaceProfilesShellContext'];
};

export function useDesktopWorkspaceShellSettingsClusterInput(
	params: DesktopWorkspaceShellSettingsClusterInputParams
): DesktopWorkspaceSurfaceChromeShellClusterRest {
	const {
		applyCuratedDesktopConfigPreset,
		updateDesktopVisualPreferences,
		updateConfig,
		config,
		isOnline,
		isConfigSaving,
		isProfileSaving,
		configSaveError,
		activeTab,
		onActiveTabChange,
		theme,
		onThemeChange,
		accent,
		accentCustomHex,
		onAccentChange,
		onAccentCustomHexChange,
		wallpaper,
		iconSize,
		snapToGridEnabled,
		gridStep,
		desktopIconStyle,
		desktopTaskbarStyle,
		desktopWindowStyle,
		desktopAccentFollowsWindowStyle,
		desktopFloatingWidgetVisible,
		desktopOpenAppsMaximized,
		desktopWidgetsStyle,
		desktopPanelOpacity,
		desktopUiScale,
		desktopSceneDepth,
		desktopFontBody,
		desktopFontDisplay,
		desktopWallpaperCrossfadeEnabled,
		desktopStyledTooltips,
		desktopShellReduceMotion,
		desktopShellParallaxEnabled,
		desktopShellParallaxIntensity,
		desktopShellWindowMorphEnabled,
		desktopShellMotionSpeed,
		expansionSettings,
		settingsCenterBridge,
		performance,
		profilePatchRemote,
		personalizationStagingActive,
		onPersonalizationStagingStart,
		onPersonalizationStagingCommit,
		onPersonalizationStagingCancel,
		onApplyUserVisualStylePreset,
		onExportPersonalizationPackJson,
		onImportPersonalizationPackJson,
		workspaceProfilesShellContext,
	} = params;

	const onShowWidgetsPanelChange = useCallback(
		(value: boolean) => {
			void updateConfig({ show_widgets_panel: value });
		},
		[updateConfig]
	);

	const onWidgetsPanelPositionChange = useCallback(
		(value: WidgetsPanelPosition) => {
			void updateConfig({ widgets_panel_position: value });
		},
		[updateConfig]
	);

	const onCompactWidgetsChange = useCallback(
		(value: boolean) => {
			void updateConfig({ compact_widgets: value });
		},
		[updateConfig]
	);

	const widgetsPanelPosition = normalizeDesktopWidgetsPanelPosition(
		config?.widgets_panel_position
	);

	return useMemo(
		(): DesktopWorkspaceSurfaceChromeShellClusterRest => ({
			applyCuratedDesktopConfigPreset,
			updateDesktopVisualPreferences,
			isOnline,
			isConfigSaving,
			isProfileSaving,
			configSaveError,
			activeTab,
			onActiveTabChange,
			theme,
			onThemeChange,
			accent,
			accentCustomHex,
			onAccentChange,
			onAccentCustomHexChange,
			wallpaper,
			iconSize,
			snapToGridEnabled,
			gridStep,
			desktopIconStyle,
			desktopTaskbarStyle,
			desktopWindowStyle,
			desktopAccentFollowsWindowStyle,
			desktopFloatingWidgetVisible,
			desktopOpenAppsMaximized,
			desktopWidgetsStyle,
			desktopPanelOpacity,
			desktopUiScale,
			desktopSceneDepth,
			desktopFontBody,
			desktopFontDisplay,
			desktopWallpaperCrossfadeEnabled,
			desktopStyledTooltips,
			desktopShellReduceMotion,
			desktopShellParallaxEnabled,
			desktopShellParallaxIntensity,
			desktopShellWindowMorphEnabled,
			desktopShellMotionSpeed,
			showWidgetsPanel: config?.show_widgets_panel ?? false,
			onShowWidgetsPanelChange,
			widgetsPanelPosition,
			onWidgetsPanelPositionChange,
			compactWidgets: config?.compact_widgets ?? false,
			onCompactWidgetsChange,
			expansionSettings,
			settingsCenterBridge,
			performance,
			profilePatchRemote,
			personalizationStagingActive,
			onPersonalizationStagingStart,
			onPersonalizationStagingCommit,
			onPersonalizationStagingCancel,
			onApplyUserVisualStylePreset,
			onExportPersonalizationPackJson,
			onImportPersonalizationPackJson,
			workspaceProfilesShellContext,
		}),
		[
			applyCuratedDesktopConfigPreset,
			updateDesktopVisualPreferences,
			isOnline,
			isConfigSaving,
			isProfileSaving,
			configSaveError,
			activeTab,
			onActiveTabChange,
			theme,
			onThemeChange,
			accent,
			accentCustomHex,
			onAccentChange,
			onAccentCustomHexChange,
			wallpaper,
			iconSize,
			snapToGridEnabled,
			gridStep,
			desktopIconStyle,
			desktopTaskbarStyle,
			desktopWindowStyle,
			desktopAccentFollowsWindowStyle,
			desktopFloatingWidgetVisible,
			desktopOpenAppsMaximized,
			desktopWidgetsStyle,
			desktopPanelOpacity,
			desktopUiScale,
			desktopSceneDepth,
			desktopFontBody,
			desktopFontDisplay,
			desktopWallpaperCrossfadeEnabled,
			desktopStyledTooltips,
			desktopShellReduceMotion,
			desktopShellParallaxEnabled,
			desktopShellParallaxIntensity,
			desktopShellWindowMorphEnabled,
			desktopShellMotionSpeed,
			config?.show_widgets_panel,
			config?.compact_widgets,
			onShowWidgetsPanelChange,
			widgetsPanelPosition,
			onWidgetsPanelPositionChange,
			onCompactWidgetsChange,
			expansionSettings,
			settingsCenterBridge,
			performance,
			profilePatchRemote,
			personalizationStagingActive,
			onPersonalizationStagingStart,
			onPersonalizationStagingCommit,
			onPersonalizationStagingCancel,
			onApplyUserVisualStylePreset,
			onExportPersonalizationPackJson,
			onImportPersonalizationPackJson,
			workspaceProfilesShellContext,
		]
	);
}
