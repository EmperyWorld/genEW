/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Thin orchestrator for the App Store application detail card — shell chrome,
 * detail controller, then state views vs happy-path body.
 *
 * Invariants:
 * - Install/uninstall делегируются родителю; карточка обновляет локальный `installed` после успеха.
 * - Public export remains `AppStoreCard` / `AppStoreCardProps` for lazy chunk consumers.
 *
 * Related:
 * - appStore/useAppStoreDetailController.ts, appStore/AppStoreDetailBody.tsx,
 *   appStore/AppStoreDetailStateViews.tsx, storeAppMedia.tsx, desktopApi.getStoreApp
 */

import { cn } from '@/utils/cn';
import { useMemo, type ReactElement } from 'react';
import type { DesktopIconStyle } from '@/types/profile';
import type { StoreAppResponse } from '../services/desktopApi';
import { useDesktopShellFrame } from '@/pages/Desktop/context/DesktopShellFrameContext';
import { getDesktopShellPanelClassName } from '../utils/desktopVisualSystem';
import type { DesktopExpansionDiscoveryState } from '../types/desktopExpansion.types';
import { AppStoreDetailBody } from './appStore/AppStoreDetailBody';
import { AppStoreDetailStateViews } from './appStore/AppStoreDetailStateViews';
import { useAppStoreDetailController } from './appStore/useAppStoreDetailController';

export interface AppStoreCardProps {
	appId: string;
	appFromStore: StoreAppResponse | null;
	onBack: () => void;
	onInstall: (appId: string) => Promise<void>;
	onUninstall: (appId: string) => Promise<void>;
	onError?: (message: string) => void;
	/** Открыть установленное приложение на рабочем столе */
	onOpenInstalledApp?: (appComponent: string) => void;
	iconStyle?: DesktopIconStyle;
	expansionState?: DesktopExpansionDiscoveryState;
	/** Root-level desktop shortcut app ids (store `app_id`); modal shell only. */
	appStoreDesktopShortcutIds?: readonly string[];
	/** Другие приложения той же категории для полосы «Похожие». */
	relatedApps?: StoreAppResponse[];
	onRelatedAppClick?: (appId: string) => void;
}

export function AppStoreCard({
	appId,
	appFromStore,
	onBack,
	onInstall,
	onUninstall,
	onError,
	onOpenInstalledApp,
	iconStyle = 'glass',
	expansionState,
	appStoreDesktopShortcutIds,
	relatedApps = [],
	onRelatedAppClick,
}: AppStoreCardProps): ReactElement {
	const shellFrame = useDesktopShellFrame();
	const detailShellClass = useMemo(
		() =>
			cn(
				'w-full max-w-3xl overflow-hidden',
				getDesktopShellPanelClassName(shellFrame, 'standard'),
				'ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.1)]',
				'shadow-(--as-premium-card-glow)'
			),
		[shellFrame]
	);

	const ctrl = useAppStoreDetailController({
		appId,
		appFromStore,
		onBack,
		onInstall,
		onUninstall,
		onError,
		onOpenInstalledApp,
		expansionState,
		appStoreDesktopShortcutIds,
	});

	if (ctrl.loading || !ctrl.detail) {
		return (
			<AppStoreDetailStateViews
				detailShellClass={detailShellClass}
				loading={ctrl.loading}
				loadError={ctrl.loadError}
				hasDetail={Boolean(ctrl.detail)}
				onBack={onBack}
				onRetry={() => void ctrl.fetchDetailFromApi()}
				t={ctrl.t}
			/>
		);
	}

	return (
		<AppStoreDetailBody
			detailShellClass={detailShellClass}
			detail={ctrl.detail}
			t={ctrl.t}
			onBack={onBack}
			iconStyle={iconStyle}
			relatedApps={relatedApps}
			onRelatedAppClick={onRelatedAppClick}
			defaultIcon={ctrl.defaultApp?.icon}
			defaultAppsMap={ctrl.defaultAppsMap}
			categoryLabel={ctrl.categoryLabel}
			billingCaption={ctrl.billingCaption}
			heroGradient={ctrl.heroGradient}
			windowsPolicyLabel={ctrl.windowsPolicyLabel}
			minWindowSize={ctrl.minWindowSize}
			inMaintenance={ctrl.inMaintenance}
			maintenanceHint={ctrl.maintenanceHint}
			workspaceNames={ctrl.workspaceNames}
			collectionNames={ctrl.collectionNames}
			isShortcutOnDesktop={ctrl.isShortcutOnDesktop}
			winMax={ctrl.winMax}
			allowsMultipleInstances={ctrl.allowsMultipleInstances}
			showTechnicalDetails={ctrl.showTechnicalDetails}
			billingExempt={ctrl.billingExempt}
			ewPrice={ctrl.ewPrice}
			trialDays={ctrl.trialDays}
			cannotUninstall={ctrl.cannotUninstall}
			uninstallBlockedTitle={ctrl.uninstallBlockedTitle}
			allowInstall={ctrl.allowInstall}
			installPrimaryLabel={ctrl.installPrimaryLabel}
			busy={ctrl.busy}
			busyAction={ctrl.busyAction}
			busyLabel={ctrl.busyLabel}
			onOpenInstalledApp={onOpenInstalledApp}
			handleInstall={ctrl.handleInstall}
			handleOpenInstalled={ctrl.handleOpenInstalled}
			handleCopyDeepLink={ctrl.handleCopyDeepLink}
		/>
	);
}
