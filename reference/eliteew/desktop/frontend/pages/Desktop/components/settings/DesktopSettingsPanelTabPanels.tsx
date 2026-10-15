/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Lazy Suspense tab bodies for Desktop Settings Center (personalize / icons /
 * chrome / shell / performance). Owned by the outer `role="tabpanel"` shell.
 *
 * Invariants:
 * - Only the active tab mounts; inactive tab chunks stay unloaded until selected.
 * - Surface ids stay aligned with `DESKTOP_SETTINGS_TAB_SURFACE_IDS` for deep-links.
 *
 * Related:
 * - `DesktopSettingsPanel.tsx`
 * - `desktopSettingsPanel.types.ts`
 * - `prefetchDesktopSettingsTabChunks.ts`
 */

import {
	lazy,
	Suspense,
	type Dispatch,
	type FC,
	type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopSettingsPanelProps } from './desktopSettingsPanel.types';
import type {
	DesktopSettingsShellHelpers,
	DesktopSettingsVisualLabels,
	SavedFilterContentShortcutDraftState,
	TabId,
} from './desktopSettingsShared.types';
import type { SettingsNavigateTarget } from '../../utils/desktopSettingsStorageMapNavigation';
import { DESKTOP_SETTINGS_TAB_SURFACE_IDS } from '../../utils/desktopSettingsStorageMapNavigation';
import { DesktopSettingsTabLoadingFallback } from './desktopSettingsSharedUi';

const DesktopSettingsPerformanceTabLazy = lazy(async () => {
	const mod = await import('./DesktopSettingsPerformanceTab');
	return { default: mod.DesktopSettingsPerformanceTab };
});
const DesktopSettingsPersonalizeTabLazy = lazy(async () => {
	const mod = await import('./DesktopSettingsPersonalizeTab');
	return { default: mod.DesktopSettingsPersonalizeTab };
});
const DesktopSettingsIconsTabLazy = lazy(async () => {
	const mod = await import('./DesktopSettingsIconsTab');
	return { default: mod.DesktopSettingsIconsTab };
});
const DesktopSettingsChromeTabLazy = lazy(async () => {
	const mod = await import('./DesktopSettingsChromeTab');
	return { default: mod.DesktopSettingsChromeTab };
});
const DesktopSettingsShellTabLazy = lazy(async () => {
	const mod = await import('./DesktopSettingsShellTab');
	return { default: mod.DesktopSettingsShellTab };
});

export type DesktopSettingsPanelTabPanelsProps = DesktopSettingsPanelProps & {
	selectedAccentName: string;
	shell: DesktopSettingsShellHelpers;
	visualLabels: DesktopSettingsVisualLabels;
	onNavigateSettingsField: (target: { tab: TabId; elementId: string }) => void;
	onStorageMapFieldNavigate: (target: SettingsNavigateTarget) => void;
	onOpenShellMotionSettings: () => void;
	savedFilterShortcutDraft: SavedFilterContentShortcutDraftState;
	setSavedFilterShortcutDraft: Dispatch<
		SetStateAction<SavedFilterContentShortcutDraftState>
	>;
};

export const DesktopSettingsPanelTabPanels: FC<
	DesktopSettingsPanelTabPanelsProps
