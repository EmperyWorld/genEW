/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * T35 input assembler: maps coarse workspace source slices to voice/settings cluster input.
 *
 * Invariants:
 * - Pass-through field mapping only; cluster hook owns integration → facade wiring.
 *
 * Related:
 * - hooks/useDesktopWorkspaceVoiceSettingsCenterCluster.ts
 * - types/desktopWorkspaceVoiceSettingsCenterCluster.types.ts
 */

import type { TFunction } from 'i18next';
import type { MutableRefObject, RefObject } from 'react';
import type {
	DesktopConfig,
	DesktopItem,
	WindowState,
} from '../types/desktop.types';
import type { SettingsCenterVirtualDesktopRow } from '../types/desktopSettingsCenterBridge.types';
import type { DesktopExpansionSettings } from '../types/desktopExpansion.types';
import type { DesktopWorkspaceVisualPreferenceState } from './useDesktopWorkspaceVisualProfileBridge';
import type { TabId } from '../components/settings/desktopSettingsShared.types';
import type { DesktopShellSettingsBridgeValue } from '../context/DesktopShellSettingsBridgeContext';
import type { UseDesktopStorageReturn } from './useDesktopStorage';
import type { DesktopShellMotionPrefs } from '../utils/resolveDesktopShellMotion';
import {
	useDesktopWorkspaceVoiceSettingsCenterCluster,
	type DesktopWorkspaceVoiceSettingsCenterClusterResult,
} from './useDesktopWorkspaceVoiceSettingsCenterCluster';

type DesktopConfigVisualActions = {
	setTheme: (theme: DesktopConfig['theme']) => void;
	setWallpaper: (wallpaper: string) => void;
	setAccent: (accent: DesktopConfig['accent']) => void;
	setAccentCustomHex: (hex: string) => void;
};

