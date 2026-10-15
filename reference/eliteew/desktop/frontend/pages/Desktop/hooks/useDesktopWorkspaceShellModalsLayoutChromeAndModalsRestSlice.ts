/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * T24: builds the chrome/modals slice for desktop shell layout slots: taskbar,
 * search overlays, aux layer and modal chain.
 *
 * Invariants:
 * - Derived callbacks like session-info opening are created here from overlay state setters.
 * - Overridden taskbar fields are not required from callers of this slice.
 *
 * Related:
 * - `hooks/useDesktopWorkspaceShellModalsAndLayoutSlotsCluster.ts`
 * - `hooks/useDesktopWorkspaceShellLayoutSlotsCluster.ts`
 */

import { useCallback } from 'react';
import type { SocialHubLaunchTab } from './useDesktopWorkspaceAppLaunch';
import type { DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams } from './useDesktopWorkspaceShellModalsAndLayoutSlotsCluster';

type P = DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams;

export type DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice = Pick<
	P,
	| 'showVirtualDesktopStrip'
	| 'windows'
	| 'apps'
	| 'notificationCenterOpenNonce'
	| 'onWinClick'
	| 'onOpenApp'
	| 'onShowShortcuts'
	| 'onOpenDesktopWelcomeTour'
	| 'onOpenSessionInfo'
	| 'onOpenProfile'
	| 'onPinAppToDesktop'
	| 'onAppStore'
	| 'activeWindowId'
	| 'compact'
	| 'visualStyle'
	| 'panelOpacity'
	| 'shellWindowStyle'
	| 'iconStyle'
	| 'appBadgeCounts'
	| 'minimizedPersistentSurfaceApps'
	| 'expansionState'
	| 'expansionLaunchActions'
	| 'showTaskSwitcher'
	| 'setShowTaskSwitcher'
	| 'showQuickSearch'
	| 'setShowQuickSearch'
	| 'recordRecentApp'
	| 'recentItemsForSearch'
	| 'recentFiles'
	| 'recentLibraryOpened'
	| 'recentLibraryAdded'
	| 'recentLibraryGenerated'
	| 'recentLibraryUploaded'
	| 'recentLibraryProjects'
	| 'recentContentFeedLoading'
	| 'recentContentFeedError'
	| 'recentContentFeedLoadedAt'
	| 'hasRecentContentFeedItems'
	| 'onRefetchRecentContentFeed'
	| 'onOpenShellWorkspacesSettings'
	| 'addRecentFile'
	| 'removeRecentFile'
	| 'setShowShortcutsHelp'
	| 'openShellSettings'
	| 'bumpNotificationCenterOpen'
	| 'displayItems'
	| 'handleOpenWindow'
	| 'currentDesktopWindows'
	| 'activeDesktopWindowId'
	| 'desktopIconStyle'
	| 'focusWindow'
	| 'desktopWindowStyle'
	| 'showShortcutsHelp'
	| 'showSessionInfoPanel'
	| 'showAppStore'
	| 'appStoreDetailId'
	| 'appStoreDetailFromStore'
	| 'storeApps'
	| 'installedAppsLoading'
	| 'onCloseModal'
	| 'onBackFromDetail'
	| 'onSetAppStoreDetailId'
	| 'onInstall'
	| 'onUninstall'
	| 'onAppStoreError'
	| 'onAppStoreSuccess'
	| 'onOpenInstalledApp'
	| 'appStoreDesktopShortcutIds'
	| 'setCtx'
	| 'setShowNF'
	| 'setShowSessionInfoPanel'
	| 'commitItems'
	| 'setRenamingId'
	| 'copyItems'
	| 'cutItems'
	| 'pasteClipboard'
	| 'updateConfig'
	| 'activeDesktopWindow'
	| 'createDesktop'
	| 'switchToNextDesktop'
	| 'switchToPreviousDesktop'
	| 'toggleExplicitTheme'
	| 'closeShellSettingsWindow'
	| 'setShowWP'
	| 'openVoiceCommandCenter'
	| 'setShowClipboard'
	| 'showWP'
	| 'wallpaper'
	| 'wallpaperHistory'
	| 'handleWallpaperChange'
	| 'handleRemoveUserWallpaper'
	| 'openWallpaperFromDesktopSettings'
	| 'showNF'
	| 'onCloseNewFolder'
	| 'handleCreateFolder'
	| 'openEditFolderIconDialog'
	| 'showCommandPalette'
	| 'setShowCommandPalette'
	| 'showClipboard'
	| 'minimizeAllWindows'
	| 'openDesktopAppByComponent'
	| 'createMarkdownFile'
	| 'onUnpinAppFromDesktop'
	| 'onOpenAppInWorkspace'
	| 'onStartMenuOpenRecentFile'
	| 'onStartMenuRemoveRecentFile'
	| 'startMenuWorkspaceContextWindows'
	| 'getWindowsOnDesktop'
