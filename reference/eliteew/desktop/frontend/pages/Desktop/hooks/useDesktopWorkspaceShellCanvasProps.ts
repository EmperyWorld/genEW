/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Assembles canvas props for Безраздельный мир: icons, widgets, context menu, properties panel, and selection state.
 *
 * Invariants:
 * - Fallback root path label uses current product terminology.
 * - Prop assembly stays pure; mutations are delegated to callbacks passed in params.
 *
 * Related:
 * - `components/DesktopWorkspaceCanvas.tsx`
 * - `components/ItemPropertiesModal.tsx`
 */

import type { TFunction } from 'i18next';
import * as React from 'react';
import { useCallback, useMemo } from 'react';
import type { DesktopWorkspaceCanvasProps } from '../components/DesktopWorkspaceCanvas';
import type { DesktopWidgetsPanelProps } from '../components/DesktopWidgetsPanel';
import type { DesktopIconLayerProps } from '../components/DesktopIconLayer';
import {
	DESKTOP_PERFORMANCE_TARGETS,
	type GridStepPreference,
	type IconSizePreference,
} from '../constants';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';
import { computeDesktopIconReservedViewportBounds } from '../utils/desktopFloatingWidgetPlacement';
import type { DesktopWelcomeCompleteOptions } from '../components/DesktopWelcomeScreen';
import type { DesktopControlCenterTab } from '../components/DesktopSettingsPanel';
import type { DesktopItem, WindowState } from '../types/desktop.types';
import type { DesktopAssistantContextAction } from '../types/desktopExpansion.types';
import type { DesktopIconStyle, DesktopWindowStyle } from '@/types/profile';

type EnhancedCtx = DesktopWorkspaceCanvasProps['enhancedContextMenu'];

