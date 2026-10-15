/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Горизонтальная полоса «Похожие приложения» на экране детали — та же категория.
 *
 * Invariants:
 * - Только навигация к другой детали; install/uninstall не здесь.
 *
 * Related:
 * - AppStoreCard.tsx, AppStoreFeaturedRow.tsx
 * - DesktopChromeTooltip.tsx
 */

import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { cn } from '@/utils/cn';
import { memo, useCallback, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopIconStyle } from '@/types/profile';
import type { StoreAppResponse } from '../services/desktopApi';
import { DesktopAppStatusBadge } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { AppStoreCatalogBadge } from './AppStoreCatalogBadge';
import { getStoreAppGradientBarClass } from './storeCatalogGradients';
import { Squares2X2Icon } from '@heroicons/react/24/outline';
import {
	appStoreCompactCardOpenDetailsClass,
	appStoreCompactCardTitleClass,
	appStoreCompactInstalledBadgeClass,
	appStoreHorizontalScrollListClass,
	appStoreSectionHeadingClass,
} from '../utils/appStoreCompactCardUi';

export type AppStoreRelatedAppsRowProps = {
	apps: StoreAppResponse[];
	defaultIcons: ReadonlyMap<string, ReactNode>;
	iconStyle: DesktopIconStyle;
	onAppClick: (appId: string) => void;
};

function AppStoreRelatedAppsRowInner({
	apps,
	defaultIcons,
	iconStyle,
	onAppClick,
}: AppStoreRelatedAppsRowProps): ReactElement | null {
	const { t } = useTranslation('appStore');

	const handleCardClick = useCallback(
		(appId: string) => () => {
			onAppClick(appId);
		},
		[onAppClick]
	);

	if (apps.length === 0) {
		return null;
	}

	return (
		<section
			className="mb-8 border-t border-(--desktop-border-subtle)/60 pt-8"
			aria-labelledby="app-store-related-heading"
		>
			<div className="mb-4 border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.35)] pl-3 sm:pl-4">
				<div className="flex flex-wrap items-center gap-2.5">
					<span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--desktop-accent-rgb))]/12 text-(--desktop-text-primary) ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.18)]">
						<Squares2X2Icon className="h-4 w-4 shrink-0" aria-hidden />
					</span>
					<h3
						id="app-store-related-heading"
						className={appStoreSectionHeadingClass}
					>
						{t('related.title')}
					</h3>
				</div>
				<p
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'mt-1.5 leading-snug text-(--desktop-text-muted)'
					)}
				>
					{t('related.subtitle')}
				</p>
			</div>

			<ul
				className={appStoreHorizontalScrollListClass}
				aria-label={t('related.listAria')}
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
									className={cn(
										'group/rel flex h-full w-full flex-col overflow-hidden rounded-(--desktop-radius-frame) text-left',
										'border border-(--desktop-border-subtle)/60 bg-[color-mix(in_srgb,var(--desktop-surface-soft)_88%,transparent)]',
										'ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.06)]',
										'transition-[transform,box-shadow,border-color] duration-200',
										'hover:border-[rgb(var(--desktop-accent-rgb))]/32 hover:shadow-md',
										'focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb))]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-(--desktop-surface-panel-strong)',
										'active:scale-[0.99]'
									)}
								>
									<div
										className={cn('relative h-12 w-full shrink-0', gradient)}
										aria-hidden
									/>
									<div className="relative flex min-h-0 flex-1 flex-col px-3 pb-3 pt-0">
										<div className="-mt-6 mb-2 flex items-end gap-2">
											<AppStoreCatalogBadge
												app={app}
												defaultIcon={defaultIcons.get(app.app_id)}
												iconStyle={iconStyle}
												className="h-10 w-10 shrink-0 ring-2 ring-[rgb(var(--desktop-fg-primary-rgb)/0.08)]"
											/>
											<div className="min-w-0 flex-1 pb-0.5">
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
												'mt-auto group-hover/rel:text-[rgb(var(--desktop-accent-rgb))]'
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
		</section>
	);
}

export const AppStoreRelatedAppsRow = memo(AppStoreRelatedAppsRowInner);
AppStoreRelatedAppsRow.displayName = 'AppStoreRelatedAppsRow';
