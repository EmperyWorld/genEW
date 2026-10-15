/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Анимированный стек «каталог ↔ деталь» для окна магазина на рабочем столе.
 *
 * Invariants:
 * - AnimatePresence mode="wait" — одновременно виден только один экран.
 * - Install/uninstall и toast остаются в родительском AppStoreWindowContent.
 *
 * Related:
 * - AppStoreWindowContent.tsx, appStoreMotion.ts
 */

import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopIconStyle } from '@/types/profile';
import type { StoreAppResponse } from '../services/desktopApi';
import { AppStore, type AppStoreSuccessPayload } from './AppStore';
import { AppStoreCard } from './AppStoreCard';
import {
	appStoreCatalogViewVariants,
	appStoreDetailViewVariants,
	appStoreViewTransition,
} from '../utils/appStoreMotion';
import { focusAppStoreCatalogSearch } from '../utils/appStoreFocus';
import { pickRelatedStoreApps } from '../utils/appStoreRelatedApps';
import { pushRecentlyViewedAppId } from '../utils/appStoreRecentlyViewed';

export type AppStoreViewStackProps = {
	selectedAppId: string | null;
	appFromStore: StoreAppResponse | null;
	storeApps: StoreAppResponse[] | undefined;
	isLoading: boolean;
	catalogError: Error | null;
	iconStyle: DesktopIconStyle;
	onSelectAppId: (appId: string | null) => void;
	onInstall: (appId: string) => Promise<void>;
	onUninstall: (appId: string) => Promise<void>;
	onCatalogRetry: () => Promise<void>;
	onError: (message: string) => void;
	onSuccess: (payload: AppStoreSuccessPayload) => void;
	onOpenInstalledApp: (appComponent: string) => void;
	embeddedMobile?: boolean;
};

export function AppStoreViewStack({
	selectedAppId,
	appFromStore,
	storeApps,
	isLoading,
	catalogError,
	iconStyle,
	onSelectAppId,
	onInstall,
	onUninstall,
	onCatalogRetry,
	onError,
	onSuccess,
	onOpenInstalledApp,
	embeddedMobile,
}: AppStoreViewStackProps): ReactElement {
	const { t } = useTranslation('appStore');
	const reduceMotion = useReducedMotion() ?? false;
	const transition = appStoreViewTransition(reduceMotion);
	const relatedApps = pickRelatedStoreApps(storeApps, appFromStore);

	const handleRelatedAppClick = (appId: string) => {
		pushRecentlyViewedAppId(appId);
		onSelectAppId(appId);
	};

	const handleBackToCatalog = () => {
		onSelectAppId(null);
		requestAnimationFrame(() => {
			requestAnimationFrame(() => focusAppStoreCatalogSearch());
		});
	};

	return (
		<section
			className="relative h-full min-h-0 overflow-hidden"
			aria-label={
				selectedAppId
					? t('viewStack.detailAria', {
							name: appFromStore?.name ?? selectedAppId,
						})
					: t('viewStack.catalogAria')
			}
		>
			<AnimatePresence mode="wait" initial={false}>
				{selectedAppId ? (
					<m.div
						key={`detail-${selectedAppId}`}
						className="absolute inset-0 flex min-h-0 flex-col overflow-y-auto overflow-x-hidden p-4 md:p-5"
						variants={appStoreDetailViewVariants(reduceMotion)}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={transition}
					>
						<AppStoreCard
							appId={selectedAppId}
							appFromStore={appFromStore}
							onBack={handleBackToCatalog}
							onInstall={onInstall}
							onUninstall={onUninstall}
							onError={onError}
							onOpenInstalledApp={
								embeddedMobile ? undefined : onOpenInstalledApp
							}
							iconStyle={iconStyle}
							relatedApps={relatedApps}
							onRelatedAppClick={handleRelatedAppClick}
						/>
					</m.div>
				) : (
					<m.div
						key="catalog"
						className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
						variants={appStoreCatalogViewVariants(reduceMotion)}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={transition}
					>
						<AppStore
							isOpen
							apps={storeApps}
							isLoading={isLoading}
							catalogError={catalogError}
							iconStyle={iconStyle}
							onInstall={onInstall}
							onUninstall={onUninstall}
							onCatalogRetry={onCatalogRetry}
							onError={onError}
							onSuccess={onSuccess}
							onAppClick={onSelectAppId}
							onOpenInstalledApp={
								embeddedMobile ? undefined : onOpenInstalledApp
							}
							variant="page"
							embeddedMobile={embeddedMobile}
						/>
					</m.div>
				)}
			</AnimatePresence>
		</section>
	);
}
