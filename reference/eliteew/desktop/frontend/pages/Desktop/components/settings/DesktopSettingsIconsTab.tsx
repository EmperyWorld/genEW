/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Icons tab for Desktop Settings Center.
 *
 * Invariants:
 * - Style previews reuse live desktop icon rendering (`DesktopAppSymbol`, `ICON_VISUAL_STYLES`).
 *
 * Related:
 * - `DesktopSettingsPanel.tsx`, `DesktopSettingsIconPreviews.tsx`
 */

import { cn } from '@/utils/cn';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import {
	DESKTOP_ICON_ONLY_STYLE_KEYS,
	type DesktopIconStyle,
} from '@/types/profile';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import { buildDesktopSettingsFieldElementId } from '../../utils/desktopSettingsFieldElementIds';
import { SettingsFormCard } from './DesktopSettingsFormCard';
import { DesktopSettingsMotionSection } from './DesktopSettingsMotionSection';
import { desktopSettingsStylePickerCardClass } from './desktopSettingsSharedUi';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';
import {
	DesktopIconSizePreviewStrip,
	DesktopIconStylePreviewPanel,
} from './DesktopSettingsIconPreviews';
import type {
	DesktopSettingsShellHelpers,
	DesktopSettingsVisualLabels,
	GridStep,
	IconSize,
} from './desktopSettingsShared.types';

interface IconStylePickerCardProps {
	style: DesktopIconStyle;
	active: boolean;
	label: string;
	description: string;
	onSelect: (style: DesktopIconStyle) => void;
}

const IconStylePickerCard: FC<IconStylePickerCardProps> = ({
	style,
	active,
	label,
	description,
	onSelect,
}) => (
	<DesktopChromeTooltip
		content={`${label} — ${description}`}
		placement="top"
		offsetExtra={4}
	>
		<button
			type="button"
			aria-pressed={active}
			onClick={() => onSelect(style)}
			className={desktopSettingsStylePickerCardClass(
				active,
				'items-stretch gap-3 p-3'
			)}
		>
			<DesktopIconStylePreviewPanel style={style} />
			<div className="min-w-0 space-y-1 text-left">
				<div className="flex items-start gap-2">
					<span className="min-w-0 flex-1 text-sm font-semibold text-(--desktop-text-primary)">
						{label}
					</span>
					{active ? (
						<CheckCircleIcon
							className="size-4 shrink-0 text-[rgb(var(--desktop-accent-rgb))] drop-shadow-sm"
							aria-hidden
						/>
					) : null}
				</div>
				<p
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'line-clamp-2 leading-snug'
					)}
				>
					{description}
				</p>
			</div>
		</button>
	</DesktopChromeTooltip>
);

interface IconsWorkspaceSectionProps {
	iconSize: IconSize;
	onIconSizeChange: (size: IconSize) => void;
	snapToGrid: boolean;
	onSnapToGridChange: (value: boolean) => void;
	gridStep: GridStep;
	onGridStepChange: (value: GridStep) => void;
	desktopIconStyle: DesktopIconStyle;
	onDesktopIconStyleChange: (value: DesktopIconStyle) => void;
	shell: DesktopSettingsShellHelpers;
	visualLabels: DesktopSettingsVisualLabels;
}

export const DesktopSettingsIconsTab: FC<IconsWorkspaceSectionProps> = ({
	iconSize,
	onIconSizeChange,
	snapToGrid,
	onSnapToGridChange,
	gridStep,
	onGridStepChange,
	desktopIconStyle,
	onDesktopIconStyleChange,
	shell,
	visualLabels,
}) => {
	const { t } = useTranslation('desktopUi');

	const iconOnlyStyles = DESKTOP_ICON_ONLY_STYLE_KEYS;

	return (
		<section
			aria-labelledby="icons-heading"
			className="space-y-5"
			data-testid="desktop-settings-icons-tab"
		>
			<h3 id="icons-heading" className="sr-only">
				{t('settingsPanel.sectionIconsTitle')}
			</h3>

			<DesktopSettingsMotionSection>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId('desktop_config', 'icon_size')}
					title={t('settingsPanel.cardIconSizeTitle')}
					windowStyle={shell.windowStyle}
				>
					<DesktopIconSizePreviewStrip
						iconSize={iconSize}
						iconStyle={desktopIconStyle}
					/>
					<div className={shell.segmentClusterClass}>
						{(['small', 'medium', 'large'] as IconSize[]).map((size) => {
							const label = visualLabels.iconSize[size];
							return (
								<DesktopChromeTooltip
									key={size}
									content={label}
									placement="top"
									offsetExtra={4}
								>
									<button
										type="button"
										aria-pressed={iconSize === size}
										onClick={() => onIconSizeChange(size)}
										className={shell.segmentTabClass(iconSize === size)}
									>
										{label}
									</button>
								</DesktopChromeTooltip>
							);
						})}
					</div>
				</SettingsFormCard>
			</DesktopSettingsMotionSection>

			<DesktopSettingsMotionSection delaySec={0.04}>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'desktop_config',
						'snap_to_grid'
					)}
					title={t('settingsPanel.cardGridTitle')}
					windowStyle={shell.windowStyle}
				>
					<label className="inline-flex cursor-pointer items-center gap-2 text-sm text-(--desktop-text-secondary)">
						<input
							type="checkbox"
							className={shell.checkboxClass}
							checked={snapToGrid}
							onChange={(event) => {
								onSnapToGridChange(event.target.checked);
							}}
						/>
						{t('settingsPanel.snapToGridLabel')}
					</label>
					<div
						id={buildDesktopSettingsFieldElementId(
							'desktop_config',
							'grid_step'
						)}
						className="scroll-mt-20 space-y-2 pt-1"
					>
						<p
							className={cn(
								DESKTOP_TYPOGRAPHY.captionInherit,
								'text-(--desktop-text-dim)'
							)}
						>
							{t('settingsPanel.gridDensityHint')}
						</p>
						<div className={shell.segmentClusterClass}>
							{(['small', 'medium', 'large'] as GridStep[]).map((step) => {
								const label = visualLabels.gridStep[step];
								return (
									<DesktopChromeTooltip
										key={step}
										content={label}
										placement="top"
										offsetExtra={4}
									>
										<button
											type="button"
											aria-pressed={gridStep === step}
											onClick={() => {
												onGridStepChange(step);
											}}
											className={shell.segmentTabClass(gridStep === step)}
										>
											{label}
										</button>
									</DesktopChromeTooltip>
								);
							})}
						</div>
					</div>
				</SettingsFormCard>
			</DesktopSettingsMotionSection>

			<DesktopSettingsMotionSection delaySec={0.08}>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'profile_ui',
						'desktop_icon_style'
					)}
					title={t('settingsPanel.cardIconStyleTitle')}
					windowStyle={shell.windowStyle}
				>
					{iconOnlyStyles.length > 0 ? (
						<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
							{iconOnlyStyles.map((style) => (
								<IconStylePickerCard
									key={style}
									style={style}
									active={desktopIconStyle === style}
									label={visualLabels.iconStyle[style]}
									description={visualLabels.iconStyleDesc[style]}
									onSelect={onDesktopIconStyleChange}
								/>
							))}
						</div>
					) : null}
				</SettingsFormCard>
			</DesktopSettingsMotionSection>
		</section>
	);
};
