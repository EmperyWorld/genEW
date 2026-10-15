/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Personalize presets facade: try-on staging, user visual style presets, pack import/export, quick tab jump.
 * Empery curated looks live on PersonalizeTab (scroll top, after sticky preview).
 *
 * Invariants:
 * - Visual preset save captures current theme/accent/wallpaper snapshot for shell_state merge.
 *
 * Related:
 * - `DesktopSettingsPersonalizeTab.tsx`
 * - `desktopSettingsPersonalize.types.ts`
 */

import { cn } from '@/utils/cn';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import {
	buildVisualStudioPresetMetaLine,
	hasVisualStudioPresetMeta,
} from '../../../utils/desktopVisualStudioMeta';
import { isBuiltInWallpaperStyle } from '../../../constants/wallpapers';
import { DESKTOP_TYPOGRAPHY } from '../../../constants';
import {
	DesktopAppButton,
	DESKTOP_CHROME_FOCUS_VISIBLE,
} from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import { buildDesktopSettingsFieldElementId } from '../../../utils/desktopSettingsFieldElementIds';
import { SettingsFormCard } from '../DesktopSettingsFormCard';
import { DesktopSettingsMotionSection } from '../DesktopSettingsMotionSection';
import { builtinWallpaperIndexFromStyle } from '../desktopSettingsVisualLabels';
import type { DesktopSettingsPersonalizePresetsFacadeProps } from './desktopSettingsPersonalize.types';
import { mapVisualPackImportErrorMessage } from '../desktopSettingsVisualPackImportErrors';
import { buildDesktopSettingsThemeModeOptions } from '../desktopSettingsVisualLabels';
import { DesktopSettingsPersonalizeDisclosure } from './DesktopSettingsPersonalizeDisclosure';

export const DesktopSettingsPersonalizePresetsFacade: FC<
	DesktopSettingsPersonalizePresetsFacadeProps
