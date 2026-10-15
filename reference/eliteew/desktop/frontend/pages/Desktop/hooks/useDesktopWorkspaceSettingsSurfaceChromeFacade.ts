/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Facade for Settings Center surface chrome: shared visual slices + `shellClusterRest` + bundle input.
 *
 * Invariants:
 * - Composes existing cluster/bundle input hooks without changing their contracts.
 * - Visual fields shared between `shell` and `chrome` come from one memoized slice builder.
 *
 * Related:
 * - `DesktopWorkspaceContent.tsx`, `useDesktopWorkspaceSurfaceChromeBundle.ts`
 */

import {
	type DesktopWorkspaceShellSettingsClusterInputParams,
	useDesktopWorkspaceShellSettingsClusterInput,
} from './useDesktopWorkspaceShellSettingsClusterInput';
import { useDesktopWorkspaceSettingsSharedVisualSlices } from './useDesktopWorkspaceSettingsSharedVisualSlices';
import {
	type DesktopWorkspaceSurfaceChromeBundleInput,
	type DesktopWorkspaceSurfaceChromeBundleInputParams,
	useDesktopWorkspaceSurfaceChromeBundleInput,
} from './useDesktopWorkspaceSurfaceChromeBundleInput';
import type { DesktopWorkspaceSettingsSharedVisualSlicesInput } from '../utils/desktopWorkspaceSettingsSharedVisualSlices';

type ShellClusterRestInput = Omit<
	DesktopWorkspaceShellSettingsClusterInputParams,
	| 'desktopAccentFollowsWindowStyle'
	| 'desktopWidgetsStyle'
	| 'desktopPanelOpacity'
>;

type ChromeBundleRestInput = Omit<
	DesktopWorkspaceSurfaceChromeBundleInputParams,
	'accentRgb' | 'mainSurface'
> & {
	mainSurface: Omit<
		DesktopWorkspaceSurfaceChromeBundleInputParams['mainSurface'],
		'reduceBackdropBlur'
	>;
};

export type DesktopWorkspaceSettingsSurfaceChromeFacadeParams = {
	visual: DesktopWorkspaceSettingsSharedVisualSlicesInput;
	shell: ShellClusterRestInput;
	chrome: ChromeBundleRestInput;
};

export type DesktopWorkspaceSettingsSurfaceChromeFacadeResult = {
	shellClusterRest: ReturnType<
		typeof useDesktopWorkspaceShellSettingsClusterInput
	>;
	surfaceChromeBundleInput: DesktopWorkspaceSurfaceChromeBundleInput;
};

export function useDesktopWorkspaceSettingsSurfaceChromeFacade(
	params: DesktopWorkspaceSettingsSurfaceChromeFacadeParams
): DesktopWorkspaceSettingsSurfaceChromeFacadeResult {
	const sharedVisual = useDesktopWorkspaceSettingsSharedVisualSlices(
		params.visual
	);

	const shellClusterRest = useDesktopWorkspaceShellSettingsClusterInput({
		...params.shell,
		desktopAccentFollowsWindowStyle:
			sharedVisual.shellStyles.desktopAccentFollowsWindowStyle,
		desktopWidgetsStyle: sharedVisual.shellStyles.desktopWidgetsStyle,
		desktopPanelOpacity: sharedVisual.shellStyles.desktopPanelOpacity,
		desktopSceneDepth: sharedVisual.mainSurfaceStudio.desktopSceneDepth,
		desktopFontBody: sharedVisual.mainSurfaceStudio.desktopFontBody,
		desktopFontDisplay: sharedVisual.mainSurfaceStudio.desktopFontDisplay,
		desktopWallpaperCrossfadeEnabled:
			sharedVisual.mainSurfaceStudio.wallpaperCrossfadeEnabled,
		desktopStyledTooltips: sharedVisual.mainSurfaceStudio.styledTooltips,
		desktopShellReduceMotion: sharedVisual.shellMotion.desktopShellReduceMotion,
		desktopShellParallaxEnabled:
			sharedVisual.shellMotion.desktopShellParallaxEnabled,
		desktopShellParallaxIntensity:
			sharedVisual.shellMotion.desktopShellParallaxIntensity,
		desktopShellWindowMorphEnabled:
			sharedVisual.shellMotion.desktopShellWindowMorphEnabled,
		desktopShellMotionSpeed: sharedVisual.shellMotion.desktopShellMotionSpeed,
	});

	const surfaceChromeBundleInput = useDesktopWorkspaceSurfaceChromeBundleInput({
		accentRgb: sharedVisual.accentRgb,
		appearance: params.chrome.appearance,
		wallpaper: params.chrome.wallpaper,
		mainSurface: {
			...params.chrome.mainSurface,
			reduceBackdropBlur: sharedVisual.shellStyles.reduceBackdropBlur,
			...sharedVisual.mainSurfaceStudio,
		},
	});

	return { shellClusterRest, surfaceChromeBundleInput };
}
