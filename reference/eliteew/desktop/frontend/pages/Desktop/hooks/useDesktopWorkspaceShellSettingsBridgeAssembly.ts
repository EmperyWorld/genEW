/**
 * Волна 15: группировка аргументов для {@link useDesktopShellSettingsBridgeValue}
 * без изменения публичной сигнатуры bridge-хука.
 */

import type { DesktopShellSettingsBridgeValue } from '../context/DesktopShellSettingsBridgeContext';
import type { DesktopCuratedStyleSet } from '../constants/desktopCuratedStyleSets';
import type { DesktopSettingsCenterBridge } from '../types/desktopSettingsCenterBridge.types';
import { useDesktopShellSettingsBridgeValue } from './useDesktopShellSettingsBridgeValue';

export type DesktopWorkspaceShellSettingsBridgeAssemblyParams = {
	persistence: Pick<
		DesktopShellSettingsBridgeValue,
		'isOnline' | 'isConfigSaving' | 'isProfileSaving' | 'configSaveError'
	>;
	session: Pick<
		DesktopShellSettingsBridgeValue,
		'activeTab' | 'onActiveTabChange'
	>;
	themeAccent: Pick<
		DesktopShellSettingsBridgeValue,
		| 'theme'
		| 'onThemeChange'
		| 'accent'
		| 'accentCustomHex'
		| 'onAccentChange'
		| 'onAccentCustomHexChange'
	>;
	wallpaperGrid: Pick<
		DesktopShellSettingsBridgeValue,
		| 'wallpaper'
		| 'onWallpaperChange'
		| 'onOpenWallpaperPicker'
		| 'iconSize'
		| 'onIconSizeChange'
		| 'snapToGrid'
		| 'onSnapToGridChange'
		| 'gridStep'
		| 'onGridStepChange'
	>;
	desktopShellStyles: Pick<
		DesktopShellSettingsBridgeValue,
		| 'desktopIconStyle'
		| 'onDesktopIconStyleChange'
		| 'desktopTaskbarStyle'
		| 'onDesktopTaskbarStyleChange'
		| 'desktopWindowStyle'
		| 'onDesktopWindowStyleChange'
		| 'desktopAccentFollowsWindowStyle'
		| 'onDesktopAccentFollowsWindowStyleChange'
		| 'desktopFloatingWidgetVisible'
		| 'onDesktopFloatingWidgetVisibleChange'
		| 'desktopOpenAppsMaximized'
		| 'onDesktopOpenAppsMaximizedChange'
		| 'desktopWidgetsStyle'
		| 'onDesktopWidgetsStyleChange'
		| 'desktopPanelOpacity'
		| 'onDesktopPanelOpacityChange'
		| 'desktopUiScale'
		| 'onDesktopUiScaleChange'
		| 'desktopSceneDepth'
		| 'onDesktopSceneDepthChange'
		| 'desktopFontBody'
		| 'onDesktopFontBodyChange'
		| 'desktopFontDisplay'
		| 'onDesktopFontDisplayChange'
		| 'desktopWallpaperCrossfadeEnabled'
		| 'onDesktopWallpaperCrossfadeChange'
		| 'desktopStyledTooltips'
		| 'onDesktopStyledTooltipsChange'
		| 'desktopShellReduceMotion'
		| 'onDesktopShellReduceMotionChange'
		| 'desktopShellParallaxEnabled'
		| 'onDesktopShellParallaxEnabledChange'
		| 'desktopShellParallaxIntensity'
		| 'onDesktopShellParallaxIntensityChange'
		| 'desktopShellWindowMorphEnabled'
		| 'onDesktopShellWindowMorphEnabledChange'
		| 'desktopShellMotionSpeed'
		| 'onDesktopShellMotionSpeedChange'
		| 'showWidgetsPanel'
		| 'onShowWidgetsPanelChange'
		| 'widgetsPanelPosition'
		| 'onWidgetsPanelPositionChange'
		| 'compactWidgets'
		| 'onCompactWidgetsChange'
	>;
	curatedPresets: {
		onApplyCuratedStyleSet: (
			set: DesktopCuratedStyleSet
		) => void | Promise<void>;
	};
	expansion: Pick<DesktopShellSettingsBridgeValue, 'expansionSettings'>;
	settingsCenterBridge: DesktopSettingsCenterBridge;
	performance: Pick<DesktopShellSettingsBridgeValue, 'performance'>;
	workspaceProfilesShellContext?: DesktopShellSettingsBridgeValue['workspaceProfilesShellContext'];
} & Pick<
	DesktopShellSettingsBridgeValue,
	| 'personalizationStagingActive'
	| 'onPersonalizationStagingStart'
	| 'onPersonalizationStagingCommit'
	| 'onPersonalizationStagingCancel'
	| 'onApplyUserVisualStylePreset'
	| 'onExportPersonalizationPackJson'
	| 'onImportPersonalizationPackJson'
>;

export function useDesktopWorkspaceShellSettingsBridgeAssembly(
	params: DesktopWorkspaceShellSettingsBridgeAssemblyParams
): DesktopShellSettingsBridgeValue {
	const {
		persistence,
		session,
		themeAccent,
		wallpaperGrid,
		desktopShellStyles,
		curatedPresets,
		expansion,
		settingsCenterBridge,
		performance,
		workspaceProfilesShellContext,
		personalizationStagingActive,
		onPersonalizationStagingStart,
		onPersonalizationStagingCommit,
		onPersonalizationStagingCancel,
		onApplyUserVisualStylePreset,
		onExportPersonalizationPackJson,
		onImportPersonalizationPackJson,
	} = params;

	return useDesktopShellSettingsBridgeValue({
		...persistence,
		...session,
		...themeAccent,
		...wallpaperGrid,
		...desktopShellStyles,
		...curatedPresets,
		...expansion,
		settingsCenterBridge,
		workspaceProfilesShellContext,
		...performance,
		personalizationStagingActive,
		onPersonalizationStagingStart,
		onPersonalizationStagingCommit,
		onPersonalizationStagingCancel,
		onApplyUserVisualStylePreset,
		onExportPersonalizationPackJson,
		onImportPersonalizationPackJson,
	});
}
