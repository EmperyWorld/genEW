/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Memo bundle for Visual Studio section props shared between preview-only and details-only layouts in Personalize tab.
 *
 * Invariants:
 * - Output shape matches `DesktopSettingsVisualStudioSectionProps` minus `layout`.
 *
 * Related:
 * - `components/settings/personalize/*`
 * - `DesktopSettingsVisualStudioSection.tsx`
 */

import { useMemo } from 'react';
import type { DesktopSettingsVisualStudioSectionProps } from '../components/settings/DesktopSettingsVisualStudioSection';
import type { DesktopSettingsPersonalizeVisualStudioInput } from '../components/settings/personalize/desktopSettingsPersonalize.types';

export type DesktopSettingsPersonalizeVisualStudioProps = Omit<
	DesktopSettingsVisualStudioSectionProps,
	'layout'
>;

export function useDesktopSettingsPersonalizeVisualStudioProps(
	input: DesktopSettingsPersonalizeVisualStudioInput
): DesktopSettingsPersonalizeVisualStudioProps {
	return useMemo(
		() => ({
			theme: input.theme,
			wallpaper: input.wallpaper,
			selectedAccentName: input.selectedAccentName,
			desktopWindowStyle: input.desktopWindowStyle,
			onDesktopWindowStyleChange: input.onDesktopWindowStyleChange,
			desktopTaskbarStyle: input.desktopTaskbarStyle,
			onDesktopTaskbarStyleChange: input.onDesktopTaskbarStyleChange,
			desktopWidgetsStyle: input.desktopWidgetsStyle,
			onDesktopWidgetsStyleChange: input.onDesktopWidgetsStyleChange,
			desktopIconStyle: input.desktopIconStyle,
			desktopPanelOpacity: input.desktopPanelOpacity,
			onDesktopPanelOpacityChange: input.onDesktopPanelOpacityChange,
			onOpenWallpaperPicker: input.onOpenWallpaperPicker,
			visualLabels: input.visualLabels,
			desktopSceneDepth: input.desktopSceneDepth,
			onDesktopSceneDepthChange: input.onDesktopSceneDepthChange,
			desktopFontBody: input.desktopFontBody,
			onDesktopFontBodyChange: input.onDesktopFontBodyChange,
			desktopFontDisplay: input.desktopFontDisplay,
			onDesktopFontDisplayChange: input.onDesktopFontDisplayChange,
			desktopWallpaperCrossfadeEnabled: input.desktopWallpaperCrossfadeEnabled,
			onDesktopWallpaperCrossfadeChange:
				input.onDesktopWallpaperCrossfadeChange,
			desktopStyledTooltips: input.desktopStyledTooltips,
			onDesktopStyledTooltipsChange: input.onDesktopStyledTooltipsChange,
			desktopShellReduceMotion: input.desktopShellReduceMotion,
			onDesktopShellReduceMotionChange: input.onDesktopShellReduceMotionChange,
			desktopShellParallaxEnabled: input.desktopShellParallaxEnabled,
			onDesktopShellParallaxEnabledChange:
				input.onDesktopShellParallaxEnabledChange,
			desktopShellParallaxIntensity: input.desktopShellParallaxIntensity,
			onDesktopShellParallaxIntensityChange:
				input.onDesktopShellParallaxIntensityChange,
			desktopShellWindowMorphEnabled: input.desktopShellWindowMorphEnabled,
			onDesktopShellWindowMorphEnabledChange:
				input.onDesktopShellWindowMorphEnabledChange,
			desktopShellMotionSpeed: input.desktopShellMotionSpeed,
			onDesktopShellMotionSpeedChange: input.onDesktopShellMotionSpeedChange,
			onNavigateSettingsField: input.onNavigateSettingsField,
			shell: input.shell,
		}),
		[input]
	);
}
