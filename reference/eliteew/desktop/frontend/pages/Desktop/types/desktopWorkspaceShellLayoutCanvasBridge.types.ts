/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Typed prop groups for the T29+ canvas/interactions layout bridge — reduces flat
 * prop fan-out in DesktopWorkspaceContent before useDesktopWorkspaceShellLayoutInputBridge.
 *
 * Invariants:
 * - Groups partition DesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice without overlap.
 * - Field names match the flat slot cluster contract exactly.
 *
 * Related:
 * - hooks/useDesktopWorkspaceShellLayoutCanvasAndInteractionsInput.ts
 * - hooks/useDesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import type { DesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice } from '../hooks/useDesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice';

type CanvasSlice = DesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice;

/** Welcome rail, floating widget, notifications and shell chrome surfacing on canvas. */
export type DesktopWorkspaceShellLayoutCanvasShellSurfaceGroup = Pick<
	CanvasSlice,
	| 't'
	| 'setSelected'
	| 'handleContextMenu'
	| 'showWelcome'
	| 'onWelcomeComplete'
	| 'showDesktopWidget'
	| 'floatingWidgetPerformanceForCanvas'
	| 'autoQuietWindowLoad'
	| 'isShellSettingsWindowOpen'
	| 'desktopUnreadCount'
	| 'markAllAsRead'
	| 'widgetAvatarUrl'
	| 'openSocialHubTab'
	| 'updateDesktopVisualPreferences'
	| 'desktopWidgetsStyle'
	| 'reduceMotionWorkspace'
	| 'isWindowDragActive'
	| 'openAppStoreAsWindow'
>;

/** Sync chip, persist queue and stale shell-state recovery on the workspace canvas. */
export type DesktopWorkspaceShellLayoutCanvasSyncPersistenceGroup = Pick<
	CanvasSlice,
	| 'isOnline'
	| 'isSyncing'
	| 'shellStatePipelinePhase'
	| 'combinedDesktopPersistenceError'
	| 'tabConflictDetected'
	| 'staleShellStateConflict'
	| 'syncWorkspaceFromServer'
	/** Context menu / F5 hard reload — must not drop in layout bridge assembly. */
	| 'performWorkspaceRefresh'
	| 'clearTabConflict'
	| 'onRecoverStaleShellState'
	| 'loadFailure'
	| 'clearLoadFailure'
	| 'syncToServer'
	| 'onFlushPersistPatches'
	| 'persistQueuedPatches'
>;

/** Desktop icon grid: selection, drag, context menu and folder drop targets. */
export type DesktopWorkspaceShellLayoutCanvasIconInteractionsGroup = Pick<
	CanvasSlice,
	| 'isDraggingIcon'
	| 'gridStep'
	| 'showEnhancedContextMenu'
	| 'contextMenuPosition'
	| 'setShowEnhancedContextMenu'
	| 'items'
	| 'selected'
	| 'contextMenuType'
	| 'clipboard'
	| 'iconSizeConfig'
	| 'snapToGridEnabled'
	| 'desktopUiScale'
	| 'ctx'
	| 'propertiesItem'
	| 'setPropertiesItem'
	| 'iconSize'
	| 'desktopItemBadgeCounts'
	| 'folderChildCounts'
	| 'folderPreviewByFolderId'
	| 'handleDesktopIconSelect'
	| 'handleDragStart'
	| 'handleDesktopIconDragEnd'
	| 'handleDrag'
	| 'handleDropToFolder'
	| 'handleDesktopIconRename'
	| 'handleStartIconRename'
	| 'handleCancelIconRename'
	| 'renamingId'
	| 'iconIsCut'
	| 'activeDropTargetFolderId'
	| 'setActiveDropTargetFolderId'
	| 'handleRubberBandSelection'
	| 'desktopAreaRef'
>;

/** Window layer, virtual desktops and window chrome interactions. */
export type DesktopWorkspaceShellLayoutCanvasWindowSlotGroup = Pick<
	CanvasSlice,
	| 'windowContextMenu'
	| 'activeDesktopId'
	| 'onVdDropHover'
	| 'desktops'
	| 'minimizeWindow'
	| 'maximizeWindow'
	| 'closeWindow'
	| 'toggleWindowAlwaysOnTop'
	| 'onToggleAlwaysOnTop'
	| 'onDuplicateWindow'
	| 'activeWindowAlwaysOnTop'
	| 'moveWindowToDesktop'
	| 'onOpenShellSettings'
	| 'snapZone'
	| 'moveWindow'
	| 'resizeWindow'
	| 'handleWindowDrag'
	| 'handleWindowDragCommit'
	| 'updateSnapZone'
	| 'getSnapZoneForPosition'
	| 'clearSnapZone'
	| 'snapWindow'
	| 'registerBeforeClose'
	| 'unregisterBeforeClose'
	| 'updateWindowPayload'
	| 'retargetFolderWindow'
	| 'installedApps'
	| 'onBringWindowIntoWorkArea'
>;

/** Widgets panel, floating widget position and external content drop handlers. */
export type DesktopWorkspaceShellLayoutCanvasWidgetsAndDropGroup = Pick<
	CanvasSlice,
	| 'widgetPosition'
	| 'onWidgetPositionCommit'
	| 'onBackgroundContentDragOver'
	| 'onBackgroundContentDrop'
	| 'onExternalContentDropToFolder'
	| 'widgetsPanel'
>;

/** Assistant context actions on selection and window context menu. */
export type DesktopWorkspaceShellLayoutCanvasAssistantGroup = Pick<
	CanvasSlice,
	| 'assistantWindowContextSummarizeEnabled'
	| 'assistantWindowContextGafEnabled'
	| 'onWindowContextAssistantSummarize'
	| 'onWindowContextAssistantShareGaf'
	| 'assistantPropertiesPanelActions'
	| 'onAssistantPropertiesPanelAction'
>;

/** Grouped input for useDesktopWorkspaceShellLayoutCanvasAndInteractionsInput. */
export type DesktopWorkspaceShellLayoutCanvasAndInteractionsBridgeInput = {
	shellSurface: DesktopWorkspaceShellLayoutCanvasShellSurfaceGroup;
	syncPersistence: DesktopWorkspaceShellLayoutCanvasSyncPersistenceGroup;
	iconInteractions: DesktopWorkspaceShellLayoutCanvasIconInteractionsGroup;
	windowSlot: DesktopWorkspaceShellLayoutCanvasWindowSlotGroup;
	widgetsAndDrop: DesktopWorkspaceShellLayoutCanvasWidgetsAndDropGroup;
	assistant: DesktopWorkspaceShellLayoutCanvasAssistantGroup;
};
