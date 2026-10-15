/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Builds the paired props for desktop window context menus and the window layer from shell-level state.
 * Keeps both slots in sync without making layout components know every workspace callback.
 *
 * Invariants:
 * - Context menu Assistant/GAF actions are exposed only through the menu slot, not as titlebar chrome controls.
 * - Window-layer props stay limited to rendering, movement, resize, and lifecycle contracts.
 *
 * Related:
 * - DesktopWindowLayer.tsx
 * - DesktopWorkspaceWindowContextMenu.tsx
 */

import { useMemo } from 'react';
import type { DesktopWorkspaceWindowContextMenuProps } from '../components/DesktopWorkspaceWindowContextMenu';
import type { DesktopWindowLayerProps } from '../components/DesktopWindowLayer';
import type { DesktopItem } from '../types/desktop.types';

export function useDesktopWorkspaceShellWindowSlotProps(params: {
	windowContextMenu: DesktopWorkspaceWindowContextMenuProps['windowContextMenu'];
	onDismissWindowContextMenu: () => void;
	reduceMotionWorkspace: boolean | null;
	currentDesktopWindows: DesktopWorkspaceWindowContextMenuProps['currentDesktopWindows'];
	desktops: DesktopWorkspaceWindowContextMenuProps['desktops'];
	minimizeWindow: DesktopWorkspaceWindowContextMenuProps['onMinimizeWindow'];
	maximizeWindow: DesktopWorkspaceWindowContextMenuProps['onMaximizeWindow'];
	closeWindow: DesktopWorkspaceWindowContextMenuProps['onCloseWindow'];
	moveWindowToDesktop: DesktopWorkspaceWindowContextMenuProps['moveWindowToDesktop'];
	onOpenShellSettings: DesktopWorkspaceWindowContextMenuProps['onOpenShellSettings'];
	desktopItems: DesktopWindowLayerProps['desktopItems'];
	activeDesktopWindowId: string | null;
	snapZone: DesktopWindowLayerProps['snapZone'];
	moveWindow: DesktopWindowLayerProps['onMove'];
	resizeWindow: DesktopWindowLayerProps['onResize'];
	handleWindowDrag: DesktopWindowLayerProps['onDrag'];
	handleWindowDragCommit: DesktopWindowLayerProps['onDragCommit'];
	updateSnapZone: DesktopWindowLayerProps['updateSnapZone'];
	getSnapZoneForPosition: DesktopWindowLayerProps['getSnapZoneForPosition'];
	clearSnapZone: DesktopWindowLayerProps['clearSnapZone'];
	snapWindow: DesktopWindowLayerProps['snapWindow'];
	registerBeforeClose: DesktopWindowLayerProps['registerBeforeClose'];
	unregisterBeforeClose: DesktopWindowLayerProps['unregisterBeforeClose'];
	updateWindowPayload: DesktopWindowLayerProps['updateWindowPayload'];
	retargetFolderWindow: DesktopWindowLayerProps['retargetFolderWindow'];
	desktopWindowStyle: DesktopWindowLayerProps['visualStyle'];
	focusWindow: DesktopWindowLayerProps['onFocus'];
	installedApps?: DesktopItem[];
	onBringWindowIntoWorkArea?: DesktopWorkspaceWindowContextMenuProps['onBringWindowIntoWorkArea'];
	onToggleAlwaysOnTop?: DesktopWorkspaceWindowContextMenuProps['onToggleAlwaysOnTop'];
	onDuplicateWindow?: DesktopWorkspaceWindowContextMenuProps['onDuplicateWindow'];
	isWindowDragActive?: boolean;
	assistantWindowContextSummarizeEnabled?: boolean;
	assistantWindowContextGafEnabled?: boolean;
	onWindowContextAssistantSummarize?: (windowId: string) => void;
	onWindowContextAssistantShareGaf?: (windowId: string) => void;
	activeDesktopId: string;
	onVdDropHover: (desktopId: string | null) => void;
}): {
	windowContextMenu: DesktopWorkspaceWindowContextMenuProps;
	windowLayer: DesktopWindowLayerProps;
} {
	const {
		windowContextMenu,
		onDismissWindowContextMenu,
		reduceMotionWorkspace,
		currentDesktopWindows,
		desktops,
		minimizeWindow,
		maximizeWindow,
		closeWindow,
		moveWindowToDesktop,
		onOpenShellSettings,
		desktopItems,
		activeDesktopWindowId,
		snapZone,
		moveWindow,
		resizeWindow,
		handleWindowDrag,
		handleWindowDragCommit,
		updateSnapZone,
		getSnapZoneForPosition,
		clearSnapZone,
		snapWindow,
		registerBeforeClose,
		unregisterBeforeClose,
		updateWindowPayload,
		retargetFolderWindow,
		desktopWindowStyle,
		focusWindow,
		installedApps,
		onBringWindowIntoWorkArea,
		onToggleAlwaysOnTop,
		onDuplicateWindow,
		isWindowDragActive = false,
		assistantWindowContextSummarizeEnabled,
		assistantWindowContextGafEnabled,
		onWindowContextAssistantSummarize,
		onWindowContextAssistantShareGaf,
		activeDesktopId,
		onVdDropHover,
	} = params;

	return useMemo(
		() => ({
			windowContextMenu: {
				windowContextMenu,
				onDismiss: onDismissWindowContextMenu,
				reduceMotion: reduceMotionWorkspace === true,
				currentDesktopWindows,
				desktops,
				onMinimizeWindow: minimizeWindow,
				onMaximizeWindow: maximizeWindow,
				onCloseWindow: closeWindow,
				onFocusWindow: focusWindow,
				moveWindowToDesktop,
				onOpenShellSettings,
				snapWindow,
				onBringWindowIntoWorkArea,
				onToggleAlwaysOnTop,
				onDuplicateWindow,
				installedApps,
				assistantWindowContextSummarizeEnabled,
				assistantWindowContextGafEnabled,
				onWindowContextAssistantSummarize,
				onWindowContextAssistantShareGaf,
			},
			windowLayer: {
				currentDesktopWindows,
				desktopItems,
				installedApps,
				snapLayoutPickerOpen: isWindowDragActive,
				activeWindowId: activeDesktopWindowId,
				snapZone,
				onClose: closeWindow,
				onMinimize: minimizeWindow,
				onMaximize: maximizeWindow,
				onFocus: focusWindow,
				onMove: moveWindow,
				onResize: resizeWindow,
				onDrag: handleWindowDrag,
				onDragCommit: handleWindowDragCommit,
				updateSnapZone,
				getSnapZoneForPosition,
				clearSnapZone,
				snapWindow,
				registerBeforeClose,
				unregisterBeforeClose,
				updateWindowPayload,
				retargetFolderWindow,
				visualStyle: desktopWindowStyle,
				activeDesktopId,
				moveWindowToDesktop,
				onVdDropHover,
				onToggleAlwaysOnTop,
			},
		}),
		[
			windowContextMenu,
			onDismissWindowContextMenu,
			reduceMotionWorkspace,
			currentDesktopWindows,
			desktops,
			minimizeWindow,
			maximizeWindow,
			closeWindow,
			moveWindowToDesktop,
			onOpenShellSettings,
			desktopItems,
			activeDesktopWindowId,
			snapZone,
			focusWindow,
			moveWindow,
			resizeWindow,
			handleWindowDrag,
			handleWindowDragCommit,
			updateSnapZone,
			getSnapZoneForPosition,
			clearSnapZone,
			snapWindow,
			registerBeforeClose,
			unregisterBeforeClose,
			updateWindowPayload,
			retargetFolderWindow,
			desktopWindowStyle,
			installedApps,
			onBringWindowIntoWorkArea,
			onToggleAlwaysOnTop,
			onDuplicateWindow,
			assistantWindowContextSummarizeEnabled,
			assistantWindowContextGafEnabled,
			onWindowContextAssistantSummarize,
			onWindowContextAssistantShareGaf,
			isWindowDragActive,
			activeDesktopId,
			onVdDropHover,
		]
	);
}
