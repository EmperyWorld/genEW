/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Модальный слой магазина приложений на рабочем столе — каталог + overlay детали.
 *
 * Invariants:
 * - Деталь открывается поверх каталога; Escape/back закрывает только деталь (capture).
 * - Lazy-load AppStoreCard с prefetch при idle после открытия витрины.
 *
 * Related:
 * - AppStore.tsx, AppStoreCard.tsx, hooks/useShellCaptureKeyboard.ts
 */
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import {
	lazy,
	memo,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from 'react';
import type { MouseEvent } from 'react';
import { cn } from '@/utils/cn';
import { useTranslation } from 'react-i18next';
import type { DesktopIconStyle, DesktopWindowStyle } from '@/types/profile';
import { DESKTOP_OVERLAY, DESKTOP_Z_INDEX } from '../constants';
import { getDesktopShellPanelClassName } from '../utils/desktopVisualSystem';
import { useDesktopModalFocusTrap } from '../hooks/useDesktopModalFocusTrap';
import { useShellCaptureEscape } from '../hooks/useShellCaptureKeyboard';
import type { StoreAppResponse } from '../services/desktopApi';
import { AppStore, type AppStoreSuccessPayload } from './AppStore';
import { DesktopAppSkeleton } from './DesktopAppChrome';
import type { DesktopExpansionDiscoveryState } from '../types/desktopExpansion.types';
import {
	appStoreShellDetailSuspenseBodyClass,
	appStoreShellDetailSuspenseHeroClass,
} from '../utils/appStoreCompactCardUi';
import {
	appStoreModalDetailPanelVariants,
	appStoreViewTransition,
} from '../utils/appStoreMotion';
import { focusAppStoreCatalogSearch } from '../utils/appStoreFocus';
import { pickRelatedStoreApps } from '../utils/appStoreRelatedApps';
import { pushRecentlyViewedAppId } from '../utils/appStoreRecentlyViewed';

/** Тот же модуль, что у `lazy` — предзагрузка при открытии витрины, чтобы «Подробнее» не ждало сеть. */
function prefetchAppStoreCardChunk(): void {
	void import('./AppStoreCard');
}

const AppStoreCardLazy = lazy(async () => {
	const m = await import('./AppStoreCard');
	return { default: m.AppStoreCard };
});

export interface DesktopWorkspaceAppStoreLayerProps {
	showAppStore: boolean;
	appStoreDetailId: string | null;
	appStoreDetailFromStore: StoreAppResponse | null;
	storeApps: StoreAppResponse[] | undefined;
	installedAppsLoading: boolean;
	desktopIconStyle: DesktopIconStyle;
	shellWindowStyle: DesktopWindowStyle;
	onCloseModal: () => void;
	onBackFromDetail: () => void;
	onSetAppStoreDetailId: (id: string | null) => void;
	onInstall: (appId: string) => Promise<void>;
	onUninstall: (appId: string) => Promise<void>;
	onAppStoreError: (message: string) => void;
	onAppStoreSuccess: (payload: AppStoreSuccessPayload) => void;
	onOpenInstalledApp: (appComponent: string) => void;
	expansionState?: DesktopExpansionDiscoveryState;
	/** Root-level desktop shortcut app ids (store `app_id`); shell modal path. */
	appStoreDesktopShortcutIds?: readonly string[];
}

function DesktopWorkspaceAppStoreLayerInner({
	showAppStore,
	appStoreDetailId,
	appStoreDetailFromStore,
	storeApps,
	installedAppsLoading,
	desktopIconStyle,
	shellWindowStyle,
	onCloseModal,
	onBackFromDetail,
	onSetAppStoreDetailId,
	onInstall,
	onUninstall,
	onAppStoreError,
	onAppStoreSuccess,
	onOpenInstalledApp,
	expansionState,
	appStoreDesktopShortcutIds,
}: DesktopWorkspaceAppStoreLayerProps) {
	const { t } = useTranslation('appStore');
	const detailPanelRef = useRef<HTMLDivElement>(null);
	const reduceMotion = useReducedMotion() ?? false;
	const detailTransition = appStoreViewTransition(reduceMotion);
	const relatedApps = useMemo(
		() => pickRelatedStoreApps(storeApps, appStoreDetailFromStore),
		[storeApps, appStoreDetailFromStore]
	);

	const handleRelatedAppClick = useCallback(
		(appId: string) => {
			pushRecentlyViewedAppId(appId);
			onSetAppStoreDetailId(appId);
		},
		[onSetAppStoreDetailId]
	);

	useDesktopModalFocusTrap(
		Boolean(showAppStore && appStoreDetailId),
		detailPanelRef
	);

	const handleAppClick = useCallback(
		(appId: string) => {
			pushRecentlyViewedAppId(appId);
			onSetAppStoreDetailId(appId);
		},
		[onSetAppStoreDetailId]
	);

	const handleBackFromDetailWithFocus = useCallback(() => {
		onBackFromDetail();
		requestAnimationFrame(() => {
			requestAnimationFrame(() => focusAppStoreCatalogSearch());
		});
	}, [onBackFromDetail]);

	useShellCaptureEscape(
		Boolean(showAppStore && appStoreDetailId),
		handleBackFromDetailWithFocus
	);

	const stopDetailPanelClick = useCallback((e: MouseEvent) => {
		e.stopPropagation();
	}, []);

	useEffect(() => {
		if (!showAppStore) {
			return;
		}
		const ric = window.requestIdleCallback;
		if (typeof ric === 'function') {
			const id = ric(() => prefetchAppStoreCardChunk());
			return () => window.cancelIdleCallback(id);
		}
		prefetchAppStoreCardChunk();
	}, [showAppStore]);

	const appStoreDetailPanelClass = useMemo(
		() =>
			cn(
				'relative mx-4 flex max-h-[min(90vh,880px)] w-full max-w-2xl flex-col',
				'border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.45)]',
				'backdrop-blur-md ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.08)]',
				'shadow-[0_22px_52px_-30px_rgb(var(--desktop-bg-primary-rgb)/0.42)]',
				getDesktopShellPanelClassName(shellWindowStyle, 'strong')
			),
		[shellWindowStyle]
	);

	return (
		<AnimatePresence>
			{showAppStore && appStoreDetailId ? (
				<m.div
					key="app-store-detail"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className={cn(
						'fixed inset-0 flex items-center justify-center',
						DESKTOP_OVERLAY.backdrop
					)}
					style={{ zIndex: DESKTOP_Z_INDEX.MODAL }}
					onClick={handleBackFromDetailWithFocus}
				>
					<m.div
						ref={detailPanelRef}
						role="dialog"
						aria-modal="true"
						data-desktop-shell-keyboard-surface
						aria-label={appStoreDetailFromStore?.name ?? appStoreDetailId}
						variants={appStoreModalDetailPanelVariants(reduceMotion)}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={detailTransition}
						className={appStoreDetailPanelClass}
						style={{ zIndex: DESKTOP_Z_INDEX.MODAL_CONTENT }}
						onClick={stopDetailPanelClick}
					>
						<div
							className="pointer-events-none h-1 shrink-0 bg-linear-to-r from-[rgb(var(--desktop-accent-rgb)/0.45)] via-[rgb(var(--desktop-accent-rgb)/0.22)] to-[color-mix(in_srgb,var(--desktop-surface-soft)_75%,rgb(var(--desktop-accent-rgb)/0.15))]"
							aria-hidden
						/>
						<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-5">
							<Suspense
								fallback={
									<div
										className="mx-auto w-full max-w-2xl space-y-4"
										role="status"
										aria-busy="true"
										aria-label={t('loading.appDetail')}
									>
										<div className={appStoreShellDetailSuspenseHeroClass}>
											<DesktopAppSkeleton className="h-28 w-full rounded-none md:h-32" />
										</div>
										<div className={appStoreShellDetailSuspenseBodyClass}>
											<DesktopAppSkeleton className="h-24 w-full rounded-lg" />
											<DesktopAppSkeleton className="h-11 w-full max-w-xs rounded-lg" />
										</div>
									</div>
								}
							>
								<AppStoreCardLazy
									appId={appStoreDetailId}
									appFromStore={appStoreDetailFromStore}
									onBack={handleBackFromDetailWithFocus}
									onInstall={onInstall}
									onUninstall={onUninstall}
									onError={onAppStoreError}
									onOpenInstalledApp={onOpenInstalledApp}
									iconStyle={desktopIconStyle}
									expansionState={expansionState}
									appStoreDesktopShortcutIds={appStoreDesktopShortcutIds}
									relatedApps={relatedApps}
									onRelatedAppClick={handleRelatedAppClick}
								/>
							</Suspense>
						</div>
					</m.div>
				</m.div>
			) : null}
			<AppStore
				isOpen={showAppStore && !appStoreDetailId}
				onClose={onCloseModal}
				apps={storeApps}
				isLoading={installedAppsLoading}
				iconStyle={desktopIconStyle}
				onInstall={onInstall}
				onUninstall={onUninstall}
				onError={onAppStoreError}
				onSuccess={onAppStoreSuccess}
				onOpenInstalledApp={onOpenInstalledApp}
				onAppClick={handleAppClick}
				expansionState={expansionState}
			/>
		</AnimatePresence>
	);
}

export const DesktopWorkspaceAppStoreLayer = memo(
	DesktopWorkspaceAppStoreLayerInner
);
DesktopWorkspaceAppStoreLayer.displayName = 'DesktopWorkspaceAppStoreLayer';
