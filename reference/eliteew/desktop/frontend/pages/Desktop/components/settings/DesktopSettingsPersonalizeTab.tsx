/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Personalize tab for Desktop Settings Center — sticky Visual Studio preview,
 * Empery curated looks at scroll top, tier-1 look controls, Fine-tune / Looks disclosures.
 *
 * Invariants:
 * - Idle: Change wallpaper is the sole filled primary CTA; try-on Save becomes primary when staging.
 * - Curated Empery presets render immediately after sticky preview, before intro/theme/wallpaper.
 * - Visual Studio preview sticky header + details cards share props via `useDesktopSettingsPersonalizeVisualStudioProps`.
 *
 * Related:
 * - `settings/personalize/*`
 * - `DesktopSettingsPanel.tsx`
 */

import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
	type DesktopIconStyle,
	type DesktopTaskbarStyle,
	type DesktopWidgetsStyle,
	type DesktopWindowStyle,
	type DesktopSceneDepth,
	type DesktopFontBodyId,
	type DesktopFontDisplayId,
} from '@/types/profile';
import type { DesktopCuratedStyleSet } from '../../constants/desktopCuratedStyleSets';
import type {
	DesktopExpansionSettings,
	DesktopUserVisualStylePreset,
} from '../../types/desktopExpansion.types';
import type { AccentColorId } from '../../context/DesktopStateContext';
import type { DesktopStorageConfigSaveErrorCode } from '../../utils/desktopStorageSyncError';
import { DesktopSettingsVisualStudioSection } from './DesktopSettingsVisualStudioSection';
import type {
	DesktopSettingsShellHelpers,
	DesktopSettingsVisualLabels,
	TabId,
	ThemeMode,
} from './desktopSettingsShared.types';
import type { VisualStudioSettingsNavigateTarget } from './desktopVisualStudioPreviewHotspots';
import { DesktopSettingsPersonalizeDisclosure } from './personalize/DesktopSettingsPersonalizeDisclosure';
import { DesktopSettingsPersonalizePresetsFacade } from './personalize/DesktopSettingsPersonalizePresetsFacade';
import { DesktopSettingsPersonalizeThemeAccentCard } from './personalize/DesktopSettingsPersonalizeThemeAccentCard';
import { DesktopSettingsPersonalizeWallpaperCard } from './personalize/DesktopSettingsPersonalizeWallpaperCard';
import { DesktopAppButton } from '../DesktopAppChrome';
import { SettingsFormCard } from './DesktopSettingsFormCard';
import { DesktopSettingsMotionSection } from './DesktopSettingsMotionSection';
import { CuratedStylePresetsRow } from './desktopSettingsPreviewComponents';
import { useDesktopSettingsPersonalizeVisualStudioProps } from '../../hooks/useDesktopSettingsPersonalizeVisualStudioProps';

interface PersonalizeSectionProps {
	theme: ThemeMode;
	onThemeChange: (theme: ThemeMode) => void;
	accent: AccentColorId;
	accentCustomHex: string;
	onAccentChange: (accent: AccentColorId) => void;
	onAccentCustomHexChange: (hex: string) => void;
	wallpaper: string;
	onOpenWallpaperPicker: () => void;
	selectedAccentName: string;
	desktopWindowStyle: DesktopWindowStyle;
	onDesktopWindowStyleChange: (value: DesktopWindowStyle) => void;
	desktopAccentFollowsWindowStyle: boolean;
	onDesktopAccentFollowsWindowStyleChange: (value: boolean) => void;
	desktopTaskbarStyle: DesktopTaskbarStyle;
	onDesktopTaskbarStyleChange: (value: DesktopTaskbarStyle) => void;
	desktopIconStyle: DesktopIconStyle;
	desktopWidgetsStyle: DesktopWidgetsStyle;
	onDesktopWidgetsStyleChange: (value: DesktopWidgetsStyle) => void;
	desktopPanelOpacity: number;
	onDesktopPanelOpacityChange: (value: number) => void;
	desktopUiScale: number;
	onJumpToTab: (tab: TabId) => void;
	onApplyCuratedStyleSet: (set: DesktopCuratedStyleSet) => void;
	shell: DesktopSettingsShellHelpers;
	visualLabels: DesktopSettingsVisualLabels;
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
	onNavigateSettingsField?: (
		target: VisualStudioSettingsNavigateTarget
	) => void;
	isOnline: boolean;
	isConfigSaving: boolean;
	configSaveError: DesktopStorageConfigSaveErrorCode | null;
}

