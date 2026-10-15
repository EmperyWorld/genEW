import { useMemo } from 'react';
import type { DesktopWorkspaceAppStoreLayerProps } from '../components/DesktopWorkspaceAppStoreLayer';
import type { DesktopWorkspaceHelpAndSessionProps } from '../components/DesktopWorkspaceOverlays';

export function useDesktopWorkspaceShellAuxLayerProps(params: {
	showShortcutsHelp: boolean;
	onCloseShortcutsHelp: () => void;
	showSessionInfoPanel: DesktopWorkspaceHelpAndSessionProps['showSessionInfoPanel'];
	shellWindowStyle: DesktopWorkspaceHelpAndSessionProps['shellWindowStyle'];
	onCloseSessionPanel: DesktopWorkspaceHelpAndSessionProps['onCloseSessionPanel'];
	onOpenProfile?: DesktopWorkspaceHelpAndSessionProps['onOpenProfile'];
	showAppStore: DesktopWorkspaceAppStoreLayerProps['showAppStore'];
	appStoreDetailId: DesktopWorkspaceAppStoreLayerProps['appStoreDetailId'];
	appStoreDetailFromStore: DesktopWorkspaceAppStoreLayerProps['appStoreDetailFromStore'];
	storeApps: DesktopWorkspaceAppStoreLayerProps['storeApps'];
	installedAppsLoading: DesktopWorkspaceAppStoreLayerProps['installedAppsLoading'];
	desktopIconStyle: DesktopWorkspaceAppStoreLayerProps['desktopIconStyle'];
	onCloseModal: DesktopWorkspaceAppStoreLayerProps['onCloseModal'];
	onBackFromDetail: DesktopWorkspaceAppStoreLayerProps['onBackFromDetail'];
	onSetAppStoreDetailId: DesktopWorkspaceAppStoreLayerProps['onSetAppStoreDetailId'];
	onInstall: DesktopWorkspaceAppStoreLayerProps['onInstall'];
	onUninstall: DesktopWorkspaceAppStoreLayerProps['onUninstall'];
	onAppStoreError: DesktopWorkspaceAppStoreLayerProps['onAppStoreError'];
	onAppStoreSuccess: DesktopWorkspaceAppStoreLayerProps['onAppStoreSuccess'];
	onOpenInstalledApp: DesktopWorkspaceAppStoreLayerProps['onOpenInstalledApp'];
	expansionState?: DesktopWorkspaceAppStoreLayerProps['expansionState'];
	appStoreDesktopShortcutIds?: DesktopWorkspaceAppStoreLayerProps['appStoreDesktopShortcutIds'];
}): {
	helpAndSession: DesktopWorkspaceHelpAndSessionProps;
	appStoreLayer: DesktopWorkspaceAppStoreLayerProps;
} {
	const {
		showShortcutsHelp,
		onCloseShortcutsHelp,
		showSessionInfoPanel,
		shellWindowStyle,
		onCloseSessionPanel,
		onOpenProfile,
		showAppStore,
		appStoreDetailId,
		appStoreDetailFromStore,
		storeApps,
		installedAppsLoading,
		desktopIconStyle,
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
	} = params;

	return useMemo(
		() => ({
			helpAndSession: {
				shortcutsHelp: {
					isOpen: showShortcutsHelp,
					onClose: onCloseShortcutsHelp,
				},
				showSessionInfoPanel,
				shellWindowStyle,
				onCloseSessionPanel,
				onOpenProfile,
			},
			appStoreLayer: {
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
			},
		}),
		[
			showShortcutsHelp,
			onCloseShortcutsHelp,
			showSessionInfoPanel,
			shellWindowStyle,
			onCloseSessionPanel,
			onOpenProfile,
			showAppStore,
			appStoreDetailId,
			appStoreDetailFromStore,
			storeApps,
			installedAppsLoading,
			desktopIconStyle,
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
		]
	);
}
