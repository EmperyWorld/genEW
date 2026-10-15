/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Assembles {@link useDesktopWorkspaceShellModalsChain} args so DesktopWorkspaceContent
 * avoids a large inline literal; wires command-palette window layout actions.
 *
 * Invariants:
 * - Snap/maximize/restore palette actions target the active desktop window only.
 *
 * Related:
 * - useDesktopWorkspaceCommandAction.ts, CommandPalette.tsx
 */

import { useCallback } from 'react';
import type { SnapZone } from '../types/desktop.types';
import { useDesktopWorkspaceShellModalsChain } from './useDesktopWorkspaceShellModalsChain';

type ChainParams = Parameters<typeof useDesktopWorkspaceShellModalsChain>[0];

/** Плоские пропсы: `snapToGridEnabled` мапится в `handleAction.snapToGridEffective`. */
export type DesktopWorkspaceShellModalsClusterParams = Omit<
	ChainParams['handleAction'],
	'snapToGridEffective'
> &
	ChainParams['commandAction'] &
	ChainParams['modals'] & {
		snapToGridEnabled: ChainParams['handleAction']['snapToGridEffective'];
		snapWindow: (windowId: string, zone: SnapZone) => void;
	};

export function useDesktopWorkspaceShellModalsCluster(
	p: DesktopWorkspaceShellModalsClusterParams
): ReturnType<typeof useDesktopWorkspaceShellModalsChain> {
	const {
		snapToGridEnabled,
		ctx,
		items,
		selected,
		gridStep,
		setShowNF,
		openAppStoreAsWindow,
		setShowSessionInfoPanel,
		openSocialHubTab,
		openShellSettings,
		handleOpenWindow,
		commitItems,
		setSelected,
		performWorkspaceRefresh,
		setPropertiesItem,
		setRenamingId,
		copyItems,
		cutItems,
		pasteClipboard,
		updateConfig,
		activeDesktopWindow,
		minimizeWindow,
		maximizeWindow,
		closeWindow,
		toggleWindowAlwaysOnTop,
		updateDesktopVisualPreferences,
		minimizeAllWindows,
		setShowQuickSearch,
		openDesktopAppByComponent,
		createMarkdownFile,
		createDesktop,
		switchToNextDesktop,
		switchToPreviousDesktop,
		setShowTaskSwitcher,
		setShowShortcutsHelp,
		toggleExplicitTheme,
		closeShellSettingsWindow,
		setShowWP,
		bumpNotificationCenterOpen,
		openVoiceCommandCenter,
		setShowClipboard,
		showWP,
		wallpaper,
		wallpaperHistory,
		handleWallpaperChange,
		handleRemoveUserWallpaper,
		openWallpaperFromDesktopSettings,
		showNF,
		onCloseNewFolder,
		handleCreateFolder,
		openEditFolderIconDialog,
		desktopWindowStyle,
		desktopIconStyle,
		showCommandPalette,
		setShowCommandPalette,
		displayItems,
		showClipboard,
		snapWindow,
	} = p;

	const snapActiveWindowLeft = useCallback(() => {
		const id = activeDesktopWindow?.id;
		if (id) snapWindow(id, 'left');
	}, [activeDesktopWindow?.id, snapWindow]);

	const snapActiveWindowRight = useCallback(() => {
		const id = activeDesktopWindow?.id;
		if (id) snapWindow(id, 'right');
	}, [activeDesktopWindow?.id, snapWindow]);

	const maximizeActiveWindow = useCallback(() => {
		const id = activeDesktopWindow?.id;
		if (id && !activeDesktopWindow?.isMaximized) maximizeWindow(id);
	}, [activeDesktopWindow, maximizeWindow]);

	const restoreActiveWindow = useCallback(() => {
		const id = activeDesktopWindow?.id;
		if (id && activeDesktopWindow?.isMaximized) maximizeWindow(id);
	}, [activeDesktopWindow, maximizeWindow]);

	return useDesktopWorkspaceShellModalsChain({
		handleAction: {
			ctx,
			items,
			selected,
			gridStep,
			snapToGridEffective: snapToGridEnabled,
			setShowNF,
			openAppStoreAsWindow,
			setShowSessionInfoPanel,
			openSocialHubTab,
			openShellSettings,
			handleOpenWindow,
			openDesktopAppByComponent,
			createMarkdownFile,
			commitItems,
			setSelected,
			performWorkspaceRefresh,
			setPropertiesItem,
			setRenamingId,
			copyItems,
			cutItems,
			pasteClipboard,
			updateConfig,
			activeDesktopWindow,
			minimizeWindow,
			maximizeWindow,
			closeWindow,
			toggleWindowAlwaysOnTop,
			updateDesktopVisualPreferences,
			openEditFolderIconDialog,
		},
		commandAction: {
			setShowNF,
			performWorkspaceRefresh,
			minimizeAllWindows,
			setShowQuickSearch,
			openSocialHubTab,
			openDesktopAppByComponent,
			createDesktop,
			switchToNextDesktop,
			switchToPreviousDesktop,
			setShowTaskSwitcher,
			setShowShortcutsHelp,
			toggleExplicitTheme,
			closeShellSettingsWindow,
			setShowWP,
			openShellSettings,
			bumpNotificationCenterOpen,
			openVoiceCommandCenter,
			setShowClipboard,
			snapActiveWindowLeft,
			snapActiveWindowRight,
			maximizeActiveWindow,
			restoreActiveWindow,
		},
		modals: {
			showWP,
			setShowWP,
			wallpaper,
			wallpaperHistory,
			handleWallpaperChange,
			handleRemoveUserWallpaper,
			openWallpaperFromDesktopSettings,
			showNF,
			setShowNF,
			onCloseNewFolder,
			handleCreateFolder,
			desktopWindowStyle,
			desktopIconStyle,
			showCommandPalette,
			setShowCommandPalette,
			displayItems,
			handleOpenWindow,
			showClipboard,
			setShowClipboard,
		},
	});
}
