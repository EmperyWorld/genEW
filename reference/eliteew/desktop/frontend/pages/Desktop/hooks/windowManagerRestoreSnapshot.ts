/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure helpers to turn persisted `windows_snapshot` entries into runtime `WindowState`
 * for session restore (legacy remap, geometry guards, item resolution, z-order).
 *
 * Invariants:
 * - Invalid geometry entries are skipped, not thrown.
 * - Legacy hidden / ephemeral app components never restore.
 * - Persisted `zIndex` is preserved when finite; otherwise monotonic fallback applies.
 *
 * Related:
 * - `hooks/useWindowManager.ts`, `hooks/useDesktopShellWindowPersistence.ts`
 * - `documentation/product/desktop/DESKTOP-STATE-PERSISTENCE.md`
 */

import { DEFAULT_APPS } from '../constants';
import type {
	DesktopItem,
	PersistedWindowState,
	WindowState,
} from '../types/desktop.types';
import {
	isEphemeralDesktopWindowComponent,
	isLegacyHiddenDesktopAppComponent,
	remapLegacyDesktopAppComponent,
} from '../utils/desktopAppRegistry';

export type RestoredWindowBuildResult = {
	windows: WindowState[];
	/** Parallel to `windows`: persisted `desktopId` per restored window. */
	desktopIds: (string | undefined)[];
	maxZ: number;
};

export type BuildRestoredWindowStatesOptions = {
	snapshot: PersistedWindowState[];
	items: DesktopItem[];
	createWindowId: (builtIndex: number) => string;
	onSkipInvalid?: (entry: PersistedWindowState) => void;
	onSkipNoItem?: (entry: PersistedWindowState) => void;
};

export function normalizePersistedWindowSnapshot(
	snapshot: PersistedWindowState[]
): PersistedWindowState[] {
	const remapped = snapshot.map((s) => ({
		...s,
		appComponent:
			remapLegacyDesktopAppComponent(s.appComponent) ?? s.appComponent,
	}));
	return remapped.filter(
		(s) =>
			!isLegacyHiddenDesktopAppComponent(s.appComponent) &&
			!isEphemeralDesktopWindowComponent(s.appComponent)
	);
}

export function isValidPersistedWindowGeometry(
	entry: PersistedWindowState
): boolean {
	return (
		!!entry.position &&
		typeof entry.position.x === 'number' &&
		typeof entry.position.y === 'number' &&
		!!entry.size &&
		typeof entry.size.width === 'number' &&
		typeof entry.size.height === 'number'
	);
}

export function resolveRestoreItemForSnapshot(
	entry: PersistedWindowState,
	items: DesktopItem[]
): DesktopItem | undefined {
	if (entry.type === 'folder' && entry.folderId != null) {
		return items.find((item) => item.id === entry.folderId);
	}

	if (entry.type !== 'app') {
		return undefined;
	}

	const byComponent =
		entry.appComponent != null && entry.appComponent !== ''
			? items.find(
					(item) =>
						item.type === 'app' && item.appComponent === entry.appComponent
				)
			: undefined;
	const byName =
		byComponent ??
		items.find((item) => item.type === 'app' && item.name === entry.title);

	if (byName) {
		return byName;
	}

	if (entry.appComponent) {
		return DEFAULT_APPS.find((app) => app.appComponent === entry.appComponent);
	}

	return undefined;
}

export function buildRestoredWindowStates(
	options: BuildRestoredWindowStatesOptions
): RestoredWindowBuildResult {
	const filtered = normalizePersistedWindowSnapshot(options.snapshot);
	const windows: WindowState[] = [];
	const desktopIds: (string | undefined)[] = [];
	let fallbackZ = 1;

	for (const entry of filtered) {
		if (!isValidPersistedWindowGeometry(entry)) {
			options.onSkipInvalid?.(entry);
			continue;
		}

		const item = resolveRestoreItemForSnapshot(entry, options.items);
		if (!item) {
			options.onSkipNoItem?.(entry);
			continue;
		}

		const pathFromSnapshot = Array.isArray(entry.path) ? entry.path : [];
		const restoredZ =
			typeof entry.zIndex === 'number' && Number.isFinite(entry.zIndex)
				? Math.max(1, Math.trunc(entry.zIndex))
				: fallbackZ;
		fallbackZ = Math.max(fallbackZ, restoredZ + 1);

		windows.push({
			id: options.createWindowId(windows.length),
			title: entry.title,
			type: entry.type,
			position: entry.position,
			size: entry.size,
			restoreBounds: null,
			isMinimized: Boolean(entry.isMinimized),
			isMaximized: Boolean(entry.isMaximized),
			zIndex: restoredZ,
			folderId: item.id,
			path: pathFromSnapshot.length > 0 ? pathFromSnapshot : [item.name],
			appComponent: item.appComponent,
			icon: item.icon,
			initialPayload: entry.initialPayload,
			openedFromSessionRestore: true,
		});
		desktopIds.push(entry.desktopId);
	}

	const maxZ =
		windows.length === 0
			? 0
			: Math.max(...windows.map((window) => window.zIndex));

	return { windows, desktopIds, maxZ };
}

const RESTORE_SKIP_INVALID_PREFIX =
	'[Desktop:Windows] Skipping invalid window snapshot';
const RESTORE_SKIP_NO_ITEM_PREFIX = '[Desktop:Debug] Restore skip: no item';

export function logRestoreSkipInvalid(entry: PersistedWindowState): void {
	// eslint-disable-next-line no-console
	console.warn(RESTORE_SKIP_INVALID_PREFIX, entry);
}

export function logRestoreSkipNoItem(entry: PersistedWindowState): void {
	console.warn(
		RESTORE_SKIP_NO_ITEM_PREFIX,
		JSON.stringify({
			title: entry.title,
			type: entry.type,
			appComponent: entry.appComponent ?? '(empty)',
		})
	);
}

/** Normalize + build; returns null when nothing restorable remains. */
export function prepareSessionRestore(
	snapshot: PersistedWindowState[],
	items: DesktopItem[],
	createWindowId: (builtIndex: number) => string,
	hooks?: {
		onSkipInvalid?: (entry: PersistedWindowState) => void;
		onSkipNoItem?: (entry: PersistedWindowState) => void;
	}
): RestoredWindowBuildResult | null {
	if (normalizePersistedWindowSnapshot(snapshot).length === 0) {
		return null;
	}
	const result = buildRestoredWindowStates({
		snapshot,
		items,
		createWindowId,
		onSkipInvalid: hooks?.onSkipInvalid ?? logRestoreSkipInvalid,
		onSkipNoItem: hooks?.onSkipNoItem ?? logRestoreSkipNoItem,
	});
	return result.windows.length === 0 ? null : result;
}
