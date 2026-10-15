/**
 * T22: единая цепочка «accent → appearance → wallpaper → shell settings bridge → main surface».
 * Снимает пять последовательных вызовов из {@link DesktopWorkspaceContent}.
 */

import type * as React from 'react';
import { useDesktopWorkspaceAccentRgb } from './useDesktopWorkspaceAccentRgb';
import { useDesktopWorkspaceAppearanceCallbacks } from './useDesktopWorkspaceAppearanceCallbacks';
import { useDesktopWorkspaceMainSurfaceEffects } from './useDesktopWorkspaceMainSurfaceEffects';
import {
	type DesktopWorkspaceShellSettingsIntegrationClusterParams,
	useDesktopWorkspaceShellSettingsIntegrationCluster,
} from './useDesktopWorkspaceShellSettingsIntegrationCluster';
import { useDesktopWorkspaceWallpaperAndFolderHandlers } from './useDesktopWorkspaceWallpaperAndFolderHandlers';

type AccentInput = Parameters<typeof useDesktopWorkspaceAccentRgb>[0];
type AppearanceInput = Parameters<
	typeof useDesktopWorkspaceAppearanceCallbacks
>[0];
type WallpaperInput = Parameters<
	typeof useDesktopWorkspaceWallpaperAndFolderHandlers
>[0];

type InjectedShellClusterHandlerKeys =
	| 'onWallpaperChange'
	| 'onOpenWallpaperPicker'
	| 'onIconSizeChange'
	| 'onSnapToGridChange'
	| 'onGridStepChange'
	| 'onDesktopIconStyleChange'
	| 'onDesktopTaskbarStyleChange'
	| 'onDesktopWindowStyleChange'
	| 'onDesktopAccentFollowsWindowStyleChange'
	| 'onDesktopFloatingWidgetVisibleChange'
	| 'onDesktopOpenAppsMaximizedChange'
	| 'onDesktopWidgetsStyleChange'
	| 'onDesktopPanelOpacityChange'
	| 'onDesktopUiScaleChange'
	| 'onDesktopSceneDepthChange'
	| 'onDesktopFontBodyChange'
	| 'onDesktopFontDisplayChange'
	| 'onDesktopWallpaperCrossfadeChange'
	| 'onDesktopStyledTooltipsChange'
	| 'onDesktopShellReduceMotionChange'
	| 'onDesktopShellParallaxEnabledChange'
	| 'onDesktopShellParallaxIntensityChange'
	| 'onDesktopShellWindowMorphEnabledChange'
	| 'onDesktopShellMotionSpeedChange';

export type DesktopWorkspaceSurfaceChromeShellClusterRest = Omit<
	DesktopWorkspaceShellSettingsIntegrationClusterParams,
	InjectedShellClusterHandlerKeys
>;

export function useDesktopWorkspaceSurfaceChromeBundle(params: {
	accentRgbInput: AccentInput;
	appearanceInput: AppearanceInput;
	wallpaperInput: WallpaperInput;
	shellClusterRest: DesktopWorkspaceSurfaceChromeShellClusterRest;
	mainSurface: {
		desktopAreaRef: React.RefObject<HTMLElement | null>;
		desktopThemeVars: Record<string, string>;
		effectiveTheme: 'dark' | 'light';
		wallpaper: string;
		storageLoading: boolean;
		reduceBackdropBlur: boolean;
		desktopFontBody: import('@/types/profile').DesktopFontBodyId;
		desktopFontDisplay: import('@/types/profile').DesktopFontDisplayId;
		desktopSceneDepth: import('@/types/profile').DesktopSceneDepth;
		wallpaperCrossfadeEnabled: boolean;
		styledTooltips: boolean;
		parallaxDisabled?: boolean;
		parallaxIntensityScale?: number;
	};
}) {
	const accentRgb = useDesktopWorkspaceAccentRgb(params.accentRgbInput);
	const appearanceCallbacks = useDesktopWorkspaceAppearanceCallbacks(
		params.appearanceInput
	);
	const wallpaperHandlers = useDesktopWorkspaceWallpaperAndFolderHandlers(
		params.wallpaperInput
	);

	const shellSettingsBridge =
		useDesktopWorkspaceShellSettingsIntegrationCluster({
			...params.shellClusterRest,
			onWallpaperChange: wallpaperHandlers.handleWallpaperChange,
			onOpenWallpaperPicker:
				appearanceCallbacks.openWallpaperFromDesktopSettings,
			onIconSizeChange: appearanceCallbacks.handleDesktopIconSizeChange,
			onSnapToGridChange: appearanceCallbacks.handleDesktopSnapToGridChange,
			onGridStepChange: appearanceCallbacks.handleDesktopGridStepChange,
			onDesktopIconStyleChange:
				appearanceCallbacks.handleDesktopIconStyleChange,
			onDesktopTaskbarStyleChange:
				appearanceCallbacks.handleDesktopTaskbarStyleChange,
			onDesktopWindowStyleChange:
				appearanceCallbacks.handleDesktopWindowStyleChange,
			onDesktopAccentFollowsWindowStyleChange:
				appearanceCallbacks.handleDesktopAccentFollowsWindowStyleChange,
			onDesktopFloatingWidgetVisibleChange:
				appearanceCallbacks.handleDesktopFloatingWidgetVisibleChange,
			onDesktopOpenAppsMaximizedChange:
				appearanceCallbacks.handleDesktopOpenAppsMaximizedChange,
			onDesktopWidgetsStyleChange:
				appearanceCallbacks.handleDesktopWidgetsStyleChange,
			onDesktopPanelOpacityChange:
				appearanceCallbacks.handleDesktopPanelOpacityChange,
			onDesktopUiScaleChange: appearanceCallbacks.handleDesktopUiScaleChange,
			onDesktopSceneDepthChange:
				appearanceCallbacks.handleDesktopSceneDepthChange,
			onDesktopFontBodyChange: appearanceCallbacks.handleDesktopFontBodyChange,
			onDesktopFontDisplayChange:
				appearanceCallbacks.handleDesktopFontDisplayChange,
			onDesktopWallpaperCrossfadeChange:
				appearanceCallbacks.handleDesktopWallpaperCrossfadeChange,
			onDesktopStyledTooltipsChange:
				appearanceCallbacks.handleDesktopStyledTooltipsChange,
			onDesktopShellReduceMotionChange:
				appearanceCallbacks.handleDesktopShellReduceMotionChange,
			onDesktopShellParallaxEnabledChange:
				appearanceCallbacks.handleDesktopShellParallaxEnabledChange,
			onDesktopShellParallaxIntensityChange:
				appearanceCallbacks.handleDesktopShellParallaxIntensityChange,
			onDesktopShellWindowMorphEnabledChange:
				appearanceCallbacks.handleDesktopShellWindowMorphEnabledChange,
			onDesktopShellMotionSpeedChange:
				appearanceCallbacks.handleDesktopShellMotionSpeedChange,
		});

	useDesktopWorkspaceMainSurfaceEffects({
		accentRgb,
		...params.mainSurface,
	});

	return {
		accentRgb,
		...appearanceCallbacks,
		...wallpaperHandlers,
		shellSettingsBridge,
	};
}
