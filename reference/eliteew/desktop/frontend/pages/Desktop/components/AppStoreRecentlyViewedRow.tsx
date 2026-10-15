/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Горизонтальная полоса «Недавно просмотренные» в каталоге магазина.
 *
 * Invariants:
 * - Только навигация к детали; данные из sessionStorage MRU.
 *
 * Related:
 * - appStoreRecentlyViewed.ts, AppStoreFeaturedRow.tsx
 * - DesktopChromeTooltip.tsx
 */

import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { cn } from '@/utils/cn';
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
import { ClockIcon } from '@heroicons/react/24/outline';
import {
	appStoreCompactCardOpenDetailsClass,
	appStoreCompactCardTitleClass,
	appStoreCompactInstalledBadgeClass,
	appStoreHorizontalScrollListClass,
} from '../utils/appStoreCompactCardUi';

export type AppStoreRecentlyViewedRowProps = {
	apps: StoreAppResponse[];
	defaultIcons: ReadonlyMap<string, ReactNode>;
	iconStyle: DesktopIconStyle;
	onAppClick?: (appId: string) => void;
};

function AppStoreRecentlyViewedRowInner({
	apps,
	defaultIcons,
	iconStyle,
	onAppClick,
}: AppStoreRecentlyViewedRowProps): ReactElement | null {
	const { t } = useTranslation('appStore');
	const { contentPanel, sectionPanelShadow } = useAppStoreShellClasses();

	const handleCardClick = useCallback(
		(appId: string) => () => {
			onAppClick?.(appId);
		},
		[onAppClick]
	);

	const compactCardClass = cn(
		contentPanel,
		sectionPanelShadow,
		'group/recent flex h-full w-full flex-col overflow-hidden rounded-(--desktop-radius-frame) text-left',
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
			title={t('recent.title')}
			description={t('recent.subtitle')}
			headingId="app-store-recent-heading"
			icon={<ClockIcon className="h-4 w-4 shrink-0" aria-hidden />}
		>
			<ul
				className={appStoreHorizontalScrollListClass}
				aria-label={t('recent.listAria')}
			>
				{apps.map((app) => {
					const gradient = getStoreAppGradientBarClass(
						app.gradient,
						app.category
					);
					const cardTooltip = `${app.name} — ${app.description?.trim() || t('noDescription')}`;
					return (
						<li
							key={app.app_id}
							className="w-[min(200px,68vw)] shrink-0 snap-start"
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
										<div className="mb-1.5 flex items-start gap-2">
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
												) : null}
											</div>
										</div>
										<span
											className={cn(
												appStoreCompactCardOpenDetailsClass,
												'mt-auto group-hover/recent:text-[rgb(var(--desktop-accent-rgb))]'
											)}
										>
											{t('card.openDetails')}
										</span>
									</div>
								</button>
							</DesktopChromeTooltip>
						</li>
					);
				})}
			</ul>
		</AppStoreSectionPanel>
	);
}

export const AppStoreRecentlyViewedRow = memo(AppStoreRecentlyViewedRowInner);
AppStoreRecentlyViewedRow.displayName = 'AppStoreRecentlyViewedRow';
