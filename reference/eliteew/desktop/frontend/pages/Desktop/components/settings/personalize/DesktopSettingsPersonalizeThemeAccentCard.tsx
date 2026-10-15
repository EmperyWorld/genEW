/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Theme and accent color card for Personalize tab.
 *
 * Invariants:
 * - Field ids wired for storage map navigation (`desktop_config/theme`, `accent_color`).
 *
 * Related:
 * - `DesktopSettingsPersonalizeTab.tsx`
 * - `desktopSettingsPersonalize.types.ts`
 */

import { cn } from '@/utils/cn';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
	ACCENT_COLORS,
	DESKTOP_INTERACTIVE,
	DESKTOP_TYPOGRAPHY,
} from '../../../constants';
import { accentColorLabel } from '../../../utils/accentColorLabel';
import { DesktopAccentColorPlane } from '../../DesktopAccentColorPlane';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import { buildDesktopSettingsFieldElementId } from '../../../utils/desktopSettingsFieldElementIds';
import { SettingsFormCard } from '../DesktopSettingsFormCard';
import { DesktopSettingsMotionSection } from '../DesktopSettingsMotionSection';
import { buildDesktopSettingsThemeModeOptions } from '../desktopSettingsVisualLabels';
import type { DesktopSettingsPersonalizeThemeAccentCardProps } from './desktopSettingsPersonalize.types';

export const DesktopSettingsPersonalizeThemeAccentCard: FC<
	DesktopSettingsPersonalizeThemeAccentCardProps
