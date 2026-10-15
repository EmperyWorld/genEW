/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * T16: flat prop bridge for `useDesktopWorkspaceShellLayoutSlotsBundle`, keeping
 * DesktopWorkspaceContent away from five nested slot literals.
 *
 * Invariants:
 * - Every taskbar/search/aux prop added upstream must be explicitly forwarded here.
 * - `items` is the desktop item source for both canvas and taskbar slots.
 *
 * Related:
 * - `hooks/useDesktopWorkspaceShellLayoutSlotsBundle.ts`
 * - `components/DesktopWorkspaceShellLayout.tsx`
 */

import { useTranslation } from 'react-i18next';

import type { ContextMenuState } from '../types/desktop.types';
import {
	type DesktopWorkspaceShellLayoutSlotsBundleParams,
	useDesktopWorkspaceShellLayoutSlotsBundle,
} from './useDesktopWorkspaceShellLayoutSlotsBundle';
import { withSocialHubDesktopItemsDisplayName } from '@/features/friends/social-hub/socialHubDesktopChrome';
import {
	resolveDesktopWindowDisplayTitle,
	withEwaDesktopItemsDisplayName,
} from '../utils/desktopWindowDisplayTitle';
import { localizeDefaultDesktopAppCatalogItems } from '../utils/localizeDefaultDesktopAppCatalogCopy';

type B = DesktopWorkspaceShellLayoutSlotsBundleParams;

export type DesktopWorkspaceShellLayoutSlotsClusterParams = Omit<
	B['canvas'],
	'clipboardLength' | 'ctxTargetItem' | 'snapToGrid'
> &
	Omit<B['windowSlot'], 'desktopItems'> &
	Omit<B['taskbar'], 'desktopItems'> &
	B['searchOverlays'] &
	B['aux'] & {
		clipboard: { readonly length: number };
		ctx: ContextMenuState;
		snapToGridEnabled: B['canvas']['snapToGrid'];
		onDismissWindowContextMenu: B['windowSlot']['onDismissWindowContextMenu'];
		/** Global desktop wallpaper (config) — Start Menu workspace previews. */
		wallpaper: string;
	};

function applyDesktopPersonaItemLabels(
	items: DesktopWorkspaceShellLayoutSlotsClusterParams['displayItems'],
	windows: DesktopWorkspaceShellLayoutSlotsClusterParams['currentDesktopWindows'],
	socialHubLabels: { name: string; description?: string },
	tAppStore: ReturnType<typeof useTranslation<'appStore'>>['t']
) {
	return localizeDefaultDesktopAppCatalogItems(
		withSocialHubDesktopItemsDisplayName(
			withEwaDesktopItemsDisplayName(items, windows),
			socialHubLabels
		),
		tAppStore
	);
}

