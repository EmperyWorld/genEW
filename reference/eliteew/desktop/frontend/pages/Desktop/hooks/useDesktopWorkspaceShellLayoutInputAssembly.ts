/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Assembles DesktopWorkspaceContent shell layout bridge input and delegates to
 * useDesktopWorkspaceShellLayoutInputBridge (extract of nested prop literals).
 *
 * Invariants:
 * - Pass-through only — no field remapping vs prior Content inline object.
 *
 * Related:
 * - hooks/useDesktopWorkspaceShellLayoutInputBridge.ts
 * - DesktopWorkspaceContent.tsx
 */

import { DESKTOP_SETTINGS_SHELL_ANCHORS } from '../constants/desktopSettingsShellAnchors';
import { DESKTOP_FLOATING_WIDGET_POSITION_SEED } from '../constants';
import type { DesktopWorkspaceShellLayoutInputBridgeInput } from './useDesktopWorkspaceShellLayoutInputBridge';
import { useDesktopWorkspaceShellLayoutInputBridge } from './useDesktopWorkspaceShellLayoutInputBridge';
import type { DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams } from './useDesktopWorkspaceShellModalsAndLayoutSlotsCluster';
import type { DesktopWorkspaceContentHeadClusterResult } from './useDesktopWorkspaceContentHeadCluster';

/** Head cluster output plus tail-only deps for the layout bridge builder. */
export type DesktopWorkspaceShellLayoutInputAssemblySources =
	DesktopWorkspaceContentHeadClusterResult & {
		desktopWidgetsPanelProps: DesktopWorkspaceShellLayoutInputBridgeInput['canvasAndInteractions']['widgetsAndDrop']['widgetsPanel'];
		onBackgroundContentDragOver: DesktopWorkspaceShellLayoutInputBridgeInput['canvasAndInteractions']['widgetsAndDrop']['onBackgroundContentDragOver'];
		onBackgroundContentDrop: DesktopWorkspaceShellLayoutInputBridgeInput['canvasAndInteractions']['widgetsAndDrop']['onBackgroundContentDrop'];
		onExternalContentDropToFolder: DesktopWorkspaceShellLayoutInputBridgeInput['canvasAndInteractions']['widgetsAndDrop']['onExternalContentDropToFolder'];
		openWorkspaceProfile: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['expansionAndLaunch']['expansionLaunchActions']['onOpenWorkspaceProfile'];
		openAppInWorkspaceProfile: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['taskbarViewport']['onOpenAppInWorkspace'];
		openRecentDesktopFile: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['taskbarViewport']['onStartMenuOpenRecentFile'];
		openAppCollection: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['expansionAndLaunch']['expansionLaunchActions']['onOpenAppCollection'];
		openContentShortcut: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['expansionAndLaunch']['expansionLaunchActions']['onOpenContentShortcut'];
		openAssistantContextAction: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['expansionAndLaunch']['expansionLaunchActions']['onOpenAssistantAction'];
		openGafChatBySession: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['expansionAndLaunch']['expansionLaunchActions']['onOpenGafChatById'];
		assistantPropertiesPanelActions: DesktopWorkspaceShellLayoutInputBridgeInput['canvasAndInteractions']['assistant']['assistantPropertiesPanelActions'];
		onAssistantPropertiesPanelAction: DesktopWorkspaceShellLayoutInputBridgeInput['canvasAndInteractions']['assistant']['onAssistantPropertiesPanelAction'];
		assistantWindowContextSummarizeEnabled: DesktopWorkspaceShellLayoutInputBridgeInput['canvasAndInteractions']['assistant']['assistantWindowContextSummarizeEnabled'];
		assistantWindowContextGafEnabled: DesktopWorkspaceShellLayoutInputBridgeInput['canvasAndInteractions']['assistant']['assistantWindowContextGafEnabled'];
		onWindowContextAssistantSummarize: DesktopWorkspaceShellLayoutInputBridgeInput['canvasAndInteractions']['assistant']['onWindowContextAssistantSummarize'];
		onWindowContextAssistantShareGaf: DesktopWorkspaceShellLayoutInputBridgeInput['canvasAndInteractions']['assistant']['onWindowContextAssistantShareGaf'];
		handlePinAppFromStartMenu: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['taskbarViewport']['handlePinAppFromStartMenu'];
		handleUnpinAppFromStartMenu: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['taskbarViewport']['onUnpinAppFromDesktop'];
		openAppStoreAsWindow: DesktopWorkspaceShellLayoutInputBridgeInput['canvasAndInteractions']['shellSurface']['openAppStoreAsWindow'];
		unifiedAdminDesktopItem: DesktopWorkspaceShellLayoutInputBridgeInput['derived']['shellSettingsAndAdmin']['unifiedAdminDesktopItem'];
		appStoreDetailFromStore: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['appStore']['appStoreDetailFromStore'];
		clearAppStoreDetail: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['appStore']['onBackFromDetail'];
		handleAppStoreLayerError: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['appStore']['onAppStoreError'];
		handleAppStoreLayerSuccess: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['appStore']['onAppStoreSuccess'];
		handleAppStoreLayerOpenInstalled: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['appStore']['onOpenInstalledApp'];
		handleInstallApp: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['appStore']['onInstall'];
		handleUninstallApp: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['appStore']['onUninstall'];
		appStoreDesktopShortcutIds: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['appStore']['appStoreDesktopShortcutIds'];
		openVoiceCommandCenter: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['overlayState']['openVoiceCommandCenter'];
		openWallpaperFromDesktopSettings: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['shellSettingsAndWallpaper']['openWallpaperFromDesktopSettings'];
		handleWallpaperChange: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['shellSettingsAndWallpaper']['handleWallpaperChange'];
		handleRemoveUserWallpaper: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['shellSettingsAndWallpaper']['handleRemoveUserWallpaper'];
		onCloseNewFolder: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['clipboardAndFolderActions']['onCloseNewFolder'];
		handleCreateFolderForDialog: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['clipboardAndFolderActions']['handleCreateFolder'];
		openEditFolderIconDialog: DesktopWorkspaceShellLayoutInputBridgeInput['chromeAndModalsRest']['clipboardAndFolderActions']['openEditFolderIconDialog'];
	};