>;

type ChromeRestOverriddenKeys =
	| 'showVirtualDesktopStrip'
	| 'windows'
	| 'onWinClick'
	| 'onOpenApp'
	| 'onShowShortcuts'
	| 'onOpenDesktopWelcomeTour'
	| 'onOpenSessionInfo'
	| 'onOpenProfile'
	| 'onPinAppToDesktop'
	| 'onAppStore'
	| 'activeWindowId'
	| 'compact'
	| 'visualStyle'
	| 'panelOpacity'
	| 'shellWindowStyle'
	| 'iconStyle'
	| 'appBadgeCounts';

type ChromeRestWorkspaceFields = {
	isMobile: boolean;
	handleTaskbarWinClick: P['onWinClick'];
	handlePinAppFromStartMenu: P['onPinAppToDesktop'];
	openAppStoreAsWindow: P['onAppStore'];
	desktopTaskbarStyle: P['visualStyle'];
	desktopPanelOpacity: P['panelOpacity'];
	taskbarAppBadgeCounts: P['appBadgeCounts'];
	setShowWelcome: (value: boolean) => void;
	openSocialHubTab: (tab?: SocialHubLaunchTab) => void;
};

export type DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSliceInput =
	Pick<
		P,
		Exclude<
			keyof DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice,
			| ChromeRestOverriddenKeys
			| 'onShowShortcuts'
			| 'onOpenDesktopWelcomeTour'
			| 'onOpenSessionInfo'
			| 'onOpenProfile'
		>
	> &
		ChromeRestWorkspaceFields;

export function useDesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice(
	input: DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSliceInput
): DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice {
	const onShowShortcuts = useCallback(() => {
		input.setShowShortcutsHelp(true);
	}, [input.setShowShortcutsHelp]);
	const onOpenDesktopWelcomeTour = useCallback(() => {
		input.setShowWelcome(true);
	}, [input.setShowWelcome]);
	const onOpenSessionInfo = useCallback(() => {
		input.setShowSessionInfoPanel(true);
	}, [input.setShowSessionInfoPanel]);
	const onOpenProfile = useCallback(() => {
		input.openSocialHubTab('profile');
	}, [input.openSocialHubTab]);

	const {
		isMobile,
		handleTaskbarWinClick,
		handlePinAppFromStartMenu,
		openAppStoreAsWindow,
		desktopTaskbarStyle,
		desktopPanelOpacity,
		taskbarAppBadgeCounts,
		...rest
	} = input;

	return {
		...rest,
		showVirtualDesktopStrip: !isMobile,
		windows: rest.currentDesktopWindows,
		onWinClick: handleTaskbarWinClick,
		onOpenApp: rest.handleOpenWindow,
		onShowShortcuts,
		onOpenDesktopWelcomeTour,
		onOpenSessionInfo,
		onOpenProfile,
		onPinAppToDesktop: handlePinAppFromStartMenu,
		onAppStore: openAppStoreAsWindow,
		activeWindowId: rest.activeDesktopWindowId,
		compact: isMobile,
		visualStyle: desktopTaskbarStyle,
		panelOpacity: desktopPanelOpacity,
		shellWindowStyle: rest.desktopWindowStyle,
		iconStyle: rest.desktopIconStyle,
		appBadgeCounts: taskbarAppBadgeCounts,
	};
}
