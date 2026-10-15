/**
 * T19: плоские пропсы для {@link useDesktopWorkspaceShellSettingsIntegration}
 * (без вложенных `persistence` / `session` / `themeAccent` / … в контенте).
 *
 * `snapToGridEnabled` → `wallpaperGrid.snapToGrid`.
 */

import type { DesktopSettingsCenterBridge } from '../types/desktopSettingsCenterBridge.types';
import {
	type UseDesktopWorkspaceShellSettingsIntegrationParams,
	useDesktopWorkspaceShellSettingsIntegration,
} from './useDesktopWorkspaceShellSettingsIntegration';

type Int = UseDesktopWorkspaceShellSettingsIntegrationParams;

export type DesktopWorkspaceShellSettingsIntegrationClusterParams = Pick<
	Int,
	| 'applyCuratedDesktopConfigPreset'
	| 'updateDesktopVisualPreferences'
	| 'profilePatchRemote'
	| 'personalizationStagingActive'
	| 'onPersonalizationStagingStart'
	| 'onPersonalizationStagingCommit'
	| 'onPersonalizationStagingCancel'
	| 'onApplyUserVisualStylePreset'
	| 'onExportPersonalizationPackJson'
	| 'onImportPersonalizationPackJson'
> &
	Int['persistence'] &
	Int['session'] &
	Int['themeAccent'] &
	Omit<Int['wallpaperGrid'], 'snapToGrid'> & {
		snapToGridEnabled: Int['wallpaperGrid']['snapToGrid'];
	} & Int['desktopShellStyles'] &
	Int['expansion'] &
	Int['performance'] & {
		settingsCenterBridge: DesktopSettingsCenterBridge;
	} & Pick<Int, 'workspaceProfilesShellContext'>;

