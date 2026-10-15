import type {
	DesktopItem,
	PersistedWindowState,
	WindowState,
} from '../types/desktop.types';

function buildDesktopItemCatalog(
	items: DesktopItem[],
	installedApps: DesktopItem[]
): Map<string, DesktopItem> {
	const catalog = new Map<string, DesktopItem>();
	for (const i of installedApps) {
		if (!catalog.has(i.id)) catalog.set(i.id, i);
	}
	for (const i of items) {
		if (!catalog.has(i.id)) catalog.set(i.id, i);
	}
	return catalog;
}

/**
 * Build workspace profile app/folder id lists from open windows.
 * `folderId` on {@link WindowState} is the desktop item id for both app and folder windows.
 */
export function deriveWorkspaceProfileIdsFromWindows(
	windows: WindowState[],
	items: DesktopItem[],
	installedApps: DesktopItem[]
): { appIds: string[]; folderItemIds: string[] } {
	const catalog = buildDesktopItemCatalog(items, installedApps);
	const appIds: string[] = [];
	const folderItemIds: string[] = [];
	const seen = new Set<string>();

	for (const w of windows) {
		const fid = w.folderId?.trim();
		if (!fid || seen.has(fid)) continue;
		const item = catalog.get(fid);
		if (!item) continue;
		if (item.type === 'folder') {
			folderItemIds.push(fid);
			seen.add(fid);
		} else if (item.type === 'app') {
			appIds.push(fid);
			seen.add(fid);
		}
	}

	return { appIds, folderItemIds };
}

/**
 * Same as {@link deriveWorkspaceProfileIdsFromWindows} but for persisted snapshot windows.
 * When `filterDesktopId` is set, entries with a different non-empty `desktopId` are skipped.
 */
export function deriveWorkspaceProfileIdsFromPersistedWindows(
	persisted: PersistedWindowState[],
	items: DesktopItem[],
	installedApps: DesktopItem[],
	filterDesktopId?: string
): { appIds: string[]; folderItemIds: string[] } {
	const catalog = buildDesktopItemCatalog(items, installedApps);
	const appIds: string[] = [];
	const folderItemIds: string[] = [];
	const seen = new Set<string>();

	for (const w of persisted) {
		if (
			filterDesktopId !== undefined &&
			w.desktopId !== undefined &&
			w.desktopId !== '' &&
			w.desktopId !== filterDesktopId
		) {
			continue;
		}
		const fid = w.folderId?.trim();
		if (!fid || seen.has(fid)) continue;
		const item = catalog.get(fid);
		if (!item) continue;
		if (item.type === 'folder') {
			folderItemIds.push(fid);
			seen.add(fid);
		} else if (item.type === 'app') {
			appIds.push(fid);
			seen.add(fid);
		}
	}

	return { appIds, folderItemIds };
}
