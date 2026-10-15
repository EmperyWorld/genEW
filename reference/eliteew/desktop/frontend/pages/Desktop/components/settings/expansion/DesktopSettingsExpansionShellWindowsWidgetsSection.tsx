/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Window behavior and widget chrome cards (maximized, floating shelf, widget style).
 *
 * Invariants:
 * - Widget style keys mirror `DESKTOP_WINDOW_FRAME_STYLES` picker set.
 *
 * Related:
 * - `DesktopSettingsExpansionShellCluster.tsx`
 */

import { cn } from '@/utils/cn';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { type DesktopWidgetsStyle } from '@/types/profile';
import { DESKTOP_INTERACTIVE, DESKTOP_TYPOGRAPHY } from '../../../constants';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import { DESKTOP_WINDOW_FRAME_STYLES } from '../../../utils/desktopVisualSystem';
import { buildDesktopSettingsFieldElementId } from '../../../utils/desktopSettingsFieldElementIds';
import { SettingsFormCard } from '../DesktopSettingsFormCard';
import { DesktopSettingsMotionSection } from '../DesktopSettingsMotionSection';
import { desktopSettingsStylePickerCardClass } from '../desktopSettingsSharedUi';
import { DesktopWidgetsStyleMiniPreview } from '../desktopSettingsPreviewComponents';
import type {
	DesktopSettingsShellHelpers,
	DesktopSettingsVisualLabels,
} from '../desktopSettingsShared.types';

const DESKTOP_WIDGETS_STYLE_PICKER_KEYS = Object.keys(
	DESKTOP_WINDOW_FRAME_STYLES
) as DesktopWidgetsStyle[];

export type DesktopSettingsExpansionShellWindowsWidgetsSectionProps = {
	desktopOpenAppsMaximized: boolean;
	onDesktopOpenAppsMaximizedChange: (value: boolean) => void;
	desktopFloatingWidgetVisible: boolean;
	onDesktopFloatingWidgetVisibleChange: (value: boolean) => void;
	desktopWidgetsStyle: DesktopWidgetsStyle;
	onDesktopWidgetsStyleChange: (value: DesktopWidgetsStyle) => void;
	shell: DesktopSettingsShellHelpers;
	visualLabels: DesktopSettingsVisualLabels;
	onScrollToWidgetPanelSettings?: () => void;
};

export const DesktopSettingsExpansionShellWindowsWidgetsSection: FC<
	DesktopSettingsExpansionShellWindowsWidgetsSectionProps
