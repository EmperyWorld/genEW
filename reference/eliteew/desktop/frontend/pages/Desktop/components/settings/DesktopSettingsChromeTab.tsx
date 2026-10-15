/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Chrome tab (window/taskbar styles, scale, opacity) for Desktop Settings Center.
 *
 * Invariants:
 * - —
 *
 * Related:
 * - `DesktopSettingsPanel.tsx`
 * - `DesktopChromeTooltip.tsx`
 */

import { cn } from '@/utils/cn';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
	ArrowsPointingOutIcon,
	CheckCircleIcon,
	ComputerDesktopIcon,
	MinusIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';
import {
	DESKTOP_PANEL_OPACITY_MAX,
	DESKTOP_PANEL_OPACITY_MIN,
	DESKTOP_TASKBAR_STYLE_KEYS,
	type DesktopTaskbarStyle,
	type DesktopWindowStyle,
} from '@/types/profile';
import {
	DESKTOP_TASKBAR_STYLE_PRESETS,
	DESKTOP_WINDOW_FRAME_STYLES,
	DESKTOP_WINDOW_TITLEBAR_STYLES,
} from '../../utils/desktopVisualSystem';
import {
	DESKTOP_UI_SCALE_MAX,
	DESKTOP_UI_SCALE_MIN,
} from '../../utils/desktopUiScale';
import {
	DESKTOP_TYPOGRAPHY,
	DESKTOP_LUCIDE,
	WINDOW_TITLE_BAR,
} from '../../constants';
import { buildDesktopSettingsFieldElementId } from '../../utils/desktopSettingsFieldElementIds';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from '../DesktopAppChrome';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';
import { SettingsFormCard } from './DesktopSettingsFormCard';
import { DesktopSettingsMotionSection } from './DesktopSettingsMotionSection';
import { desktopSettingsStylePickerCardClass } from './desktopSettingsSharedUi';
import {
	DesktopTaskbarPreviewStrip,
	DesktopTaskbarStyleMiniPreview,
	DesktopWindowStyleMiniPreview,
} from './desktopSettingsPreviewComponents';
import type {
	DesktopSettingsShellHelpers,
	DesktopSettingsVisualLabels,
} from './desktopSettingsShared.types';

interface ChromeSectionProps {
	desktopTaskbarStyle: DesktopTaskbarStyle;
	onDesktopTaskbarStyleChange: (value: DesktopTaskbarStyle) => void;
	desktopWindowStyle: DesktopWindowStyle;
	onDesktopWindowStyleChange: (value: DesktopWindowStyle) => void;
	desktopPanelOpacity: number;
	onDesktopPanelOpacityChange: (value: number) => void;
	desktopUiScale: number;
	onDesktopUiScaleChange: (value: number) => void;
	shell: DesktopSettingsShellHelpers;
	visualLabels: DesktopSettingsVisualLabels;
}

