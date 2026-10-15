import type { PersistedWindowState } from '../types/desktop.types';
import { filterRestoredWindows } from './desktopOpenPayloads';

/**
 * Reads `windows` from `shell_state.windows_snapshot` payload (unvalidated).
 * Restore path should still use {@link assessWindowsSnapshotRestore}.
 */
export function getWindowsArrayFromShellSnapshot(
	windowsSnapshot: unknown
): PersistedWindowState[] {
	if (
		windowsSnapshot &&
		typeof windowsSnapshot === 'object' &&
		!Array.isArray(windowsSnapshot) &&
		'windows' in windowsSnapshot &&
		Array.isArray((windowsSnapshot as { windows?: unknown }).windows)
	) {
		return (windowsSnapshot as { windows: PersistedWindowState[] }).windows;
	}
	return [];
}

export type WindowsSnapshotRestoreAssessment =
	| { status: 'empty' }
	| { status: 'corrupt' }
	| {
			status: 'ok';
			windows: PersistedWindowState[];
			activeDesktopId?: string;
			/** Windows in snapshot that were filtered out (legacy/hidden/uninstalled). */
			skippedCount: number;
			requestedCount: number;
	  };

/**
 * Validates a persisted windows snapshot before applying restore (no side effects).
 * Exported for unit tests alongside shell_state restore logic.
 */
export function assessWindowsSnapshotRestore(
	parsed: {
		activeDesktopId?: string;
		windows?: PersistedWindowState[];
	},
	installedApps: { appComponent?: string | null }[]
): WindowsSnapshotRestoreAssessment {
	if (!parsed?.windows?.length) {
		return { status: 'empty' };
	}
	const requestedCount = parsed.windows.length;
	const nextWindows = filterRestoredWindows([...parsed.windows], installedApps);
	const skippedCount = Math.max(0, requestedCount - nextWindows.length);
	const appWindows = nextWindows.filter((w) => w.type === 'app');
	const appWithoutComponent = appWindows.filter(
		(w) => !w.appComponent || w.appComponent.trim() === ''
	);
	if (
		appWindows.length > 0 &&
		appWithoutComponent.length > appWindows.length / 2
	) {
		return { status: 'corrupt' };
	}
	if (!nextWindows.length) {
		return { status: 'empty' };
	}
	return {
		status: 'ok',
		windows: nextWindows,
		activeDesktopId: parsed.activeDesktopId,
		skippedCount,
		requestedCount,
	};
}
