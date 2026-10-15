/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Visual Studio controls: live preview, typography, scene depth, motion prefs.
 *
 * Invariants:
 * - All fields persist via profile UI preferences (except preview-only props).
 *
 * Related:
 * - `DesktopSettingsPersonalizeTab.tsx`, `desktopTypography.ts`
 * - `DesktopChromeTooltip.tsx`
 */

import { cn } from '@/utils/cn';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
	DESKTOP_FONT_BODY_KEYS,
	DESKTOP_FONT_DISPLAY_KEYS,
	DESKTOP_SCENE_DEPTH_KEYS,
	DESKTOP_SHELL_MOTION_SPEED_KEYS,
	DESKTOP_SHELL_PARALLAX_INTENSITY_KEYS,
	type DesktopFontBodyId,
	type DesktopFontDisplayId,
	type DesktopIconStyle,
	type DesktopSceneDepth,
	type DesktopShellMotionSpeed,
	type DesktopShellParallaxIntensity,
	type DesktopTaskbarStyle,
	type DesktopWidgetsStyle,
	type DesktopWindowStyle,
} from '@/types/profile';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from '../DesktopAppChrome';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import { buildDesktopSettingsFieldElementId } from '../../utils/desktopSettingsFieldElementIds';
import { getDesktopShellSettingsFormCardClassName } from '../../utils/desktopVisualSystem';
import {
	DESKTOP_FONT_BODY_LABEL_KEYS,
	DESKTOP_FONT_DISPLAY_LABEL_KEYS,
	DESKTOP_SCENE_DEPTH_LABEL_KEYS,
	resolveDesktopFontDisplayStack,
	resolveDesktopFontFamilyStack,
} from '../../utils/desktopTypography';
import type { ThemeMode } from './desktopSettingsShared.types';
import type { DesktopSettingsShellHelpers } from './desktopSettingsShared.types';
import { SettingsFormCard } from './DesktopSettingsFormCard';
import { DesktopVisualStudioPreviewInteractive } from './DesktopVisualStudioPreviewInteractive';
import type { VisualStudioSettingsNavigateTarget } from './desktopVisualStudioPreviewHotspots';
import type { DesktopSettingsVisualLabels } from './desktopSettingsShared.types';
import { DesktopSettingsMotionSection } from './DesktopSettingsMotionSection';

export type DesktopSettingsVisualStudioSectionProps = {
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
	onOpenPerformanceTab?: () => void;
	shell: DesktopSettingsShellHelpers;
	layout?: 'full' | 'preview-only' | 'details-only';
};

function segmentButtonClass(active: boolean): string {
	return cn(
		'rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors outline-none',
		DESKTOP_CHROME_FOCUS_VISIBLE,
		active
			? 'border-[rgb(var(--desktop-accent-rgb))] bg-[rgb(var(--desktop-accent-rgb)/0.14)] text-(--desktop-text-primary)'
			: 'border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-secondary) hover:border-(--desktop-border-strong) hover:bg-(--desktop-surface-soft-hover)'
	);
}

export const DesktopSettingsVisualStudioSection: FC<
	DesktopSettingsVisualStudioSectionProps
