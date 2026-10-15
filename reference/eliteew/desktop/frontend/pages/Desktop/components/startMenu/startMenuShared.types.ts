/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared Start Menu props contract for the multimodal orchestrator and all
 * interface modes (legacy / command console / workspace dashboard).
 *
 * Invariants:
 * - Modes must accept the same Taskbar wiring; no mode may drop required launch callbacks.
 *
 * Related:
 * - `../StartMenu.tsx`, `../StartMenuLegacy.tsx`
 * - `../../types/desktopStartMenu.ts`
 */

import type {
	DesktopIconStyle,
	DesktopWindowStyle,
} from '../../../../types/profile';
import type { OpenWindowOptions } from '../../hooks/useWindowManager';
import type { VirtualDesktop } from '../../hooks/useVirtualDesktops';
import type { StoreAppResponse } from '../../services/desktopApi';
import type {
	DesktopItem,
	RecentFile,
	WindowState,
} from '../../types/desktop.types';
import type {
	DesktopExpansionDiscoveryState,
	DesktopExpansionLaunchActions,
} from '../../types/desktopExpansion.types';
import type { StartMenuTab } from '../../types/desktopStartMenu';

export interface StartMenuProps {
	isOpen: boolean;
	onClose: () => void;
	apps: DesktopItem[];
	/** Folders and shortcuts — resolve workspace profile labels. */
	desktopItems?: DesktopItem[];
	onOpenApp: (app: DesktopItem, options?: OpenWindowOptions) => void;
	onWallpaper: () => void;
	onAppStore?: () => void;
	onPowerOff?: () => void;
	/** Open profile / account settings (UserProfile window). */
	onOpenProfile?: () => void;
	/** Show Admin button when caller grants UGS admin access. */
	onOpenAdmin?: () => void;
	/** Context menu: pin shortcut to desktop (no uninstall). */
	onPinAppToDesktop?: (app: DesktopItem) => void;
	/** Context menu: remove shortcut from desktop. */
	onUnpinAppFromDesktop?: (app: DesktopItem) => void;
	/** Open app in a workspace profile context (switch desktop + wallpaper + one window). */
	onOpenAppInWorkspace?: (app: DesktopItem, workspaceProfileId: string) => void;
	recentFiles?: RecentFile[];
	recentLibraryOpened?: RecentFile[];
	recentLibraryAdded?: RecentFile[];
	recentLibraryGenerated?: RecentFile[];
	recentLibraryUploaded?: RecentFile[];
	recentLibraryProjects?: RecentFile[];
	/** Library feed UX: loading / error from `GET /desktop/recent-content-feed`. */
	recentContentFeedLoading?: boolean;
	recentContentFeedError?: string | null;
	recentContentFeedLoadedAt?: number | null;
	hasRecentContentFeedItems?: boolean;
	onRefetchRecentContentFeed?: () => void | Promise<void>;
	/** Cog6ToothIcon → Shell → workspace scenarios. */
	onOpenShellWorkspacesSettings?: () => void;
	/** When nonce increases while open, switches tab (taskbar discovery hub). */
	startMenuIntent?: { tab: StartMenuTab; nonce: number };
	onOpenRecentFile?: (file: RecentFile) => void;
	onRemoveRecentFile?: (fileId: string) => void;
	/** Active virtual desktop — for «for this space» recommendations. */
	startMenuActiveDesktopId?: string;
	storeApps?: StoreAppResponse[];
	/** App ids currently shown on desktop root (for per-app status). */
	desktopAppIds?: string[];
	iconStyle?: DesktopIconStyle;
	shellWindowStyle?: DesktopWindowStyle;
	expansionState?: DesktopExpansionDiscoveryState;
	expansionLaunchActions?: DesktopExpansionLaunchActions;
	/** Virtual desktops (names and wallpaper) for workspace cards. */
	startMenuVirtualDesktops?: VirtualDesktop[];
	/** Global wallpaper when profile/desktop has none. */
	startMenuGlobalWallpaper?: string;
	/** Open windows on the active desktop (for "Continue" in Recent). */
	resumeWindows?: { id: string; title: string }[];
	onResumeOpenWindow?: (windowId: string) => void;
	/** All windows — live open-window hints on workspace cards. */
	startMenuWorkspaceContextWindows?: WindowState[];
	getWindowsOnDesktop?: (desktopId: string) => string[] | undefined;
}