export function useDesktopWorkspaceShellSettingsIntegrationCluster(
	p: DesktopWorkspaceShellSettingsIntegrationClusterParams
): ReturnType<typeof useDesktopWorkspaceShellSettingsIntegration> {
	return useDesktopWorkspaceShellSettingsIntegration({
		applyCuratedDesktopConfigPreset: p.applyCuratedDesktopConfigPreset,
		updateDesktopVisualPreferences: p.updateDesktopVisualPreferences,
		profilePatchRemote: p.profilePatchRemote,
		personalizationStagingActive: p.personalizationStagingActive,
		onPersonalizationStagingStart: p.onPersonalizationStagingStart,
		onPersonalizationStagingCommit: p.onPersonalizationStagingCommit,
		onPersonalizationStagingCancel: p.onPersonalizationStagingCancel,
		onApplyUserVisualStylePreset: p.onApplyUserVisualStylePreset,
		onExportPersonalizationPackJson: p.onExportPersonalizationPackJson,
		onImportPersonalizationPackJson: p.onImportPersonalizationPackJson,
		persistence: {
			isOnline: p.isOnline,
			isConfigSaving: p.isConfigSaving,
			isProfileSaving: p.isProfileSaving,
			configSaveError: p.configSaveError,
		},
		session: {
			activeTab: p.activeTab,
			onActiveTabChange: p.onActiveTabChange,
		},
		themeAccent: {
			theme: p.theme,
			onThemeChange: p.onThemeChange,
			accent: p.accent,
			accentCustomHex: p.accentCustomHex,
			onAccentChange: p.onAccentChange,
			onAccentCustomHexChange: p.onAccentCustomHexChange,
		},
		wallpaperGrid: {
			wallpaper: p.wallpaper,
			onWallpaperChange: p.onWallpaperChange,
			onOpenWallpaperPicker: p.onOpenWallpaperPicker,
			iconSize: p.iconSize,
			onIconSizeChange: p.onIconSizeChange,
			snapToGrid: p.snapToGridEnabled,
			onSnapToGridChange: p.onSnapToGridChange,
			gridStep: p.gridStep,
			onGridStepChange: p.onGridStepChange,
		},
		desktopShellStyles: {
			desktopIconStyle: p.desktopIconStyle,
			onDesktopIconStyleChange: p.onDesktopIconStyleChange,
			desktopTaskbarStyle: p.desktopTaskbarStyle,
			onDesktopTaskbarStyleChange: p.onDesktopTaskbarStyleChange,
			desktopWindowStyle: p.desktopWindowStyle,
			onDesktopWindowStyleChange: p.onDesktopWindowStyleChange,
			desktopAccentFollowsWindowStyle: p.desktopAccentFollowsWindowStyle,
			onDesktopAccentFollowsWindowStyleChange:
				p.onDesktopAccentFollowsWindowStyleChange,
			desktopFloatingWidgetVisible: p.desktopFloatingWidgetVisible,
			onDesktopFloatingWidgetVisibleChange:
				p.onDesktopFloatingWidgetVisibleChange,
			desktopOpenAppsMaximized: p.desktopOpenAppsMaximized,
			onDesktopOpenAppsMaximizedChange: p.onDesktopOpenAppsMaximizedChange,
			desktopWidgetsStyle: p.desktopWidgetsStyle,
			onDesktopWidgetsStyleChange: p.onDesktopWidgetsStyleChange,
			desktopPanelOpacity: p.desktopPanelOpacity,
			onDesktopPanelOpacityChange: p.onDesktopPanelOpacityChange,
			desktopUiScale: p.desktopUiScale,
			onDesktopUiScaleChange: p.onDesktopUiScaleChange,
			desktopSceneDepth: p.desktopSceneDepth,
			onDesktopSceneDepthChange: p.onDesktopSceneDepthChange,
			desktopFontBody: p.desktopFontBody,
			onDesktopFontBodyChange: p.onDesktopFontBodyChange,
			desktopFontDisplay: p.desktopFontDisplay,
			onDesktopFontDisplayChange: p.onDesktopFontDisplayChange,
			desktopWallpaperCrossfadeEnabled: p.desktopWallpaperCrossfadeEnabled,
			onDesktopWallpaperCrossfadeChange: p.onDesktopWallpaperCrossfadeChange,
			desktopStyledTooltips: p.desktopStyledTooltips,
			onDesktopStyledTooltipsChange: p.onDesktopStyledTooltipsChange,
			desktopShellReduceMotion: p.desktopShellReduceMotion,
			onDesktopShellReduceMotionChange: p.onDesktopShellReduceMotionChange,
			desktopShellParallaxEnabled: p.desktopShellParallaxEnabled,
			onDesktopShellParallaxEnabledChange:
				p.onDesktopShellParallaxEnabledChange,
			desktopShellParallaxIntensity: p.desktopShellParallaxIntensity,
			onDesktopShellParallaxIntensityChange:
				p.onDesktopShellParallaxIntensityChange,
			desktopShellWindowMorphEnabled: p.desktopShellWindowMorphEnabled,
			onDesktopShellWindowMorphEnabledChange:
				p.onDesktopShellWindowMorphEnabledChange,
			desktopShellMotionSpeed: p.desktopShellMotionSpeed,
			onDesktopShellMotionSpeedChange: p.onDesktopShellMotionSpeedChange,
			showWidgetsPanel: p.showWidgetsPanel,
			onShowWidgetsPanelChange: p.onShowWidgetsPanelChange,
			widgetsPanelPosition: p.widgetsPanelPosition,
			onWidgetsPanelPositionChange: p.onWidgetsPanelPositionChange,
			compactWidgets: p.compactWidgets,
			onCompactWidgetsChange: p.onCompactWidgetsChange,
		},
		expansion: {
			expansionSettings: p.expansionSettings,
		},
		settingsCenterBridge: p.settingsCenterBridge,
		workspaceProfilesShellContext: p.workspaceProfilesShellContext,
		performance: {
			performance: p.performance,
		},
	});
}
