/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Typed input groups for expansion-driven launch actions extracted from DesktopWorkspaceContent.
 *
 * Invariants:
 * - Mirrors expansionSettings slices used by workspace profiles, collections, shortcuts and assistant rails.
 *
 * Related:
 * - hooks/useDesktopWorkspaceExpansionLaunchActions.ts
 */

import type { TFunction } from 'i18next';
import type {
	DesktopAssistantContextAction,
	DesktopAppCollection,
	DesktopContentShortcut,
	DesktopWorkspaceProfile,
} from '../types/desktopExpansion.types';
import type {
	DesktopItem,
	RecentFile,
	WindowState,
} from '../types/desktop.types';
import type { OpenWindowOptions } from '../hooks/useWindowManager';

export type DesktopWorkspaceExpansionLaunchExpansionSlice = {
	workspaceProfiles: DesktopWorkspaceProfile[];
	appCollections: DesktopAppCollection[];
	contentShortcuts: DesktopContentShortcut[];
	assistantContextActions: DesktopAssistantContextAction[];
};

export type DesktopWorkspaceExpansionLaunchActionsInput = {
	items: DesktopItem[];
	installedApps: DesktopItem[];
	selected: Set<string>;
	activeDesktopId: string;
	activeDesktopWindow: WindowState | null | undefined;
	windows: WindowState[];
	expansion: DesktopWorkspaceExpansionLaunchExpansionSlice;
	handleOpenWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
	openDesktopAppByComponent: (
		component: string,
		options?: { initialPayload?: Record<string, unknown> }
	) => void;
	switchToDesktop: (desktopId: string) => void;
	updateDesktopWallpaper: (desktopId: string, wallpaper: string) => void;
	recordRecentAppOnVirtualDesktop: (itemId: string, desktopId: string) => void;
	addRecentFile: (file: RecentFile) => void;
	propertiesItem: DesktopItem | null;
	setPropertiesItem: (item: DesktopItem | null) => void;
	t: TFunction<'desktopUi'>;
};

export type DesktopWorkspaceExpansionLaunchActions = {
	openWorkspaceProfile: (profileId: string) => void;
	openAppInWorkspaceProfile: (app: DesktopItem, profileId: string) => void;
	openRecentDesktopFile: (file: RecentFile) => void;
	openAppCollection: (collectionId: string) => void;
	openContentShortcut: (shortcutId: string) => void;
	openAssistantContextAction: (actionId: string) => void;
	assistantPropertiesPanelActions: DesktopAssistantContextAction[];
	onAssistantPropertiesPanelAction: (actionId: string) => void;
	openGafChatBySession: (chatId: string) => void;
	assistantWindowContextSummarizeEnabled: boolean;
	assistantWindowContextGafEnabled: boolean;
	onWindowContextAssistantSummarize: (windowId: string) => void;
	onWindowContextAssistantShareGaf: (windowId: string) => void;
};