/** Pass-through nesting of the former Content inline bridge literal. */
export function buildDesktopWorkspaceShellLayoutInputBridgeInput(
	sources: DesktopWorkspaceShellLayoutInputAssemblySources
): DesktopWorkspaceShellLayoutInputBridgeInput {
	const {
		t,
		setSelected,
		handleContextMenu,
		showWelcome,
		onWelcomeComplete,
		showDesktopWidget,
		floatingWidgetPerformanceForCanvas,
		autoQuietWindowLoad,
		isShellSettingsWindowOpen,
		desktopUnreadCount,
		markAllAsRead,
		widgetAvatarUrl,
		openSocialHubTab,
		updateDesktopVisualPreferences,
		desktopVisualPreferences,
		reduceMotionWorkspace,
		isWindowDragActive,
		openAppStoreAsWindow,
		isOnline,
		isSyncing,
		persistQueueFlushing,
		shellStatePipelinePhase,
		canvasSyncPersistenceError,
		tabConflictDetected,
		staleShellStateConflict,
		syncWorkspaceFromServer,
		performWorkspaceRefresh,
		clearTabConflict,
		recoverStaleShellState,
		loadFailure,
		clearLoadFailure,
		syncToServer,
		flushPersistPatches,
		persistPatchStats,
		widgetOutboxPendingCount = 0,
		isDraggingIcon,
		gridStep,
		showEnhancedContextMenu,
		contextMenuPosition,
		setShowEnhancedContextMenu,
		items,
		selected,
		contextMenuType,
		clipboard,
		iconSize,
		snapToGridEnabled,
		desktopUiScale,
		ctx,
		propertiesItem,
		setPropertiesItem,
		desktopItemBadgeCounts,
		folderChildCounts,
		folderPreviewByFolderId,
		handleDesktopIconSelect,
		handleDragStart,
		handleDesktopIconDragEnd,
		handleDrag,
		handleDropToFolder,
		handleDesktopIconRename,
		handleStartIconRename,
		handleCancelIconRename,
		renamingId,
		iconIsCut,
		activeDropTargetFolderId,
		setActiveDropTargetFolderId,
		handleRubberBandSelection,
		desktopAreaRef,
		windowContextMenu,
		activeDesktopId,
		onVdDropHover,
		desktops,
		minimizeWindow,
		maximizeWindow,
		closeWindow,
		toggleWindowAlwaysOnTop,
		handleDuplicateWindow,
		activeDesktopWindow,
		moveWindowToDesktop,
		openShellSettings,
		snapZone,
		moveWindow,
		resizeWindow,
		handleWindowDrag,
		trackedHandleWindowDragCommit,
		updateSnapZone,
		getSnapZoneForPosition,
		clearSnapZone,
		snapWindow,
		registerBeforeClose,
		unregisterBeforeClose,
		updateWindowPayload,
		retargetFolderWindow,
		installedApps,
		bringWindowIntoWorkAreaById,
		config,
		updateConfig,
		onBackgroundContentDragOver,
		onBackgroundContentDrop,
		onExternalContentDropToFolder,
		desktopWidgetsPanelProps,
		assistantWindowContextSummarizeEnabled,
		assistantWindowContextGafEnabled,
		onWindowContextAssistantSummarize,
		onWindowContextAssistantShareGaf,
		assistantPropertiesPanelActions,
		onAssistantPropertiesPanelAction,
		isMobile,
		handleTaskbarWinClick,
		handlePinAppFromStartMenu,
		handleUnpinAppFromStartMenu,
		openAppInWorkspaceProfile,
		openRecentDesktopFile,
		removeRecentFile,
		windows,
		getWindowsOnDesktop,
		desktopTaskbarStyle,
		taskbarAppBadgeCounts,
		notificationCenterOpenNonce,
		minimizedPersistentSurfaceApps,
		bumpNotificationCenterOpen,
		expansionSettings,
		openWorkspaceProfile,
		openAppCollection,
		openContentShortcut,
		openAssistantContextAction,
		openGafChatBySession,
		displayItems,
		handleOpenWindow,
		activeDesktopWindowId,
		currentDesktopWindows,
		desktopIconStyle,
		focusWindow,
		desktopWindowStyle,
		createDesktop,
		switchToNextDesktop,
		switchToPreviousDesktop,
		minimizeAllWindows,
		openDesktopAppByComponent,
		showTaskSwitcher,
		setShowTaskSwitcher,
		showQuickSearch,
		setShowQuickSearch,
		showShortcutsHelp,
		showSessionInfoPanel,
		setShowShortcutsHelp,
		setShowSessionInfoPanel,
		setShowWelcome,
		showCommandPalette,
		setShowCommandPalette,
		showClipboard,
		setShowClipboard,
		showWP,
		setShowWP,
		showNF,
		setShowNF,
		openVoiceCommandCenter,
		showAppStore,
		appStoreDetailId,
		appStoreDetailFromStore,
		storeApps,
		installedAppsLoading,
		closeAppStoreModal,
		clearAppStoreDetail,
		setAppStoreDetailId,
		handleInstallApp,
		handleUninstallApp,
		handleAppStoreLayerError,
		handleAppStoreLayerSuccess,
		handleAppStoreLayerOpenInstalled,
		appStoreDesktopShortcutIds,
		recordRecentApp,
		recentItemsForSearch,
		recentFiles,
		recentLibraryOpened,
		recentLibraryAdded,
		recentLibraryGenerated,
		recentLibraryUploaded,
		recentLibraryProjects,
		recentContentFeedLoading,
		recentContentFeedError,
		recentContentFeedLoadedAt,
		hasRecentContentFeedItems,
		refetchRecentContentFeed,
		addRecentFile,
		setCtx,
		commitItems,
		setRenamingId,
		copyItems,
		cutItems,
		pasteClipboard,
		openEditFolderIconDialog,
		onCloseNewFolder,
		handleCreateFolderForDialog,
		createMarkdownFile,
		toggleExplicitTheme,
		closeShellSettingsWindow,
		wallpaper,
		handleWallpaperChange,
		handleRemoveUserWallpaper,
		openWallpaperFromDesktopSettings,
		setWindowContextMenu,
		canOpenUnifiedAdmin,
		unifiedAdminDesktopItem,
		deleteDesktop,
		switchToDesktop,
		updateDesktopName,
		vdDropHoverId,
	} = sources;

	return {
		canvasAndInteractions: {
			shellSurface: {
				t,
				setSelected,
				handleContextMenu,
				showWelcome,
				onWelcomeComplete,
				showDesktopWidget,
				floatingWidgetPerformanceForCanvas,
				autoQuietWindowLoad,
				isShellSettingsWindowOpen,
				desktopUnreadCount,
				markAllAsRead,
				widgetAvatarUrl,
				openSocialHubTab,
				updateDesktopVisualPreferences,
				desktopWidgetsStyle: desktopVisualPreferences.desktop_widgets_style,
				reduceMotionWorkspace,
				isWindowDragActive,
				openAppStoreAsWindow,
			},
			syncPersistence: {
				isOnline,
				isSyncing: isSyncing || persistQueueFlushing,
				shellStatePipelinePhase,
				combinedDesktopPersistenceError: canvasSyncPersistenceError,
				tabConflictDetected,
				staleShellStateConflict,
				syncWorkspaceFromServer,
				performWorkspaceRefresh,
				clearTabConflict,
				onRecoverStaleShellState: recoverStaleShellState,
				loadFailure,
				clearLoadFailure,
				syncToServer,
				onFlushPersistPatches: flushPersistPatches,
				persistQueuedPatches:
					persistPatchStats.total + (widgetOutboxPendingCount || 0),
			},
			iconInteractions: {
				isDraggingIcon,
				gridStep,
				showEnhancedContextMenu,
				contextMenuPosition,
				setShowEnhancedContextMenu,
				items,
				selected,
				contextMenuType,
				clipboard,
				iconSizeConfig: iconSize,
				snapToGridEnabled,
				desktopUiScale,
				ctx,
				propertiesItem,
				setPropertiesItem,
				iconSize,
				desktopItemBadgeCounts,
				folderChildCounts,
				folderPreviewByFolderId,
				handleDesktopIconSelect,
				handleDragStart,
				handleDesktopIconDragEnd,
				handleDrag,
				handleDropToFolder,
				handleDesktopIconRename,
				handleStartIconRename,
				handleCancelIconRename,
				renamingId,
				iconIsCut,
				activeDropTargetFolderId,
				setActiveDropTargetFolderId,
				handleRubberBandSelection,
				desktopAreaRef,
			},
			windowSlot: {
				windowContextMenu,
				activeDesktopId,
				onVdDropHover,
				desktops,
				minimizeWindow,
				maximizeWindow,
				closeWindow,
				toggleWindowAlwaysOnTop,
				onToggleAlwaysOnTop: toggleWindowAlwaysOnTop,
				onDuplicateWindow: handleDuplicateWindow,
				activeWindowAlwaysOnTop: activeDesktopWindow?.alwaysOnTop === true,
				moveWindowToDesktop,
				onOpenShellSettings: openShellSettings,
				snapZone,
				moveWindow,
				resizeWindow,
				handleWindowDrag,
				handleWindowDragCommit: trackedHandleWindowDragCommit,
				updateSnapZone,
				getSnapZoneForPosition,
				clearSnapZone,
				snapWindow,
				registerBeforeClose,
				unregisterBeforeClose,
				updateWindowPayload,
				retargetFolderWindow,
				installedApps,
				onBringWindowIntoWorkArea: bringWindowIntoWorkAreaById,
			},
			widgetsAndDrop: {
				widgetPosition: config?.widget_position ?? {
					...DESKTOP_FLOATING_WIDGET_POSITION_SEED,
				},
				onWidgetPositionCommit: (next) => {
					if (!config) return;
					void updateConfig({ widget_position: next });
				},
				onBackgroundContentDragOver,
				onBackgroundContentDrop,
				onExternalContentDropToFolder,
				widgetsPanel: desktopWidgetsPanelProps,
			},
			assistant: {
				assistantWindowContextSummarizeEnabled,
				assistantWindowContextGafEnabled,
				onWindowContextAssistantSummarize,
				onWindowContextAssistantShareGaf,
				assistantPropertiesPanelActions,
				onAssistantPropertiesPanelAction,
			},
		},
		chromeAndModalsRest: {
			taskbarViewport: {
				isMobile,
				handleTaskbarWinClick,
				handlePinAppFromStartMenu,
				onUnpinAppFromDesktop: handleUnpinAppFromStartMenu,
				onOpenAppInWorkspace: openAppInWorkspaceProfile,
				onStartMenuOpenRecentFile: openRecentDesktopFile,
				onStartMenuRemoveRecentFile: removeRecentFile,
				startMenuWorkspaceContextWindows: windows,
				getWindowsOnDesktop,
				openAppStoreAsWindow,
				desktopTaskbarStyle,
				desktopPanelOpacity: desktopVisualPreferences.desktop_panel_opacity,
				taskbarAppBadgeCounts,
				apps: installedApps,
				notificationCenterOpenNonce,
				minimizedPersistentSurfaceApps,
				bumpNotificationCenterOpen,
			},
			expansionAndLaunch: {
				expansionState: expansionSettings,
				expansionLaunchActions: {
					onOpenWorkspaceProfile: openWorkspaceProfile,
					onAddWorkspaceProfileFromTemplate: (templateId) => {
						void expansionSettings.addWorkspaceProfileFromTemplate(templateId);
					},
					onAddAppCollectionFromTemplate: (templateId) => {
						void expansionSettings.addAppCollectionFromTemplate(templateId);
					},
					onOpenAppCollection: openAppCollection,
					onOpenContentShortcut: openContentShortcut,
					onOpenAssistantAction: openAssistantContextAction,
					onOpenGafChatById: openGafChatBySession,
				},
			},
			windowsAndSession: {
				displayItems,
				handleOpenWindow,
				activeDesktopWindowId,
				currentDesktopWindows,
				desktopIconStyle,
				focusWindow,
				desktopWindowStyle,
				activeDesktopWindow,
				createDesktop,
				switchToNextDesktop,
				switchToPreviousDesktop,
				minimizeAllWindows,
				openDesktopAppByComponent,
				openSocialHubTab,
			},
			overlayState: {
				showTaskSwitcher,
				setShowTaskSwitcher,
				showQuickSearch,
				setShowQuickSearch,
				showShortcutsHelp,
				showSessionInfoPanel,
				setShowShortcutsHelp,
				setShowSessionInfoPanel,
				setShowWelcome,
				showCommandPalette,
				setShowCommandPalette,
				showClipboard,
				setShowClipboard,
				showWP,
				setShowWP,
				showNF,
				setShowNF,
				openVoiceCommandCenter,
			},
			appStore: {
				showAppStore,
				appStoreDetailId,
				appStoreDetailFromStore,
				storeApps,
				installedAppsLoading,
				onCloseModal: closeAppStoreModal,
				onBackFromDetail: clearAppStoreDetail,
				onSetAppStoreDetailId: setAppStoreDetailId,
				onInstall: handleInstallApp,
				onUninstall: handleUninstallApp,
				onAppStoreError: handleAppStoreLayerError,
				onAppStoreSuccess: handleAppStoreLayerSuccess,
				onOpenInstalledApp: handleAppStoreLayerOpenInstalled,
				appStoreDesktopShortcutIds,
			},
			searchAndRecents: {
				recordRecentApp,
				recentItemsForSearch,
				recentFiles,
				recentLibraryOpened,
				recentLibraryAdded,
				recentLibraryGenerated,
				recentLibraryUploaded,
				recentLibraryProjects,
				recentContentFeedLoading,
				recentContentFeedError,
				recentContentFeedLoadedAt,
				hasRecentContentFeedItems,
				onRefetchRecentContentFeed: refetchRecentContentFeed,
				addRecentFile,
				removeRecentFile,
			},
			clipboardAndFolderActions: {
				setCtx,
				commitItems,
				setRenamingId,
				copyItems,
				cutItems,
				pasteClipboard,
				openEditFolderIconDialog,
				onCloseNewFolder,
				handleCreateFolder: handleCreateFolderForDialog,
				createMarkdownFile,
			},
			shellSettingsAndWallpaper: {
				updateConfig,
				toggleExplicitTheme,
				closeShellSettingsWindow,
				openShellSettings,
				onOpenShellWorkspacesSettings: () =>
					openShellSettings('shell', {
						scrollToElementId: DESKTOP_SETTINGS_SHELL_ANCHORS.workspaces,
					}),
				wallpaper,
				wallpaperHistory: config?.wallpaper_history,
				handleWallpaperChange,
				handleRemoveUserWallpaper,
				openWallpaperFromDesktopSettings,
			},
		},
		derived: {
			contextMenuAndOverlays: {
				setWindowContextMenu,
				setShowShortcutsHelp,
				setShowSessionInfoPanel,
			},
			shellSettingsAndAdmin: {
				openShellSettings,
				canOpenUnifiedAdmin,
				handleOpenWindow,
				unifiedAdminDesktopItem,
			},
			virtualDesktopsState: {
				desktops,
				activeDesktopId,
				createDesktop,
				deleteDesktop,
				switchToDesktop,
				updateDesktopName,
				workspaceProfiles: expansionSettings.workspaceProfiles,
				onOpenWorkspaceProfile: openWorkspaceProfile,
				vdDropHoverId,
			},
		},
	};
}

/** Named assembly entry for Content/tail cluster. */
export function useDesktopWorkspaceShellLayoutInputAssembly(
	sources: DesktopWorkspaceShellLayoutInputAssemblySources
): DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams {
	return useDesktopWorkspaceShellLayoutInputBridge(
		buildDesktopWorkspaceShellLayoutInputBridgeInput(sources)
	);
}

export type { DesktopWorkspaceShellLayoutInputBridgeInput };
