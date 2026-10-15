import { useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { AppStoreSuccessPayload } from '../components/AppStore';
import type { StoreAppResponse } from '../services/desktopApi';

export function useDesktopWorkspaceAppStoreLayerState(params: {
	appStoreDetailId: string | null;
	setAppStoreDetailId: (id: string | null) => void;
	storeApps: StoreAppResponse[] | undefined;
	tAppStore: TFunction<'appStore'>;
	toast: {
		error: (title: string, message: string) => void;
		success: (
			title: string,
			message: string,
			options?: {
				toastAction?: { label: string; onClick: () => void };
			}
		) => void;
	};
	openDesktopAppByComponent: (appComponent: string) => unknown;
	closeAppStoreModal: () => void;
}) {
	const {
		appStoreDetailId,
		setAppStoreDetailId,
		storeApps,
		tAppStore,
		toast,
		openDesktopAppByComponent,
		closeAppStoreModal,
	} = params;

	const appStoreDetailFromStore = useMemo(() => {
		if (!appStoreDetailId || !storeApps) return null;
		return storeApps.find((a) => a.app_id === appStoreDetailId) ?? null;
	}, [appStoreDetailId, storeApps]);

	const clearAppStoreDetail = useCallback(() => {
		setAppStoreDetailId(null);
	}, [setAppStoreDetailId]);

	const handleAppStoreLayerError = useCallback(
		(msg: string) => {
			toast.error(tAppStore('toast.errorTitle'), msg);
		},
		[tAppStore, toast]
	);

	const handleAppStoreLayerSuccess = useCallback(
		({ action, appName, appComponent }: AppStoreSuccessPayload) => {
			if (action === 'install' && appComponent) {
				toast.success(
					tAppStore('detail.toastInstalled'),
					tAppStore('toast.appNameSubtitle', { name: appName }),
					{
						toastAction: {
							label: tAppStore('openApp'),
							onClick: () => {
								openDesktopAppByComponent(appComponent);
								closeAppStoreModal();
							},
						},
					}
				);
				return;
			}
			toast.success(
				action === 'uninstall'
					? tAppStore('detail.toastRemoved')
					: tAppStore('detail.toastInstalled'),
				tAppStore('toast.appNameSubtitle', { name: appName })
			);
		},
		[tAppStore, toast, openDesktopAppByComponent, closeAppStoreModal]
	);

	const handleAppStoreLayerOpenInstalled = useCallback(
		(appComponent: string) => {
			openDesktopAppByComponent(appComponent);
			closeAppStoreModal();
		},
		[openDesktopAppByComponent, closeAppStoreModal]
	);

	return {
		appStoreDetailFromStore,
		clearAppStoreDetail,
		handleAppStoreLayerError,
		handleAppStoreLayerSuccess,
		handleAppStoreLayerOpenInstalled,
	};
}