> = ({
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
	onOpenPerformanceTab,
	shell,
	layout = 'full',
}) => {
	const { t } = useTranslation('desktopUi');
	const bodyPreviewStack = resolveDesktopFontFamilyStack(desktopFontBody);
	const showPreview = layout === 'full' || layout === 'preview-only';
	const showDetails = layout === 'full' || layout === 'details-only';

	return (
		<>
			{showPreview ? (
				<DesktopSettingsMotionSection>
					{layout === 'preview-only' ? (
						<div
							id={buildDesktopSettingsFieldElementId(
								'profile_ui',
								'visual_studio_preview'
							)}
							className={cn(
								getDesktopShellSettingsFormCardClassName(shell.windowStyle),
								'relative overflow-hidden p-2 sm:p-3 shadow-(--desktop-shadow-soft)'
							)}
						>
							<DesktopVisualStudioPreviewInteractive
								wallpaper={wallpaper}
								theme={theme}
								desktopWindowStyle={desktopWindowStyle}
								onDesktopWindowStyleChange={onDesktopWindowStyleChange}
								desktopTaskbarStyle={desktopTaskbarStyle}
								onDesktopTaskbarStyleChange={onDesktopTaskbarStyleChange}
								desktopWidgetsStyle={desktopWidgetsStyle}
								onDesktopWidgetsStyleChange={onDesktopWidgetsStyleChange}
								desktopIconStyle={desktopIconStyle}
								desktopPanelOpacity={desktopPanelOpacity}
								onDesktopPanelOpacityChange={onDesktopPanelOpacityChange}
								onOpenWallpaperPicker={onOpenWallpaperPicker}
								visualLabels={visualLabels}
								desktopSceneDepth={desktopSceneDepth}
								onDesktopSceneDepthChange={onDesktopSceneDepthChange}
								desktopFontBody={desktopFontBody}
								onDesktopFontBodyChange={onDesktopFontBodyChange}
								desktopFontDisplay={desktopFontDisplay}
								onDesktopFontDisplayChange={onDesktopFontDisplayChange}
								accentLabel={selectedAccentName}
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
								onDesktopShellMotionSpeedChange={
									onDesktopShellMotionSpeedChange
								}
								desktopWallpaperCrossfadeEnabled={
									desktopWallpaperCrossfadeEnabled
								}
								onDesktopWallpaperCrossfadeChange={
									onDesktopWallpaperCrossfadeChange
								}
								desktopStyledTooltips={desktopStyledTooltips}
								onDesktopStyledTooltipsChange={onDesktopStyledTooltipsChange}
								shellCheckboxClass={shell.checkboxClass}
								onNavigateSettingsField={onNavigateSettingsField}
							/>
						</div>
					) : (
						<SettingsFormCard
							id={buildDesktopSettingsFieldElementId(
								'profile_ui',
								'visual_studio_preview'
							)}
							title={t('settingsPanel.visualStudio.livePreviewTitle')}
							windowStyle={shell.windowStyle}
						>
							<DesktopVisualStudioPreviewInteractive
								wallpaper={wallpaper}
								theme={theme}
								desktopWindowStyle={desktopWindowStyle}
								onDesktopWindowStyleChange={onDesktopWindowStyleChange}
								desktopTaskbarStyle={desktopTaskbarStyle}
								onDesktopTaskbarStyleChange={onDesktopTaskbarStyleChange}
								desktopWidgetsStyle={desktopWidgetsStyle}
								onDesktopWidgetsStyleChange={onDesktopWidgetsStyleChange}
								desktopIconStyle={desktopIconStyle}
								desktopPanelOpacity={desktopPanelOpacity}
								onDesktopPanelOpacityChange={onDesktopPanelOpacityChange}
								onOpenWallpaperPicker={onOpenWallpaperPicker}
								visualLabels={visualLabels}
								desktopSceneDepth={desktopSceneDepth}
								onDesktopSceneDepthChange={onDesktopSceneDepthChange}
								desktopFontBody={desktopFontBody}
								onDesktopFontBodyChange={onDesktopFontBodyChange}
								desktopFontDisplay={desktopFontDisplay}
								onDesktopFontDisplayChange={onDesktopFontDisplayChange}
								accentLabel={selectedAccentName}
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
								onDesktopShellMotionSpeedChange={
									onDesktopShellMotionSpeedChange
								}
								desktopWallpaperCrossfadeEnabled={
									desktopWallpaperCrossfadeEnabled
								}
								onDesktopWallpaperCrossfadeChange={
									onDesktopWallpaperCrossfadeChange
								}
								desktopStyledTooltips={desktopStyledTooltips}
								onDesktopStyledTooltipsChange={onDesktopStyledTooltipsChange}
								shellCheckboxClass={shell.checkboxClass}
								onNavigateSettingsField={onNavigateSettingsField}
							/>
							{layout === 'full' ? (
								<p
									className={cn(
										DESKTOP_TYPOGRAPHY.meta,
										'mt-2 text-(--desktop-text-dim)'
									)}
								>
									{t('settingsPanel.visualStudio.livePreviewInteractiveHint')}
								</p>
							) : null}
						</SettingsFormCard>
					)}
				</DesktopSettingsMotionSection>
			) : null}

			{showDetails ? (
				<>
					<DesktopSettingsMotionSection delaySec={0.04}>
						<SettingsFormCard
							id={buildDesktopSettingsFieldElementId(
								'profile_ui',
								'desktop_font_body'
							)}
							title={t('settingsPanel.visualStudio.typographyTitle')}
							windowStyle={shell.windowStyle}
						>
							<div className="space-y-4">
								<div>
									<p
										className={cn(
											DESKTOP_TYPOGRAPHY.captionInherit,
											'mb-2 font-medium text-(--desktop-text-secondary)'
										)}
									>
										{t('settingsPanel.visualStudio.fontBodyHeading')}
									</p>
									<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
										{DESKTOP_FONT_BODY_KEYS.map((id) => {
											const label = t(DESKTOP_FONT_BODY_LABEL_KEYS[id]);
											return (
												<DesktopChromeTooltip
													key={id}
													content={label}
													placement="top"
													offsetExtra={4}
												>
													<button
														type="button"
														onClick={() => onDesktopFontBodyChange(id)}
														className={segmentButtonClass(
															desktopFontBody === id
														)}
														style={{
															fontFamily: resolveDesktopFontFamilyStack(id),
														}}
													>
														{label}
													</button>
												</DesktopChromeTooltip>
											);
										})}
									</div>
								</div>
								<div>
									<p
										className={cn(
											DESKTOP_TYPOGRAPHY.captionInherit,
											'mb-2 font-medium text-(--desktop-text-secondary)'
										)}
									>
										{t('settingsPanel.visualStudio.fontDisplayHeading')}
									</p>
									<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
										{DESKTOP_FONT_DISPLAY_KEYS.map((id) => {
											const label = t(DESKTOP_FONT_DISPLAY_LABEL_KEYS[id]);
											return (
												<DesktopChromeTooltip
													key={id}
													content={label}
													placement="top"
													offsetExtra={4}
												>
													<button
														type="button"
														onClick={() => onDesktopFontDisplayChange(id)}
														className={segmentButtonClass(
															desktopFontDisplay === id
														)}
														style={{
															fontFamily: resolveDesktopFontDisplayStack(
																id,
																bodyPreviewStack
															),
														}}
													>
														{label}
													</button>
												</DesktopChromeTooltip>
											);
										})}
									</div>
								</div>
							</div>
						</SettingsFormCard>
					</DesktopSettingsMotionSection>

					<DesktopSettingsMotionSection delaySec={0.08}>
						<SettingsFormCard
							id={buildDesktopSettingsFieldElementId(
								'profile_ui',
								'desktop_scene_depth'
							)}
							title={t('settingsPanel.visualStudio.sceneDepthTitle')}
							windowStyle={shell.windowStyle}
						>
							<div className="grid gap-2 sm:grid-cols-3">
								{DESKTOP_SCENE_DEPTH_KEYS.map((depth) => {
									const label = t(DESKTOP_SCENE_DEPTH_LABEL_KEYS[depth]);
									const desc = t(
										`settingsPanel.visualStudio.sceneDepthDesc_${depth}`
									);
									return (
										<DesktopChromeTooltip
											key={depth}
											content={`${label} — ${desc}`}
											placement="top"
											offsetExtra={4}
										>
											<button
												type="button"
												onClick={() => onDesktopSceneDepthChange(depth)}
												className={cn(
													segmentButtonClass(desktopSceneDepth === depth),
													'flex flex-col gap-1 py-3'
												)}
											>
												<span>{label}</span>
												<span
													className={cn(
														DESKTOP_TYPOGRAPHY.meta,
														'font-normal text-(--desktop-text-dim)'
													)}
												>
													{desc}
												</span>
											</button>
										</DesktopChromeTooltip>
									);
								})}
							</div>
						</SettingsFormCard>
					</DesktopSettingsMotionSection>

					<DesktopSettingsMotionSection delaySec={0.12}>
						<SettingsFormCard
							id={buildDesktopSettingsFieldElementId(
								'profile_ui',
								'desktop_shell_motion'
							)}
							title={t('settingsPanel.visualStudio.motionTitle')}
							windowStyle={shell.windowStyle}
						>
							<div className="space-y-5">
								<section
									className="space-y-3"
									aria-labelledby="desktop-settings-motion-transitions"
								>
									<h5
										id="desktop-settings-motion-transitions"
										className={cn(
											DESKTOP_TYPOGRAPHY.captionInherit,
											'font-semibold uppercase tracking-wide text-(--desktop-text-secondary)'
										)}
									>
										{t('settingsPanel.visualStudio.motionGroupTransitions')}
									</h5>
									<label className="flex cursor-pointer items-start gap-3">
										<input
											type="checkbox"
											checked={desktopShellReduceMotion}
											onChange={(e) =>
												onDesktopShellReduceMotionChange(e.target.checked)
											}
											className={shell.checkboxClass}
										/>
										<span className="min-w-0">
											<span className="block text-sm font-medium text-(--desktop-text-primary)">
												{t('settingsPanel.visualStudio.shellReduceMotionLabel')}
											</span>
											<span
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'text-(--desktop-text-dim)'
												)}
											>
												{t('settingsPanel.visualStudio.shellReduceMotionDesc')}
											</span>
										</span>
									</label>

									<div>
										<p
											className={cn(
												DESKTOP_TYPOGRAPHY.captionInherit,
												'mb-2 font-medium text-(--desktop-text-secondary)'
											)}
										>
											{t('settingsPanel.visualStudio.shellMotionSpeedHeading')}
										</p>
										<div className="grid grid-cols-3 gap-2">
											{DESKTOP_SHELL_MOTION_SPEED_KEYS.map((speed) => (
												<button
													key={speed}
													type="button"
													onClick={() => onDesktopShellMotionSpeedChange(speed)}
													className={segmentButtonClass(
														desktopShellMotionSpeed === speed
													)}
												>
													{t(
														`settingsPanel.visualStudio.shellMotionSpeed_${speed}`
													)}
												</button>
											))}
										</div>
									</div>

									<label className="flex cursor-pointer items-start gap-3">
										<input
											type="checkbox"
											checked={desktopShellWindowMorphEnabled}
											onChange={(e) =>
												onDesktopShellWindowMorphEnabledChange(e.target.checked)
											}
											className={shell.checkboxClass}
											disabled={desktopShellReduceMotion}
										/>
										<span className="min-w-0">
											<span className="block text-sm font-medium text-(--desktop-text-primary)">
												{t('settingsPanel.visualStudio.windowMorphLabel')}
											</span>
											<span
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'text-(--desktop-text-dim)'
												)}
											>
												{t('settingsPanel.visualStudio.windowMorphDesc')}
											</span>
										</span>
									</label>
								</section>

								<section
									className="space-y-3 border-t border-(--desktop-border-subtle)/70 pt-4"
									aria-labelledby="desktop-settings-motion-wallpaper"
								>
									<h5
										id="desktop-settings-motion-wallpaper"
										className={cn(
											DESKTOP_TYPOGRAPHY.captionInherit,
											'font-semibold uppercase tracking-wide text-(--desktop-text-secondary)'
										)}
									>
										{t('settingsPanel.visualStudio.motionGroupWallpaper')}
									</h5>
									<label className="flex cursor-pointer items-start gap-3">
										<input
											type="checkbox"
											checked={desktopShellParallaxEnabled}
											onChange={(e) =>
												onDesktopShellParallaxEnabledChange(e.target.checked)
											}
											className={shell.checkboxClass}
											disabled={desktopShellReduceMotion}
										/>
										<span className="min-w-0">
											<span className="block text-sm font-medium text-(--desktop-text-primary)">
												{t('settingsPanel.visualStudio.wallpaperParallaxLabel')}
											</span>
											<span
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'text-(--desktop-text-dim)'
												)}
											>
												{t('settingsPanel.visualStudio.wallpaperParallaxDesc')}
											</span>
										</span>
									</label>

									<div>
										<p
											className={cn(
												DESKTOP_TYPOGRAPHY.captionInherit,
												'mb-2 font-medium text-(--desktop-text-secondary)'
											)}
										>
											{t('settingsPanel.visualStudio.parallaxIntensityHeading')}
										</p>
										<div className="grid grid-cols-3 gap-2">
											{DESKTOP_SHELL_PARALLAX_INTENSITY_KEYS.map(
												(intensity) => (
													<button
														key={intensity}
														type="button"
														onClick={() =>
															onDesktopShellParallaxIntensityChange(intensity)
														}
														className={segmentButtonClass(
															desktopShellParallaxIntensity === intensity
														)}
														disabled={
															desktopShellReduceMotion ||
															!desktopShellParallaxEnabled
														}
													>
														{t(
															`settingsPanel.visualStudio.parallaxIntensity_${intensity}`
														)}
													</button>
												)
											)}
										</div>
									</div>

									<label className="flex cursor-pointer items-start gap-3">
										<input
											type="checkbox"
											checked={desktopWallpaperCrossfadeEnabled}
											onChange={(e) =>
												onDesktopWallpaperCrossfadeChange(e.target.checked)
											}
											className={shell.checkboxClass}
										/>
										<span className="min-w-0">
											<span className="block text-sm font-medium text-(--desktop-text-primary)">
												{t(
													'settingsPanel.visualStudio.wallpaperCrossfadeLabel'
												)}
											</span>
											<span
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'text-(--desktop-text-dim)'
												)}
											>
												{t('settingsPanel.visualStudio.wallpaperCrossfadeDesc')}
											</span>
										</span>
									</label>
								</section>

								<section
									className="space-y-3 border-t border-(--desktop-border-subtle)/70 pt-4"
									aria-labelledby="desktop-settings-motion-tooltips"
								>
									<h5
										id="desktop-settings-motion-tooltips"
										className={cn(
											DESKTOP_TYPOGRAPHY.captionInherit,
											'font-semibold uppercase tracking-wide text-(--desktop-text-secondary)'
										)}
									>
										{t('settingsPanel.visualStudio.motionGroupTooltips')}
									</h5>
									<label className="flex cursor-pointer items-start gap-3">
										<input
											type="checkbox"
											checked={desktopStyledTooltips}
											onChange={(e) =>
												onDesktopStyledTooltipsChange(e.target.checked)
											}
											className={shell.checkboxClass}
										/>
										<span className="min-w-0">
											<span className="block text-sm font-medium text-(--desktop-text-primary)">
												{t('settingsPanel.visualStudio.styledTooltipsLabel')}
											</span>
											<span
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'text-(--desktop-text-dim)'
												)}
											>
												{t('settingsPanel.visualStudio.styledTooltipsDesc')}
											</span>
										</span>
									</label>
									{onOpenPerformanceTab ? (
										<div className="rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2.5">
											<p
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'text-(--desktop-text-dim)'
												)}
											>
												{t('settingsPanel.performanceMotionPerformanceLink')}
											</p>
											<button
												type="button"
												onClick={onOpenPerformanceTab}
												className={cn(
													'mt-2 text-sm font-medium text-[rgb(var(--desktop-accent-rgb))] underline-offset-2 hover:underline',
													DESKTOP_CHROME_FOCUS_VISIBLE
												)}
											>
												{t('settingsPanel.tabs.performance.label')} →
											</button>
										</div>
									) : null}
								</section>
							</div>
						</SettingsFormCard>
					</DesktopSettingsMotionSection>
				</>
			) : null}
		</>
	);
};
