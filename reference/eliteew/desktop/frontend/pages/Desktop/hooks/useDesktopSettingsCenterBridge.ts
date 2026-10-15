/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Build `DesktopSettingsCenterBridge` for Settings Center (virtual desktops, sync, apps, diagnostics).
 *
 * Invariants:
 * - Must run under `DesktopTaskbarShellPrefsProvider` (workspace shell providers).
 * - PATCH side effects stay in taskbar prefs / coordinator — bridge exposes callbacks only.
 *
 * Related:
 * - `DesktopWorkspaceContent.tsx`, `DesktopSettingsShellTab.tsx`
 */

import { useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { notify as toast } from '@/notifications';
import type { DesktopExpansionSettings } from '../types/desktopExpansion.types';
import type {
	DesktopSettingsCenterBridge,
	SettingsCenterVirtualDesktopRow,
} from '../types/desktopSettingsCenterBridge.types';
import type { DesktopItem, WindowState } from '../types/desktop.types';
import {
	downloadJsonDocument,
	summarizeShellStateForDiagnostics,
} from '../utils/desktopDiagnosticsExport';
import { getCoalescedDesktopShellStateTelemetry } from '../utils/desktopShellStateWriteCoordinator';
import { fetchDesktopShellStateDeduplicated } from '../services/desktopApi';
import { useDesktopTaskbarShellPrefs } from './useDesktopTaskbarShellPrefs';
import type { DesktopStorageSyncErrorCode } from '../utils/desktopStorageSyncError';

export type UseDesktopSettingsCenterBridgeParams = {
	desktops: SettingsCenterVirtualDesktopRow[];
	activeDesktopId: string;
	wallpaper: string;
	createDesktop: () => void;
	deleteDesktop: (id: string) => void;
	switchToDesktop: (id: string) => void;
	updateDesktopName: (id: string, name: string) => void;
	updateDesktopWallpaper: (id: string, wallpaper: string) => void;
	tabConflictDetected: boolean;
	clearTabConflict: () => void;
	isSyncing: boolean;
	storageError: DesktopStorageSyncErrorCode | null | undefined;
	isOnline: boolean;
	persistPatchStats: { config: number; shell: number; total: number };
	persistPatchFlushFailed: string | null | undefined;
	flushPersistPatches: () => void | Promise<void>;
	refreshStorage: () => Promise<void>;
	expansionSettings: DesktopExpansionSettings;
	installedApps: DesktopItem[];
	items: DesktopItem[];
	handlePinAppFromStartMenu: (app: DesktopItem) => void;
	deleteItem: (id: string) => void | Promise<void>;
	openAppStoreAsWindow: () => void;
	getWindowsOnDesktop: (desktopId: string) => string[];
	currentDesktopWindows: WindowState[];
	bringWindowsIntoWorkArea: (
		predicate: (window: WindowState) => boolean
	) => void;
	t: TFunction;
	clientLanguage: string;
};

export function useDesktopSettingsCenterBridge(
	params: UseDesktopSettingsCenterBridgeParams
): DesktopSettingsCenterBridge {
	const {
		desktops,
		activeDesktopId,
		wallpaper,
		createDesktop,
		deleteDesktop,
		switchToDesktop,
		updateDesktopName,
		updateDesktopWallpaper,
		tabConflictDetected,
		clearTabConflict,
		isSyncing,
		storageError,
		isOnline,
		persistPatchStats,
		persistPatchFlushFailed,
		flushPersistPatches,
		refreshStorage,
		expansionSettings,
		installedApps,
		items,
		handlePinAppFromStartMenu,
		deleteItem,
		openAppStoreAsWindow,
		getWindowsOnDesktop,
		currentDesktopWindows,
		bringWindowsIntoWorkArea,
		t,
		clientLanguage,
	} = params;

	const {
		showSeconds,
		persistClockShowSeconds,
		quietMode,
		persistQuietMode,
		timezone,
		persistTimezone,
	} = useDesktopTaskbarShellPrefs();

	const handleExportDiagnosticsSummary = useCallback(async () => {
		let shellSummary: Record<string, unknown>;
		try {
			const shell = await fetchDesktopShellStateDeduplicated();
			shellSummary = summarizeShellStateForDiagnostics(
				shell as unknown as Record<string, unknown>
			);
		} catch (e) {
			shellSummary = {
				error: e instanceof Error ? e.message : 'fetch failed',
			};
		}
		downloadJsonDocument(
			`eliteew-desktop-diagnostics-summary-${Date.now()}.json`,
			{
				schemaVersion: 1 as const,
				exportedAt: new Date().toISOString(),
				client: {
					online: isOnline,
					language: clientLanguage,
				},
				sync: {
					tabConflict: tabConflictDetected,
					storageError: storageError ?? null,
					persistPatchFlushFailed: persistPatchFlushFailed ?? null,
				},
				persistQueue: {
					config: persistPatchStats.config,
					shell: persistPatchStats.shell,
					total: persistPatchStats.total,
				},
				coalescedWriter: getCoalescedDesktopShellStateTelemetry(),
				expansionCounts: {
					workspaceProfiles: expansionSettings.workspaceProfiles.length,
					windowLayoutPresets: expansionSettings.windowLayoutPresets.length,
					widgetSlots: expansionSettings.widgetsLayout.slots.length,
					appCollections: expansionSettings.appCollections.length,
					contentShortcuts: expansionSettings.contentShortcuts.length,
					assistantContextActions:
						expansionSettings.assistantContextActions.length,
					visualStylePresets: expansionSettings.visualStylePresets.length,
				},
				virtualDesktopsCount: desktops.length,
				shellStateSummary: shellSummary,
			}
		);
	}, [
		clientLanguage,
		desktops.length,
		expansionSettings,
		isOnline,
		persistPatchFlushFailed,
		persistPatchStats.config,
		persistPatchStats.shell,
		persistPatchStats.total,
		storageError,
		tabConflictDetected,
	]);

	const handleExportDiagnosticsFullShell = useCallback(async () => {
		if (!window.confirm(t('settingsPanel.diagnosticsFullExportConfirm'))) {
			return;
		}
		try {
			const shell = await fetchDesktopShellStateDeduplicated();
			downloadJsonDocument(`eliteew-desktop-shell-state-${Date.now()}.json`, {
				schemaVersion: 1 as const,
				exportedAt: new Date().toISOString(),
				warning: t('settingsPanel.diagnosticsFullExportWarning'),
				shellState: shell,
			});
		} catch (e) {
			toast.error(
				t('settingsPanel.diagnosticsExportFailedTitle'),
				e instanceof Error
					? e.message
					: t('settingsPanel.diagnosticsExportFailedBody')
			);
		}
	}, [t]);

	return useMemo((): DesktopSettingsCenterBridge => {
		return {
			virtualDesktops: {
				desktops,
				activeDesktopId,
				globalWallpaper: wallpaper,
				onCreateDesktop: () => createDesktop(),
				onDeleteDesktop: deleteDesktop,
				onSwitchDesktop: switchToDesktop,
				onRenameDesktop: updateDesktopName,
				onApplyGlobalWallpaperToDesktop: (id: string) =>
					updateDesktopWallpaper(id, wallpaper),
			},
			sync: {
				tabConflictDetected,
				clearTabConflict,
				isSyncing,
				storageError: storageError ?? null,
				isOnline,
				persistQueue: {
					config: persistPatchStats.config,
					shell: persistPatchStats.shell,
					total: persistPatchStats.total,
				},
				persistPatchFlushFailed: persistPatchFlushFailed ?? null,
				onFlushPersistQueue: flushPersistPatches,
				onRefreshAll: async () => {
					await refreshStorage();
					await expansionSettings.refresh();
				},
				onExportDiagnosticsSummary: () => {
					void handleExportDiagnosticsSummary();
				},
				onExportDiagnosticsFullShell: () => {
					void handleExportDiagnosticsFullShell();
				},
			},
			apps: {
				installedApps,
				isAppShortcutOnDesktop: (app) =>
					items.some((i) => i.type === 'app' && i.id === app.id && !i.parentId),
				onAddAppToDesktop: (app) => {
					handlePinAppFromStartMenu(app);
				},
				onRemoveAppFromDesktop: (app) => {
					const row = items.find(
						(i) => i.type === 'app' && i.id === app.id && !i.parentId
					);
					if (row) void deleteItem(row.id);
				},
				onOpenAppStore: openAppStoreAsWindow,
			},
			windows: {
				onBringWindowsIntoWorkArea: () => {
					const ids = new Set(getWindowsOnDesktop(activeDesktopId));
					const visibleCount = currentDesktopWindows.filter(
						(w) => !w.isMinimized && ids.has(w.id)
					).length;
					if (visibleCount === 0) {
						toast.info(t('settingsPanel.expansionBringWindowsToWorkAreaNone'));
						return;
					}
					bringWindowsIntoWorkArea((w) => ids.has(w.id));
					toast.success(
						t('settingsPanel.expansionBringWindowsToWorkAreaDone', {
							count: visibleCount,
						})
					);
				},
			},
			syncPrefs: {
				showSeconds,
				onShowSecondsChange: persistClockShowSeconds,
				quietMode,
				onQuietModeChange: persistQuietMode,
				timezone,
				onTimezoneChange: persistTimezone,
			},
		};
	}, [
		activeDesktopId,
		bringWindowsIntoWorkArea,
		clearTabConflict,
		createDesktop,
		currentDesktopWindows,
		deleteDesktop,
		deleteItem,
		desktops,
		expansionSettings,
		flushPersistPatches,
		getWindowsOnDesktop,
		handleExportDiagnosticsFullShell,
		handleExportDiagnosticsSummary,
		handlePinAppFromStartMenu,
		installedApps,
		isOnline,
		isSyncing,
		items,
		openAppStoreAsWindow,
		persistClockShowSeconds,
		persistPatchFlushFailed,
		persistPatchStats.config,
		persistPatchStats.shell,
		persistPatchStats.total,
		persistQuietMode,
		persistTimezone,
		quietMode,
		refreshStorage,
		showSeconds,
		storageError,
		switchToDesktop,
		t,
		tabConflictDetected,
		timezone,
		updateDesktopName,
		updateDesktopWallpaper,
		wallpaper,
	]);
}