export function useDesktopWorkspaceShellLayoutSlotsCluster(
	p: DesktopWorkspaceShellLayoutSlotsClusterParams
): ReturnType<typeof useDesktopWorkspaceShellLayoutSlotsBundle> {
	const { t: tFriends } = useTranslation('contentManager');
	const { t: tAppStore } = useTranslation('appStore');
	const socialHubLabels = {
		name: tFriends('friends.socialHubDesktopAppName'),
		description: tFriends('friends.socialHubDesktopAppDescription'),
	};
	const personaDisplayItems = applyDesktopPersonaItemLabels(
		p.displayItems,
		p.currentDesktopWindows,
		socialHubLabels,
		tAppStore
	);
	const personaTaskbarApps = applyDesktopPersonaItemLabels(
		p.apps,
		p.currentDesktopWindows,
		socialHubLabels,
		tAppStore
	);
	const personaRecentItemsForSearch = applyDesktopPersonaItemLabels(
		p.recentItemsForSearch,
		p.currentDesktopWindows,
		socialHubLabels,
		tAppStore
	);

	return useDesktopWorkspaceShellLayoutSlotsBundle({
		canvas: {
			t: p.t,
			setSelected: p.setSelected,
			handleContextMenu: p.handleContextMenu,
			showWelcome: p.showWelcome,
			onWelcomeComplete: p.onWelcomeComplete,
			showDesktopWidget: p.showDesktopWidget,
			floatingWidgetPerformanceForCanvas: p.floatingWidgetPerformanceForCanvas,
			autoQuietWindowLoad: p.autoQuietWindowLoad,
			isShellSettingsWindowOpen: p.isShellSettingsWindowOpen,
			isWindowDragActive: p.isWindowDragActive,
			currentDesktopWindows: p.currentDesktopWindows,
			desktopUnreadCount: p.desktopUnreadCount,
			markAllAsRead: p.markAllAsRead,
			widgetAvatarUrl: p.widgetAvatarUrl,
			openSocialHubTab: p.openSocialHubTab,
			openShellSettings: p.openShellSettings,
			bumpNotificationCenterOpen: p.bumpNotificationCenterOpen,
			updateDesktopVisualPreferences: p.updateDesktopVisualPreferences,
			desktopWidgetsStyle: p.desktopWidgetsStyle,
			isOnline: p.isOnline,
			isSyncing: p.isSyncing,
			shellStatePipelinePhase: p.shellStatePipelinePhase,
			combinedDesktopPersistenceError: p.combinedDesktopPersistenceError,
			tabConflictDetected: p.tabConflictDetected,
			staleShellStateConflict: p.staleShellStateConflict,
			syncWorkspaceFromServer: p.syncWorkspaceFromServer,
			clearTabConflict: p.clearTabConflict,
			onRecoverStaleShellState: p.onRecoverStaleShellState,
			loadFailure: p.loadFailure,
			clearLoadFailure: p.clearLoadFailure,
			syncToServer: p.syncToServer,
			onFlushPersistPatches: p.onFlushPersistPatches,
			persistQueuedPatches: p.persistQueuedPatches ?? 0,
			isDraggingIcon: p.isDraggingIcon,
			gridStep: p.gridStep,
			showEnhancedContextMenu: p.showEnhancedContextMenu,
			contextMenuPosition: p.contextMenuPosition,
			setShowEnhancedContextMenu: p.setShowEnhancedContextMenu,
			items: p.items,
			selected: p.selected,
			contextMenuType: p.contextMenuType,
			handleAction: p.handleAction,
			clipboardLength: p.clipboard.length,
			iconSizeConfig: p.iconSizeConfig,
			snapToGrid: p.snapToGridEnabled,
			desktopUiScale: p.desktopUiScale,
			ctxTargetItem: p.ctx.targetItem,
			activeWindowAlwaysOnTop: p.activeWindowAlwaysOnTop,
			desktopWindowStyle: p.desktopWindowStyle,
			propertiesItem: p.propertiesItem,
			setPropertiesItem: p.setPropertiesItem,
			displayItems: personaDisplayItems,
			iconSize: p.iconSize,
			desktopIconStyle: p.desktopIconStyle,
			desktopItemBadgeCounts: p.desktopItemBadgeCounts,
			folderChildCounts: p.folderChildCounts,
			folderPreviewByFolderId: p.folderPreviewByFolderId,
			handleDesktopIconSelect: p.handleDesktopIconSelect,
			handleOpenWindow: p.handleOpenWindow,
			handleDragStart: p.handleDragStart,
			handleDesktopIconDragEnd: p.handleDesktopIconDragEnd,
			handleDrag: p.handleDrag,
			handleDropToFolder: p.handleDropToFolder,
			handleDesktopIconRename: p.handleDesktopIconRename,
			handleStartIconRename: p.handleStartIconRename,
			handleCancelIconRename: p.handleCancelIconRename,
			renamingId: p.renamingId,
			iconIsCut: p.iconIsCut,
			activeDropTargetFolderId: p.activeDropTargetFolderId,
			setActiveDropTargetFolderId: p.setActiveDropTargetFolderId,
			handleRubberBandSelection: p.handleRubberBandSelection,
			desktopAreaRef: p.desktopAreaRef,
			openAppStoreAsWindow: p.openAppStoreAsWindow,
			widgetPosition: p.widgetPosition,
			onWidgetPositionCommit: p.onWidgetPositionCommit,
			onBackgroundContentDragOver: p.onBackgroundContentDragOver,
			onBackgroundContentDrop: p.onBackgroundContentDrop,
			onExternalContentDropToFolder: p.onExternalContentDropToFolder,
			widgetsPanel: p.widgetsPanel,
			assistantPropertiesPanelActions: p.assistantPropertiesPanelActions,
			onAssistantPropertiesPanelAction: p.onAssistantPropertiesPanelAction,
		},
		windowSlot: {
			windowContextMenu: p.windowContextMenu,
			onDismissWindowContextMenu: p.onDismissWindowContextMenu,
			reduceMotionWorkspace: p.reduceMotionWorkspace,
			currentDesktopWindows: p.currentDesktopWindows,
			desktops: p.desktops,
			minimizeWindow: p.minimizeWindow,
			maximizeWindow: p.maximizeWindow,
			closeWindow: p.closeWindow,
			moveWindowToDesktop: p.moveWindowToDesktop,
			onOpenShellSettings: p.onOpenShellSettings,
			desktopItems: p.items,
			activeDesktopWindowId: p.activeDesktopWindowId,
			snapZone: p.snapZone,
			moveWindow: p.moveWindow,
			resizeWindow: p.resizeWindow,
			handleWindowDrag: p.handleWindowDrag,
			handleWindowDragCommit: p.handleWindowDragCommit,
			updateSnapZone: p.updateSnapZone,
			getSnapZoneForPosition: p.getSnapZoneForPosition,
			clearSnapZone: p.clearSnapZone,
			snapWindow: p.snapWindow,
			registerBeforeClose: p.registerBeforeClose,
			unregisterBeforeClose: p.unregisterBeforeClose,
			updateWindowPayload: p.updateWindowPayload,
			retargetFolderWindow: p.retargetFolderWindow,
			desktopWindowStyle: p.desktopWindowStyle,
			focusWindow: p.focusWindow,
			installedApps: p.installedApps,
			onBringWindowIntoWorkArea: p.onBringWindowIntoWorkArea,
			onToggleAlwaysOnTop: p.onToggleAlwaysOnTop,
			onDuplicateWindow: p.onDuplicateWindow,
			isWindowDragActive: p.isWindowDragActive,
			activeDesktopId: p.activeDesktopId,
			onVdDropHover: p.onVdDropHover,
			assistantWindowContextSummarizeEnabled:
				p.assistantWindowContextSummarizeEnabled,
			assistantWindowContextGafEnabled: p.assistantWindowContextGafEnabled,
			onWindowContextAssistantSummarize: p.onWindowContextAssistantSummarize,
			onWindowContextAssistantShareGaf: p.onWindowContextAssistantShareGaf,
		},
		taskbar: {
			showVirtualDesktopStrip: p.showVirtualDesktopStrip,
			virtualDesktops: p.virtualDesktops,
			windows: p.windows,
			apps: personaTaskbarApps,
			desktopItems: p.items,
			notificationCenterOpenNonce: p.notificationCenterOpenNonce,
			onWinClick: p.onWinClick,
			onFocusWindow: p.focusWindow,
			onMinimizeWindow: p.minimizeWindow,
			onToggleMaximizeWindow: p.maximizeWindow,
			onCloseWindow: p.closeWindow,
			onOpenApp: p.onOpenApp,
			onWallpaper: p.onWallpaper,
			onShowShortcuts: p.onShowShortcuts,
			onOpenDesktopWelcomeTour: p.onOpenDesktopWelcomeTour,
			onOpenSessionInfo: p.onOpenSessionInfo,
			onOpenAdmin: p.onOpenAdmin,
			onPinAppToDesktop: p.onPinAppToDesktop,
			onAppStore: p.onAppStore,
			desktops: p.desktops,
			moveWindowToDesktop: p.moveWindowToDesktop,
			activeWindowId: p.activeWindowId,
			compact: p.compact,
			visualStyle: p.visualStyle,
			panelOpacity: p.panelOpacity,
			shellWindowStyle: p.shellWindowStyle,
			iconStyle: p.iconStyle,
			appBadgeCounts: p.appBadgeCounts,
			minimizedPersistentSurfaceApps: p.minimizedPersistentSurfaceApps,
			expansionState: p.expansionState,
			expansionLaunchActions: p.expansionLaunchActions,
			startMenuResumeWindows: p.currentDesktopWindows
				.filter((w) => !w.isMinimized)
				.map((w) => ({
					id: w.id,
					title: resolveDesktopWindowDisplayTitle(w),
				})),
			onStartMenuResumeOpenWindow: p.focusWindow,
			recentFiles: p.recentFiles,
			recentLibraryOpened: p.recentLibraryOpened,
			recentLibraryAdded: p.recentLibraryAdded,
			recentLibraryGenerated: p.recentLibraryGenerated,
			recentLibraryUploaded: p.recentLibraryUploaded,
			recentLibraryProjects: p.recentLibraryProjects,
			recentContentFeedLoading: p.recentContentFeedLoading,
			recentContentFeedError: p.recentContentFeedError,
			recentContentFeedLoadedAt: p.recentContentFeedLoadedAt,
			hasRecentContentFeedItems: p.hasRecentContentFeedItems,
			onRefetchRecentContentFeed: p.onRefetchRecentContentFeed,
			onOpenShellWorkspacesSettings: p.onOpenShellWorkspacesSettings,
			onStartMenuOpenRecentFile: p.onStartMenuOpenRecentFile,
			onStartMenuRemoveRecentFile: p.onStartMenuRemoveRecentFile,
			startMenuActiveDesktopId: p.virtualDesktops.activeDesktopId,
			storeApps: p.storeApps,
			onUnpinAppFromDesktop: p.onUnpinAppFromDesktop,
			onOpenAppInWorkspace: p.onOpenAppInWorkspace,
			startMenuGlobalWallpaper: p.wallpaper,
			startMenuWorkspaceContextWindows: p.startMenuWorkspaceContextWindows,
			getWindowsOnDesktop: p.getWindowsOnDesktop,
			shellOverlayConsumesEscape:
				p.showCommandPalette ||
				p.showQuickSearch ||
				p.showTaskSwitcher ||
				p.showShortcutsHelp ||
				p.showWP ||
				p.showNF ||
				p.showClipboard ||
				p.showAppStore,
		},
		searchOverlays: {
			showTaskSwitcher: p.showTaskSwitcher,
			currentDesktopWindows: p.currentDesktopWindows,
			activeDesktopWindowId: p.activeDesktopWindowId,
			desktopIconStyle: p.desktopIconStyle,
			focusWindow: p.focusWindow,
			setShowTaskSwitcher: p.setShowTaskSwitcher,
			showQuickSearch: p.showQuickSearch,
			setShowQuickSearch: p.setShowQuickSearch,
			desktopWindowStyle: p.desktopWindowStyle,
			displayItems: personaDisplayItems,
			handleOpenWindow: p.handleOpenWindow,
			recordRecentApp: p.recordRecentApp,
			recentItemsForSearch: personaRecentItemsForSearch,
			recentFiles: p.recentFiles,
			recentLibraryOpened: p.recentLibraryOpened,
			recentLibraryAdded: p.recentLibraryAdded,
			recentLibraryGenerated: p.recentLibraryGenerated,
			recentLibraryUploaded: p.recentLibraryUploaded,
			recentLibraryProjects: p.recentLibraryProjects,
			recentContentFeedLoading: p.recentContentFeedLoading,
			recentContentFeedError: p.recentContentFeedError,
			onRefetchRecentContentFeed: p.onRefetchRecentContentFeed,
			onStartMenuOpenRecentFile: p.onStartMenuOpenRecentFile,
			addRecentFile: p.addRecentFile,
			removeRecentFile: p.removeRecentFile,
			onPinAppToDesktop: p.onPinAppToDesktop,
			openShellSettings: p.openShellSettings,
			bumpNotificationCenterOpen: p.bumpNotificationCenterOpen,
			setShowShortcutsHelp: p.setShowShortcutsHelp,
		},
		aux: {
			showShortcutsHelp: p.showShortcutsHelp,
			onCloseShortcutsHelp: p.onCloseShortcutsHelp,
			showSessionInfoPanel: p.showSessionInfoPanel,
			shellWindowStyle: p.shellWindowStyle,
			onCloseSessionPanel: p.onCloseSessionPanel,
			onOpenProfile: p.onOpenProfile,
			showAppStore: p.showAppStore,
			appStoreDetailId: p.appStoreDetailId,
			appStoreDetailFromStore: p.appStoreDetailFromStore,
			storeApps: p.storeApps,
			installedAppsLoading: p.installedAppsLoading,
			desktopIconStyle: p.desktopIconStyle,
			onCloseModal: p.onCloseModal,
			onBackFromDetail: p.onBackFromDetail,
			onSetAppStoreDetailId: p.onSetAppStoreDetailId,
			onInstall: p.onInstall,
			onUninstall: p.onUninstall,
			onAppStoreError: p.onAppStoreError,
			onAppStoreSuccess: p.onAppStoreSuccess,
			onOpenInstalledApp: p.onOpenInstalledApp,
			expansionState: p.expansionState,
			appStoreDesktopShortcutIds: p.appStoreDesktopShortcutIds,
		},
	});
}