export function useDesktopWorkspaceShellCanvasProps(params: {
	t: TFunction<'desktopUi'>;
	setSelected: (s: Set<string>) => void;
	handleContextMenu: (e: React.MouseEvent) => void;
	showWelcome: boolean;
	onWelcomeComplete: (options: DesktopWelcomeCompleteOptions) => void;
	showDesktopWidget: boolean;
	floatingWidgetPerformanceForCanvas: DesktopWorkspaceCanvasProps['floatingWidget']['performance'];
	autoQuietWindowLoad?: boolean;
	isShellSettingsWindowOpen: boolean;
	isWindowDragActive: boolean;
	currentDesktopWindows: WindowState[];
	desktopUnreadCount: number;
	markAllAsRead: () => void;
	widgetAvatarUrl: string | null;
	openSocialHubTab: (
		tab?: 'overview' | 'friends' | 'profile' | 'mobile-app'
	) => unknown;
	openShellSettings: (tab?: DesktopControlCenterTab) => void;
	bumpNotificationCenterOpen: () => void;
	updateDesktopVisualPreferences: (patch: {
		desktop_floating_widget_visible?: boolean;
	}) => void;
	desktopWidgetsStyle: DesktopWorkspaceCanvasProps['floatingWidget']['widgetsStyle'];
	isOnline: boolean;
	isSyncing: boolean;
	shellStatePipelinePhase?: import('../hooks/useDesktopShellStatePipelineSync').ShellStatePipelinePhase;
	combinedDesktopPersistenceError: string | null | undefined;
	tabConflictDetected: boolean;
	staleShellStateConflict?: boolean;
	syncWorkspaceFromServer: () => void;
	clearTabConflict: () => void;
	onRecoverStaleShellState?: () => void | Promise<void>;
	loadFailure: unknown;
	clearLoadFailure: () => void;
	syncToServer: () => undefined | Promise<unknown>;
	/** Flush queued config/shell PATCH retries (wave 15 persist queue). */
	onFlushPersistPatches?: () => undefined | Promise<boolean | undefined>;
	/** Count of pending PATCH operations in localStorage queue. */
	persistQueuedPatches?: number;
	isDraggingIcon: boolean;
	gridStep: GridStepPreference;
	showEnhancedContextMenu: boolean;
	contextMenuPosition: { x: number; y: number };
	setShowEnhancedContextMenu: (v: boolean) => void;
	items: DesktopItem[];
	selected: Set<string>;
	contextMenuType: EnhancedCtx['contextType'];
	handleAction: (action: string) => void;
	clipboardLength: number;
	iconSizeConfig: IconSizePreference | undefined;
	snapToGrid: boolean;
	desktopUiScale: number;
	ctxTargetItem: EnhancedCtx['targetItem'];
	activeWindowAlwaysOnTop?: boolean;
	desktopWindowStyle: DesktopWindowStyle;
	propertiesItem: DesktopItem | null;
	setPropertiesItem: (v: DesktopItem | null) => void;
	displayItems: DesktopItem[];
	iconSize: IconSizePreference;
	desktopIconStyle: DesktopIconStyle;
	desktopItemBadgeCounts: DesktopIconLayerProps['itemBadgeCounts'];
	folderChildCounts: DesktopIconLayerProps['folderChildCounts'];
	folderPreviewByFolderId: DesktopIconLayerProps['folderPreviewByFolderId'];
	handleDesktopIconSelect: DesktopIconLayerProps['onSelect'];
	handleOpenWindow: (item: DesktopItem) => void;
	handleDragStart: DesktopIconLayerProps['onDragStart'];
	handleDesktopIconDragEnd: DesktopIconLayerProps['onDragEnd'];
	handleDrag: DesktopIconLayerProps['onDrag'];
	handleDropToFolder: DesktopIconLayerProps['onDropToFolder'];
	handleDesktopIconRename: DesktopIconLayerProps['onRename'];
	handleStartIconRename: DesktopIconLayerProps['onStartRename'];
	handleCancelIconRename: DesktopIconLayerProps['onCancelRename'];
	renamingId: string | null;
	iconIsCut: DesktopIconLayerProps['isCut'];
	activeDropTargetFolderId: string | null;
	setActiveDropTargetFolderId: (id: string | null) => void;
	handleRubberBandSelection: DesktopWorkspaceCanvasProps['selectionBox']['onSelectionChange'];
	desktopAreaRef: React.RefObject<HTMLDivElement | null>;
	openAppStoreAsWindow: () => void;
	widgetPosition: { x: number; y: number };
	onWidgetPositionCommit?: (next: { x: number; y: number }) => void;
	onBackgroundContentDragOver?: (e: React.DragEvent) => void;
	onBackgroundContentDrop?: (e: React.DragEvent) => void;
	onExternalContentDropToFolder?: DesktopIconLayerProps['onExternalContentDropToFolder'];
	widgetsPanel: DesktopWidgetsPanelProps | null;
	assistantPropertiesPanelActions: DesktopAssistantContextAction[];
	onAssistantPropertiesPanelAction: (actionId: string) => void;
}): DesktopWorkspaceCanvasProps {
	const {
		t,
		setSelected,
		handleContextMenu,
		showWelcome,
		onWelcomeComplete,
		showDesktopWidget,
		floatingWidgetPerformanceForCanvas,
		autoQuietWindowLoad = false,
		isShellSettingsWindowOpen,
		isWindowDragActive,
		currentDesktopWindows,
		desktopUnreadCount,
		markAllAsRead,
		widgetAvatarUrl,
		openSocialHubTab,
		openShellSettings,
		bumpNotificationCenterOpen,
		updateDesktopVisualPreferences,
		desktopWidgetsStyle,
		isOnline,
		isSyncing,
		shellStatePipelinePhase = 'idle',
		combinedDesktopPersistenceError,
		tabConflictDetected,
		staleShellStateConflict = false,
		syncWorkspaceFromServer,
		clearTabConflict,
		onRecoverStaleShellState,
		loadFailure,
		clearLoadFailure,
		syncToServer,
		onFlushPersistPatches,
		persistQueuedPatches = 0,
		isDraggingIcon,
		gridStep,
		showEnhancedContextMenu,
		contextMenuPosition,
		setShowEnhancedContextMenu,
		items,
		selected,
		contextMenuType,
		handleAction,
		clipboardLength,
		iconSizeConfig,
		snapToGrid,
		desktopUiScale,
		ctxTargetItem,
		activeWindowAlwaysOnTop,
		desktopWindowStyle,
		propertiesItem,
		setPropertiesItem,
		displayItems,
		iconSize,
		desktopIconStyle,
		desktopItemBadgeCounts,
		folderChildCounts,
		folderPreviewByFolderId,
		handleDesktopIconSelect,
		handleOpenWindow,
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
		openAppStoreAsWindow,
		widgetPosition,
		onWidgetPositionCommit,
		onBackgroundContentDragOver,
		onBackgroundContentDrop,
		onExternalContentDropToFolder,
		widgetsPanel,
		assistantPropertiesPanelActions,
		onAssistantPropertiesPanelAction,
	} = params;

	const handleDesktopIconDoubleClick = useCallback(
		(item: DesktopItem) => {
			setSelected(new Set());
			handleOpenWindow(item);
		},
		[handleOpenWindow, setSelected]
	);

	const iconReservedViewportBounds = useMemo(
		() =>
			typeof document === 'undefined'
				? null
				: computeDesktopIconReservedViewportBounds(
						displayItems,
						iconSize,
						readDesktopWorkArea()
					),
		[displayItems, iconSize]
	);

	const shouldQuietFloatingWidget =
		autoQuietWindowLoad ||
		isShellSettingsWindowOpen ||
		currentDesktopWindows.length >
			DESKTOP_PERFORMANCE_TARGETS.WINDOW_AUTO_QUIET_COUNT;

	return useMemo(
		() => ({
			sceneDecor: {
				backgroundAriaLabel: t('workspace.backgroundAria'),
				onBackgroundClick: () => setSelected(new Set()),
				onBackgroundContextMenu: (e) => handleContextMenu(e),
				onBackgroundDragOver: onBackgroundContentDragOver,
				onBackgroundDrop: onBackgroundContentDrop,
			},
			welcome: {
				show: showWelcome,
				onComplete: onWelcomeComplete,
			},
			showFloatingWidget: showDesktopWidget,
			floatingWidget: {
				performance: floatingWidgetPerformanceForCanvas,
				suspendTelemetry: shouldQuietFloatingWidget,
				deferRealtimeUpdates: shouldQuietFloatingWidget || isWindowDragActive,
				iconReservedViewportBounds,
				windowCount: currentDesktopWindows.length,
				notifications: {
					unreadCount: desktopUnreadCount,
					markAllAsRead,
				},
				avatarUrl: widgetAvatarUrl,
				onOpenProfile: () => {
					openSocialHubTab('profile');
				},
				onHide: () => {
					void updateDesktopVisualPreferences({
						desktop_floating_widget_visible: false,
					});
				},
				onOpenPerformanceSettings: () => openShellSettings('performance'),
				onOpenNotificationCenter: bumpNotificationCenterOpen,
				widgetsStyle: desktopWidgetsStyle,
				widgetPosition,
				onWidgetPositionCommit,
			},
			sync: {
				isOnline,
				isSyncing,
				shellStatePipelinePhase,
				error: combinedDesktopPersistenceError ?? null,
				tabConflictDetected,
				staleShellStateConflict,
				onRefresh: syncWorkspaceFromServer,
				onDismissConflict: clearTabConflict,
				onRecoverStaleShellState,
				pendingQueuedPatches: persistQueuedPatches,
				onPersistQueueRetry: onFlushPersistPatches,
				onRetry: () => {
					const wasLoadFailure = loadFailure != null;
					clearLoadFailure();
					void onFlushPersistPatches?.();
					if (wasLoadFailure) syncWorkspaceFromServer();
					else void syncToServer();
				},
			},
			isDraggingIcon,
			gridStep,
			enhancedContextMenu: {
				isVisible: showEnhancedContextMenu,
				position: contextMenuPosition,
				onClose: () => setShowEnhancedContextMenu(false),
				selectedItems: items.filter((item) => selected.has(item.id)),
				contextType: contextMenuType,
				onAction: handleAction,
				hasClipboard: clipboardLength > 0,
				iconSize: iconSizeConfig ?? 'medium',
				snapToGrid,
				desktopUiScale,
				targetItem: ctxTargetItem,
				activeWindowAlwaysOnTop,
				shellWindowStyle: desktopWindowStyle,
			},
			properties: {
				item: propertiesItem,
				pathLabel: propertiesItem
					? propertiesItem.parentId
						? (items.find((i) => i.id === propertiesItem.parentId)?.name ??
							'Безраздельный мир')
						: 'Безраздельный мир'
					: '',
				onClose: () => setPropertiesItem(null),
				assistantActions: assistantPropertiesPanelActions,
				onAssistantAction: onAssistantPropertiesPanelAction,
			},
			iconLayer: {
				items: displayItems,
				selected,
				iconSize,
				visualStyle: desktopIconStyle,
				itemBadgeCounts: desktopItemBadgeCounts,
				folderChildCounts,
				folderPreviewByFolderId,
				onSelect: handleDesktopIconSelect,
				onDoubleClick: handleDesktopIconDoubleClick,
				onContextMenu: handleContextMenu,
				onDragStart: handleDragStart,
				onDragEnd: handleDesktopIconDragEnd,
				onDrag: handleDrag,
				onDropToFolder: handleDropToFolder,
				onExternalContentDropToFolder,
				onRename: handleDesktopIconRename,
				onStartRename: handleStartIconRename,
				onCancelRename: handleCancelIconRename,
				renamingId,
				isCut: iconIsCut,
				activeDropTargetFolderId,
				onDropTargetChange: setActiveDropTargetFolderId,
			},
			showEmptyState: displayItems.length === 0,
			emptyState: {
				title: t('workspace.emptyTitle'),
				description: t('workspace.emptyDesc'),
				appStoreLabel: t('workspace.openAppStore'),
				onOpenAppStore: openAppStoreAsWindow,
			},
			selectionBox: {
				items: displayItems,
				onSelectionChange: handleRubberBandSelection,
				containerRef: desktopAreaRef,
				selectedIds: selected,
				iconSize: iconSizeConfig ?? 'medium',
			},
			widgetsPanel,
		}),
		[
			t,
			setSelected,
			handleContextMenu,
			showWelcome,
			onWelcomeComplete,
			showDesktopWidget,
			floatingWidgetPerformanceForCanvas,
			shouldQuietFloatingWidget,
			iconReservedViewportBounds,
			isWindowDragActive,
			currentDesktopWindows.length,
			desktopUnreadCount,
			markAllAsRead,
			widgetAvatarUrl,
			openSocialHubTab,
			openShellSettings,
			bumpNotificationCenterOpen,
			updateDesktopVisualPreferences,
			desktopWidgetsStyle,
			isOnline,
			isSyncing,
			shellStatePipelinePhase,
			combinedDesktopPersistenceError,
			tabConflictDetected,
			staleShellStateConflict,
			syncWorkspaceFromServer,
			clearTabConflict,
			onRecoverStaleShellState,
			loadFailure,
			clearLoadFailure,
			syncToServer,
			onFlushPersistPatches,
			persistQueuedPatches,
			isDraggingIcon,
			gridStep,
			showEnhancedContextMenu,
			contextMenuPosition,
			setShowEnhancedContextMenu,
			items,
			selected,
			contextMenuType,
			handleAction,
			clipboardLength,
			iconSizeConfig,
			snapToGrid,
			desktopUiScale,
			ctxTargetItem,
			activeWindowAlwaysOnTop,
			desktopWindowStyle,
			propertiesItem,
			setPropertiesItem,
			displayItems,
			iconSize,
			desktopIconStyle,
			desktopItemBadgeCounts,
			folderChildCounts,
			folderPreviewByFolderId,
			handleDesktopIconSelect,
			handleDesktopIconDoubleClick,
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
			openAppStoreAsWindow,
			widgetPosition,
			onWidgetPositionCommit,
			onBackgroundContentDragOver,
			onBackgroundContentDrop,
			onExternalContentDropToFolder,
			widgetsPanel,
			assistantPropertiesPanelActions,
			onAssistantPropertiesPanelAction,
		]
	);
}
