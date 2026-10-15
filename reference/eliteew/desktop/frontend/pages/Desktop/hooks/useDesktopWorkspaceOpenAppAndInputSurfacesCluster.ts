/**
 * T18: плоские пропсы для {@link useDesktopWorkspaceOpenAppAndInputSurfaces}
 * (без вложенного литерала `keyboard` в контенте).
 */

import type { UseDesktopWorkspaceKeyboardShortcutsParams } from './useDesktopWorkspaceKeyboardShortcuts';
import { useDesktopWorkspaceOpenAppAndInputSurfaces } from './useDesktopWorkspaceOpenAppAndInputSurfaces';

type OpenAppInput = Parameters<
	typeof useDesktopWorkspaceOpenAppAndInputSurfaces
>[0];

export type UseDesktopWorkspaceOpenAppAndInputSurfacesClusterParams =
	UseDesktopWorkspaceKeyboardShortcutsParams & Omit<OpenAppInput, 'keyboard'>;

export function useDesktopWorkspaceOpenAppAndInputSurfacesCluster(
	p: UseDesktopWorkspaceOpenAppAndInputSurfacesClusterParams
): void {
	const {
		setShowCommandPalette,
		minimizeAllWindows,
		items,
		windowsRef,
		desktops,
		activeDesktopId,
		switchToDesktop,
		focusWindow,
		handleOpenWindow,
		updateWindowPayload,
		activeDesktopWindow,
		currentDesktopWindows,
		activeDesktopWindowId,
		snapWindow,
		maximizeWindow,
		minimizeWindow,
		closeWindow,
		setShowQuickSearch,
		setShowTaskSwitcher,
		toggleExplicitTheme,
		showCommandPalette,
		setShowShortcutsHelp,
		openShellSettings,
		openSocialHubTab,
		openDesktopAppByComponent,
		setShowClipboard,
		installedApps,
		switchToNextDesktop,
		switchToPreviousDesktop,
		createDesktop,
		onWorkspaceRefresh,
		openNewFolderDialog,
	} = p;

	useDesktopWorkspaceOpenAppAndInputSurfaces({
		keyboard: {
			activeDesktopWindow,
			currentDesktopWindows,
			activeDesktopWindowId,
			snapWindow,
			maximizeWindow,
			minimizeWindow,
			closeWindow,
			minimizeAllWindows,
			setShowQuickSearch,
			setShowTaskSwitcher,
			toggleExplicitTheme,
			showCommandPalette,
			setShowCommandPalette,
			setShowShortcutsHelp,
			openShellSettings,
			openSocialHubTab,
			openDesktopAppByComponent,
			setShowClipboard,
			installedApps,
			handleOpenWindow,
			switchToNextDesktop,
			switchToPreviousDesktop,
			createDesktop,
			desktops,
			switchToDesktop,
			focusWindow,
			onWorkspaceRefresh,
			openNewFolderDialog,
		},
		setShowCommandPalette,
		minimizeAllWindows,
		items,
		windowsRef,
		desktops,
		activeDesktopId,
		switchToDesktop,
		focusWindow,
		handleOpenWindow,
		updateWindowPayload,
		closeWindow,
		minimizeWindow,
	});
}