export type DesktopWorkspaceVoiceSettingsCenterClusterSources = {
	virtualDesktops: {
		desktops: SettingsCenterVirtualDesktopRow[];
		activeDesktopId: string;
		wallpaper: string;
		createDesktop: () => void;
		deleteDesktop: (id: string) => void;
		switchToDesktop: (id: string) => void;
		updateDesktopName: (id: string, name: string) => void;
		updateDesktopWallpaper: (id: string, wallpaper: string) => void;
	};
	storageAndPersist: {
		storage: Pick<
			UseDesktopStorageReturn,
			| 'isOnline'
			| 'isSyncing'
			| 'error'
			| 'tabConflictDetected'
			| 'clearTabConflict'
			| 'refresh'
			| 'isConfigSaving'
			| 'configSaveError'
		>;
		persistPatchStats: { config: number; shell: number; total: number };
		persistPatchFlushFailed: string | null | undefined;
		flushPersistPatches: () => void | Promise<void>;
	};
	expansionLaunch: {
		expansionSettings: DesktopExpansionSettings;
		installedApps: DesktopItem[];
		items: DesktopItem[];
		handlePinAppFromStartMenu: (app: DesktopItem) => void;
		openAppStoreAsWindow: () => void;
		deleteItem: (id: string) => void | Promise<void>;
	};
	windowsAndVoice: {
		windows: WindowState[];
		getWindowsOnDesktop: (desktopId: string) => string[];
		currentDesktopWindows: WindowState[];
		bringWindowsIntoWorkArea: (
			predicate: (window: WindowState) => boolean
		) => void;
		focusWindow: (windowId: string) => void;
		closeWindow: (windowId: string) => void;
		minimizeAllWindows: () => void;
		closeActiveDesktopWindow: () => void;
		activeDesktopWindowId: string | null;
		handleOpenWindow: (item: DesktopItem) => void;
		setShowNF: (value: boolean) => void;
		setShowCommandPalette: (value: boolean) => void;
	};
	personalization: {
		config: DesktopConfig | null | undefined;
		desktopVisualPreferences: DesktopWorkspaceVisualPreferenceState;
		deferVisualPersistRef: MutableRefObject<boolean>;
		actions: DesktopConfigVisualActions;
		updateConfig: (
			patch: Partial<DesktopConfig>,
			options?: { persistRemote?: boolean }
		) => Promise<void> | void;
		updateDesktopVisualPreferences: (
			updates: Partial<DesktopWorkspaceVisualPreferenceState>,
			options?: { persist?: boolean }
		) => void | Promise<void>;
		updateDesktopWallpaper: (id: string, wallpaper: string) => void;
		persistSubjectForQueue: string | null | undefined;
	};
	i18n: {
		t: TFunction;
		clientLanguage: string;
	};
	themeSurface: {
		theme: DesktopConfig['theme'];
		setTheme: (theme: DesktopConfig['theme']) => void;
		effectiveTheme: DesktopConfig['theme'];
		desktopThemeVars: Record<string, string>;
		accent: DesktopConfig['accent'];
		accentCustomHex: string;
		setAccentChoice: (accent: DesktopConfig['accent']) => void;
		onAccentCustomHexChange: (hex: string) => void;
		applyCuratedDesktopConfigPreset: (
			set: import('../constants/desktopCuratedStyleSets').DesktopCuratedStyleSet
		) => void | Promise<void>;
		iconSize: DesktopConfig['icon_size'];
		snapToGridEnabled: boolean;
		gridStep: DesktopConfig['grid_step'];
		desktopIconStyle: DesktopWorkspaceVisualPreferenceState['desktop_icon_style'];
		desktopTaskbarStyle: DesktopWorkspaceVisualPreferenceState['desktop_taskbar_style'];
		desktopWindowStyle: DesktopWorkspaceVisualPreferenceState['desktop_window_style'];
		showDesktopWidget: boolean;
		desktopOpenAppsMaximized: boolean;
		desktopUiScale: number;
	};
	settingsPanel: {
		desktopSettingsActiveTab: TabId;
		setDesktopSettingsActiveTab: (tab: TabId) => void;
		mergedSettingsPerformanceForPanel: DesktopShellSettingsBridgeValue['performance'];
		personalizationStagingActive: boolean;
		startPersonalizationStaging: () => void;
		commitPersonalizationStaging: () => Promise<void>;
		cancelPersonalizationStaging: () => void;
		isProfileUiSaving: boolean;
	};
	appearanceBridge: {
		setShowWP: (value: boolean) => void;
		preferencesApp: ReturnType<
			typeof import('../../contexts/UserPreferencesAppContext').useUserPreferencesApp
		>;
		notifyDesktop: (message: string, detail?: string) => void;
		withProfileUiSaveIndicator: <T>(fn: () => Promise<T>) => Promise<T>;
		clearPanelOpacityPersistTimer: () => void;
		setDesktopVisualPreferences: (
			value: DesktopWorkspaceVisualPreferenceState
		) => void;
		serverUiPreferencesRef: MutableRefObject<unknown>;
		desktopVisualPreferencesRef: MutableRefObject<DesktopWorkspaceVisualPreferenceState>;
		resolvedDesktopVisualPreferencesRef: MutableRefObject<DesktopWorkspaceVisualPreferenceState>;
		panelOpacityPersistTimerRef: MutableRefObject<ReturnType<
			typeof setTimeout
		> | null>;
	};
	wallpaperBridge: {
		createFolderAPI: (
			name: string,
			parentId?: string
		) => Promise<DesktopItem | null>;
		setWallpaper: (wallpaper: string) => void;
	};
	mainSurface: {
		desktopAreaRef: RefObject<HTMLDivElement>;
		storageLoading: boolean;
		shellMotionPrefs: DesktopShellMotionPrefs;
	};
};