> = ({
	desktopOpenAppsMaximized,
	onDesktopOpenAppsMaximizedChange,
	desktopFloatingWidgetVisible,
	onDesktopFloatingWidgetVisibleChange,
	desktopWidgetsStyle,
	onDesktopWidgetsStyleChange,
	shell,
	visualLabels,
	onScrollToWidgetPanelSettings,
}) => {
	const { t } = useTranslation('desktopUi');

	return (
		<>
			<DesktopSettingsMotionSection>
				<div
					className={cn(
						'rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-4 py-3',
						DESKTOP_TYPOGRAPHY.captionInherit,
						'text-(--desktop-text-secondary)'
					)}
				>
					<p className="font-medium text-(--desktop-text-primary)">
						{t('settingsPanel.widgetsTaxonomyIntro')}
					</p>
					<ul className="mt-2 list-disc space-y-1 pl-4 text-(--desktop-text-dim)">
						<li>{t('settingsPanel.widgetsTaxonomyFloating')}</li>
						<li>{t('settingsPanel.widgetsTaxonomyPanel')}</li>
					</ul>
				</div>
			</DesktopSettingsMotionSection>

			<DesktopSettingsMotionSection delaySec={0.04}>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'profile_ui',
						'desktop_open_apps_maximized'
					)}
					title={t('settingsPanel.cardNewWindowsTitle')}
					windowStyle={shell.windowStyle}
				>
					<label className="inline-flex items-center gap-2 text-sm text-(--desktop-text-secondary) cursor-pointer">
						<input
							type="checkbox"
							className={shell.checkboxClass}
							checked={desktopOpenAppsMaximized}
							onChange={(event) =>
								onDesktopOpenAppsMaximizedChange(event.target.checked)
							}
						/>
						{t('settingsPanel.openNewAppsMaximized')}
					</label>
					<p
						className={cn(
							DESKTOP_TYPOGRAPHY.captionInherit,
							'mt-2 text-(--desktop-text-dim)'
						)}
					>
						{t('settingsPanel.openNewAppsMaximizedHint')}
					</p>
				</SettingsFormCard>
			</DesktopSettingsMotionSection>

			<DesktopSettingsMotionSection delaySec={0.08}>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'profile_ui',
						'desktop_floating_widget_visible'
					)}
					title={t('settingsPanel.cardFloatingWidgetTitle')}
					windowStyle={shell.windowStyle}
				>
					{(() => {
						const floatingLabel = desktopFloatingWidgetVisible
							? t('settingsPanel.hideFloatingWidget')
							: t('settingsPanel.showFloatingWidget');
						return (
							<DesktopChromeTooltip
								content={floatingLabel}
								placement="top"
								offsetExtra={4}
							>
								<button
									type="button"
									onClick={() =>
										onDesktopFloatingWidgetVisibleChange(
											!desktopFloatingWidgetVisible
										)
									}
									className={cn(
										'inline-flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg text-sm outline-none',
										DESKTOP_CHROME_FOCUS_VISIBLE,
										desktopFloatingWidgetVisible
											? 'bg-[rgb(var(--desktop-accent-rgb)/0.25)] text-(--desktop-text-primary)'
											: 'bg-(--desktop-surface-soft) text-(--desktop-text-secondary) hover:bg-(--desktop-surface-soft-hover)',
										DESKTOP_INTERACTIVE.btn
									)}
								>
									<Squares2X2Icon className="w-4 h-4" />
									{floatingLabel}
								</button>
							</DesktopChromeTooltip>
						);
					})()}
					{onScrollToWidgetPanelSettings ? (
						<button
							type="button"
							className={cn(
								'mt-3 text-sm font-medium text-[rgb(var(--desktop-accent-rgb))] underline-offset-2 hover:underline',
								DESKTOP_CHROME_FOCUS_VISIBLE
							)}
							onClick={onScrollToWidgetPanelSettings}
						>
							{t('settingsPanel.cardFloatingWidgetPanelLink')}
						</button>
					) : null}
				</SettingsFormCard>
			</DesktopSettingsMotionSection>

			<DesktopSettingsMotionSection delaySec={0.12}>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'profile_ui',
						'desktop_widgets_style'
					)}
					title={t('settingsPanel.cardWidgetStyleTitle')}
					windowStyle={shell.windowStyle}
				>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
						{DESKTOP_WIDGETS_STYLE_PICKER_KEYS.map((style) => {
							const label = visualLabels.windowStyle[style];
							const desc = visualLabels.windowStyleDesc[style];
							return (
								<DesktopChromeTooltip
									key={style}
									content={`${label} — ${desc}`}
									placement="top"
									offsetExtra={4}
								>
									<button
										type="button"
										aria-pressed={desktopWidgetsStyle === style}
										onClick={() => onDesktopWidgetsStyleChange(style)}
										className={desktopSettingsStylePickerCardClass(
											desktopWidgetsStyle === style
										)}
									>
										{desktopWidgetsStyle === style ? (
											<CheckCircleIcon
												className="absolute top-3 right-3 size-4 shrink-0 text-[rgb(var(--desktop-accent-rgb))] drop-shadow-sm"
												aria-hidden
											/>
										) : null}
										<DesktopWidgetsStyleMiniPreview style={style} />
										<span className="text-sm font-medium text-(--desktop-text-primary)">
											{label}
										</span>
										<span className={DESKTOP_TYPOGRAPHY.caption}>{desc}</span>
									</button>
								</DesktopChromeTooltip>
							);
						})}
					</div>
				</SettingsFormCard>
			</DesktopSettingsMotionSection>
		</>
	);
};
