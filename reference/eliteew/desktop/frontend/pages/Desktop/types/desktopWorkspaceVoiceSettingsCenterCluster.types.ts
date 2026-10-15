/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Typed prop groups for T35 voice commands + settings-center integration cluster.
 *
 * Invariants:
 * - Groups partition cluster input without overlap; field names match child hook contracts.
 * - Integration-injected facade fields stay out of shellRest / wallpaperRest groups.
 *
 * Related:
 * - hooks/useDesktopWorkspaceVoiceSettingsCenterCluster.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import type { TFunction } from 'i18next';
import type { DesktopItem, WindowState } from '../types/desktop.types';
import type { SettingsCenterVirtualDesktopRow } from '../types/desktopSettingsCenterBridge.types';
import type { DesktopWorkspaceSettingsSurfaceChromeFacadeParams } from '../hooks/useDesktopWorkspaceSettingsSurfaceChromeFacade';
import type {
	UseDesktopWorkspaceSettingsCenterIntegrationParams,
	UseDesktopWorkspaceSettingsCenterIntegrationResult,
} from '../hooks/useDesktopWorkspaceSettingsCenterIntegration';
import type { DesktopWorkspaceSurfaceChromeBundleInput } from '../hooks/useDesktopWorkspaceSurfaceChromeBundleInput';
import type { DesktopWorkspaceSurfaceChromeShellClusterRest } from '../hooks/useDesktopWorkspaceSurfaceChromeBundle';
import type { DesktopSettingsCenterBridge } from '../types/desktopSettingsCenterBridge.types';

type FacadeParams = DesktopWorkspaceSettingsSurfaceChromeFacadeParams;

type SettingsCenterBridgeBase =
	UseDesktopWorkspaceSettingsCenterIntegrationParams['bridge'];

/** Virtual desktops + global wallpaper for Settings Center bridge. */
export type DesktopWorkspaceVoiceSettingsCenterBridgeVirtualDesktopsGroup =
	Pick<
		SettingsCenterBridgeBase,
		| 'desktops'
		| 'activeDesktopId'
		| 'wallpaper'
		| 'createDesktop'
		| 'deleteDesktop'
		| 'switchToDesktop'
		| 'updateDesktopName'
		| 'updateDesktopWallpaper'
	>;

/** Sync, persist queue and storage refresh for Settings Center bridge. */
export type DesktopWorkspaceVoiceSettingsCenterBridgeSyncGroup = Pick<
	SettingsCenterBridgeBase,
	| 'tabConflictDetected'
	| 'clearTabConflict'
	| 'isSyncing'
	| 'storageError'
	| 'isOnline'
	| 'persistPatchStats'
	| 'persistPatchFlushFailed'
	| 'flushPersistPatches'
	| 'refreshStorage'
>;

/** Apps, expansion shell-state and window layout helpers for Settings Center bridge. */
export type DesktopWorkspaceVoiceSettingsCenterBridgeAppsWindowsGroup = Pick<
	SettingsCenterBridgeBase,
	| 'expansionSettings'
	| 'installedApps'
	| 'items'
	| 'handlePinAppFromStartMenu'
	| 'deleteItem'
	| 'openAppStoreAsWindow'
	| 'getWindowsOnDesktop'
	| 'currentDesktopWindows'
	| 'bringWindowsIntoWorkArea'
>;

export type DesktopWorkspaceVoiceSettingsCenterBridgeI18nGroup = {
	t: TFunction;
	clientLanguage: string;
};

export type DesktopWorkspaceVoiceSettingsCenterPersonalizationGroup =
	UseDesktopWorkspaceSettingsCenterIntegrationParams['personalization'];

export type DesktopWorkspaceVoiceSettingsCenterWorkspaceProfilesGroup =
	UseDesktopWorkspaceSettingsCenterIntegrationParams['workspaceProfilesShellContext'];

export type DesktopWorkspaceVoiceCommandsGroup = {
	items: DesktopItem[];
	windows: WindowState[];
	currentDesktopWindows: WindowState[];
	activeWindowId: string | null;
	focusWindow: (windowId: string) => void;
	handleOpenWindow: (item: DesktopItem) => void;
	setShowNF: (value: boolean) => void;
	minimizeAllWindows: () => void;
	closeWindow: (windowId: string) => void;
	closeActiveWindow: () => void;
	setShowCommandPalette: (value: boolean) => void;
};

export type DesktopWorkspaceVoiceSettingsCenterVisualGroup =
	FacadeParams['visual'];

export type DesktopWorkspaceVoiceSettingsCenterShellRestGroup = Omit<
	FacadeParams['shell'],
	| 'settingsCenterBridge'
	| 'workspaceProfilesShellContext'
	| 'onApplyUserVisualStylePreset'
	| 'onExportPersonalizationPackJson'
	| 'onImportPersonalizationPackJson'
>;

export type DesktopWorkspaceVoiceSettingsCenterAppearanceGroup =
	FacadeParams['chrome']['appearance'];

export type DesktopWorkspaceVoiceSettingsCenterWallpaperRestGroup = Omit<
	FacadeParams['chrome']['wallpaper'],
	'clearActiveDesktopWallpaperOverride'
>;

export type DesktopWorkspaceVoiceSettingsCenterMainSurfaceRestGroup = Omit<
	FacadeParams['chrome']['mainSurface'],
	'wallpaper'
>;

export type DesktopWorkspaceVoiceSettingsCenterVirtualDesktopGroup = {
	desktops: SettingsCenterVirtualDesktopRow[];
	activeDesktopId: string;
	wallpaper: string;
};

export type DesktopWorkspaceVoiceSettingsCenterClusterInput = {
	settingsCenter: {
		bridgeVirtualDesktops: DesktopWorkspaceVoiceSettingsCenterBridgeVirtualDesktopsGroup;
		bridgeSync: DesktopWorkspaceVoiceSettingsCenterBridgeSyncGroup;
		bridgeAppsWindows: DesktopWorkspaceVoiceSettingsCenterBridgeAppsWindowsGroup;
		bridgeI18n: DesktopWorkspaceVoiceSettingsCenterBridgeI18nGroup;
		personalization: DesktopWorkspaceVoiceSettingsCenterPersonalizationGroup;
		workspaceProfiles: DesktopWorkspaceVoiceSettingsCenterWorkspaceProfilesGroup;
	};
	voiceCommands: DesktopWorkspaceVoiceCommandsGroup;
	surfaceChrome: {
		visual: DesktopWorkspaceVoiceSettingsCenterVisualGroup;
		shellRest: DesktopWorkspaceVoiceSettingsCenterShellRestGroup;
		appearance: DesktopWorkspaceVoiceSettingsCenterAppearanceGroup;
		wallpaperRest: DesktopWorkspaceVoiceSettingsCenterWallpaperRestGroup;
		mainSurfaceRest: DesktopWorkspaceVoiceSettingsCenterMainSurfaceRestGroup;
		virtualDesktop: DesktopWorkspaceVoiceSettingsCenterVirtualDesktopGroup;
	};
};

export type DesktopWorkspaceVoiceSettingsCenterClusterResult = {
	settingsCenterBridge: DesktopSettingsCenterBridge;
	workspaceProfilesShellContext: UseDesktopWorkspaceSettingsCenterIntegrationResult['workspaceProfilesShellContext'];
	shellClusterRest: DesktopWorkspaceSurfaceChromeShellClusterRest;
	surfaceChromeBundleInput: DesktopWorkspaceSurfaceChromeBundleInput;
	mainSurfaceWallpaper: string;
	activeVirtualDesktopShell: { id: string; name: string };
};