export const DesktopSettingsPersonalizeTab: FC<PersonalizeSectionProps> = ({
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
	desktopWidgetsStyle,
	onDesktopWidgetsStyleChange,
	desktopPanelOpacity,
	onDesktopPanelOpacityChange,
	desktopUiScale,
	onJumpToTab,
	onApplyCuratedStyleSet,
	shell,
	visualLabels,
	expansionSettings,
	personalizationStagingActive,
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
}) => {
	const { t: tSettings } = useTranslation('desktopUi');

	const visualStudioProps = useDesktopSettingsPersonalizeVisualStudioProps({
		theme,
		wallpaper,
		selectedAccentName,
		desktopWindowStyle,
		onDesktopWindowStyleChange,
		desktopTaskbarStyle,
		onDesktopTaskbarStyleChange,
		desktopWidgetsStyle,
		onDesktopWidgetsStyleChange,
		desktopIconStyle,
		desktopPanelOpacity,
		onDesktopPanelOpacityChange,
		onOpenWallpaperPicker,
		visualLabels,
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
		shell,
	});

	return (
		<section
			aria-labelledby="personalize-heading"
			className="flex min-h-0 flex-1 flex-col"
			data-testid="desktop-settings-personalize-tab"
		>
			<div className="sticky top-0 z-20 -mx-1 shrink-0 border-b border-(--desktop-border-subtle)/55 bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.98)_0%,rgb(var(--desktop-bg-primary-rgb)/0.94)_88%,transparent_100%)] px-1 pb-3 backdrop-blur-md">
				<DesktopSettingsVisualStudioSection
					{...visualStudioProps}
					layout="preview-only"
					onOpenPerformanceTab={() => onJumpToTab('performance')}
				/>
			</div>

			{personalizationStagingActive ? (
				<div
					className="sticky top-[min(42vh,320px)] z-20 -mx-1 shrink-0 border-b border-[rgb(var(--desktop-accent-rgb)/0.35)] bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb))_12%,var(--desktop-surface-panel))] px-4 py-3 backdrop-blur-md"
					role="status"
					data-testid="desktop-settings-try-on-sticky-banner"
				>
					<div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-sm text-(--desktop-text-secondary)">
							{tSettings('settingsPanel.personalizeTryOnBanner')}
						</p>
						<div className="flex flex-wrap gap-2">
							<DesktopAppButton
								type="button"
								variant="accent"
								data-testid="desktop-settings-try-on-save-primary-cta"
								disabled={!onPersonalizationStagingCommit}
								onClick={() =>
									onPersonalizationStagingCommit &&
									void Promise.resolve(onPersonalizationStagingCommit()).catch(
										() => {}
									)
								}
							>
								{tSettings('settingsPanel.personalizeTryOnSave')}
							</DesktopAppButton>
							<DesktopAppButton
								type="button"
								variant="ghost"
								disabled={!onPersonalizationStagingCancel}
								onClick={() => onPersonalizationStagingCancel?.()}
							>
								{tSettings('settingsPanel.personalizeTryOnDiscard')}
							</DesktopAppButton>
						</div>
					</div>
				</div>
			) : null}

			<div className="min-h-0 flex-1 space-y-5 pt-4">
				<div data-testid="desktop-settings-curated-presets">
					<DesktopSettingsMotionSection delaySec={0.02}>
						<SettingsFormCard
							title={tSettings('settingsPanel.cardCuratedPresetsTitle')}
							windowStyle={shell.windowStyle}
						>
							<CuratedStylePresetsRow
								onApplyCuratedStyleSet={onApplyCuratedStyleSet}
							/>
						</SettingsFormCard>
					</DesktopSettingsMotionSection>
				</div>

				<h3 id="personalize-heading" className="sr-only">
					{tSettings('settingsPanel.sectionPersonalizeTitle')}
				</h3>

				<DesktopSettingsPersonalizeThemeAccentCard
					theme={theme}
					onThemeChange={onThemeChange}
					accent={accent}
					accentCustomHex={accentCustomHex}
					onAccentChange={onAccentChange}
					onAccentCustomHexChange={onAccentCustomHexChange}
					selectedAccentName={selectedAccentName}
					desktopWindowStyle={desktopWindowStyle}
					desktopAccentFollowsWindowStyle={desktopAccentFollowsWindowStyle}
					onDesktopAccentFollowsWindowStyleChange={
						onDesktopAccentFollowsWindowStyleChange
					}
					shell={shell}
					visualLabels={visualLabels}
				/>

				<DesktopSettingsPersonalizeWallpaperCard
					wallpaper={wallpaper}
					onOpenWallpaperPicker={onOpenWallpaperPicker}
					shell={shell}
					isPrimaryCta={!personalizationStagingActive}
				/>

				<DesktopSettingsPersonalizeDisclosure
					title={tSettings('settingsPanel.personalizeFineTuneTitle')}
					test-id="desktop-settings-personalize-fine-tune"
				>
					<DesktopSettingsVisualStudioSection
						{...visualStudioProps}
						layout="details-only"
						onOpenPerformanceTab={() => onJumpToTab('performance')}
					/>
				</DesktopSettingsPersonalizeDisclosure>

				<DesktopSettingsPersonalizeDisclosure
					title={tSettings('settingsPanel.personalizeLooksTitle')}
					test-id="desktop-settings-personalize-looks"
				>
					<DesktopSettingsPersonalizePresetsFacade
						theme={theme}
						accent={accent}
						accentCustomHex={accentCustomHex}
						wallpaper={wallpaper}
						desktopWindowStyle={desktopWindowStyle}
						desktopAccentFollowsWindowStyle={desktopAccentFollowsWindowStyle}
						desktopTaskbarStyle={desktopTaskbarStyle}
						desktopIconStyle={desktopIconStyle}
						desktopWidgetsStyle={desktopWidgetsStyle}
						desktopPanelOpacity={desktopPanelOpacity}
						desktopUiScale={desktopUiScale}
						desktopSceneDepth={desktopSceneDepth}
						desktopFontBody={desktopFontBody}
						desktopFontDisplay={desktopFontDisplay}
						desktopWallpaperCrossfadeEnabled={desktopWallpaperCrossfadeEnabled}
						desktopStyledTooltips={desktopStyledTooltips}
						expansionSettings={expansionSettings}
						personalizationStagingActive={personalizationStagingActive}
						onPersonalizationStagingStart={onPersonalizationStagingStart}
						onPersonalizationStagingCommit={onPersonalizationStagingCommit}
						onPersonalizationStagingCancel={onPersonalizationStagingCancel}
						onApplyUserVisualStylePreset={onApplyUserVisualStylePreset}
						onExportPersonalizationPackJson={onExportPersonalizationPackJson}
						onImportPersonalizationPackJson={onImportPersonalizationPackJson}
						shell={shell}
						visualLabels={visualLabels}
					/>
				</DesktopSettingsPersonalizeDisclosure>
			</div>
		</section>
	);
};
