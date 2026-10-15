/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Wave A1.1 early head cluster: storage through window-manager bundle and pagehide flush.
 *
 * Invariants:
 * - Pass-through only — no field remapping vs prior Content inline hooks.
 *
 * Related:
 * - hooks/useDesktopWorkspaceContentHeadCluster.ts
 * - hooks/useDesktopWorkspaceContentHeadLateCluster.ts
 */

import { useNotifications } from '@/notifications';
import * as React from 'react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../contexts/AuthContext';
import { useUserPreferencesApp } from '../../../contexts/UserPreferencesAppContext';
import { useAppState } from '../../../hooks/useAppState';
import { hasUgsAdminIdentity } from '../../../utils/ugsAdminAccess';
import {
	useDesktopStateActions,
	useDesktopStateContext,
} from '../context/DesktopStateContext';
import { useDesktopInstalledApps } from './useDesktopInstalledApps';
import type { UseDesktopStorageReturn } from './useDesktopStorage';
import { useDesktopWorkspaceOverlayState } from './useDesktopWorkspaceOverlayState';
import { useDesktopWorkspaceItemsCommit } from './useDesktopWorkspaceItemsCommit';
import { useDesktopWorkspaceRecentItemsForSearch } from './useDesktopWorkspaceRecentItemsForSearch';
import { useDesktopWorkspaceRecentFilesAndViewport } from './useDesktopWorkspaceRecentFilesAndViewport';
import { useVirtualDesktops } from './useVirtualDesktops';
import { useDesktopWorkspaceChromeState } from './useDesktopWorkspaceChromeState';
import { useDesktopSoftRecoveryListener } from './useDesktopSoftRecoveryListener';
import { useDesktopWorkspaceShellCss } from './useDesktopWorkspaceShellCss';
import { useDesktopWorkspaceIconInteractions } from './useDesktopWorkspaceIconInteractions';
import { resolveDesktopShellMotionPrefs } from '../utils/resolveDesktopShellMotion';
import { useDesktopWorkspaceAppPropsValueBase } from './useDesktopWorkspaceAppPropsValueBase';
import { useDesktopWorkspaceClipboardRenamingFields } from './useDesktopWorkspaceClipboardRenamingFields';
import { useDesktopWorkspaceContentLocalState } from './useDesktopWorkspaceContentLocalState';
import { useDesktopWorkspaceInstalledAppIds } from './useDesktopWorkspaceInstalledAppIds';
import { useDesktopWorkspaceRefreshBootstrap } from './useDesktopWorkspaceRefreshBootstrap';
import { useDesktopWorkspaceWindowManagerBundle } from './useDesktopWorkspaceWindowManagerBundle';
import { useDesktopWorkspaceSelectionCtxBridge } from './useDesktopWorkspaceSelectionCtxBridge';
import { useDesktopWorkspaceShellModalFields } from './useDesktopWorkspaceShellModalFields';
import { useDesktopWorkspaceLayoutConfigDerived } from './useDesktopWorkspaceLayoutConfigDerived';
import { useDesktopWorkspacePersistQueue } from './useDesktopWorkspacePersistQueue';
import { useDesktopWidgetOutboxFlush } from './useDesktopWidgetOutboxFlush';
import {
	useDesktopWorkspacePersonalizationStagingActions,
	useDesktopWorkspacePersonalizationThemeCluster,
} from './useDesktopWorkspacePersonalizationThemeCluster';
import { useDesktopWorkspaceWidgetAvatar } from './useDesktopWorkspaceWidgetAvatar';
import {
	useDesktopWorkspaceVisualProfileBridge,
	useDesktopWorkspaceShellBadgeCounts,
	useMinimizedPersistentSurfaceApps,
} from './useDesktopWorkspaceVisualProfileBridge';
import { useCoalescedDesktopShellStatePagehideFlush } from './useCoalescedDesktopShellStatePagehideFlush';
import { useSystemPrefersReducedMotion } from './useSystemPrefersReducedMotion';
export type UseDesktopWorkspaceContentHeadClusterParams = {
	storage: UseDesktopStorageReturn;
};

