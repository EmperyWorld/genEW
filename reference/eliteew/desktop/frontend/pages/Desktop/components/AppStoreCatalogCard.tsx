/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Карточка приложения в сетке каталога App Store — memo, чтобы не перерисовывать
 * весь список при несвязанных обновлениях родителя.
 *
 * Invariants:
 * - Install/uninstall и ошибки делегируются AppStore; карточка только UI-слой.
 *
 * Related:
 * - AppStore.tsx, storeAppMedia.tsx, AppStoreCatalogBadge.tsx
 */

import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { cn } from '@/utils/cn';
import { m } from 'framer-motion';
import {
	memo,
	useCallback,
	type MouseEvent,
	type ReactElement,
	type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/primitives/Spinner';
import type { DesktopIconStyle } from '@/types/profile';
import { DESKTOP_LUCIDE } from '../constants';
import type { StoreAppResponse } from '../services/desktopApi';
import { DesktopAppButton, DesktopAppStatusBadge } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { DescriptionClampOverflow } from './DescriptionClampOverflow';
import { getStoreAppGradientBarClass } from './storeCatalogGradients';
import { StoreCatalogCardPreviewStrip } from '../utils/storeAppMedia';
import { AppStoreCatalogBadge } from './AppStoreCatalogBadge';
import {
	storeAppBillingCaption,
	storeAppInstallCtaLabel,
} from '../utils/appStoreBillingCopy';
import {
	appStoreCatalogCardActionClass,
	appStoreCatalogCardGhostActionClass,
	appStoreCatalogInstallErrorPanelClass,
	appStoreCompactCardTitleClass,
	appStoreFactoryBadgeClass,
	appStoreInstalledBadgeClass,
	appStoreMaintenanceBadgeClass,
	appStoreNewBadgeClass,
	appStoreSystemBadgeClass,
} from '../utils/appStoreCompactCardUi';
import {
	ArrowDownTrayIcon,
	ArrowUturnLeftIcon,
	CheckCircleIcon,
	ChevronRightIcon,
	ComputerDesktopIcon,
	TrashIcon,
} from '@heroicons/react/24/outline';

type InstallAction = 'install' | 'uninstall';

const HighlightSearchMatch = memo(function HighlightSearchMatch({
	text,
	query,
}: {
	text: string;
	query: string;
}): ReactElement {
	const q = query.trim().toLowerCase();
	if (!q) {
		return <>{text}</>;
	}
	const lower = text.toLowerCase();
	const idx = lower.indexOf(q);
	if (idx < 0) {
		return <>{text}</>;
	}
	return (
		<>
			{text.slice(0, idx)}
			<mark className="rounded-sm bg-[rgb(var(--desktop-accent-rgb)/0.24)] px-0.5 text-inherit">
				{text.slice(idx, idx + q.length)}
			</mark>
			{text.slice(idx + q.length)}
		</>
	);
});

/** Иконка «установлено / доступно к загрузке» в шапке карточки списка. */
const AppStoreListStatusIcon = memo(function AppStoreListStatusIcon({
	installed,
}: {
	installed: boolean;
}): ReactElement {
	return installed ? (
		<CheckCircleIcon
			width={16}
			height={16}
			className="shrink-0 text-[color-mix(in_srgb,rgb(16_185_129)_62%,var(--desktop-text-secondary))]"
			aria-hidden
		/>
	) : (
		<ArrowDownTrayIcon
			width={16}
			height={16}
			className="text-(--desktop-text-dim) shrink-0"
			aria-hidden
		/>
	);
});

function sameStoreAppForCatalogCard(
	a: StoreAppResponse,
	b: StoreAppResponse
): boolean {
	return (
		a === b ||
		(a.app_id === b.app_id &&
			a.installed === b.installed &&
			a.name === b.name &&
			a.description === b.description &&
			a.app_component === b.app_component &&
			a.category === b.category &&
			a.gradient === b.gradient &&
			a.sort_order === b.sort_order &&
			a.is_system === b.is_system &&
			a.is_factory === b.is_factory &&
			a.can_uninstall === b.can_uninstall &&
			a.ew_monthly_price === b.ew_monthly_price &&
			a.trial_duration_days === b.trial_duration_days &&
			a.billing_exempt === b.billing_exempt &&
			a.show_new_badge === b.show_new_badge &&
			a.maintenance_mode === b.maintenance_mode &&
			a.maintenance_title === b.maintenance_title &&
			a.icon_url === b.icon_url &&
			a.icon_url_2x === b.icon_url_2x &&
			a.preview_url === b.preview_url &&
			a.preview_url_2x === b.preview_url_2x &&
			a.allow_multiple_windows === b.allow_multiple_windows &&
			a.max_window_instances === b.max_window_instances)
	);
}

export type AppStoreCatalogCardProps = {
	app: StoreAppResponse;
	defaultIcon?: ReactNode;
	categoryLabel: string;
	debouncedSearch: string;
	iconStyle: DesktopIconStyle;
	storeCardShellClass: string;
	reduceMotion: boolean;
	onAppClick?: (appId: string) => void;
	onInstall: (appId: string) => Promise<void>;
	onOpenInstalledApp?: (appComponent: string) => void;
	onClearInstallError: () => void;
	busyHere: boolean;
	actionBusy: boolean;
	installingAction: InstallAction | null;
	installErrorMessage: string | null;
	installFeedback?: InstallAction | null;
	workspaceNames?: string[];
	collectionNames?: string[];
};

function catalogCardPropsEqual(
	prev: Readonly<AppStoreCatalogCardProps>,
	next: Readonly<AppStoreCatalogCardProps>
): boolean {
	return (
		sameStoreAppForCatalogCard(prev.app, next.app) &&
		prev.defaultIcon === next.defaultIcon &&
		prev.categoryLabel === next.categoryLabel &&
		prev.debouncedSearch === next.debouncedSearch &&
		prev.iconStyle === next.iconStyle &&
		prev.storeCardShellClass === next.storeCardShellClass &&
		prev.reduceMotion === next.reduceMotion &&
		prev.onAppClick === next.onAppClick &&
		prev.onInstall === next.onInstall &&
		prev.onOpenInstalledApp === next.onOpenInstalledApp &&
		prev.onClearInstallError === next.onClearInstallError &&
		prev.busyHere === next.busyHere &&
		prev.actionBusy === next.actionBusy &&
		prev.installingAction === next.installingAction &&
		prev.installErrorMessage === next.installErrorMessage &&
		prev.installFeedback === next.installFeedback &&
		prev.workspaceNames === next.workspaceNames &&
		prev.collectionNames === next.collectionNames
	);
}

function AppStoreCatalogCardInner({
	app,
	defaultIcon,
	categoryLabel,
	debouncedSearch,
	iconStyle,
	storeCardShellClass,
	reduceMotion,
	onAppClick,
	onInstall,
	onOpenInstalledApp,
	onClearInstallError,
	busyHere,
	actionBusy,
	installingAction,
	installErrorMessage,
	installFeedback = null,
}: AppStoreCatalogCardProps): ReactElement {
	const { t } = useTranslation('appStore');

	const gradientBar = getStoreAppGradientBarClass(app.gradient, app.category);
	const cannotUninstall =
		app.installed &&
		(app.can_uninstall === false ||
			(app.can_uninstall === undefined &&
				(app.app_id === 'app-store' ||
					app.is_system === true ||
					app.is_factory === true)));
	const uninstallTitle =
		app.app_id === 'app-store'
			? t('uninstallBlocked.store')
			: app.is_system === true
				? t('uninstallBlocked.systemApp')
				: app.is_factory === true
					? t('uninstallBlocked.factoryApp')
					: t('uninstallBlocked.systemApp');
	const busyActionLabel =
		installingAction === 'uninstall'
			? t('inProgressUninstall')
			: t('inProgressInstall');
	const hasInstallErr = Boolean(installErrorMessage) && !busyHere;

	const detailsOpenLabel = [
		app.name,
		categoryLabel,
		storeAppBillingCaption(app, t),
		app.installed ? t('card.ariaInstalled') : t('card.ariaNotInstalled'),
		t('card.openDetails'),
	]
		.filter(Boolean)
		.join('. ');

	const inMaintenance = app.maintenance_mode === true;
	const maintenanceHint =
		app.maintenance_title?.trim() || t('maintenance.cannotInstall');

	const handleDetailsClick = useCallback(() => {
		onAppClick?.(app.app_id);
	}, [onAppClick, app.app_id]);

	const handleOpenInstalled = useCallback(() => {
		if (app.app_component) {
			onOpenInstalledApp?.(app.app_component);
		}
	}, [onOpenInstalledApp, app.app_component]);

	const handleInstallClick = useCallback(
		(e: MouseEvent) => {
			e.stopPropagation();
			void onInstall(app.app_id);
		},
		[onInstall, app.app_id]
	);

	const handleRetry = useCallback(() => {
		onClearInstallError();
		void onInstall(app.app_id);
	}, [onClearInstallError, onInstall, app.app_id]);

	return (
		<m.div
			layout={!reduceMotion}
			whileHover={reduceMotion ? undefined : { scale: 1.006, y: -2 }}
			transition={
				reduceMotion
					? { duration: 0 }
					: { type: 'spring', stiffness: 440, damping: 30 }
			}
			className={cn(
				storeCardShellClass,
				installFeedback === 'install' &&
					'border-l-[color-mix(in_srgb,rgb(16_185_129)_62%,var(--desktop-accent-rgb))] shadow-[0_0_0_2px_color-mix(in_srgb,rgb(16_185_129)_22%,transparent),0_12px_32px_-18px_rgb(16_185_129/0.35)] motion-safe:transition-[box-shadow,border-color] motion-safe:duration-700',
				installFeedback === 'uninstall' &&
					'opacity-95 motion-safe:transition-opacity motion-safe:duration-500'
			)}
		>
			<StoreCatalogCardPreviewStrip
				app={app}
				gradientBarClassName={gradientBar}
			/>
			<div className="relative px-4 pb-4 pt-3">
				<div
					className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
					aria-hidden
				>
					<div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[rgb(var(--desktop-accent-rgb))]/10 blur-2xl" />
				</div>

				<div className="mb-3 flex items-start justify-between gap-3">
					<div className="flex min-w-0 flex-1 items-start gap-3">
						<AppStoreCatalogBadge
							app={app}
							defaultIcon={defaultIcon}
							iconStyle={iconStyle}
							className="h-12 w-12 shrink-0 shadow-[0_14px_28px_-18px_rgb(0_0_0/0.48)] ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.12)]"
						/>
						<div className="min-w-0 flex-1 pt-0.5">
							<div className={appStoreCompactCardTitleClass}>
								{debouncedSearch ? (
									<HighlightSearchMatch
										text={app.name}
										query={debouncedSearch}
									/>
								) : (
									app.name
								)}
							</div>
							<p className={cn(DESKTOP_TYPOGRAPHY.meta, 'truncate')}>
								{categoryLabel}
							</p>
						</div>
					</div>
					<AppStoreListStatusIcon installed={app.installed} />
				</div>

				{app.description ? (
					<DescriptionClampOverflow
						text={app.description}
						lineClamp={2}
						className="relative mb-3 min-h-10"
						paragraphClassName={cn(
							'leading-[1.45] text-(--desktop-text-secondary)',
							DESKTOP_TYPOGRAPHY.caption
						)}
						moreLabel={t('description.more')}
						lessLabel={t('description.less')}
						stopPropagationOnToggle
					/>
				) : (
					<p className={cn('relative mb-3', DESKTOP_TYPOGRAPHY.meta)}>
						{t('noDescription')}
					</p>
				)}

				<div className="relative mb-2.5 flex flex-wrap items-center gap-1">
					<span
						className={cn(
							'inline-flex max-w-full items-center rounded-full border border-(--desktop-border-subtle)/80 bg-(--as-premium-panel-bg) px-2.5 py-1 font-medium text-(--desktop-text-secondary) tabular-nums shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)]',
							DESKTOP_TYPOGRAPHY.captionInherit
						)}
					>
						{storeAppBillingCaption(app, t)}
					</span>
					{app.installed ? (
						<DesktopAppStatusBadge className={appStoreInstalledBadgeClass}>
							{t('installed')}
						</DesktopAppStatusBadge>
					) : null}
					{app.show_new_badge ? (
						<DesktopAppStatusBadge className={appStoreNewBadgeClass}>
							{t('card.newBadge')}
						</DesktopAppStatusBadge>
					) : null}
					{inMaintenance ? (
						<DesktopAppStatusBadge className={appStoreMaintenanceBadgeClass}>
							{t('maintenance.badge')}
						</DesktopAppStatusBadge>
					) : null}
					{app.is_system ? (
						<DesktopAppStatusBadge className={appStoreSystemBadgeClass}>
							{t('system')}
						</DesktopAppStatusBadge>
					) : null}
					{app.is_factory ? (
						<DesktopAppStatusBadge className={appStoreFactoryBadgeClass}>
							{t('factory')}
						</DesktopAppStatusBadge>
					) : null}
				</div>

				{inMaintenance && app.maintenance_title?.trim() ? (
					<p
						className={cn(
							'relative mb-3 line-clamp-2 text-(--desktop-text-dim)',
							DESKTOP_TYPOGRAPHY.shellCopy13
						)}
					>
						{app.maintenance_title.trim()}
					</p>
				) : null}

				<div className="relative -mx-4 -mb-4 mt-3 border-t border-(--desktop-border-subtle)/55 bg-(--as-premium-action-bg) px-4 py-3">
					{hasInstallErr && installErrorMessage ? (
						<div
							className={cn(
								appStoreCatalogInstallErrorPanelClass,
								'mb-3',
								DESKTOP_TYPOGRAPHY.shellCopy13
							)}
							role="alert"
						>
							<p className="mb-2">{installErrorMessage}</p>
							<DesktopAppButton
								type="button"
								variant="neutral"
								size="sm"
								className="w-full gap-2 sm:w-auto"
								onClick={(e) => {
									e.stopPropagation();
									handleRetry();
								}}
							>
								<ArrowUturnLeftIcon
									className={DESKTOP_LUCIDE.sm}
									strokeWidth={DESKTOP_LUCIDE.stroke}
									aria-hidden
								/>
								{t('retry')}
							</DesktopAppButton>
						</div>
					) : null}
					<div className="flex flex-wrap items-center gap-2">
						{app.installed ? (
							<>
								{onOpenInstalledApp && app.app_component ? (
									<span className="inline-flex">
										<DesktopAppButton
											type="button"
											variant="accent"
											size="sm"
											className={appStoreCatalogCardActionClass}
											disabled={actionBusy}
											aria-label={`${t('openApp')}: ${app.name}`}
											onClick={(e) => {
												e.stopPropagation();
												handleOpenInstalled();
											}}
										>
											<ComputerDesktopIcon
												className={DESKTOP_LUCIDE.md}
												strokeWidth={DESKTOP_LUCIDE.stroke}
												aria-hidden
											/>
											{t('openApp')}
										</DesktopAppButton>
									</span>
								) : null}
								<DesktopChromeTooltip
									content={cannotUninstall ? uninstallTitle : undefined}
									placement="top"
									offsetExtra={6}
								>
									<span className="inline-flex">
										<DesktopAppButton
											type="button"
											variant="danger"
											size="sm"
											className={appStoreCatalogCardActionClass}
											disabled={busyHere || cannotUninstall || actionBusy}
											aria-label={
												busyHere
													? t('inProgress')
													: cannotUninstall
														? uninstallTitle
														: `${t('uninstall')} ${app.name}`
											}
											onClick={handleInstallClick}
										>
											{busyHere ? (
												<span className="inline-flex items-center gap-2">
													<Spinner size="sm" color="white" type="spin" />
													{busyActionLabel}
												</span>
											) : cannotUninstall ? (
												t('installed')
											) : (
												<>
													<TrashIcon
														className={DESKTOP_LUCIDE.md}
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
													{t('uninstall')}
												</>
											)}
										</DesktopAppButton>
									</span>
								</DesktopChromeTooltip>
							</>
						) : (
							<DesktopChromeTooltip
								content={
									!app.installed && inMaintenance ? maintenanceHint : undefined
								}
								placement="top"
								offsetExtra={6}
							>
								<span className="inline-flex">
									<DesktopAppButton
										type="button"
										variant="accent"
										size="sm"
										className={appStoreCatalogCardActionClass}
										disabled={
											busyHere ||
											actionBusy ||
											(!app.installed && inMaintenance)
										}
										aria-label={
											busyHere
												? t('inProgress')
												: !app.installed && inMaintenance
													? `${app.name}. ${maintenanceHint}`
													: `${t('installVerb')} ${app.name}`
										}
										onClick={handleInstallClick}
									>
										{busyHere ? (
											<span className="inline-flex items-center gap-2">
												<Spinner size="sm" color="white" type="spin" />
												{busyActionLabel}
											</span>
										) : (
											<>
												<ArrowDownTrayIcon
													className={DESKTOP_LUCIDE.md}
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
												{storeAppInstallCtaLabel(app, t)}
											</>
										)}
									</DesktopAppButton>
								</span>
							</DesktopChromeTooltip>
						)}
						{onAppClick ? (
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="sm"
								className={appStoreCatalogCardGhostActionClass}
								aria-label={detailsOpenLabel}
								onClick={(e) => {
									e.stopPropagation();
									handleDetailsClick();
								}}
							>
								{t('card.openDetails')}
								<ChevronRightIcon
									className="h-3.5 w-3.5 shrink-0"
									aria-hidden
								/>
							</DesktopAppButton>
						) : null}
					</div>
				</div>
			</div>
		</m.div>
	);
}

export const AppStoreCatalogCard = memo(
	AppStoreCatalogCardInner,
	catalogCardPropsEqual
);
AppStoreCatalogCard.displayName = 'AppStoreCatalogCard';
