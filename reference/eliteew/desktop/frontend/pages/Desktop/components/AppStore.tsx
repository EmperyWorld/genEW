/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Магазин приложений рабочего стола — модальное окно или встроенная страница;
 * оркестратор install/shell + catalog body.
 *
 * Invariants:
 * - Фильтры каталога — `appStore/useAppStoreCatalogState` (sessionStorage).
 * - Install/uninstall делегируются родительскому shell через props; flow — `appStore/useAppStoreInstallFlow`.
 * - Modal Escape: layered search clear then close via `useShellCaptureEscape`.
 *
 * Related:
 * - DesktopWorkspaceAppStoreLayer.tsx, appStore/AppStoreCatalogBody.tsx, appStore/useAppStoreCatalogState.ts
 */

import { cn } from '@/utils/cn';
import { DesktopProductWorkspace } from '@/pages/Desktop/components/DesktopAppChrome';
import { useReducedMotion } from 'framer-motion';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	type FC,
	type MouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopIconStyle } from '@/types/profile';
import { useEmbeddedPortaledModalZIndex } from '../context/DesktopWindowPortalStackContext';
import type { StoreAppResponse } from '../services/desktopApi';
import { useDesktopShellFrame } from '@/pages/Desktop/context/DesktopShellFrameContext';
import '../appStoreDesktopVars.css';
import { useAppStoreShellClasses } from '../hooks/useAppStoreShellClasses';
import { AppStoreCatalogBody } from './appStore/AppStoreCatalogBody';
import { AppStoreModalShell } from './appStore/AppStoreModalShell';
import { useAppStoreCatalogCardRenderer } from './appStore/useAppStoreCatalogCardRenderer';
import { useAppStoreCatalogState } from './appStore/useAppStoreCatalogState';
import { useAppStoreInstallFlow } from './appStore/useAppStoreInstallFlow';
import type { AppStoreSuccessPayload } from './appStore/appStoreInstallTypes';
export type { AppStoreSuccessPayload };
import { getDesktopShellPanelClassName } from '../utils/desktopVisualSystem';
import { useDesktopModalFocusTrap } from '../hooks/useDesktopModalFocusTrap';
import {
	consumeEscapeForSearchClear,
	useShellCaptureEscape,
} from '../hooks/useShellCaptureKeyboard';
import type { DesktopExpansionDiscoveryState } from '../types/desktopExpansion.types';
import { MOBILE_EMBEDDED_APP_ROOT_CLASS } from '@/components/mobileEmbedded/mobileEmbeddedLayoutTokens';
import { isMobileAppStoreEmbeddedRoute } from '@/utils/mobileEmbeddedSpaRoute';

export interface AppStoreProps {
	isOpen: boolean;
	onClose?: () => void;
	apps: StoreAppResponse[] | undefined;
	isLoading: boolean;
	/** Terminal catalog fetch failure; only replaces an unavailable empty catalog. */
	catalogError?: Error | null;
	onInstall: (appId: string) => Promise<void>;
	onUninstall: (appId: string) => Promise<void>;
	/** Re-fetches both store and installed state after a catalog failure. */
	onCatalogRetry?: () => void | Promise<void>;
	onError?: (message: string) => void;
	onSuccess?: (payload: AppStoreSuccessPayload) => void;
	onAppClick?: (appId: string) => void;
	/** Открыть установленное приложение на рабочем столе (по `app_component`) */
	onOpenInstalledApp?: (appComponent: string) => void;
	onOpenInFullWindow?: () => void;
	variant?: 'modal' | 'page';
	/** Как на рабочем столе / в меню Пуск (glass, graphite, …) */
	iconStyle?: DesktopIconStyle;
	expansionState?: DesktopExpansionDiscoveryState;
	/** MobileAndroid embedded WebView — compact shell, native toolbar owns title. */
	embeddedMobile?: boolean;
}