> = ({
	theme,
	onThemeChange,
	accent,
	accentCustomHex,
	onAccentChange,
	onAccentCustomHexChange,
	selectedAccentName,
	desktopWindowStyle,
	desktopAccentFollowsWindowStyle,
	onDesktopAccentFollowsWindowStyleChange,
	shell,
	visualLabels,
}) => {
	const { t: tSettings } = useTranslation('desktopUi');
	const themeModeOptions = useMemo(
		() => buildDesktopSettingsThemeModeOptions(tSettings),
		[tSettings]
	);

	return (
		<DesktopSettingsMotionSection delaySec={0.04}>
			<SettingsFormCard
				title={tSettings('settingsPanel.cardThemeAccentTitle')}
				windowStyle={shell.windowStyle}
			>
				<div
					id={buildDesktopSettingsFieldElementId('desktop_config', 'theme')}
					className="space-y-2 scroll-mt-20"
				>
					<div className="grid gap-3 sm:grid-cols-3">
						{themeModeOptions.map((option) => (
							<DesktopChromeTooltip
								key={option.id}
								content={`${option.name} — ${option.description}`}
								placement="top"
								offsetExtra={4}
							>
								<button
									type="button"
									onClick={() => onThemeChange(option.id)}
									className={cn(
										'flex flex-col items-stretch gap-2.5 rounded-xl border px-3 py-3 text-left transition-[border-color,background-color,box-shadow] duration-200 motion-reduce:transition-none outline-none',
										DESKTOP_CHROME_FOCUS_VISIBLE,
										DESKTOP_INTERACTIVE.rowHover,
										theme === option.id
											? 'border-[rgb(var(--desktop-accent-rgb))] bg-[rgb(var(--desktop-accent-rgb)/0.16)] shadow-[inset_0_0_0_1px_rgb(var(--desktop-accent-rgb)/0.25)]'
											: 'border-(--desktop-border-subtle) hover:border-(--desktop-border-strong)'
									)}
								>
									<div
										className={cn(
											'h-2 w-full shrink-0 rounded-md',
											option.preview
										)}
										aria-hidden
									/>
									<div className="flex items-center gap-2">
										<span className="rounded-lg bg-(--desktop-surface-soft) p-1.5 text-(--desktop-text-secondary) ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.06)]">
											{option.icon}
										</span>
										<span
											className={cn(
												DESKTOP_TYPOGRAPHY.body,
												'font-semibold text-(--desktop-text-primary)'
											)}
										>
											{option.name}
										</span>
									</div>
									<p className={DESKTOP_TYPOGRAPHY.caption}>
										{option.description}
									</p>
								</button>
							</DesktopChromeTooltip>
						))}
					</div>
				</div>
				<div
					id={buildDesktopSettingsFieldElementId(
						'desktop_config',
						'accent_color'
					)}
					className="space-y-2 border-t border-(--desktop-border-subtle) pt-4 scroll-mt-20"
				>
					<p
						className={cn(
							'font-medium text-(--desktop-text-secondary)',
							DESKTOP_TYPOGRAPHY.captionInherit
						)}
					>
						{tSettings('settingsPanel.accentHeading')}
					</p>
					<label
						id={buildDesktopSettingsFieldElementId(
							'profile_ui',
							'desktop_accent_follows_window_style'
						)}
						className="mb-3 flex cursor-pointer items-start gap-2.5 text-sm text-(--desktop-text-secondary) scroll-mt-20"
					>
						<input
							type="checkbox"
							className={cn(shell.checkboxClass, 'mt-0.5 shrink-0')}
							checked={desktopAccentFollowsWindowStyle}
							onChange={(event) => {
								onDesktopAccentFollowsWindowStyleChange(event.target.checked);
							}}
						/>
						<span className="min-w-0">
							<span className="font-medium text-(--desktop-text-primary)">
								{tSettings('settingsPanel.accentFromWindowLabel')}
							</span>
							<span
								className={cn(
									'mt-0.5 block leading-relaxed',
									DESKTOP_TYPOGRAPHY.meta,
									'text-(--desktop-text-dim)'
								)}
							>
								{desktopAccentFollowsWindowStyle
									? tSettings('settingsAccent.fromWindowStyleBlurb', {
											style: visualLabels.windowStyle[desktopWindowStyle],
										})
									: tSettings('settingsPanel.accentFromWindowHint')}
							</span>
						</span>
					</label>
					<div
						className={cn(
							'flex flex-wrap items-center gap-3',
							desktopAccentFollowsWindowStyle && 'opacity-80'
						)}
					>
						<div className="flex min-w-0 flex-wrap gap-2">
							{ACCENT_COLORS.map((accentColor) => {
								const label = accentColorLabel(accentColor.id, tSettings);
								return (
									<DesktopChromeTooltip
										key={accentColor.id}
										content={label}
										placement="top"
										offsetExtra={6}
									>
										<button
											type="button"
											onClick={() => onAccentChange(accentColor.id)}
											className={cn(
												`relative h-8 w-8 rounded-full ${accentColor.className} transition-transform outline-none`,
												DESKTOP_CHROME_FOCUS_VISIBLE,
												accentColor.id === accent
													? 'ring-2 ring-(--desktop-border-strong) ring-offset-2 ring-offset-(--desktop-surface-panel) scale-105'
													: 'hover:scale-105'
											)}
											aria-label={label}
										/>
									</DesktopChromeTooltip>
								);
							})}
							<DesktopChromeTooltip
								content={tSettings('settingsAccent.customColor')}
								placement="top"
								offsetExtra={6}
							>
								<button
									type="button"
									onClick={() => onAccentChange('custom')}
									className={cn(
										'relative h-8 w-8 shrink-0 rounded-full bg-[conic-gradient(from_0deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)] transition-transform outline-none',
										DESKTOP_CHROME_FOCUS_VISIBLE,
										accent === 'custom'
											? 'ring-2 ring-(--desktop-border-strong) ring-offset-2 ring-offset-(--desktop-surface-panel) scale-105'
											: 'hover:scale-105'
									)}
									aria-label={tSettings('settingsAccent.customColor')}
								/>
							</DesktopChromeTooltip>
						</div>
						<span className={cn(DESKTOP_TYPOGRAPHY.meta)}>
							{tSettings('settingsPanel.currentAccentPrefix')}{' '}
							<span className="text-(--desktop-text-secondary)">
								{selectedAccentName}
							</span>
						</span>
					</div>
					{accent === 'custom' ? (
						<div className="pt-3">
							<DesktopAccentColorPlane
								valueHex={accentCustomHex}
								onChange={onAccentCustomHexChange}
							/>
							<p
								className={cn(
									DESKTOP_TYPOGRAPHY.meta,
									'mt-2 text-(--desktop-text-dim) leading-relaxed'
								)}
							>
								{tSettings('settingsPanel.customAccentPlaneHint')}
							</p>
						</div>
					) : null}
				</div>
			</SettingsFormCard>
		</DesktopSettingsMotionSection>
	);
};