export function useDesktopWorkspaceContentHeadEarlyCluster(
	params: UseDesktopWorkspaceContentHeadClusterParams
) {
	const { storage } = params;
	const { user: authUser } = useAuth();
	const appState = useAppState();
	const [widgetAvatarUrl, setWidgetAvatarUrl] = useDesktopWorkspaceWidgetAvatar(
		authUser?.id
	);
	const canOpenUnifiedAdmin = hasUgsAdminIdentity(
		authUser ?? appState.state.user
	);
	const appPropsValueBase = useDesktopWorkspaceAppPropsValueBase({
		authUser,
		appUser: appState.state.user,
		settings: appState.state.settings,
		isAuthenticated: appState.state.isAuthenticated,
		setWidgetAvatarUrl,
	});

	const {
		config,
		items: storageItems,
		isLoading: storageLoading,
		updateConfig,
		applyDesktopConfigSnapshotLocal,
		applyPersistedConfigPatch,
		updateItemPosition,
		replaceItems,
		createFolder: createFolderAPI,
		updateFolderIcon,
		createMarkdownFile,
		refresh: refreshStorage,
		isOnline,
		isSyncing,
		error: storageError,
		tabConflictDetected,
		clearTabConflict,
		syncToServer,
		loadFailure,
		isLoadingStalled,
		clearLoadFailure,
		deleteItem,
	} = storage;

	const expansionPersistRefreshRef = React.useRef<(() => Promise<void>) | null>(
		null
	);

	const persistSubjectForQueue = authUser?.id ?? null;
	const {
		persistPatchStats,
		persistPatchFlushFailed,
		persistPatchConflict,
		persistQueueFlushing,
		flushPersistPatches,
		clearPersistPatchConflict,
	} = useDesktopWorkspacePersistQueue({
		persistSubjectKey: persistSubjectForQueue,
		isOnline,
		applyPersistedConfigPatch,
		refreshExpansionSettings: () =>
			expansionPersistRefreshRef.current?.() ?? Promise.resolve(),
	});

	const {
		widgetOutboxPendingCount,
		widgetOutboxFlushFailed,
		widgetOutboxFlushing,
		flushWidgetOutbox,
	} = useDesktopWidgetOutboxFlush({
		persistSubjectKey: persistSubjectForQueue,
		isOnline,
	});

	const mergedPersistFlushFailed = persistPatchConflict
		? null
		: [persistPatchFlushFailed, widgetOutboxFlushFailed]
				.filter((part): part is string => Boolean(part?.trim()))
				.join(' · ') || null;

	const flushPersistAndWidgetOutbox = React.useCallback(async () => {
		const persistOk = await flushPersistPatches();
		const widgetOk = await flushWidgetOutbox();
		return persistOk && widgetOk;
	}, [flushPersistPatches, flushWidgetOutbox]);

	const { iconSize, snapToGridEnabled, gridStep } =
		useDesktopWorkspaceLayoutConfigDerived(config);

	const { workspaceRefreshImplRef, refreshForPersistenceShell } =
		useDesktopWorkspaceRefreshBootstrap(refreshStorage);

	const { t, i18n: i18nextInstance } = useTranslation('desktopUi');
	const { t: tAppStore } = useTranslation('appStore');
	const workspaceShellCss = useDesktopWorkspaceShellCss();

	const reduceMotionWorkspace = useSystemPrefersReducedMotion();

	const { state } = useDesktopStateContext();
	const actions = useDesktopStateActions();

	const {
		deferVisualPersistRef,
		personalizationStagingActive,
		personalizationBaselineRef,
		setPersonalizationStagingActive,
		wallpaper,
		setWallpaper,
		showWP,
		setShowWP,
		showNF,
		setShowNF,
		showWelcome,
		setShowWelcome,
		onWelcomeComplete,
		theme,
		setTheme,
		effectiveTheme,
		desktopEmbeddedAppTheme,
		desktopThemeVars,
		accent,
		accentCustomHex,
		setAccentChoice,
		onAccentCustomHexChange,
		toggleExplicitTheme,
		applyCuratedDesktopConfigPreset,
	} = useDesktopWorkspacePersonalizationThemeCluster({
		config,
		updateConfig,
		storageLoading,
		state,
		actions,
	});

	const items = storageItems;
	const { itemsRef, commitItems } = useDesktopWorkspaceItemsCommit(
		items,
		replaceItems
	);
	const {
		installedApps,
		storeApps,
		installApp,
		uninstallApp,
		isLoading: installedAppsLoading,
	} = useDesktopInstalledApps(items);
	const installedAppIds = useDesktopWorkspaceInstalledAppIds(installedApps);

	const desktopAreaRef = useRef<HTMLDivElement>(null);
	const {
		showTaskSwitcher,
		setShowTaskSwitcher,
		showQuickSearch,
		setShowQuickSearch,
		showShortcutsHelp,
		setShowShortcutsHelp,
		showSessionInfoPanel,
		setShowSessionInfoPanel,
		showAppStore,
		appStoreDetailId,
		setAppStoreDetailId,
		closeAppStoreModal,
		openAppStore,
	} = useDesktopWorkspaceOverlayState();
	const { selected, selectedSyncRef, setSelected, ctx, setCtx } =
		useDesktopWorkspaceSelectionCtxBridge({
			selectedRaw: state.selected,
			ctx: state.ctx,
			setSelectedToStore: actions.setSelected,
			setCtxToStore: actions.setCtx,
		});
	const [vdDropHoverId, setVdDropHoverId] = React.useState<string | null>(null);
	const onVdDropHover = React.useCallback((desktopId: string | null) => {
		setVdDropHoverId(desktopId);
	}, []);

	const {
		combinedDesktopPersistenceError,
		loadingShellProps,
		loadFailureMessage,
		deferLoadingShellToMaintenance,
		desktopMaintenanceOverlay,
	} = useDesktopWorkspaceChromeState({
		loadFailure,
		storageError,
		persistPatchFlushFailed: mergedPersistFlushFailed,
		t,
		effectiveTheme,
		desktopThemeVars,
		workspaceShellCss,
		isLoadingStalled,
		refreshStorage: refreshForPersistenceShell,
	});

	useDesktopSoftRecoveryListener(refreshForPersistenceShell);

	const {
		recentFiles,
		addRecentFile,
		removeRecentFile,
		recentLibraryOpened,
		recentLibraryAdded,
		recentLibraryGenerated,
		recentLibraryUploaded,
		recentLibraryProjects,
		refetchRecentContentFeed,
		recentContentFeedLoading,
		recentContentFeedError,
		recentContentFeedLoadedAt,
		hasRecentContentFeedItems,
		isMobile,
	} = useDesktopWorkspaceRecentFilesAndViewport();
	const {
		clipboard,
		clipboardAction,
		setClipboard,
		renamingId,
		setRenamingId,
	} = useDesktopWorkspaceClipboardRenamingFields({
		clipboard: state.clipboard,
		clipboardAction: state.clipboardAction,
		renamingId: state.renamingId,
		setClipboardItems: actions.setClipboard,
		setRenamingId: actions.setRenamingId,
	});
	const {
		showCommandPalette,
		setShowCommandPalette,
		showClipboard,
		setShowClipboard,
		isDraggingIcon,
		setIsDraggingIcon,
		showEnhancedContextMenu,
		setShowEnhancedContextMenu,
		contextMenuPosition,
		setContextMenuPosition,
		contextMenuType,
		setContextMenuType,
	} = useDesktopWorkspaceShellModalFields({ state, actions });

	const {
		groupDragState,
		displayItems,
		handleDragStart,
		handleDrag,
		handleUpdatePosition: _handleUpdatePosition,
		handleDesktopIconSelect,
		handleDesktopIconDragEnd,
		handleDesktopIconRename,
		handleRubberBandSelection,
		handleStartIconRename,
		handleCancelIconRename,
		iconIsCut,
		handleContextMenu,
		handleDropToFolder,
	} = useDesktopWorkspaceIconInteractions({
		items,
		installedAppIds,
		desktopAreaRef,
		iconSize,
		gridStepKey: gridStep,
		commitItems,
		updateItemPosition,
		selected,
		setSelected,
		selectedSyncRef,
		setIsDraggingIcon,
		setRenamingId,
		clipboard,
		clipboardAction,
		setCtx,
		setContextMenuType,
		setContextMenuPosition,
		setShowEnhancedContextMenu,
	});

	const {
		desktopSettingsActiveTab,
		setDesktopSettingsActiveTab,
		notificationCenterOpenNonce,
		bumpNotificationCenterOpen,
		activeDropTargetFolderId,
		setActiveDropTargetFolderId,
		propertiesItem,
		setPropertiesItem,
		windowContextMenu,
		setWindowContextMenu,
	} = useDesktopWorkspaceContentLocalState();

	// Virtual desktops hook (single source of state; VirtualDesktops receives via props)
	const {
		activeDesktopId,
		desktops,
		getWindowsOnDesktop,
		createDesktop,
		deleteDesktop,
		switchToDesktop,
		switchToNextDesktop,
		switchToPreviousDesktop,
		addWindowToDesktop,
		removeWindowFromDesktop,
		moveWindowToDesktop,
		updateDesktopName,
		updateDesktopWallpaper,
	} = useVirtualDesktops(persistSubjectForQueue);

	const {
		recentItemsForSearch,
		recordRecentApp,
		recordRecentAppOnVirtualDesktop,
	} = useDesktopWorkspaceRecentItemsForSearch(
		displayItems,
		activeDesktopId,
		persistSubjectForQueue
	);

	const {
		notify: notifyDesktop,
		toast: desktopToast,
		unreadCount: desktopUnreadCount,
		markAllAsRead,
	} = useNotifications();
	const preferencesApp = useUserPreferencesApp();
	const {
		desktopVisualPreferences,
		setDesktopVisualPreferences,
		serverUiPreferencesRef,
		desktopVisualPreferencesRef,
		resolvedDesktopVisualPreferencesRef,
		panelOpacityPersistTimerRef,
		isProfileUiSaving,
		withProfileUiSaveIndicator,
		clearPanelOpacityPersistTimer,
		clearWindowDragWidgetTimer,
		updateDesktopVisualPreferences,
		markWindowDragActivity,
		isWindowDragActive,
		setIsWindowDragActive,
		isWindowDragActiveRef,
		windowDragWidgetTimerRef: _windowDragWidgetTimerRef,
		showDesktopWidget,
		desktopIconStyle,
		desktopTaskbarStyle,
		desktopWindowStyle,
		desktopUiScale,
		desktopOpenAppsMaximized,
	} = useDesktopWorkspaceVisualProfileBridge({ preferencesApp, notifyDesktop });

	const shellMotionPrefs = React.useMemo(
		() =>
			resolveDesktopShellMotionPrefs({
				ui: {
					animations_enabled:
						preferencesApp?.preferences?.ui?.animations_enabled !== false,
					desktop_shell_reduce_motion:
						desktopVisualPreferences.desktop_shell_reduce_motion === true,
					desktop_shell_parallax_enabled:
						desktopVisualPreferences.desktop_shell_parallax_enabled !== false,
					desktop_shell_parallax_intensity:
						desktopVisualPreferences.desktop_shell_parallax_intensity,
					desktop_shell_window_morph_enabled:
						desktopVisualPreferences.desktop_shell_window_morph_enabled !==
						false,
					desktop_shell_motion_speed:
						desktopVisualPreferences.desktop_shell_motion_speed,
				},
				accessibility: preferencesApp?.preferences?.accessibility,
				systemReduceMotion: reduceMotionWorkspace === true,
			}),
		[
			desktopVisualPreferences.desktop_shell_motion_speed,
			desktopVisualPreferences.desktop_shell_parallax_enabled,
			desktopVisualPreferences.desktop_shell_parallax_intensity,
			desktopVisualPreferences.desktop_shell_reduce_motion,
			desktopVisualPreferences.desktop_shell_window_morph_enabled,
			preferencesApp?.preferences?.accessibility,
			preferencesApp?.preferences?.ui?.animations_enabled,
			reduceMotionWorkspace,
		]
	);

	const {
		startPersonalizationStaging,
		cancelPersonalizationStaging,
		commitPersonalizationStaging,
	} = useDesktopWorkspacePersonalizationStagingActions({
		config,
		applyDesktopConfigSnapshotLocal,
		updateConfig,
		desktopVisualPreferences,
		desktopVisualPreferencesRef,
		setDesktopVisualPreferences,
		updateDesktopVisualPreferences,
		setPersonalizationStagingActive,
		personalizationBaselineRef,
	});

	const {
		desktopItemBadgeCounts,
		taskbarAppBadgeCounts,
		folderChildCounts,
		folderPreviewByFolderId,
	} = useDesktopWorkspaceShellBadgeCounts({
		displayItems,
		allDesktopItems: items,
		installedApps,
		authUserId: authUser?.id,
	});

	const {
		windows,
		openWindow,
		closeWindow,
		minimizeWindow,
		maximizeWindow,
		focusWindow,
		toggleWindowAlwaysOnTop,
		snapWindow,
		minimizeAllWindows,
		snapZone,
		updateSnapZone,
		getSnapZoneForPosition,
		clearSnapZone,
		resizeWindow,
		moveWindow,
		commitWindowPosition: _commitWindowPosition,
		registerBeforeClose,
		unregisterBeforeClose,
		restoreWindows,
		updateWindowPayload,
		retargetFolderWindow,
		performWorkspaceRefresh,
		syncWorkspaceFromServer,
		bringWindowsIntoWorkArea,
		windowsRef,
		handleWindowDrag,
		handleWindowDragCommit,
	} = useDesktopWorkspaceWindowManagerBundle({
		addWindowToDesktop,
		removeWindowFromDesktop,
		moveWindowToDesktop,
		desktopOpenAppsMaximized,
		minimizeAnimationMs: shellMotionPrefs.minimizeMs,
		workspaceRefreshImplRef,
		refreshStorage,
		onAfterWorkspaceRefresh: () => {
			void refetchRecentContentFeed();
		},
		markWindowDragActivity,
		clearWindowDragWidgetTimer,
		isWindowDragActiveRef,
		setIsWindowDragActive,
	});

	useCoalescedDesktopShellStatePagehideFlush();
	return {
		storage,
		appState,
		canOpenUnifiedAdmin,
		appPropsValueBase,
		expansionPersistRefreshRef,
		persistSubjectForQueue,
		workspaceShellCss,
		reduceMotionWorkspace,
		actions,
		items,
		installedAppIds,
		desktopAreaRef,
		onVdDropHover,
		preferencesApp,
		shellMotionPrefs,
		authUser,
		config,
		storageItems,
		storageLoading,
		updateConfig,
		applyDesktopConfigSnapshotLocal,
		applyPersistedConfigPatch,
		updateItemPosition,
		replaceItems,
		createFolderAPI,
		updateFolderIcon,
		createMarkdownFile,
		refreshStorage,
		isOnline,
		isSyncing,
		storageError,
		tabConflictDetected,
		clearTabConflict,
		syncToServer,
		loadFailure,
		isLoadingStalled,
		clearLoadFailure,
		deleteItem,
		persistPatchStats,
		persistPatchFlushFailed: mergedPersistFlushFailed,
		persistPatchConflict,
		persistQueueFlushing: persistQueueFlushing || widgetOutboxFlushing,
		flushPersistPatches: flushPersistAndWidgetOutbox,
		clearPersistPatchConflict,
		widgetOutboxPendingCount,
		widgetOutboxFlushFailed,
		widgetOutboxFlushing,
		flushWidgetOutbox,
		iconSize,
		snapToGridEnabled,
		gridStep,
		workspaceRefreshImplRef,
		refreshForPersistenceShell,
		t,
		i18nextInstance,
		tAppStore,
		state,
		deferVisualPersistRef,
		personalizationStagingActive,
		personalizationBaselineRef,
		setPersonalizationStagingActive,
		wallpaper,
		setWallpaper,
		showWP,
		setShowWP,
		showNF,
		setShowNF,
		showWelcome,
		setShowWelcome,
		onWelcomeComplete,
		theme,
		setTheme,
		effectiveTheme,
		desktopEmbeddedAppTheme,
		desktopThemeVars,
		accent,
		accentCustomHex,
		setAccentChoice,
		onAccentCustomHexChange,
		toggleExplicitTheme,
		applyCuratedDesktopConfigPreset,
		itemsRef,
		commitItems,
		installedApps,
		storeApps,
		installApp,
		uninstallApp,
		installedAppsLoading,
		showTaskSwitcher,
		setShowTaskSwitcher,
		showQuickSearch,
		setShowQuickSearch,
		showShortcutsHelp,
		setShowShortcutsHelp,
		showSessionInfoPanel,
		setShowSessionInfoPanel,
		showAppStore,
		appStoreDetailId,
		setAppStoreDetailId,
		closeAppStoreModal,
		openAppStore,
		selected,
		selectedSyncRef,
		setSelected,
		ctx,
		setCtx,
		combinedDesktopPersistenceError,
		loadingShellProps,
		loadFailureMessage,
		deferLoadingShellToMaintenance,
		desktopMaintenanceOverlay,
		recentFiles,
		addRecentFile,
		removeRecentFile,
		recentLibraryOpened,
		recentLibraryAdded,
		recentLibraryGenerated,
		recentLibraryUploaded,
		recentLibraryProjects,
		refetchRecentContentFeed,
		recentContentFeedLoading,
		recentContentFeedError,
		recentContentFeedLoadedAt,
		hasRecentContentFeedItems,
		isMobile,
		clipboard,
		clipboardAction,
		setClipboard,
		renamingId,
		setRenamingId,
		showCommandPalette,
		setShowCommandPalette,
		showClipboard,
		setShowClipboard,
		isDraggingIcon,
		setIsDraggingIcon,
		showEnhancedContextMenu,
		setShowEnhancedContextMenu,
		contextMenuPosition,
		setContextMenuPosition,
		contextMenuType,
		setContextMenuType,
		groupDragState,
		displayItems,
		handleDragStart,
		handleDrag,
		_handleUpdatePosition,
		handleDesktopIconSelect,
		handleDesktopIconDragEnd,
		handleDesktopIconRename,
		handleRubberBandSelection,
		handleStartIconRename,
		handleCancelIconRename,
		iconIsCut,
		handleContextMenu,
		handleDropToFolder,
		desktopSettingsActiveTab,
		setDesktopSettingsActiveTab,
		notificationCenterOpenNonce,
		bumpNotificationCenterOpen,
		activeDropTargetFolderId,
		setActiveDropTargetFolderId,
		propertiesItem,
		setPropertiesItem,
		windowContextMenu,
		setWindowContextMenu,
		activeDesktopId,
		desktops,
		getWindowsOnDesktop,
		createDesktop,
		deleteDesktop,
		switchToDesktop,
		switchToNextDesktop,
		switchToPreviousDesktop,
		addWindowToDesktop,
		removeWindowFromDesktop,
		moveWindowToDesktop,
		updateDesktopName,
		updateDesktopWallpaper,
		recentItemsForSearch,
		recordRecentApp,
		recordRecentAppOnVirtualDesktop,
		notifyDesktop,
		desktopToast,
		desktopUnreadCount,
		markAllAsRead,
		desktopVisualPreferences,
		setDesktopVisualPreferences,
		serverUiPreferencesRef,
		desktopVisualPreferencesRef,
		resolvedDesktopVisualPreferencesRef,
		panelOpacityPersistTimerRef,
		isProfileUiSaving,
		withProfileUiSaveIndicator,
		clearPanelOpacityPersistTimer,
		clearWindowDragWidgetTimer,
		updateDesktopVisualPreferences,
		markWindowDragActivity,
		isWindowDragActive,
		setIsWindowDragActive,
		isWindowDragActiveRef,
		_windowDragWidgetTimerRef,
		showDesktopWidget,
		desktopIconStyle,
		desktopTaskbarStyle,
		desktopWindowStyle,
		desktopUiScale,
		desktopOpenAppsMaximized,
		startPersonalizationStaging,
		cancelPersonalizationStaging,
		commitPersonalizationStaging,
		desktopItemBadgeCounts,
		taskbarAppBadgeCounts,
		folderChildCounts,
		folderPreviewByFolderId,
		windows,
		openWindow,
		closeWindow,
		minimizeWindow,
		maximizeWindow,
		focusWindow,
		toggleWindowAlwaysOnTop,
		snapWindow,
		minimizeAllWindows,
		snapZone,
		updateSnapZone,
		getSnapZoneForPosition,
		clearSnapZone,
		resizeWindow,
		moveWindow,
		_commitWindowPosition,
		registerBeforeClose,
		unregisterBeforeClose,
		restoreWindows,
		updateWindowPayload,
		retargetFolderWindow,
		performWorkspaceRefresh,
		syncWorkspaceFromServer,
		bringWindowsIntoWorkArea,
		windowsRef,
		handleWindowDrag,
		handleWindowDragCommit,
		widgetAvatarUrl,
		setWidgetAvatarUrl,
		vdDropHoverId,
		setVdDropHoverId,
	};
}

export type DesktopWorkspaceContentHeadEarlyClusterResult = ReturnType<
	typeof useDesktopWorkspaceContentHeadEarlyCluster
>;
