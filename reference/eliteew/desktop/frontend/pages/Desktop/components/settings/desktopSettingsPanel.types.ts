/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Public props contract for Desktop Settings Center shell (`DesktopSettingsPanel`).
 *
 * Invariants:
 * - Active tab remains parent-controlled (`activeTab` / `onActiveTabChange`).
 *
 * Related:
 * - `DesktopSettingsPanel.tsx`
 * - `DesktopSettingsPanelTabPanels.tsx`
 */

import {
	type DesktopIconStyle,
	type DesktopTaskbarStyle,
	type DesktopWindowStyle,
	type DesktopWidgetsStyle,
} from '../../types/profile';
import type { DesktopCuratedStyleSet } from '../../constants/desktopCuratedStyleSets';
import type {
	DesktopExpansionSettings,
	DesktopUserVisualStylePreset,
} from '../../types/desktopExpansion.types';
import type { DesktopSettingsCenterBridge } from '../../types/desktopSettingsCenterBridge.types';
import type { AccentColorId } from '../../context/DesktopStateContext';
import type { PerformanceSummary } from './DesktopSettingsPerformanceTab';
import type {
	DesktopSettingsWorkspaceProfilesShellContext,
	IconSize,
	TabId,
	ThemeMode,
} from './desktopSettingsShared.types';
import type { WidgetsPanelPosition } from '../../types/desktop.types';
import type { DesktopStorageConfigSaveErrorCode } from '../../utils/desktopStorageSyncError';

export interface DesktopSettingsPanelProps {
	isOpen: boolean;
	onClose: () => void;

	/** Connectivity and save status for inline feedback */
	isOnline: boolean;
	isConfigSaving: boolean;
	/** Profile UI preferences PATCH in flight */
	isProfileSaving: boolean;
	configSaveError: DesktopStorageConfigSaveErrorCode | null;

	/** Active tab is controlled by parent to avoid state inconsistencies in compiled bundle */
	activeTab: TabId;
	onActiveTabChange: (tab: TabId) => void;

	theme: ThemeMode;
	onThemeChange: (theme: ThemeMode) => void;
	accent: AccentColorId;
	accentCustomHex: string;
	onAccentChange: (accent: AccentColorId) => void;
	onAccentCustomHexChange: (hex: string) => void;
	wallpaper: string;
	/** Смена обоев: как в галерее — сохранение в конфиг рабочего стола. */
	onWallpaperChange: (style: string) => void;
	onOpenWallpaperPicker: () => void;

	iconSize: IconSize;
	onIconSizeChange: (size: IconSize) => void;

	/** Desktop grid behaviour */
	snapToGrid: boolean;
	onSnapToGridChange: (value: boolean) => void;
	gridStep: 'small' | 'medium' | 'large';
	onGridStepChange: (value: 'small' | 'medium' | 'large') => void;
	desktopIconStyle: DesktopIconStyle;
	onDesktopIconStyleChange: (value: DesktopIconStyle) => void;
	desktopTaskbarStyle: DesktopTaskbarStyle;
	onDesktopTaskbarStyleChange: (value: DesktopTaskbarStyle) => void;
	desktopWindowStyle: DesktopWindowStyle;
	onDesktopWindowStyleChange: (value: DesktopWindowStyle) => void;
	desktopAccentFollowsWindowStyle: boolean;
	onDesktopAccentFollowsWindowStyleChange: (value: boolean) => void;
	desktopFloatingWidgetVisible: boolean;
	onDesktopFloatingWidgetVisibleChange: (value: boolean) => void;
	desktopOpenAppsMaximized: boolean;
	onDesktopOpenAppsMaximizedChange: (value: boolean) => void;
	desktopWidgetsStyle: DesktopWidgetsStyle;
	onDesktopWidgetsStyleChange: (value: DesktopWidgetsStyle) => void;
	/** 0.35–1: прозрачность фона панели задач и виджета (кнопки на панели без затемнения). */
	desktopPanelOpacity: number;
	onDesktopPanelOpacityChange: (value: number) => void;
	/** Масштаб контента рабочего стола (0.5–1.5), как грубый аналог DPI. */
	desktopUiScale: number;
	onDesktopUiScaleChange: (value: number) => void;

	desktopSceneDepth: import('@/types/profile').DesktopSceneDepth;
	onDesktopSceneDepthChange: (
		value: import('@/types/profile').DesktopSceneDepth
	) => void;
	desktopFontBody: import('@/types/profile').DesktopFontBodyId;
	onDesktopFontBodyChange: (
		value: import('@/types/profile').DesktopFontBodyId
	) => void;
	desktopFontDisplay: import('@/types/profile').DesktopFontDisplayId;
	onDesktopFontDisplayChange: (
		value: import('@/types/profile').DesktopFontDisplayId
	) => void;
	desktopWallpaperCrossfadeEnabled: boolean;
	onDesktopWallpaperCrossfadeChange: (value: boolean) => void;
	desktopStyledTooltips: boolean;
	onDesktopStyledTooltipsChange: (value: boolean) => void;
	desktopShellReduceMotion: boolean;
	onDesktopShellReduceMotionChange: (value: boolean) => void;
	desktopShellParallaxEnabled: boolean;
	onDesktopShellParallaxEnabledChange: (value: boolean) => void;
	desktopShellParallaxIntensity: import('@/types/profile').DesktopShellParallaxIntensity;
	onDesktopShellParallaxIntensityChange: (
		value: import('@/types/profile').DesktopShellParallaxIntensity
	) => void;
	desktopShellWindowMorphEnabled: boolean;
	onDesktopShellWindowMorphEnabledChange: (value: boolean) => void;
	desktopShellMotionSpeed: import('@/types/profile').DesktopShellMotionSpeed;
	onDesktopShellMotionSpeedChange: (
		value: import('@/types/profile').DesktopShellMotionSpeed
	) => void;

	/** Панель виджетов на столе — `desktop_config`. */
	showWidgetsPanel: boolean;
	onShowWidgetsPanelChange: (value: boolean) => void;
	widgetsPanelPosition: WidgetsPanelPosition;
	onWidgetsPanelPositionChange: (value: WidgetsPanelPosition) => void;
	compactWidgets: boolean;
	onCompactWidgetsChange: (value: boolean) => void;

	expansionSettings: DesktopExpansionSettings;
	settingsCenterBridge: DesktopSettingsCenterBridge;
	performance: PerformanceSummary;
	/** `modal` — полноэкранный оверлей; `embedded` — содержимое внутри окна рабочего стола */
	presentation?: 'modal' | 'embedded';
	/** MobileAndroid embedded WebView — native toolbar owns title/close. */
	embeddedMobile?: boolean;

	/** Готовые образы: атомарное применение профиля и конфига из workspace. */
	onApplyCuratedStyleSet: (set: DesktopCuratedStyleSet) => void | Promise<void>;
	/** Shell tab: scroll target element id once (taskbar «scenarios»). */
	pendingShellScrollElementId?: string | null;
	onShellScrollHandled?: () => void;
	/** Живой контекст для карточек сценариев (окна по виртуальным столам). */
	workspaceProfilesShellContext?: DesktopSettingsWorkspaceProfilesShellContext;

	personalizationStagingActive?: boolean;
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
}