> = ({
	theme,
	accent,
	accentCustomHex,
	wallpaper,
	desktopWindowStyle,
	desktopAccentFollowsWindowStyle,
	desktopTaskbarStyle,
	desktopIconStyle,
	desktopWidgetsStyle,
	desktopPanelOpacity,
	desktopUiScale,
	desktopSceneDepth,
	desktopFontBody,
	desktopFontDisplay,
	desktopWallpaperCrossfadeEnabled,
	desktopStyledTooltips,
	expansionSettings,
	personalizationStagingActive,
	onPersonalizationStagingStart,
	onApplyUserVisualStylePreset,
	onExportPersonalizationPackJson,
	onImportPersonalizationPackJson,
	shell,
	visualLabels,
}) => {
	const { t: tSettings } = useTranslation('desktopUi');
	const [presetNameDraft, setPresetNameDraft] = useState('');
	const [importDraft, setImportDraft] = useState('');
	const [importBusy, setImportBusy] = useState(false);
	const [importPasteVisible, setImportPasteVisible] = useState(false);
	const themeModeOptions = buildDesktopSettingsThemeModeOptions(tSettings);
	const themeLabel = (value: string) =>
		themeModeOptions.find((opt) => opt.value === value)?.label ?? value;

	return (
		<>
			<DesktopSettingsMotionSection delaySec={0.16}>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'local_session',
						'personalization_staging'
					)}
					title={tSettings('settingsPanel.personalizeTryOnTitle')}
					windowStyle={shell.windowStyle}
				>
					{personalizationStagingActive ? (
						<p
							className={cn(
								DESKTOP_TYPOGRAPHY.captionInherit,
								'text-(--desktop-text-secondary)'
							)}
							data-testid="desktop-settings-try-on-banner-pointer"
						>
							{tSettings('settingsPanel.personalizeTryOnUseBanner')}
						</p>
					) : (
						<DesktopChromeTooltip
							content={tSettings('settingsPanel.personalizeTryOnStart')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="neutral"
								disabled={
									expansionSettings.isSaving || !onPersonalizationStagingStart
								}
								onClick={() => onPersonalizationStagingStart?.()}
							>
								{tSettings('settingsPanel.personalizeTryOnStart')}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					)}
				</SettingsFormCard>
			</DesktopSettingsMotionSection>

			<DesktopSettingsMotionSection delaySec={0.24}>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'shell_state',
						'visual_style_presets'
					)}
					title={tSettings('settingsPanel.visualPresetsCardTitle')}
					windowStyle={shell.windowStyle}
				>
					<div className="space-y-3">
						{expansionSettings.visualStylePresets.length === 0 ? (
							<p
								className={cn(
									DESKTOP_TYPOGRAPHY.captionInherit,
									'text-(--desktop-text-dim)'
								)}
							>
								{tSettings('settingsPanel.visualPresetsEmpty')}
							</p>
						) : (
							<ul className="space-y-2">
								{expansionSettings.visualStylePresets.map((preset) => (
									<li
										key={preset.id}
										className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2"
									>
										<div className="min-w-0">
											<div className="text-sm font-medium text-(--desktop-text-primary)">
												{preset.name}
											</div>
											<div
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'text-(--desktop-text-dim)'
												)}
											>
												{themeLabel(preset.theme)} ·{' '}
												{visualLabels.windowStyle[preset.windowStyle]}
											</div>
											{hasVisualStudioPresetMeta({
												fontBody: preset.desktopFontBody,
												fontDisplay: preset.desktopFontDisplay,
												sceneDepth: preset.desktopSceneDepth,
											}) ? (
												<div className="mt-0.5 text-[11px] leading-snug tracking-wide text-[rgb(var(--desktop-accent-rgb)/0.82)]">
													{buildVisualStudioPresetMetaLine(
														{
															fontBody: preset.desktopFontBody,
															fontDisplay: preset.desktopFontDisplay,
															sceneDepth: preset.desktopSceneDepth,
														},
														tSettings
													)}
												</div>
											) : null}
										</div>
										<div className="flex flex-wrap gap-2">
											<DesktopChromeTooltip
												content={tSettings('settingsPanel.visualPresetApply')}
												placement="top"
												offsetExtra={4}
											>
												<DesktopAppButton
													type="button"
													size="sm"
													variant="neutral"
													disabled={
														expansionSettings.isSaving ||
														!onApplyUserVisualStylePreset
													}
													onClick={() => onApplyUserVisualStylePreset?.(preset)}
												>
													{tSettings('settingsPanel.visualPresetApply')}
												</DesktopAppButton>
											</DesktopChromeTooltip>
											<DesktopChromeTooltip
												content={tSettings('settingsPanel.visualPresetRemove')}
												placement="top"
												offsetExtra={4}
											>
												<DesktopAppButton
													type="button"
													size="sm"
													variant="ghost"
													disabled={expansionSettings.isSaving}
													onClick={() =>
														void expansionSettings.removeVisualStylePreset(
															preset.id
														)
													}
												>
													{tSettings('settingsPanel.visualPresetRemove')}
												</DesktopAppButton>
											</DesktopChromeTooltip>
										</div>
									</li>
								))}
							</ul>
						)}
						<div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
							<label className="flex min-w-0 flex-1 flex-col gap-1">
								<span
									className={cn(
										DESKTOP_TYPOGRAPHY.caption,
										'text-(--desktop-text-secondary)'
									)}
								>
									{tSettings('settingsPanel.visualPresetNameLabel')}
								</span>
								<input
									type="text"
									value={presetNameDraft}
									onChange={(e) => setPresetNameDraft(e.target.value)}
									className={cn(
										'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 text-sm text-(--desktop-text-primary)',
										DESKTOP_CHROME_FOCUS_VISIBLE
									)}
								/>
							</label>
							<DesktopChromeTooltip
								content={tSettings('settingsPanel.visualPresetSaveCurrent')}
								placement="top"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									variant="neutral"
									disabled={
										expansionSettings.isSaving || !presetNameDraft.trim()
									}
									onClick={() => {
										const name = presetNameDraft.trim();
										void expansionSettings.addVisualStylePreset({
											name,
											theme,
											accentFollows: desktopAccentFollowsWindowStyle,
											wallpaperIndex: isBuiltInWallpaperStyle(wallpaper)
												? builtinWallpaperIndexFromStyle(wallpaper)
												: 1,
											wallpaperRef: isBuiltInWallpaperStyle(wallpaper)
												? undefined
												: wallpaper,
											accent: desktopAccentFollowsWindowStyle
												? undefined
												: accent === 'custom'
													? accentCustomHex
													: accent,
											windowStyle: desktopWindowStyle,
											taskbarStyle: desktopTaskbarStyle,
											iconStyle: desktopIconStyle,
											widgetsStyle: desktopWidgetsStyle,
											desktopPanelOpacity,
											desktopUiScale,
											desktopSceneDepth,
											desktopFontBody,
											desktopFontDisplay,
											desktopWallpaperCrossfadeEnabled,
											desktopStyledTooltips,
										});
										setPresetNameDraft('');
									}}
								>
									{tSettings('settingsPanel.visualPresetSaveCurrent')}
								</DesktopAppButton>
							</DesktopChromeTooltip>
						</div>
					</div>
				</SettingsFormCard>
			</DesktopSettingsMotionSection>

			<DesktopSettingsMotionSection delaySec={0.28}>
				<DesktopSettingsPersonalizeDisclosure
					title={tSettings('settingsPanel.personalizeAdvancedPackTitle')}
					test-id="desktop-settings-personalize-advanced-pack"
				>
					<SettingsFormCard
						title={tSettings('settingsPanel.visualPackCardTitle')}
						windowStyle={shell.windowStyle}
					>
						<div className="flex flex-wrap gap-2">
							<DesktopChromeTooltip
								content={tSettings('settingsPanel.visualPackExport')}
								placement="top"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									variant="neutral"
									disabled={!onExportPersonalizationPackJson}
									onClick={() => {
										const raw = onExportPersonalizationPackJson?.() ?? '';
										if (!raw.trim()) return;
										const blob = new Blob([raw], {
											type: 'application/json;charset=utf-8',
										});
										const url = URL.createObjectURL(blob);
										const a = document.createElement('a');
										a.href = url;
										a.download = 'eliteew-desktop-visual-profile.json';
										a.click();
										URL.revokeObjectURL(url);
									}}
								>
									<DocumentTextIcon className="h-4 w-4" />
									{tSettings('settingsPanel.visualPackExport')}
								</DesktopAppButton>
							</DesktopChromeTooltip>
							<DesktopAppButton
								type="button"
								variant="ghost"
								onClick={() => setImportPasteVisible((prev) => !prev)}
							>
								{importPasteVisible
									? tSettings('settingsPanel.visualPackImportHidePaste')
									: tSettings('settingsPanel.visualPackImportShowPaste')}
							</DesktopAppButton>
						</div>
						{importPasteVisible ? (
							<label className="mt-3 flex flex-col gap-1">
								<span
									className={cn(
										DESKTOP_TYPOGRAPHY.caption,
										'text-(--desktop-text-secondary)'
									)}
								>
									{tSettings('settingsPanel.visualPackImportLabel')}
								</span>
								<textarea
									rows={5}
									value={importDraft}
									onChange={(e) => setImportDraft(e.target.value)}
									className={cn(
										'min-h-24 rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 font-mono text-xs text-(--desktop-text-primary)',
										DESKTOP_CHROME_FOCUS_VISIBLE
									)}
								/>
							</label>
						) : null}
						{importPasteVisible ? (
							<DesktopChromeTooltip
								content={tSettings('settingsPanel.visualPackImportApply')}
								placement="top"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									className="mt-2"
									variant="neutral"
									disabled={importBusy || !onImportPersonalizationPackJson}
									onClick={async () => {
										if (!onImportPersonalizationPackJson) return;
										setImportBusy(true);
										try {
											const res = await onImportPersonalizationPackJson(
												importDraft.trim()
											);
											if (!res.ok) {
												toast.error(
													tSettings(
														'settingsPanel.visualPackImportFailedTitle'
													),
													{
														description: mapVisualPackImportErrorMessage(
															res.error,
															tSettings
														),
													}
												);
												return;
											}
											setImportDraft('');
											toast.success(
												tSettings('settingsPanel.visualPackImportOkTitle'),
												{
													description: [
														tSettings('settingsPanel.visualPackImportOkBody'),
														res.shellSlicesApplied
															? tSettings(
																	'settingsPanel.visualPackImportShellNote'
																)
															: '',
													]
														.filter(Boolean)
														.join(' '),
												}
											);
										} finally {
											setImportBusy(false);
										}
									}}
								>
									{tSettings('settingsPanel.visualPackImportApply')}
								</DesktopAppButton>
							</DesktopChromeTooltip>
						) : null}
					</SettingsFormCard>
				</DesktopSettingsPersonalizeDisclosure>
			</DesktopSettingsMotionSection>
		</>
	);
};
