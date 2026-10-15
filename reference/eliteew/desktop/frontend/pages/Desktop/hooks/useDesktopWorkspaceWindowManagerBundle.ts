import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback } from 'react';
import { useDesktopWorkspaceRefreshController } from './useDesktopWorkspaceRefreshController';
import { useDesktopWorkspaceWindowDragHandlers } from './useDesktopWorkspaceWindowDragHandlers';
import { useDesktopWorkspaceWindowsRef } from './useDesktopWorkspaceWindowsRef';
import { useWindowManager } from './useWindowManager';

/**
 * T11 — `useWindowManager` + refresh controller + `windowsRef` + drag commit handlers
 * (раньше кластер в `DesktopWorkspaceContent.tsx`).
 */
export function useDesktopWorkspaceWindowManagerBundle(params: {
	addWindowToDesktop: (windowId: string) => void;
	removeWindowFromDesktop: (windowId: string) => void;
	moveWindowToDesktop: (windowId: string, desktopId: string) => void;
	desktopOpenAppsMaximized: boolean;
	minimizeAnimationMs?: number;
	workspaceRefreshImplRef: MutableRefObject<(() => void) | null>;
	refreshStorage: () => void;
	onAfterWorkspaceRefresh?: () => void;
	markWindowDragActivity: () => void;
	clearWindowDragWidgetTimer: () => void;
	isWindowDragActiveRef: MutableRefObject<boolean>;
	setIsWindowDragActive: Dispatch<SetStateAction<boolean>>;
}) {
	const {
		addWindowToDesktop,
		removeWindowFromDesktop,
		moveWindowToDesktop,
		desktopOpenAppsMaximized,
		minimizeAnimationMs,
		workspaceRefreshImplRef,
		refreshStorage,
		onAfterWorkspaceRefresh,
		markWindowDragActivity,
		clearWindowDragWidgetTimer,
		isWindowDragActiveRef,
		setIsWindowDragActive,
	} = params;

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
		commitWindowPosition,
		registerBeforeClose,
		unregisterBeforeClose,
		restoreWindows,
		updateWindowPayload,
		retargetFolderWindow,
		bringWindowsIntoWorkArea,
	} = useWindowManager(
		addWindowToDesktop,
		removeWindowFromDesktop,
		moveWindowToDesktop,
		desktopOpenAppsMaximized,
		minimizeAnimationMs
	);

	const { performWorkspaceRefresh, syncWorkspaceFromServer } =
		useDesktopWorkspaceRefreshController({
			workspaceRefreshImplRef,
			refreshStorage,
			windows,
			closeWindow,
			onAfterWorkspaceRefresh,
		});

	const windowsRef = useDesktopWorkspaceWindowsRef(windows);

	const { handleWindowDrag, handleWindowDragCommit } =
		useDesktopWorkspaceWindowDragHandlers({
			markWindowDragActivity,
			clearWindowDragWidgetTimer,
			isWindowDragActiveRef,
			setIsWindowDragActive,
			moveWindow,
			commitWindowPosition,
		});

	const focusWindowGuarded = useCallback(
		(id: string) => {
			if (isWindowDragActiveRef.current) return;
			focusWindow(id);
		},
		[focusWindow, isWindowDragActiveRef]
	);

	return {
		windows,
		openWindow,
		closeWindow,
		minimizeWindow,
		maximizeWindow,
		focusWindow: focusWindowGuarded,
		toggleWindowAlwaysOnTop,
		snapWindow,
		minimizeAllWindows,
		snapZone,
		updateSnapZone,
		getSnapZoneForPosition,
		clearSnapZone,
		resizeWindow,
		moveWindow,
		commitWindowPosition,
		registerBeforeClose,
		unregisterBeforeClose,
		restoreWindows,
		updateWindowPayload,
		retargetFolderWindow,
		bringWindowsIntoWorkArea,
		performWorkspaceRefresh,
		syncWorkspaceFromServer,
		windowsRef,
		handleWindowDrag,
		handleWindowDragCommit,
	};
}
