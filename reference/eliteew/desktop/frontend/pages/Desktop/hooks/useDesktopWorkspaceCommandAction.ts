/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Command palette actions for DesktopModalsLayer, including app launches and workspace controls.
 *
 * Invariants:
 * - Social Hub command launches use the same tab union as the desktop launch helper.
 * - Command callbacks remain thin wrappers around workspace services.
 * - Info-only palette rows (`calendar`, `time`) are explicit no-ops if routed here.
 *
 * Related:
 * - useDesktopWorkspaceAppLaunch.ts
 */

import { useCallback } from 'react';
import type { DesktopControlCenterTab } from '../components/DesktopSettingsPanel';
import type { DesktopItem } from '../types/desktop.types';
import type { OpenWindowOptions } from './useWindowManager';

export interface UseDesktopWorkspaceCommandActionParams {
	setShowNF: (open: boolean) => void;
	performWorkspaceRefresh: () => void;
	minimizeAllWindows: () => void;
	setShowQuickSearch: (open: boolean) => void;
	openSocialHubTab: (
		tab?: 'overview' | 'friends' | 'profile' | 'mobile-app'
	) => DesktopItem | undefined;
	openDesktopAppByComponent: (
		component: string,
		options?: OpenWindowOptions
	) => DesktopItem | undefined;
	createDesktop: () => void;
	switchToNextDesktop: () => void;
	switchToPreviousDesktop: () => void;
	setShowTaskSwitcher: (open: boolean) => void;
	setShowShortcutsHelp: (open: boolean) => void;
	toggleExplicitTheme: () => void;
	closeShellSettingsWindow: () => void;
	setShowWP: (open: boolean) => void;
	openShellSettings: (tab?: DesktopControlCenterTab) => void;
	bumpNotificationCenterOpen: () => void;
	openVoiceCommandCenter: () => void;
	setShowClipboard: (open: boolean) => void;
	snapActiveWindowLeft?: () => void;
	snapActiveWindowRight?: () => void;
	maximizeActiveWindow?: () => void;
	restoreActiveWindow?: () => void;
}

export function useDesktopWorkspaceCommandAction(
	params: UseDesktopWorkspaceCommandActionParams
): (action: string) => void {
	const {
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
	} = params;

	return useCallback(
		(action: string) => {
			switch (action) {
				case 'create_folder':
					setShowNF(true);
					break;
				case 'refresh':
					performWorkspaceRefresh();
					break;
				case 'minimize_all':
					minimizeAllWindows();
					break;
				case 'quick_search':
					setShowQuickSearch(true);
					break;
				case 'open_profile': {
					openSocialHubTab('profile');
					break;
				}
				case 'open_explorer': {
					openDesktopAppByComponent('ContentManagerPro');
					break;
				}
				case 'create_virtual_desktop':
					createDesktop();
					break;
				case 'next_virtual_desktop':
					switchToNextDesktop();
					break;
				case 'prev_virtual_desktop':
					switchToPreviousDesktop();
					break;
				case 'task_switcher':
					setShowTaskSwitcher(true);
					break;
				case 'shortcuts_help':
					setShowShortcutsHelp(true);
					break;
				case 'toggle_theme': {
					toggleExplicitTheme();
					break;
				}
				case 'wallpaper':
					closeShellSettingsWindow();
					setShowWP(true);
					break;
				case 'settings':
					openShellSettings('personalize');
					break;
				case 'notifications':
					bumpNotificationCenterOpen();
					break;
				case 'voice':
					openVoiceCommandCenter();
					break;
				case 'clipboard':
					setShowClipboard(true);
					break;
				case 'snap_window_left':
					snapActiveWindowLeft?.();
					break;
				case 'snap_window_right':
					snapActiveWindowRight?.();
					break;
				case 'maximize_active_window':
					maximizeActiveWindow?.();
					break;
				case 'restore_active_window':
					restoreActiveWindow?.();
					break;
				case 'calendar':
				case 'time':
					break;
				default:
					break;
			}
		},
		[
			bumpNotificationCenterOpen,
			closeShellSettingsWindow,
			createDesktop,
			minimizeAllWindows,
			openDesktopAppByComponent,
			openShellSettings,
			openSocialHubTab,
			openVoiceCommandCenter,
			performWorkspaceRefresh,
			setShowClipboard,
			setShowNF,
			setShowQuickSearch,
			setShowShortcutsHelp,
			setShowTaskSwitcher,
			setShowWP,
			snapActiveWindowLeft,
			snapActiveWindowRight,
			maximizeActiveWindow,
			restoreActiveWindow,
			switchToNextDesktop,
			switchToPreviousDesktop,
			toggleExplicitTheme,
		]
	);
}