export function useDesktopWorkspaceVoiceSettingsCenterClusterInput(
	sources: DesktopWorkspaceVoiceSettingsCenterClusterSources
): DesktopWorkspaceVoiceSettingsCenterClusterResult {
	const {
		virtualDesktops,
		storageAndPersist,
		expansionLaunch,
		windowsAndVoice,
		personalization,
		i18n,
		themeSurface,
		settingsPanel,
		appearanceBridge,
		wallpaperBridge,
		mainSurface,
	} = sources;

	const {
		storage,
		persistPatchStats,
		persistPatchFlushFailed,
		flushPersistPatches,
	} = storageAndPersist;

	return useDesktopWorkspaceVoiceSettingsCenterCluster({
		settingsCenter: {
			bridgeVirtualDesktops: {
				desktops: virtualDesktops.desktops,
				activeDesktopId: virtualDesktops.activeDesktopId,
				wallpaper: virtualDesktops.wallpaper,
				createDesktop: virtualDesktops.createDesktop,
				deleteDesktop: virtualDesktops.deleteDesktop,
				switchToDesktop: virtualDesktops.switchToDesktop,
				updateDesktopName: virtualDesktops.updateDesktopName,
				updateDesktopWallpaper: virtualDesktops.updateDesktopWallpaper,
			},
			bridgeSync: {
				tabConflictDetected: storage.tabConflictDetected,
				clearTabConflict: storage.clearTabConflict,
				isSyncing: storage.isSyncing,
				storageError: storage.error,
				isOnline: storage.isOnline,
				persistPatchStats,
				persistPatchFlushFailed,
				flushPersistPatches,
				refreshStorage: storage.refresh,
			},
			bridgeAppsWindows: {
				expansionSettings: expansionLaunch.expansionSettings,
				installedApps: expansionLaunch.installedApps,
				items: expansionLaunch.items,
				handlePinAppFromStartMenu: expansionLaunch.handlePinAppFromStartMenu,
				deleteItem: expansionLaunch.deleteItem,
				openAppStoreAsWindow: expansionLaunch.openAppStoreAsWindow,
				getWindowsOnDesktop: windowsAndVoice.getWindowsOnDesktop,
				currentDesktopWindows: windowsAndVoice.currentDesktopWindows,
				bringWindowsIntoWorkArea: windowsAndVoice.bringWindowsIntoWorkArea,
			},
			bridgeI18n: {
				t: i18n.t,
				clientLanguage: i18n.clientLanguage,
			},
			personalization: {
				config: personalization.config,
				desktopVisualPreferences: personalization.desktopVisualPreferences,
				deferVisualPersistRef: personalization.deferVisualPersistRef,
				actions: personalization.actions,
				updateConfig: personalization.updateConfig,
				updateDesktopVisualPreferences:
					personalization.updateDesktopVisualPreferences,
				updateDesktopWallpaper: personalization.updateDesktopWallpaper,
				activeDesktopId: virtualDesktops.activeDesktopId,
				persistSubjectForQueue: personalization.persistSubjectForQueue,
			},
			workspaceProfiles: {
				windows: windowsAndVoice.windows,
				getWindowsOnDesktop: windowsAndVoice.getWindowsOnDesktop,
				activeDesktopId: virtualDesktops.activeDesktopId,
			},
		},
		voiceCommands: {
			items: expansionLaunch.items,
			windows: windowsAndVoice.windows,
			currentDesktopWindows: windowsAndVoice.currentDesktopWindows,
			activeWindowId: windowsAndVoice.activeDesktopWindowId,
			focusWindow: windowsAndVoice.focusWindow,
			handleOpenWindow: windowsAndVoice.handleOpenWindow,
			setShowNF: windowsAndVoice.setShowNF,
			minimizeAllWindows: windowsAndVoice.minimizeAllWindows,
			closeWindow: windowsAndVoice.closeWindow,
			closeActiveWindow: windowsAndVoice.closeActiveDesktopWindow,
			setShowCommandPalette: windowsAndVoice.setShowCommandPalette,
		},
		surfaceChrome: {
			visual: {
				desktopVisualPreferences: personalization.desktopVisualPreferences,
				desktopWindowStyle: themeSurface.desktopWindowStyle,
				accent: themeSurface.accent,
				accentCustomHex: themeSurface.accentCustomHex,
			},
			shellRest: {
				applyCuratedDesktopConfigPreset:
					themeSurface.applyCuratedDesktopConfigPreset,
				updateDesktopVisualPreferences:
					personalization.updateDesktopVisualPreferences,
				updateConfig: personalization.updateConfig,
				config: personalization.config,
				isOnline: storage.isOnline,
				isConfigSaving: storage.isConfigSaving,
				isProfileSaving: settingsPanel.isProfileUiSaving,
				configSaveError: storage.configSaveError ?? null,
				activeTab: settingsPanel.desktopSettingsActiveTab,
				onActiveTabChange: settingsPanel.setDesktopSettingsActiveTab,
				theme: themeSurface.theme,
				onThemeChange: themeSurface.setTheme,
				accent: themeSurface.accent,
				accentCustomHex: themeSurface.accentCustomHex,
				onAccentChange: themeSurface.setAccentChoice,
				onAccentCustomHexChange: themeSurface.onAccentCustomHexChange,
				wallpaper: virtualDesktops.wallpaper,
				iconSize: themeSurface.iconSize,
				snapToGridEnabled: themeSurface.snapToGridEnabled,
				gridStep: themeSurface.gridStep,
				desktopIconStyle: themeSurface.desktopIconStyle,
				desktopTaskbarStyle: themeSurface.desktopTaskbarStyle,
				desktopWindowStyle: themeSurface.desktopWindowStyle,
				desktopFloatingWidgetVisible: themeSurface.showDesktopWidget,
				desktopOpenAppsMaximized: themeSurface.desktopOpenAppsMaximized,
				desktopUiScale: themeSurface.desktopUiScale,
				expansionSettings: expansionLaunch.expansionSettings,
				performance: settingsPanel.mergedSettingsPerformanceForPanel,
				profilePatchRemote: !settingsPanel.personalizationStagingActive,
				personalizationStagingActive:
					settingsPanel.personalizationStagingActive,
				onPersonalizationStagingStart:
					settingsPanel.startPersonalizationStaging,
				onPersonalizationStagingCommit:
					settingsPanel.commitPersonalizationStaging,
				onPersonalizationStagingCancel:
					settingsPanel.cancelPersonalizationStaging,
			},
			appearance: {
				setShowWP: appearanceBridge.setShowWP,
				updateConfig: personalization.updateConfig,
				updateDesktopVisualPreferences:
					personalization.updateDesktopVisualPreferences,
				clearPanelOpacityPersistTimer:
					appearanceBridge.clearPanelOpacityPersistTimer,
				setDesktopVisualPreferences:
					appearanceBridge.setDesktopVisualPreferences,
				notifyDesktop: appearanceBridge.notifyDesktop,
				preferencesApp: appearanceBridge.preferencesApp,
				withProfileUiSaveIndicator: appearanceBridge.withProfileUiSaveIndicator,
				serverUiPreferencesRef: appearanceBridge.serverUiPreferencesRef,
				desktopVisualPreferencesRef:
					appearanceBridge.desktopVisualPreferencesRef,
				resolvedDesktopVisualPreferencesRef:
					appearanceBridge.resolvedDesktopVisualPreferencesRef,
				panelOpacityPersistTimerRef:
					appearanceBridge.panelOpacityPersistTimerRef,
				deferProfilePersistRef: personalization.deferVisualPersistRef,
			},
			wallpaperRest: {
				createFolderAPI: wallpaperBridge.createFolderAPI,
				setWallpaper: wallpaperBridge.setWallpaper,
				updateConfig: personalization.updateConfig,
				deferConfigPersistRef: personalization.deferVisualPersistRef,
				wallpaper: virtualDesktops.wallpaper,
				wallpaperHistory: personalization.config?.wallpaper_history,
			},
			mainSurfaceRest: {
				desktopAreaRef: mainSurface.desktopAreaRef,
				desktopThemeVars: themeSurface.desktopThemeVars,
				effectiveTheme: themeSurface.effectiveTheme,
				storageLoading: mainSurface.storageLoading,
				parallaxDisabled:
					mainSurface.storageLoading ||
					!mainSurface.shellMotionPrefs.parallaxEnabled,
				parallaxIntensityScale:
					mainSurface.shellMotionPrefs.parallaxIntensityScale,
			},
			virtualDesktop: {
				desktops: virtualDesktops.desktops,
				activeDesktopId: virtualDesktops.activeDesktopId,
				wallpaper: virtualDesktops.wallpaper,
			},
		},
	});
}
