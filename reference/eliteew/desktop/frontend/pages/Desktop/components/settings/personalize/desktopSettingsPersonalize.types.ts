/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared prop contracts for Personalize tab facade cluster under `settings/personalize/`.
 *
 * Invariants:
 * - Field ids and persistence targets stay aligned with storage map navigation.
 *
 * Related:
 * - `DesktopSettingsPersonalizeTab.tsx`
 * - `useDesktopSettingsPersonalizeVisualStudioProps.ts`
 */

import type {
	DesktopFontBodyId,
	DesktopFontDisplayId,
	DesktopIconStyle,
	DesktopSceneDepth,
	DesktopShellMotionSpeed,
	DesktopShellParallaxIntensity,
	DesktopTaskbarStyle,
	DesktopWidgetsStyle,
	DesktopWindowStyle,
} from '@/types/profile';
import type { AccentColorId } from '../../../context/DesktopStateContext';
import type {
	DesktopExpansionSettings,
	DesktopUserVisualStylePreset,
} from '../../../types/desktopExpansion.types';
import type {
	DesktopSettingsShellHelpers,
	DesktopSettingsVisualLabels,
	ThemeMode,
} from '../desktopSettingsShared.types';
import type { VisualStudioSettingsNavigateTarget } from '../desktopVisualStudioPreviewHotspots';

export type DesktopSettingsPersonalizeVisualStudioInput = {
	theme: ThemeMode;
	wallpaper: string;
	selectedAccentName: string;
	desktopWindowStyle: DesktopWindowStyle;
	onDesktopWindowStyleChange: (value: DesktopWindowStyle) => void;
	desktopTaskbarStyle: DesktopTaskbarStyle;
	onDesktopTaskbarStyleChange: (value: DesktopTaskbarStyle) => void;
	desktopWidgetsStyle: DesktopWidgetsStyle;
	onDesktopWidgetsStyleChange: (value: DesktopWidgetsStyle) => void;
	desktopIconStyle: DesktopIconStyle;
	desktopPanelOpacity: number;
	onDesktopPanelOpacityChange: (value: number) => void;
	onOpenWallpaperPicker: () => void;
	visualLabels: DesktopSettingsVisualLabels;
	desktopSceneDepth: DesktopSceneDepth;
	onDesktopSceneDepthChange: (value: DesktopSceneDepth) => void;
	desktopFontBody: DesktopFontBodyId;
	onDesktopFontBodyChange: (value: DesktopFontBodyId) => void;
	desktopFontDisplay: DesktopFontDisplayId;
	onDesktopFontDisplayChange: (value: DesktopFontDisplayId) => void;
	desktopWallpaperCrossfadeEnabled: boolean;
	onDesktopWallpaperCrossfadeChange: (value: boolean) => void;
	desktopStyledTooltips: boolean;
	onDesktopStyledTooltipsChange: (value: boolean) => void;
	desktopShellReduceMotion: boolean;
	onDesktopShellReduceMotionChange: (value: boolean) => void;
	desktopShellParallaxEnabled: boolean;
	onDesktopShellParallaxEnabledChange: (value: boolean) => void;
	desktopShellParallaxIntensity: DesktopShellParallaxIntensity;
	onDesktopShellParallaxIntensityChange: (
		value: DesktopShellParallaxIntensity
	) => void;
	desktopShellWindowMorphEnabled: boolean;
	onDesktopShellWindowMorphEnabledChange: (value: boolean) => void;
	desktopShellMotionSpeed: DesktopShellMotionSpeed;
	onDesktopShellMotionSpeedChange: (value: DesktopShellMotionSpeed) => void;
	onNavigateSettingsField?: (
		target: VisualStudioSettingsNavigateTarget
	) => void;
	shell: DesktopSettingsShellHelpers;
};

export type DesktopSettingsPersonalizeThemeAccentCardProps = {
	theme: ThemeMode;
	onThemeChange: (theme: ThemeMode) => void;
	accent: AccentColorId;
	accentCustomHex: string;
	onAccentChange: (accent: AccentColorId) => void;
	onAccentCustomHexChange: (hex: string) => void;
	selectedAccentName: string;
	desktopWindowStyle: DesktopWindowStyle;
	desktopAccentFollowsWindowStyle: boolean;
	onDesktopAccentFollowsWindowStyleChange: (value: boolean) => void;
	shell: DesktopSettingsShellHelpers;
	visualLabels: DesktopSettingsVisualLabels;
};

export type DesktopSettingsPersonalizeWallpaperCardProps = {
	wallpaper: string;
	onOpenWallpaperPicker: () => void;
	shell: DesktopSettingsShellHelpers;
	/** When true, Change wallpaper is the sole filled primary CTA above the fold. */
	isPrimaryCta?: boolean;
};

export type DesktopSettingsPersonalizePresetsFacadeProps = {
	theme: ThemeMode;
	accent: AccentColorId;
	accentCustomHex: string;
	wallpaper: string;
	desktopWindowStyle: DesktopWindowStyle;
	desktopAccentFollowsWindowStyle: boolean;
	desktopTaskbarStyle: DesktopTaskbarStyle;
	desktopIconStyle: DesktopIconStyle;
	desktopWidgetsStyle: DesktopWidgetsStyle;
	desktopPanelOpacity: number;
	desktopUiScale: number;
	desktopSceneDepth: DesktopSceneDepth;
	desktopFontBody: DesktopFontBodyId;
	desktopFontDisplay: DesktopFontDisplayId;
	desktopWallpaperCrossfadeEnabled: boolean;
	desktopStyledTooltips: boolean;
	expansionSettings: DesktopExpansionSettings;
	personalizationStagingActive: boolean;
	onPersonalizationStagingStart?: () => void;
	onPersonalizationStagingCommit?: () => void | Promise<void>;
	onPersonalizationStagingCancel?: () => void;
	onApplyUserVisualStylePreset?: (
		preset: DesktopUserVisualStylePreset
	) => void | Promise<void>;
	onExportPersonalizationPackJson?: () => string;
	onImportPersonalizationPackJson?: (
		json: string
	) => Promise<
		{ ok: true; shellSlicesApplied?: boolean } | { ok: false; error?: string }
	>;
	shell: DesktopSettingsShellHelpers;
	visualLabels: DesktopSettingsVisualLabels;
};