export const AppStore: FC<AppStoreProps> = ({
	isOpen,
	onClose,
	apps = [],
	isLoading,
	catalogError = null,
	onInstall,
	onUninstall,
	onCatalogRetry,
	onError,
	onSuccess,
	onAppClick,
	onOpenInstalledApp,
	onOpenInFullWindow,
	variant = 'modal',
	iconStyle = 'glass',
	expansionState,
	embeddedMobile,
}) => {
	const embeddedMobileLayout =
		embeddedMobile ?? isMobileAppStoreEmbeddedRoute();
	const catalogGridClass = embeddedMobileLayout
		? 'grid grid-cols-1 gap-4 sm:gap-4'
		: 'grid grid-cols-1 gap-4 sm:gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3';
	const storeCategoryNavClass = embeddedMobileLayout
		? 'relative z-0 flex min-h-0 min-w-0 flex-1 flex-row gap-2 overflow-x-auto overflow-y-hidden px-3 pb-2 [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden'
		: 'relative z-0 flex min-h-0 min-w-0 flex-1 flex-row gap-2 overflow-x-auto overflow-y-hidden px-3 pb-2 [-ms-overflow-style:none] scrollbar-none lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-1.5 lg:overflow-y-auto lg:overflow-x-hidden lg:px-4 lg:pb-2 [&::-webkit-scrollbar]:hidden';
	const { t } = useTranslation('appStore');
	const embeddedModalZ = useEmbeddedPortaledModalZIndex();
	const shellFrame = useDesktopShellFrame();
	const {
		contentPanel,
		navRail,
		filterStrip,
		sectionPanelShadow,
		mainColumnBg,
		premiumHero: premiumHeroClass,
		premiumMetricCard,
		statusChip,
		headerStrip,
		sidebarNavRow,
		sidebarNavIcon,
	} = useAppStoreShellClasses();

	const {
		handleInstall,
		clearInstallError,
		isBusy,
		installStatus,
		getCatalogCardInstallState,
	} = useAppStoreInstallFlow({
		apps,
		onInstall,
		onUninstall,
		onError,
		onSuccess,
		t,
	});

	const catalog = useAppStoreCatalogState({
		apps,
		isOpen,
		isLoading,
		variant,
		onAppClick,
	});

	const modalPanelRef = useRef<HTMLDivElement>(null);
	const reduceMotion = useReducedMotion() ?? false;

	useDesktopModalFocusTrap(
		Boolean(isOpen && variant === 'modal'),
		modalPanelRef
	);

	const storeCardShellClass = useMemo(
		() =>
			cn(
				contentPanel,
				sectionPanelShadow,
				'group relative overflow-hidden rounded-(--desktop-radius-frame)',
				'border border-(--desktop-border-subtle)/60',
				'transition-[box-shadow,border-color,background-color,transform] duration-300 motion-reduce:transition-none',
				'[content-visibility:auto] [contain-intrinsic-size:300px]',
				'focus-within:border-(--mc-accent-40) focus-within:shadow-(--mc-glow-accent-soft)',
				'hover:-translate-y-0.5 hover:border-(--mc-accent-35) hover:shadow-(--as-premium-card-glow)',
				shellFrame === 'glass' &&
					'hover:bg-[color-mix(in_srgb,var(--glass-bg-strong)_62%,transparent_38%)]',
				shellFrame === 'framed' &&
					'hover:bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.82)_0%,rgb(var(--desktop-bg-primary-rgb)/0.76)_100%)]',
				shellFrame === 'minimal' &&
					'hover:bg-[color-mix(in_srgb,var(--glass-bg-strong)_76%,transparent_24%)]'
			),
		[shellFrame, contentPanel, sectionPanelShadow]
	);

	const appStoreModalPanelClass = useMemo(
		() =>
			cn(
				'flex h-[90vh] w-full max-w-7xl flex-col',
				getDesktopShellPanelClassName(shellFrame, 'strong')
			),
		[shellFrame]
	);

	const storeNavAsideClass = useMemo(() => {
		const mobileBottom =
			shellFrame === 'glass'
				? 'border-[var(--glass-border)]'
				: shellFrame === 'framed'
					? 'border-(--desktop-border-strong)'
					: 'border-(--desktop-border-subtle)';
		if (embeddedMobileLayout) {
			return cn(
				navRail,
				'flex max-h-[min(38dvh,16rem)] min-h-0 shrink-0 flex-col overflow-hidden border-b',
				mobileBottom
			);
		}
		const mobileBottomMaxLg =
			shellFrame === 'glass'
				? 'max-lg:border-[var(--glass-border)]'
				: shellFrame === 'framed'
					? 'max-lg:border-(--desktop-border-strong)'
					: 'max-lg:border-(--desktop-border-subtle)';
		return cn(
			navRail,
			'flex max-h-[min(42vh,320px)] min-h-0 shrink-0 flex-col overflow-hidden lg:max-h-none lg:h-full lg:w-[280px]',
			'max-lg:border-r-0 max-lg:border-b',
			mobileBottomMaxLg
		);
	}, [shellFrame, navRail, embeddedMobileLayout]);

	useShellCaptureEscape(
		isOpen && variant === 'modal' && !isBusy && Boolean(onClose),
		() => {
			onClose?.();
		},
		{
			onLayer: () =>
				consumeEscapeForSearchClear(
					catalog.searchQuery,
					catalog.clearSearchQuery
				),
		}
	);

	useEffect(() => {
		if (!isOpen || variant !== 'modal') return;
		const prevFocus = document.activeElement as HTMLElement | null;
		return () => {
			prevFocus?.focus?.();
		};
	}, [isOpen, variant]);

	const handleOpenFullWindow = useCallback(() => {
		onOpenInFullWindow?.();
	}, [onOpenInFullWindow]);

	const renderAppCard = useAppStoreCatalogCardRenderer({
		defaultIconsMap: catalog.defaultIconsMap,
		getCatalogCardInstallState,
		expansionState,
		t,
		debouncedSearch: catalog.debouncedSearch,
		iconStyle,
		storeCardShellClass,
		reduceMotion,
		handleAppNavigate: catalog.handleAppNavigate,
		handleInstall,
		onOpenInstalledApp,
		clearInstallError,
	});

	const handleModalBackdropClick = useCallback(() => {
		if (!isBusy) {
			onClose?.();
		}
	}, [isBusy, onClose]);

	const stopModalMouseDown = useCallback((e: MouseEvent) => {
		e.stopPropagation();
	}, []);

	if (!isOpen) return null;

	const catalogBody = (
		<AppStoreCatalogBody
			t={t}
			variant={variant}
			embeddedMobileLayout={embeddedMobileLayout}
			isLoading={isLoading}
			isBusy={isBusy}
			catalogError={catalogError}
			onCatalogRetry={onCatalogRetry}
			apps={apps}
			installStatus={installStatus}
			iconStyle={iconStyle}
			reduceMotion={reduceMotion}
			renderAppCard={renderAppCard}
			catalog={catalog}
			storeNavAsideClass={storeNavAsideClass}
			storeCategoryNavClass={storeCategoryNavClass}
			catalogGridClass={catalogGridClass}
			contentPanel={contentPanel}
			sectionPanelShadow={sectionPanelShadow}
			statusChip={statusChip}
			filterStrip={filterStrip}
			sidebarNavRow={sidebarNavRow}
			sidebarNavIcon={sidebarNavIcon}
			mainColumnBg={mainColumnBg}
			premiumHeroClass={premiumHeroClass}
			premiumMetricCard={premiumMetricCard}
		/>
	);

	if (variant === 'page') {
		return (
			<DesktopProductWorkspace
				data-app-store-shell
				data-app-store-root={embeddedMobileLayout ? '1' : undefined}
				data-embedded-mobile={embeddedMobileLayout ? '1' : undefined}
				data-testid="app-store-product-workspace"
				className={cn(
					'min-h-0 flex-1',
					embeddedMobileLayout && MOBILE_EMBEDDED_APP_ROOT_CLASS
				)}
				header={
					embeddedMobileLayout ? (
						<h1 className="sr-only">{t('dialog.title')}</h1>
					) : undefined
				}
				contentClassName="overflow-hidden !overflow-y-hidden flex min-h-0 flex-col"
			>
				{catalogBody}
			</DesktopProductWorkspace>
		);
	}

	return (
		<AppStoreModalShell
			isBusy={isBusy}
			isLoading={isLoading}
			onClose={onClose}
			onOpenInFullWindow={onOpenInFullWindow}
			onOpenFullWindow={handleOpenFullWindow}
			onBackdropClick={handleModalBackdropClick}
			onPanelClick={stopModalMouseDown}
			modalPanelRef={modalPanelRef}
			panelClassName={appStoreModalPanelClass}
			headerStripClassName={headerStrip}
			iconStyle={iconStyle}
			embeddedModalZ={embeddedModalZ}
			t={t}
		>
			{catalogBody}
		</AppStoreModalShell>
	);
};

AppStore.displayName = 'AppStore';
export default AppStore;