> = ({
	activeTab,
	isOnline,
	isConfigSaving,
	configSaveError,
	theme,
	onThemeChange,
	accent,
	accentCustomHex,
	onAccentChange,
	onAccentCustomHexChange,
	wallpaper,
	onOpenWallpaperPicker,
	selectedAccentName,
	desktopWindowStyle,
	onDesktopWindowStyleChange,
	desktopAccentFollowsWindowStyle,
	onDesktopAccentFollowsWindowStyleChange,
	desktopTaskbarStyle,
	onDesktopTaskbarStyleChange,
	desktopIconStyle,
	onDesktopIconStyleChange,
	desktopWidgetsStyle,
	onDesktopWidgetsStyleChange,
	desktopPanelOpacity,
	onDesktopPanelOpacityChange,
	desktopUiScale,
	onDesktopUiScaleChange,
	onActiveTabChange,
	onApplyCuratedStyleSet,
	shell,
	visualLabels,
	expansionSettings,
	personalizationStagingActive = false,
	onPersonalizationStagingStart,
	onPersonalizationStagingCommit,
	onPersonalizationStagingCancel,
	onApplyUserVisualStylePreset,
	onExportPersonalizationPackJson,
	onImportPersonalizationPackJson,
	desktopSceneDepth,
	onDesktopSceneDepthChange,
	desktopFontBody,
	onDesktopFontBodyChange,
	desktopFontDisplay,
	onDesktopFontDisplayChange,
	desktopWallpaperCrossfadeEnabled,
	onDesktopWallpaperCrossfadeChange,
	desktopStyledTooltips,
	onDesktopStyledTooltipsChange,
	desktopShellReduceMotion,
	onDesktopShellReduceMotionChange,
	desktopShellParallaxEnabled,
	onDesktopShellParallaxEnabledChange,
	desktopShellParallaxIntensity,
	onDesktopShellParallaxIntensityChange,
	desktopShellWindowMorphEnabled,
	onDesktopShellWindowMorphEnabledChange,
	desktopShellMotionSpeed,
	onDesktopShellMotionSpeedChange,
	onNavigateSettingsField,
	iconSize,
	onIconSizeChange,
	snapToGrid,
	onSnapToGridChange,
	gridStep,
	onGridStepChange,
	desktopOpenAppsMaximized,
	onDesktopOpenAppsMaximizedChange,
	desktopFloatingWidgetVisible,
	onDesktopFloatingWidgetVisibleChange,
	showWidgetsPanel,
	onShowWidgetsPanelChange,
	widgetsPanelPosition,
	onWidgetsPanelPositionChange,
	compactWidgets,
	onCompactWidgetsChange,
	settingsCenterBridge,
	workspaceProfilesShellContext,
	savedFilterShortcutDraft,
	setSavedFilterShortcutDraft,
	onStorageMapFieldNavigate,
	performance,
	onOpenShellMotionSettings,
}) => {
	const { t } = useTranslation('desktopUi');
	const syncingFallback = (
		<DesktopSettingsTabLoadingFallback
			label={t('settingsPanel.settingsCenterSyncing')}
		/>
	);

	return (
		<>
			{activeTab === 'personalize' && (
				<div
					id={DESKTOP_SETTINGS_TAB_SURFACE_IDS.personalize}
					data-desktop-settings-guide="tab-personalize"
					className="flex min-h-0 flex-1 flex-col"
				>
					<Suspense fallback={syncingFallback}>
						<DesktopSettingsPersonalizeTabLazy
							theme={theme}
							onThemeChange={onThemeChange}
							accent={accent}
							accentCustomHex={accentCustomHex}
							onAccentChange={onAccentChange}
							onAccentCustomHexChange={onAccentCustomHexChange}
							wallpaper={wallpaper}
							onOpenWallpaperPicker={onOpenWallpaperPicker}
							selectedAccentName={selectedAccentName}
							desktopWindowStyle={desktopWindowStyle}
							onDesktopWindowStyleChange={onDesktopWindowStyleChange}
							desktopAccentFollowsWindowStyle={desktopAccentFollowsWindowStyle}
							onDesktopAccentFollowsWindowStyleChange={
								onDesktopAccentFollowsWindowStyleChange
							}
							desktopTaskbarStyle={desktopTaskbarStyle}
							onDesktopTaskbarStyleChange={onDesktopTaskbarStyleChange}
							desktopIconStyle={desktopIconStyle}
							desktopWidgetsStyle={desktopWidgetsStyle}
							onDesktopWidgetsStyleChange={onDesktopWidgetsStyleChange}
							desktopPanelOpacity={desktopPanelOpacity}
							onDesktopPanelOpacityChange={onDesktopPanelOpacityChange}
							desktopUiScale={desktopUiScale}
							onJumpToTab={onActiveTabChange}
							onApplyCuratedStyleSet={onApplyCuratedStyleSet}
							shell={shell}
							visualLabels={visualLabels}
							expansionSettings={expansionSettings}
							personalizationStagingActive={personalizationStagingActive}
							onPersonalizationStagingStart={onPersonalizationStagingStart}
							onPersonalizationStagingCommit={onPersonalizationStagingCommit}
							onPersonalizationStagingCancel={onPersonalizationStagingCancel}
							onApplyUserVisualStylePreset={onApplyUserVisualStylePreset}
							onExportPersonalizationPackJson={onExportPersonalizationPackJson}
							onImportPersonalizationPackJson={onImportPersonalizationPackJson}
							desktopSceneDepth={desktopSceneDepth}
							onDesktopSceneDepthChange={onDesktopSceneDepthChange}
							desktopFontBody={desktopFontBody}
							onDesktopFontBodyChange={onDesktopFontBodyChange}
							desktopFontDisplay={desktopFontDisplay}
							onDesktopFontDisplayChange={onDesktopFontDisplayChange}
							desktopWallpaperCrossfadeEnabled={
								desktopWallpaperCrossfadeEnabled
							}
							onDesktopWallpaperCrossfadeChange={
								onDesktopWallpaperCrossfadeChange
							}
							desktopStyledTooltips={desktopStyledTooltips}
							onDesktopStyledTooltipsChange={onDesktopStyledTooltipsChange}
							desktopShellReduceMotion={desktopShellReduceMotion}
							onDesktopShellReduceMotionChange={
								onDesktopShellReduceMotionChange
							}
							desktopShellParallaxEnabled={desktopShellParallaxEnabled}
							onDesktopShellParallaxEnabledChange={
								onDesktopShellParallaxEnabledChange
							}
							desktopShellParallaxIntensity={desktopShellParallaxIntensity}
							onDesktopShellParallaxIntensityChange={
								onDesktopShellParallaxIntensityChange
							}
							desktopShellWindowMorphEnabled={desktopShellWindowMorphEnabled}
							onDesktopShellWindowMorphEnabledChange={
								onDesktopShellWindowMorphEnabledChange
							}
							desktopShellMotionSpeed={desktopShellMotionSpeed}
							onDesktopShellMotionSpeedChange={onDesktopShellMotionSpeedChange}
							onNavigateSettingsField={onNavigateSettingsField}
							isOnline={isOnline}
							isConfigSaving={isConfigSaving}
							configSaveError={configSaveError}
						/>
					</Suspense>
				</div>
			)}

			{activeTab === 'icons' && (
				<div
					id={DESKTOP_SETTINGS_TAB_SURFACE_IDS.icons}
					data-desktop-settings-guide="tab-icons"
				>
					<Suspense fallback={syncingFallback}>
						<DesktopSettingsIconsTabLazy
							iconSize={iconSize}
							onIconSizeChange={onIconSizeChange}
							snapToGrid={snapToGrid}
							onSnapToGridChange={onSnapToGridChange}
							gridStep={gridStep}
							onGridStepChange={onGridStepChange}
							desktopIconStyle={desktopIconStyle}
							onDesktopIconStyleChange={onDesktopIconStyleChange}
							shell={shell}
							visualLabels={visualLabels}
						/>
					</Suspense>
				</div>
			)}

			{activeTab === 'chrome' && (
				<div
					id={DESKTOP_SETTINGS_TAB_SURFACE_IDS.chrome}
					data-desktop-settings-guide="tab-chrome"
				>
					<Suspense fallback={syncingFallback}>
						<DesktopSettingsChromeTabLazy
							desktopTaskbarStyle={desktopTaskbarStyle}
							onDesktopTaskbarStyleChange={onDesktopTaskbarStyleChange}
							desktopWindowStyle={desktopWindowStyle}
							onDesktopWindowStyleChange={onDesktopWindowStyleChange}
							desktopPanelOpacity={desktopPanelOpacity}
							onDesktopPanelOpacityChange={onDesktopPanelOpacityChange}
							desktopUiScale={desktopUiScale}
							onDesktopUiScaleChange={onDesktopUiScaleChange}
							shell={shell}
							visualLabels={visualLabels}
						/>
					</Suspense>
				</div>
			)}

			{activeTab === 'shell' && (
				<div
					id={DESKTOP_SETTINGS_TAB_SURFACE_IDS.shell}
					data-desktop-settings-guide="tab-shell"
				>
					<Suspense fallback={syncingFallback}>
						<DesktopSettingsShellTabLazy
							desktopOpenAppsMaximized={desktopOpenAppsMaximized}
							onDesktopOpenAppsMaximizedChange={
								onDesktopOpenAppsMaximizedChange
							}
							desktopFloatingWidgetVisible={desktopFloatingWidgetVisible}
							onDesktopFloatingWidgetVisibleChange={
								onDesktopFloatingWidgetVisibleChange
							}
							desktopWidgetsStyle={desktopWidgetsStyle}
							onDesktopWidgetsStyleChange={onDesktopWidgetsStyleChange}
							showWidgetsPanel={showWidgetsPanel}
							onShowWidgetsPanelChange={onShowWidgetsPanelChange}
							widgetsPanelPosition={widgetsPanelPosition}
							onWidgetsPanelPositionChange={onWidgetsPanelPositionChange}
							compactWidgets={compactWidgets}
							onCompactWidgetsChange={onCompactWidgetsChange}
							expansionSettings={expansionSettings}
							settingsCenterBridge={settingsCenterBridge}
							shell={shell}
							visualLabels={visualLabels}
							workspaceProfilesShellContext={workspaceProfilesShellContext}
							savedFilterShortcutDraft={savedFilterShortcutDraft}
							setSavedFilterShortcutDraft={setSavedFilterShortcutDraft}
							onStorageMapFieldNavigate={onStorageMapFieldNavigate}
						/>
					</Suspense>
				</div>
			)}

			{activeTab === 'performance' && (
				<div
					id={DESKTOP_SETTINGS_TAB_SURFACE_IDS.performance}
					data-desktop-settings-guide="tab-performance"
				>
					<Suspense fallback={syncingFallback}>
						<DesktopSettingsPerformanceTabLazy
							performance={performance}
							shell={shell}
							onOpenShellMotionSettings={onOpenShellMotionSettings}
						/>
					</Suspense>
				</div>
			)}
		</>
	);
};
