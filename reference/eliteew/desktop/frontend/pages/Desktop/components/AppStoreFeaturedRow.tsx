/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Горизонтальная полоса «Новинки» в каталоге магазина приложений — компактные
 * карточки с быстрым переходом к детали или установке.
 *
 * Invariants:
 * - Только read-only отображение; install/uninstall делегируются родителю AppStore.
 * - Показывается при отсутствии активных фильтров и категории «Все».
 *
 * Related:
 * - AppStore.tsx, AppStoreCatalogCard.tsx
 * - DesktopChromeTooltip.tsx
 */

import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { cn } from '@/utils/cn';
import { m } from 'framer-motion';
import { memo, useCallback, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopIconStyle } from '@/types/profile';
import type { StoreAppResponse } from '../services/desktopApi';
import { DesktopAppStatusBadge } from './DesktopAppChrome';
import { AppStoreCatalogBadge } from './AppStoreCatalogBadge';
import { getStoreAppGradientBarClass } from './storeCatalogGradients';
import { useAppStoreShellClasses } from '../hooks/useAppStoreShellClasses';
import { AppStoreSectionPanel } from './AppStoreSectionPanel';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { SparklesIcon } from '@heroicons/react/24/outline';
import {
	appStoreCompactCardOpenDetailsClass,
	appStoreCompactCardTitleClass,
	appStoreCompactInstalledBadgeClass,
	appStoreCompactNewBadgeClass,
	appStoreHorizontalScrollListClass,
} from '../utils/appStoreCompactCardUi';

export type AppStoreFeaturedRowProps = {
	apps: StoreAppResponse[];
	defaultIcons: ReadonlyMap<string, ReactNode>;
	iconStyle: DesktopIconStyle;
	reduceMotion: boolean;
	onAppClick?: (appId: string) => void;
};

function AppStoreFeaturedRowInner({
	apps,
	defaultIcons,
	iconStyle,
	reduceMotion,
	onAppClick,
}: AppStoreFeaturedRowProps): ReactElement | null {
	const { t } = useTranslation('appStore');
	const { contentPanel, sectionPanelShadow, statusChip } =
		useAppStoreShellClasses();

	const handleCardClick = useCallback(
		(appId: string) => () => {
			onAppClick?.(appId);
		},
		[onAppClick]
	);

	const compactCardClass = cn(
		contentPanel,
		sectionPanelShadow,
		'group/feat flex h-full w-full flex-col overflow-hidden rounded-(--desktop-radius-frame) text-left',
		'border border-(--desktop-border-subtle)/60',
		'transition-[transform,box-shadow,border-color] duration-200 motion-reduce:transition-none',
		'hover:border-(--mc-accent-35) hover:shadow-(--mc-glow-accent-soft)',
		'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--mc-focus-ring-color) focus-visible:ring-offset-2 focus-visible:ring-offset-(--desktop-surface-app)',
		'active:scale-[0.99]'
	);

	if (apps.length === 0 || !onAppClick) {
		return null;
	}

	return (
		<AppStoreSectionPanel
			bare
			title={t('featured.title')}
			description={t('featured.subtitle')}
			headingId="app-store-featured-heading"
			icon={<SparklesIcon className="h-4 w-4 shrink-0" aria-hidden />}
			count={
				<span className={cn(statusChip, 'tabular-nums')}>
					{t('appsCount', { count: apps.length })}
				</span>
			}
		>
			<ul
				className={appStoreHorizontalScrollListClass}
				aria-label={t('featured.listAria')}
			>
				{apps.map((app, index) => {
					const gradient = getStoreAppGradientBarClass(
						app.gradient,
						app.category
					);
					const cardTooltip = `${app.name} — ${app.description?.trim() || t('noDescription')}`;
					return (
						<m.li
							key={app.app_id}
							initial={reduceMotion ? false : { opacity: 0, x: 12 }}
							animate={{ opacity: 1, x: 0 }}
							transition={
								reduceMotion
									? { duration: 0 }
									: { duration: 0.22, delay: index * 0.04 }
							}
							className="w-[min(220px,72vw)] shrink-0 snap-start"
						>
							<DesktopChromeTooltip
								content={cardTooltip}
								placement="top"
								offsetExtra={4}
							>
								<button
									type="button"
									onClick={handleCardClick(app.app_id)}
									className={compactCardClass}
								>
									<div
										className={cn('h-1 w-full shrink-0', gradient)}
										aria-hidden
									/>
									<div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2.5 pt-2">
										<div className="mb-2 flex items-start gap-2">
											<AppStoreCatalogBadge
												app={app}
												defaultIcon={defaultIcons.get(app.app_id)}
												iconStyle={iconStyle}
												className="h-9 w-9 shrink-0 ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.08)]"
											/>
											<div className="min-w-0 flex-1 pt-0.5">
												<div className={appStoreCompactCardTitleClass}>
													{app.name}
												</div>
												{app.installed ? (
													<DesktopAppStatusBadge
														className={cn(
															appStoreCompactInstalledBadgeClass,
															DESKTOP_TYPOGRAPHY.small
														)}
													>
														{t('installed')}
													</DesktopAppStatusBadge>
												) : (
													<DesktopAppStatusBadge
														className={cn(
															appStoreCompactNewBadgeClass,
															DESKTOP_TYPOGRAPHY.small
														)}
													>
														{t('card.newBadge')}
													</DesktopAppStatusBadge>
												)}
											</div>
										</div>
										<p
											className={cn(
												'line-clamp-2 min-h-8 flex-1 leading-snug text-(--desktop-text-secondary)',
												DESKTOP_TYPOGRAPHY.caption
											)}
										>
											{app.description?.trim() || t('noDescription')}
										</p>
										<span
											className={cn(
												appStoreCompactCardOpenDetailsClass,
												'mt-1.5 group-hover/feat:text-[rgb(var(--desktop-accent-rgb))]'
											)}
										>
											{t('card.openDetails')}
										</span>
									</div>
								</button>
							</DesktopChromeTooltip>
						</m.li>
					);
				})}
			</ul>
		</AppStoreSectionPanel>
	);
}

export const AppStoreFeaturedRow = memo(AppStoreFeaturedRowInner);
AppStoreFeaturedRow.displayName = 'AppStoreFeaturedRow';
