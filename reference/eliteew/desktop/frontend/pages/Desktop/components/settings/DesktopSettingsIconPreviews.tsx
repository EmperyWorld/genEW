/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Polished icon previews for Desktop Settings Icons tab (size strip + style panel).
 *
 * Invariants:
 * - Uses the same `ICON_VISUAL_STYLES` / `DesktopAppSymbol` path as live desktop icons.
 *
 * Related:
 * - `DesktopSettingsIconsTab.tsx`, `DesktopIcon.tsx`
 */

import { cn } from '@/utils/cn';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import type { DesktopIconStyle } from '@/types/profile';
import {
	DESKTOP_APP_ICON,
	DESKTOP_ICON_SIZES,
	DESKTOP_ICON_SVG_QUALITY,
	DESKTOP_LUCIDE,
	DESKTOP_TYPOGRAPHY,
} from '../../constants';
import {
	DesktopAppSymbol,
	DesktopFolderSymbol,
} from '../../utils/desktopVisualSystem';
import {
	ICON_STYLE_CARD_SAMPLE_APPS,
	ICON_VISUAL_STYLES,
} from '../DesktopIcon';
import type { IconSize } from './desktopSettingsShared.types';

const STYLE_PREVIEW_APP_BOX = 'size-10 sm:size-11';

export const DesktopIconStylePreviewPanel: FC<{ style: DesktopIconStyle }> = ({
	style,
}) => {
	const { t } = useTranslation('desktopUi');
	const vs = ICON_VISUAL_STYLES[style];

	return (
		<div
			className={cn(
				'relative overflow-hidden rounded-xl px-2.5 py-3',
				'bg-[radial-gradient(ellipse_at_18%_8%,rgb(var(--desktop-accent-rgb)/0.16)_0%,transparent_55%),linear-gradient(168deg,rgb(var(--desktop-bg-secondary-rgb)/0.58)_0%,rgb(var(--desktop-bg-primary-rgb)/0.78)_100%)]',
				'ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.07)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
			)}
			aria-hidden
		>
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.meta,
					'mb-2.5 text-center uppercase tracking-[0.14em] text-(--desktop-text-dim)'
				)}
			>
				{t('settingsPanel.iconStylePreviewCaption')}
			</p>
			<div className="flex flex-wrap items-start justify-center gap-x-2.5 gap-y-2 sm:gap-x-3">
				{ICON_STYLE_CARD_SAMPLE_APPS.map((app) => (
					<div
						key={app}
						className={cn(
							'relative shrink-0',
							STYLE_PREVIEW_APP_BOX,
							vs.appBox
						)}
					>
						<div className={DESKTOP_APP_ICON.inner}>
							<DesktopAppSymbol appComponent={app} iconStyle={style} />
						</div>
					</div>
				))}
			</div>
			<div className="mt-3 grid grid-cols-3 gap-2 border-t border-(--desktop-border-subtle)/45 pt-3">
				<div className="flex flex-col items-center gap-1">
					<span className={DESKTOP_TYPOGRAPHY.shellMeta10}>
						{t('settingsPanel.sampleFolderNormal')}
					</span>
					<div className={cn('relative size-9 shrink-0 sm:size-10', vs.appBox)}>
						<div className={DESKTOP_APP_ICON.inner}>
							<DesktopFolderSymbol iconStyle={style} />
						</div>
					</div>
				</div>
				<div className="flex flex-col items-center gap-1">
					<span className={DESKTOP_TYPOGRAPHY.shellMeta10}>
						{t('settingsPanel.sampleFolderProject')}
					</span>
					<div className={cn('relative size-9 shrink-0 sm:size-10', vs.appBox)}>
						<div
							className={cn(
								DESKTOP_APP_ICON.inner,
								'relative h-full w-full overflow-hidden rounded-[1.05rem]',
								'shadow-[0_0_0_2px_rgb(var(--desktop-accent-rgb)/0.48),0_8px_22px_rgba(var(--desktop-accent-rgb)/0.18)]'
							)}
						>
							<DesktopFolderSymbol iconStyle={style} isProjectFolder />
						</div>
					</div>
				</div>
				<div className="flex flex-col items-center gap-1">
					<span className={DESKTOP_TYPOGRAPHY.shellMeta10}>
						{t('settingsPanel.sampleFileLabel')}
					</span>
					<div
						className={cn(
							'relative flex size-9 shrink-0 items-center justify-center overflow-hidden sm:size-10',
							vs.fileBox,
							DESKTOP_ICON_SVG_QUALITY
						)}
					>
						<DocumentTextIcon
							className="h-[58%] w-[58%] shrink-0 text-(--desktop-text-secondary)"
							strokeWidth={DESKTOP_LUCIDE.stroke}
							aria-hidden
						/>
					</div>
				</div>
			</div>
		</div>
	);
};

export const DesktopIconSizePreviewStrip: FC<{
	iconSize: IconSize;
	iconStyle: DesktopIconStyle;
}> = ({ iconSize, iconStyle }) => {
	const { t } = useTranslation('desktopUi');
	const vs = ICON_VISUAL_STYLES[iconStyle];

	return (
		<div
			className="mb-4 flex items-end justify-center gap-5 rounded-xl border border-(--desktop-border-subtle)/55 bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.42)_0%,rgb(var(--desktop-bg-primary-rgb)/0.28)_100%)] px-4 py-4 sm:gap-8"
			aria-hidden
		>
			{(['small', 'medium', 'large'] as IconSize[]).map((size) => {
				const dims = DESKTOP_ICON_SIZES[size];
				const active = iconSize === size;
				return (
					<div
						key={size}
						className={cn(
							'flex flex-col items-center gap-1.5 transition-[opacity,transform] duration-200 motion-reduce:transition-none',
							active ? 'scale-100 opacity-100' : 'scale-[0.94] opacity-50'
						)}
					>
						<div className={cn('relative shrink-0', dims.iconBox, vs.appBox)}>
							<div className={DESKTOP_APP_ICON.inner}>
								<DesktopAppSymbol
									appComponent="AppStore"
									iconStyle={iconStyle}
								/>
							</div>
						</div>
						<span
							className={cn(
								DESKTOP_TYPOGRAPHY.meta,
								'font-medium',
								active
									? 'text-(--desktop-text-primary)'
									: 'text-(--desktop-text-dim)'
							)}
						>
							{t(`settingsIconSize.${size}`)}
						</span>
					</div>
				);
			})}
		</div>
	);
};
