/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Контент окна «Магазин приложений» на рабочем столе — каталог и деталь с анимацией.
 *
 * Invariants:
 * - Без смены hash; навигация только внутри окна через AppStoreViewStack.
 *
 * Related:
 * - AppStoreViewStack.tsx, desktopWindowAppContent.tsx
 */

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { guideTourLabelsFromI18n } from '@/components/guided-tour/guideTourLabelsFromI18n';
import { SpotlightGuideModal } from '@/components/guided-tour/SpotlightGuideModal';
import { useBuiltGuideSteps } from '@/components/guided-tour/useBuiltGuideSteps';
import { useDesktopGuideTourOpener } from '@/pages/Desktop/hooks/useDesktopGuideTourOpener';
import { useUserPreferencesApp } from '../../../contexts/UserPreferencesAppContext';
import {
	DEFAULT_UI_PREFERENCES,
	normalizeDesktopIconStyle,
} from '../../../types/profile';
import { useDesktopInstalledApps } from '../hooks/useDesktopInstalledApps';
import { notify as toast } from '@/notifications';
import { requestOpenDesktopApp } from '../utils/desktopDeepLink';
import type { AppStoreSuccessPayload } from './AppStore';
import { AppStoreViewStack } from './AppStoreViewStack';
import { DesktopAppContentWrapper } from './DesktopAppChrome';
import {
	APP_STORE_GUIDE_AUDIO_LS_KEY,
	APP_STORE_GUIDE_ROOT_ID,
	APP_STORE_GUIDE_STEP_DEFS,
	APP_STORE_GUIDE_TOUR_FOLDER,
} from './appStoreGuideConstants';

export function AppStoreWindowContent({
	embeddedMobile = false,
}: {
	embeddedMobile?: boolean;
} = {}): ReactElement {
	const { t } = useTranslation('appStore');
	const prefsCtx = useUserPreferencesApp();
	const desktopIconStyle = normalizeDesktopIconStyle(
		prefsCtx?.preferences?.ui.desktop_icon_style ??
			DEFAULT_UI_PREFERENCES.desktop_icon_style
	);
	const { storeApps, installApp, uninstallApp, refetch, isLoading, error } =
		useDesktopInstalledApps([]);
	const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

	const guideLabels = useMemo(() => guideTourLabelsFromI18n(t, 'guide'), [t]);
	const guideSteps = useBuiltGuideSteps(
		t,
		'guide.steps',
		APP_STORE_GUIDE_STEP_DEFS
	);
	const [guideOpen, setGuideOpen] = useState(false);
	const openGuideTour = useCallback(() => setGuideOpen(true), []);
	useDesktopGuideTourOpener(openGuideTour, { enabled: !embeddedMobile });
	const prepareGuideStep = useCallback((stepId: string) => {
		if (stepId === 'catalog') setSelectedAppId(null);
	}, []);

	const appFromStore = useMemo(() => {
		if (!selectedAppId || !storeApps) return null;
		return storeApps.find((a) => a.app_id === selectedAppId) ?? null;
	}, [selectedAppId, storeApps]);

	const onError = useCallback(
		(message: string) => {
			console.warn('[AppStoreWindow] Error', { message });
			if (embeddedMobile) {
				return;
			}
			toast.error(t('toast.errorTitle'), message);
		},
		[embeddedMobile, t]
	);

	const onSuccess = useCallback(
		({ action, appName, appComponent }: AppStoreSuccessPayload) => {
			if (action === 'install' && appComponent && !embeddedMobile) {
				toast.success(
					t('detail.toastInstalled'),
					t('toast.appNameSubtitle', { name: appName }),
					{
						toastAction: {
							label: t('openApp'),
							onClick: () => requestOpenDesktopApp({ appComponent }),
						},
					}
				);
				return;
			}
			toast.success(
				action === 'uninstall'
					? t('detail.toastRemoved')
					: t('detail.toastInstalled'),
				t('toast.appNameSubtitle', { name: appName })
			);
		},
		[embeddedMobile, t]
	);

	const onOpenInstalledApp = useCallback(
		(appComponent: string) => {
			if (embeddedMobile) return;
			requestOpenDesktopApp({ appComponent });
		},
		[embeddedMobile]
	);

	return (
		<DesktopAppContentWrapper
			appComponent="AppStore"
			id={APP_STORE_GUIDE_ROOT_ID}
			className="relative h-full min-h-0 overflow-hidden"
		>
			<AppStoreViewStack
				selectedAppId={selectedAppId}
				appFromStore={appFromStore}
				storeApps={storeApps}
				isLoading={isLoading}
				catalogError={error}
				iconStyle={desktopIconStyle}
				onSelectAppId={setSelectedAppId}
				onInstall={installApp}
				onUninstall={uninstallApp}
				onCatalogRetry={refetch}
				onError={onError}
				onSuccess={onSuccess}
				onOpenInstalledApp={onOpenInstalledApp}
				embeddedMobile={embeddedMobile}
			/>
			{!embeddedMobile ? (
				<SpotlightGuideModal
					open={guideOpen}
					onClose={() => setGuideOpen(false)}
					rootId={APP_STORE_GUIDE_ROOT_ID}
					steps={guideSteps}
					audioLocalStorageKey={APP_STORE_GUIDE_AUDIO_LS_KEY}
					tourAudioFolder={APP_STORE_GUIDE_TOUR_FOLDER}
					labels={guideLabels}
					onPrepareStep={prepareGuideStep}
					spotlightLayoutKey={`${selectedAppId ?? 'catalog'}-${guideOpen}`}
					dialogTitleId="app-store-guide-title"
				/>
			) : null}
		</DesktopAppContentWrapper>
	);
}
