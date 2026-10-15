/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Bridges window manager and overlay state into useKeyboardShortcuts for the desktop shell.
 *
 * Invariants:
 * - Keyboard shortcuts call typed app-launch callbacks instead of writing window payloads directly.
 * - Handler objects stay memoized for stable downstream listeners.
 *
 * Related:
 * - useDesktopWorkspaceAppLaunch.ts
 */

import type { Dispatch, SetStateAction } from 'react';
import { useMemo } from 'react';

/** useState setter or narrow context callback — keyboard hook only passes boolean. */
export type DesktopShellBoolSetter =
	| Dispatch<SetStateAction<boolean>>
	| ((value: boolean) => void);
import type { DesktopControlCenterTab } from '../components/DesktopSettingsPanel';
import type {
	DesktopItem,
	SnapZone,
	WindowState,
} from '../types/desktop.types';
import type { OpenWindowOptions } from './useWindowManager';
import { getQuickLaunchPinnedApps } from '../utils/taskbarPinnedOrder';
import type { VirtualDesktop } from './useVirtualDesktops';
import { requestToggleDesktopNotifications } from '../utils/desktopDeepLink';
import {
	useKeyboardShortcuts,
	type ShortcutHandlers,
} from './useKeyboardShortcuts';

export type UseDesktopWorkspaceKeyboardShortcutsParams = {
	activeDesktopWindow: WindowState | null;
	currentDesktopWindows: WindowState[];
	activeDesktopWindowId: string | null;
	snapWindow: (id: string, zone: SnapZone) => void;
	maximizeWindow: (id: string) => void;
	minimizeWindow: (id: string) => void;
	closeWindow: (id: string) => void;
	minimizeAllWindows: () => void;
	setShowQuickSearch: DesktopShellBoolSetter;
	setShowTaskSwitcher: DesktopShellBoolSetter;
	toggleExplicitTheme: () => void;
	showCommandPalette: boolean;
	setShowCommandPalette: DesktopShellBoolSetter;
	setShowShortcutsHelp: DesktopShellBoolSetter;
	openShellSettings: (tab?: DesktopControlCenterTab) => void;
	openSocialHubTab: (
		tab?: 'overview' | 'friends' | 'profile' | 'mobile-app'
	) => DesktopItem | undefined;
	openDesktopAppByComponent: (
		appComponent: string,
		options?: OpenWindowOptions
	) => DesktopItem | undefined;
	setShowClipboard: DesktopShellBoolSetter;
	installedApps: DesktopItem[];
	handleOpenWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
	switchToNextDesktop: () => void;
	switchToPreviousDesktop: () => void;
	createDesktop: () => void;
	desktops: VirtualDesktop[];
	switchToDesktop: (id: string) => void;
	focusWindow: (id: string) => void;
	/** F5 / «Обновить»: полная перезагрузка страницы (hard navigation reload). */
	onWorkspaceRefresh?: () => void;
	/** Ctrl+Shift+N / Win+Shift+N — диалог новой папки на столе. */
	openNewFolderDialog?: () => void;
};