export const DesktopSettingsChromeTab: FC<ChromeSectionProps> = ({
	desktopTaskbarStyle,
	onDesktopTaskbarStyleChange,
	desktopWindowStyle,
	onDesktopWindowStyleChange,
	desktopPanelOpacity,
	onDesktopPanelOpacityChange,
	desktopUiScale,
	onDesktopUiScaleChange,
	shell,
	visualLabels,
}) => {
	const { t } = useTranslation('desktopUi');
	return (
		<section
			aria-labelledby="chrome-heading"
			className="space-y-5"
			data-testid="desktop-settings-chrome-tab"
		>
			<h3 id="chrome-heading" className="sr-only">
				{t('settingsPanel.sectionChromeTitle')}
			</h3>

			<DesktopSettingsMotionSection>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'profile_ui',
						'desktop_window_style'
					)}
					title={t('settingsPanel.cardWindowStyleTitle')}
					windowStyle={shell.windowStyle}
				>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
						{DESKTOP_TASKBAR_STYLE_KEYS.map((style) => {
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
										aria-pressed={desktopWindowStyle === style}
										onClick={() => onDesktopWindowStyleChange(style)}
										className={desktopSettingsStylePickerCardClass(
											desktopWindowStyle === style
										)}
									>
										{desktopWindowStyle === style ? (
											<CheckCircleIcon
												className="absolute top-3 right-3 z-1 size-4 shrink-0 text-[rgb(var(--desktop-accent-rgb))] drop-shadow-sm"
												aria-hidden
											/>
										) : null}
										<DesktopWindowStyleMiniPreview style={style} />
										<span className="text-sm font-semibold text-(--desktop-text-primary)">
											{label}
										</span>
										<span className={DESKTOP_TYPOGRAPHY.caption}>{desc}</span>
									</button>
								</DesktopChromeTooltip>
							);
						})}
					</div>
					<div
						className={`mt-4 max-w-lg overflow-hidden rounded-xl ${DESKTOP_WINDOW_FRAME_STYLES[desktopWindowStyle].frame}`}
					>
						{(() => {
							const titlePreset =
								DESKTOP_WINDOW_TITLEBAR_STYLES[desktopWindowStyle];
							return (
								<div
									className={`flex min-h-9 items-center justify-between gap-2 pl-2 pr-1.5 py-1 ${titlePreset.root}`}
								>
									<div className="flex min-w-0 flex-1 items-center gap-2">
										<div
											className={`${WINDOW_TITLE_BAR.iconBox} ${titlePreset.iconShell} flex items-center justify-center text-(--desktop-text-primary)`}
										>
											<ComputerDesktopIcon
												className="h-3 w-3"
												strokeWidth={DESKTOP_LUCIDE.stroke}
												aria-hidden
											/>
										</div>
										<span
											className={cn(
												'truncate font-semibold',
												DESKTOP_TYPOGRAPHY.small,
												titlePreset.title
											)}
										>
											{t('settingsPanel.windowPreviewTitle')}
										</span>
										<span
											className={cn(
												'shrink-0 rounded px-1.5 py-0.5 font-medium uppercase tracking-wide',
												DESKTOP_TYPOGRAPHY.micro,
												titlePreset.pill
											)}
										>
											{t('settingsPanel.windowPreviewAppBadge')}
										</span>
									</div>
									<div className={`shrink-0 ${titlePreset.controlGroup}`}>
										<span
											className={`${WINDOW_TITLE_BAR.controlHit} ${titlePreset.control} pointer-events-none scale-[0.92]`}
											aria-hidden
										>
											<MinusIcon className="h-3 w-3" strokeWidth={2} />
										</span>
										<span
											className={`${WINDOW_TITLE_BAR.controlHit} ${titlePreset.control} pointer-events-none scale-[0.92]`}
											aria-hidden
										>
											<ArrowsPointingOutIcon
												className="h-3 w-3"
												strokeWidth={2}
											/>
										</span>
										<span
											className={`${WINDOW_TITLE_BAR.controlHitClose} ${titlePreset.close} pointer-events-none scale-[0.92]`}
											aria-hidden
										>
											<XMarkIcon className="h-3 w-3" strokeWidth={2} />
										</span>
									</div>
								</div>
							);
						})()}
						<div
							className={`h-24 p-3 ${DESKTOP_WINDOW_FRAME_STYLES[desktopWindowStyle].content}`}
						>
							<p className={DESKTOP_TYPOGRAPHY.caption}>
								{t('settingsPanel.windowPreviewBody')}
							</p>
						</div>
					</div>
				</SettingsFormCard>
			</DesktopSettingsMotionSection>

			<DesktopSettingsMotionSection delaySec={0.04}>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'profile_ui',
						'desktop_taskbar_style'
					)}
					title={t('settingsPanel.cardTaskbarTitle')}
					windowStyle={shell.windowStyle}
				>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
						{DESKTOP_TASKBAR_STYLE_KEYS.map((style) => {
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
										aria-pressed={desktopTaskbarStyle === style}
										onClick={() => onDesktopTaskbarStyleChange(style)}
										className={desktopSettingsStylePickerCardClass(
											desktopTaskbarStyle === style
										)}
									>
										{desktopTaskbarStyle === style ? (
											<CheckCircleIcon
												className="absolute top-3 right-3 z-2 size-4 shrink-0 text-[rgb(var(--desktop-accent-rgb))] drop-shadow-sm"
												aria-hidden
											/>
										) : null}
										<DesktopTaskbarStyleMiniPreview
											style={style}
											panelOpacity={desktopPanelOpacity}
										/>
										<span className="text-sm font-semibold text-(--desktop-text-primary)">
											{visualLabels.windowStyle[style]}
										</span>
										<span className={DESKTOP_TYPOGRAPHY.caption}>{desc}</span>
									</button>
								</DesktopChromeTooltip>
							);
						})}
					</div>
					<DesktopTaskbarPreviewStrip
						desktopTaskbarStyle={desktopTaskbarStyle}
						desktopPanelOpacity={desktopPanelOpacity}
						className="relative mt-4 h-12 w-full max-w-lg"
						surfaceClassName={
							DESKTOP_TASKBAR_STYLE_PRESETS[desktopTaskbarStyle]
								.surfaceClassName
						}
					>
						<div
							className={cn(
								'relative z-1 flex h-full items-center gap-2 px-3',
								DESKTOP_TYPOGRAPHY.shellMeta10
							)}
						>
							<span className="rounded-md border border-(--desktop-border-subtle)/50 bg-(--desktop-surface-soft)/40 px-2 py-0.5 font-medium text-(--desktop-text-secondary)">
								{t('settingsPanel.taskbarPreviewStart')}
							</span>
							<span className="ml-auto opacity-60">···</span>
						</div>
					</DesktopTaskbarPreviewStrip>
				</SettingsFormCard>
			</DesktopSettingsMotionSection>

			<DesktopSettingsMotionSection delaySec={0.08}>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'profile_ui',
						'desktop_panel_opacity'
					)}
					title={t('settingsPanel.cardTaskbarOpacityTitle')}
					windowStyle={shell.windowStyle}
				>
					<div className="flex max-w-lg flex-col gap-2">
						<div className="flex items-center justify-between gap-3">
							<label
								htmlFor="desktop-panel-opacity"
								className="text-sm text-(--desktop-text-secondary)"
							>
								{t('settingsPanel.panelOpacityLabel')}
							</label>
							<span className="text-sm tabular-nums text-(--desktop-text-primary)">
								{Math.round(desktopPanelOpacity * 100)}%
							</span>
						</div>
						<input
							id="desktop-panel-opacity"
							type="range"
							min={Math.round(DESKTOP_PANEL_OPACITY_MIN * 100)}
							max={Math.round(DESKTOP_PANEL_OPACITY_MAX * 100)}
							step={5}
							value={Math.round(desktopPanelOpacity * 100)}
							onChange={(e) =>
								onDesktopPanelOpacityChange(Number(e.target.value) / 100)
							}
							disabled={desktopTaskbarStyle === 'glass'}
							aria-disabled={desktopTaskbarStyle === 'glass'}
							className={cn(
								'w-full accent-[rgb(var(--desktop-accent-rgb))]',
								DESKTOP_CHROME_FOCUS_VISIBLE,
								desktopTaskbarStyle === 'glass' &&
									'cursor-not-allowed opacity-50'
							)}
						/>
					</div>
				</SettingsFormCard>
			</DesktopSettingsMotionSection>

			<DesktopSettingsMotionSection delaySec={0.12}>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'profile_ui',
						'desktop_ui_scale'
					)}
					title={t('settingsPanel.cardDesktopScaleTitle')}
					windowStyle={shell.windowStyle}
				>
					<div className="flex max-w-lg flex-col gap-2">
						<div className="flex items-center gap-2 text-(--desktop-text-secondary)">
							<ComputerDesktopIcon className="size-4 shrink-0" aria-hidden />
							<label
								htmlFor="desktop-ui-scale"
								className="text-sm text-(--desktop-text-secondary)"
							>
								{t('settingsPanel.desktopScaleLabel')}
							</label>
							<span className="ml-auto text-sm tabular-nums text-(--desktop-text-primary)">
								{Math.round(desktopUiScale * 100)}%
							</span>
						</div>
						<input
							id="desktop-ui-scale"
							type="range"
							min={Math.round(DESKTOP_UI_SCALE_MIN * 100)}
							max={Math.round(DESKTOP_UI_SCALE_MAX * 100)}
							step={25}
							value={Math.round(desktopUiScale * 100)}
							onChange={(e) =>
								onDesktopUiScaleChange(Number(e.target.value) / 100)
							}
							className={cn(
								'w-full accent-[rgb(var(--desktop-accent-rgb))]',
								DESKTOP_CHROME_FOCUS_VISIBLE
							)}
						/>
						<p
							className={cn(
								DESKTOP_TYPOGRAPHY.caption,
								'text-(--desktop-text-dim)'
							)}
						>
							{t('settingsPanel.desktopScaleHint', {
								min: Math.round(DESKTOP_UI_SCALE_MIN * 100),
								max: Math.round(DESKTOP_UI_SCALE_MAX * 100),
							})}
						</p>
					</div>
				</SettingsFormCard>
			</DesktopSettingsMotionSection>
		</section>
	);
};
