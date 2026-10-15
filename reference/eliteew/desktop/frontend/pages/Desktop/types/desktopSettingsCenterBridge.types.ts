/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Bridge contract between `DesktopWorkspaceContent` and Settings Center shell tab.
 *
 * Invariants:
 * - `syncPrefs` reads/writes active `shell_state` preferences via taskbar prefs provider + coordinator.
 *
 * Related:
 * - `useDesktopSettingsCenterBridge.ts`, `DesktopSettingsShellTab.tsx`
 */

import type { DesktopItem } from './desktop.types';
import type { DesktopStorageSyncErrorCode } from '../utils/desktopStorageSyncError';

/** Subset of virtual desktop row for settings UI (matches `useVirtualDesktops` shape). */
export type SettingsCenterVirtualDesktopRow = {
	id: string;
	name: string;
	wallpaper?: string;
	isActive: boolean;
};

export type DesktopSettingsCenterSyncPrefs = {
	showSeconds: boolean;
	onShowSecondsChange: (value: boolean) => void;
	quietMode: boolean;
	onQuietModeChange: (value: boolean) => void;
	timezone: string;
	onTimezoneChange: (value: string) => void;
};

export type DesktopSettingsCenterBridge = {
	virtualDesktops: {
		desktops: SettingsCenterVirtualDesktopRow[];
		activeDesktopId: string;
		globalWallpaper: string;
		onCreateDesktop: () => void;
		onDeleteDesktop: (id: string) => void;
		onSwitchDesktop: (id: string) => void;
		onRenameDesktop: (id: string, name: string) => void;
		/** Copy current global wallpaper from settings / config to this virtual desktop. */
		onApplyGlobalWallpaperToDesktop: (id: string) => void;
	};
	sync: {
		tabConflictDetected: boolean;
		clearTabConflict: () => void;
		isSyncing: boolean;
		storageError: DesktopStorageSyncErrorCode | null;
		isOnline: boolean;
		persistQueue: {
			config: number;
			shell: number;
			total: number;
		};
		persistPatchFlushFailed: string | null;
		onFlushPersistQueue?: () => void | Promise<void>;
		onRefreshAll: () => Promise<void>;
		/** Optional: wave 18 — safe diagnostics JSON (structure/counts only). */
		onExportDiagnosticsSummary?: () => void | Promise<void>;
		/** Optional: full shell_state JSON after explicit confirm. */
		onExportDiagnosticsFullShell?: () => void | Promise<void>;
	};
	apps: {
		installedApps: DesktopItem[];
		isAppShortcutOnDesktop: (app: DesktopItem) => boolean;
		onAddAppToDesktop: (app: DesktopItem) => void;
		onRemoveAppFromDesktop: (app: DesktopItem) => void;
		onOpenAppStore: () => void;
	};
	windows: {
		onBringWindowsIntoWorkArea: () => void;
	};
	syncPrefs: DesktopSettingsCenterSyncPrefs;
};