export function useDesktopWorkspaceKeyboardShortcuts(
	params: UseDesktopWorkspaceKeyboardShortcutsParams
): ReturnType<typeof useKeyboardShortcuts> {
	const {
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
	} = params;

	const handlers = useMemo<ShortcutHandlers>(
		() => ({
			onSnapLeft: () => {
				const w = activeDesktopWindow;
				if (w) snapWindow(w.id, 'left');
			},
			onSnapRight: () => {
				const w = activeDesktopWindow;
				if (w) snapWindow(w.id, 'right');
			},
			onSnapTop: () => {
				const w = activeDesktopWindow;
				if (w) maximizeWindow(w.id);
			},
			onSnapBottom: () => {
				const w = activeDesktopWindow;
				if (w) snapWindow(w.id, 'bottom');
			},
			onSnapLeftThird: () => {
				const w = activeDesktopWindow;
				if (w) snapWindow(w.id, 'left-third');
			},
			onSnapCenterThird: () => {
				const w = activeDesktopWindow;
				if (w) snapWindow(w.id, 'center-third');
			},
			onSnapRightThird: () => {
				const w = activeDesktopWindow;
				if (w) snapWindow(w.id, 'right-third');
			},
			onSnapTopLeft: () => {
				const w = activeDesktopWindow;
				if (w) snapWindow(w.id, 'top-left');
			},
			onSnapTopRight: () => {
				const w = activeDesktopWindow;
				if (w) snapWindow(w.id, 'top-right');
			},
			onSnapBottomLeft: () => {
				const w = activeDesktopWindow;
				if (w) snapWindow(w.id, 'bottom-left');
			},
			onSnapBottomRight: () => {
				const w = activeDesktopWindow;
				if (w) snapWindow(w.id, 'bottom-right');
			},
			onMaximize: () => {
				const w = activeDesktopWindow;
				if (w) maximizeWindow(w.id);
			},
			onMinimize: () => {
				const w = activeDesktopWindow;
				if (w) minimizeWindow(w.id);
			},
			onCloseWindow: () => {
				const w = activeDesktopWindow;
				if (w) closeWindow(w.id);
			},
			onShowDesktop: minimizeAllWindows,
			onOpenSearch: () => setShowQuickSearch(true),
			onOpenTaskSwitcher: () => setShowTaskSwitcher(true),
			onQuickSearch: () => setShowQuickSearch(true),
			onToggleTheme: toggleExplicitTheme,
			onOpenCommandPalette: () => setShowCommandPalette(!showCommandPalette),
			onHelp: () => setShowShortcutsHelp(true),
			onOpenSettings: () => {
				openShellSettings('personalize');
			},
			onOpenProfile: () => {
				openSocialHubTab('profile');
			},
			onOpenExplorer: () => {
				openDesktopAppByComponent('ContentManagerPro');
			},
			onOpenClipboard: () => setShowClipboard(true),
			onSearch: () => setShowQuickSearch(true),
			onQuickAppAccess: (appNumber: number) => {
				const quickApps = getQuickLaunchPinnedApps(installedApps);
				if (appNumber > 0 && appNumber <= quickApps.length) {
					handleOpenWindow(quickApps[appNumber - 1]);
				}
			},
			onSwitchApp: (direction) => {
				if (currentDesktopWindows.length > 0) {
					const focusedId = activeDesktopWindowId;
					const idx = currentDesktopWindows.findIndex(
						(w) => w.id === focusedId
					);
					const nextIdx =
						direction === 'next'
							? (idx + 1) % currentDesktopWindows.length
							: (idx - 1 + currentDesktopWindows.length) %
								currentDesktopWindows.length;
					focusWindow(
						currentDesktopWindows[nextIdx]?.id ?? currentDesktopWindows[0].id
					);
				}
			},
			onSwitchToNextDesktop: switchToNextDesktop,
			onSwitchToPreviousDesktop: switchToPreviousDesktop,
			onCreateDesktop: createDesktop,
			onSwitchToDesktop: (desktopNumber: number) => {
				if (desktopNumber > 0 && desktopNumber <= desktops.length) {
					switchToDesktop(desktops[desktopNumber - 1].id);
				}
			},
			onRefresh: onWorkspaceRefresh,
			onNewFolder: () => openNewFolderDialog?.(),
			onToggleNotifications: () => requestToggleDesktopNotifications(),
			onToggleFullscreen: () => {
				try {
					if (!document.fullscreenElement) {
						void document.documentElement.requestFullscreen();
					} else {
						void document.exitFullscreen();
					}
				} catch {
					// Fullscreen API may be blocked by browser policy.
				}
			},
		}),
		[
			activeDesktopWindow,
			activeDesktopWindowId,
			closeWindow,
			createDesktop,
			currentDesktopWindows,
			desktops,
			focusWindow,
			handleOpenWindow,
			installedApps,
			maximizeWindow,
			minimizeAllWindows,
			minimizeWindow,
			openDesktopAppByComponent,
			openSocialHubTab,
			onWorkspaceRefresh,
			openNewFolderDialog,
			setShowClipboard,
			setShowCommandPalette,
			openShellSettings,
			setShowQuickSearch,
			setShowShortcutsHelp,
			setShowTaskSwitcher,
			showCommandPalette,
			snapWindow,
			switchToDesktop,
			switchToNextDesktop,
			switchToPreviousDesktop,
			toggleExplicitTheme,
		]
	);

	return useKeyboardShortcuts(handlers);
}
