/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Typed prop groups for the T31 chrome/modals layout bridge — reduces flat
 * prop fan-out in DesktopWorkspaceContent before useDesktopWorkspaceShellLayoutInputBridge.
 *
 * Invariants:
 * - Groups partition DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSliceInput without overlap.
 * - Field names match the flat slice input contract exactly.
 *
 * Related:
 * - hooks/useDesktopWorkspaceShellLayoutChromeAndModalsInput.ts
 * - hooks/useDesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import type { SocialHubLaunchTab } from '../hooks/useDesktopWorkspaceAppLaunch';
import type { DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSliceInput } from '../hooks/useDesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice';

type ChromeInput =
	DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSliceInput;

/** Taskbar chrome, viewport compaction and start-menu workspace context. */
export type DesktopWorkspaceShellLayoutChromeTaskbarViewportGroup = Pick<
	ChromeInput,
	| 'isMobile'
	| 'handleTaskbarWinClick'
	| 'handlePinAppFromStartMenu'
	| 'openAppStoreAsWindow'
	| 'desktopTaskbarStyle'
	| 'desktopPanelOpacity'
	| 'taskbarAppBadgeCounts'
	| 'onUnpinAppFromDesktop'
	| 'onOpenAppInWorkspace'
	| 'onStartMenuOpenRecentFile'
	| 'onStartMenuRemoveRecentFile'
	| 'startMenuWorkspaceContextWindows'
	| 'getWindowsOnDesktop'
	| 'apps'
	| 'notificationCenterOpenNonce'
	| 'minimizedPersistentSurfaceApps'
	| 'bumpNotificationCenterOpen'
>;

/** Expansion settings shell-state and launch actions for profiles/collections. */
export type DesktopWorkspaceShellLayoutChromeExpansionAndLaunchGroup = Pick<
	ChromeInput,
	'expansionState' | 'expansionLaunchActions'
>;

/** Window session, virtual desktop switching and app launch from shell chrome. */
export type DesktopWorkspaceShellLayoutChromeWindowsAndSessionGroup = Pick<
	ChromeInput,
	| 'displayItems'
	| 'handleOpenWindow'
	| 'activeDesktopWindowId'
	| 'currentDesktopWindows'
	| 'desktopIconStyle'
	| 'focusWindow'
	| 'desktopWindowStyle'
	| 'activeDesktopWindow'
	| 'createDesktop'
	| 'switchToNextDesktop'
	| 'switchToPreviousDesktop'
	| 'minimizeAllWindows'
	| 'openDesktopAppByComponent'
	| 'openSocialHubTab'
>;

/** Overlay panels: task switcher, quick search, clipboard, wallpaper picker, voice. */
export type DesktopWorkspaceShellLayoutChromeOverlayStateGroup = Pick<
	ChromeInput,
	| 'showTaskSwitcher'
	| 'setShowTaskSwitcher'
	| 'showQuickSearch'
	| 'setShowQuickSearch'
	| 'showShortcutsHelp'
	| 'showSessionInfoPanel'
	| 'setShowShortcutsHelp'
	| 'setShowSessionInfoPanel'
	| 'setShowWelcome'
	| 'showCommandPalette'
	| 'setShowCommandPalette'
	| 'showClipboard'
	| 'setShowClipboard'
	| 'showWP'
	| 'setShowWP'
	| 'showNF'
	| 'setShowNF'
	| 'openVoiceCommandCenter'
>;

/** App Store modal layer and install/uninstall handlers. */
export type DesktopWorkspaceShellLayoutChromeAppStoreGroup = Pick<
	ChromeInput,
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
>;

/** Quick Search MRU, recent files and content-library feed for search overlays. */
export type DesktopWorkspaceShellLayoutChromeSearchAndRecentsGroup = Pick<
	ChromeInput,
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
	| 'addRecentFile'
	| 'removeRecentFile'
>;

/** Clipboard, item commit and folder/create-file dialog actions. */
export type DesktopWorkspaceShellLayoutChromeClipboardAndFolderActionsGroup =
	Pick<
		ChromeInput,
		| 'setCtx'
		| 'commitItems'
		| 'setRenamingId'
		| 'copyItems'
		| 'cutItems'
		| 'pasteClipboard'
		| 'openEditFolderIconDialog'
		| 'onCloseNewFolder'
		| 'handleCreateFolder'
		| 'createMarkdownFile'
	>;

/** Shell settings navigation, theme toggle and wallpaper handlers. */
export type DesktopWorkspaceShellLayoutChromeShellSettingsAndWallpaperGroup =
	Pick<
		ChromeInput,
		| 'updateConfig'
		| 'toggleExplicitTheme'
		| 'closeShellSettingsWindow'
		| 'openShellSettings'
		| 'onOpenShellWorkspacesSettings'
		| 'wallpaper'
		| 'wallpaperHistory'
		| 'handleWallpaperChange'
		| 'handleRemoveUserWallpaper'
		| 'openWallpaperFromDesktopSettings'
	>;

/** Grouped input for useDesktopWorkspaceShellLayoutChromeAndModalsInput. */
export type DesktopWorkspaceShellLayoutChromeAndModalsBridgeInput = {
	taskbarViewport: DesktopWorkspaceShellLayoutChromeTaskbarViewportGroup;
	expansionAndLaunch: DesktopWorkspaceShellLayoutChromeExpansionAndLaunchGroup;
	windowsAndSession: DesktopWorkspaceShellLayoutChromeWindowsAndSessionGroup;
	overlayState: DesktopWorkspaceShellLayoutChromeOverlayStateGroup;
	appStore: DesktopWorkspaceShellLayoutChromeAppStoreGroup;
	searchAndRecents: DesktopWorkspaceShellLayoutChromeSearchAndRecentsGroup;
	clipboardAndFolderActions: DesktopWorkspaceShellLayoutChromeClipboardAndFolderActionsGroup;
	shellSettingsAndWallpaper: DesktopWorkspaceShellLayoutChromeShellSettingsAndWallpaperGroup;
};
