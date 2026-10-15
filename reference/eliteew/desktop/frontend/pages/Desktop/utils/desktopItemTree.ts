/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop item tree helpers: nested folders, cycle guards, system-folder rules.
 *
 * Invariants:
 * - parentId uses desktop item_id strings (same as DesktopItem.id).
 * - Default system folders cannot be nested inside other folders.
 *
 * Related:
 * - ContentManager/sortToSystemFolders.ts
 * - hooks/useDesktopWorkspaceIconInteractions.ts
 * - DesktopFolderWindow.tsx · DesktopFolderExplorerSidebar.tsx
 */

import { SYSTEM_FOLDER_ITEM } from '@/pages/ContentManager/sortToSystemFolders';
import type { DesktopItem } from '../types/desktop.types';

/** Wire id for «Корневой раздел» (Content Manager «Без папки» / unfiled library). */
export const FOLDER_WINDOW_ROOT_ID = 'unfiled';

export type DesktopFolderTreeNode = DesktopItem & {
	children: DesktopFolderTreeNode[];
};

export type DesktopFolderPathSegment = {
	id: string;
	name: string;
};

const SYSTEM_FOLDER_IDS = new Set<string>(Object.values(SYSTEM_FOLDER_ITEM));

export function isDesktopSystemFolder(item: DesktopItem): boolean {
	return (
		item.type === 'folder' &&
		(item.isSystem === true || SYSTEM_FOLDER_IDS.has(item.id))
	);
}

export function getDesktopChildItems(
	items: DesktopItem[],
	parentId: string | undefined
): DesktopItem[] {
	const key = parentId ?? '';
	return items.filter((item) => (item.parentId ?? '') === key);
}

export type DesktopChildItemsSortBy = 'name' | 'date' | 'size';

export function filterAndSortDesktopChildItems(
	items: DesktopItem[],
	parentId: string | undefined,
	opts?: { search?: string; sortBy?: DesktopChildItemsSortBy }
): DesktopItem[] {
	let children = getDesktopChildItems(items, parentId);
	const q = opts?.search?.trim().toLowerCase();
	if (q) {
		children = children.filter((item) => item.name.toLowerCase().includes(q));
	}
	const sortBy = opts?.sortBy ?? 'name';
	const sorted = [...children];
	sorted.sort((a, b) => {
		if (sortBy === 'date') {
			const ta = Date.parse(a.updated_at ?? a.created_at ?? '') || 0;
			const tb = Date.parse(b.updated_at ?? b.created_at ?? '') || 0;
			return tb - ta;
		}
		if (sortBy === 'size') {
			return (b.size ?? 0) - (a.size ?? 0);
		}
		return (a.name || '').localeCompare(b.name || '', undefined, {
			sensitivity: 'base',
		});
	});
	return sorted;
}

export function desktopFolderDescendantIds(
	items: DesktopItem[],
	folderId: string
): Set<string> {
	const out = new Set<string>();
	const queue = [folderId];
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) continue;
		for (const child of items) {
			if (child.parentId !== current) continue;
			if (out.has(child.id)) continue;
			out.add(child.id);
			if (child.type === 'folder') {
				queue.push(child.id);
			}
		}
	}
	return out;
}

export function wouldCreateDesktopFolderCycle(
	items: DesktopItem[],
	folderId: string,
	targetParentFolderId: string
): boolean {
	if (folderId === targetParentFolderId) return true;
	const descendants = desktopFolderDescendantIds(items, folderId);
	return descendants.has(targetParentFolderId);
}

export function canMoveDesktopItemIntoFolder(
	items: DesktopItem[],
	item: DesktopItem,
	targetFolder: DesktopItem
): boolean {
	if (targetFolder.type !== 'folder') return false;
	if (item.id === targetFolder.id) return false;
	if (isDesktopSystemFolder(item)) return false;
	if (item.type === 'folder') {
		return !wouldCreateDesktopFolderCycle(items, item.id, targetFolder.id);
	}
	return true;
}

export function listValidNestedMoveTargetFolders(
	items: DesktopItem[],
	movingIds: Iterable<string>
): DesktopItem[] {
	const idSet = new Set(movingIds);
	const moving = items.filter((item) => idSet.has(item.id));
	if (moving.length === 0) return [];

	const excludeFolderIds = new Set<string>();
	for (const item of moving) {
		if (item.type === 'folder') {
			excludeFolderIds.add(item.id);
			for (const descendantId of desktopFolderDescendantIds(items, item.id)) {
				excludeFolderIds.add(descendantId);
			}
		}
	}

	return items
		.filter((candidate) => {
			if (candidate.type !== 'folder') return false;
			if (excludeFolderIds.has(candidate.id)) return false;
			return moving.every((item) =>
				canMoveDesktopItemIntoFolder(items, item, candidate)
			);
		})
		.sort((a, b) =>
			(a.name || '').localeCompare(b.name || '', undefined, {
				sensitivity: 'base',
			})
		);
}

export function collectDesktopMoveIntoFolderIds(
	items: DesktopItem[],
	selectedIds: Set<string>,
	anchorId: string,
	targetFolderId: string
): string[] {
	const target = items.find((i) => i.id === targetFolderId);
	if (target?.type !== 'folder') return [];

	const candidateIds =
		selectedIds.has(anchorId) && selectedIds.size > 1
			? items
					.filter((candidate) => selectedIds.has(candidate.id))
					.map((candidate) => candidate.id)
			: [anchorId];

	return candidateIds.filter((id) => {
		if (id === targetFolderId) return false;
		const item = items.find((row) => row.id === id);
		if (!item) return false;
		return canMoveDesktopItemIntoFolder(items, item, target);
	});
}

export function buildDesktopFolderTreeNodes(
	items: DesktopItem[]
): DesktopFolderTreeNode[] {
	const folders = items.filter((item) => item.type === 'folder');
	const byParent = new Map<string, DesktopItem[]>();
	for (const folder of folders) {
		const parentKey = folder.parentId ?? '';
		if (!byParent.has(parentKey)) byParent.set(parentKey, []);
		byParent.get(parentKey)?.push(folder);
	}
	for (const group of byParent.values()) {
		group.sort((a, b) =>
			(a.name || '').localeCompare(b.name || '', undefined, {
				sensitivity: 'base',
			})
		);
	}
	const build = (parentKey: string): DesktopFolderTreeNode[] =>
		(byParent.get(parentKey) ?? []).map((row) => ({
			...row,
			children: build(row.id),
		}));
	return build('');
}

export function buildDesktopFolderPathChain(
	items: DesktopItem[],
	folderId: string | undefined,
	rootLabel: string
): DesktopFolderPathSegment[] {
	if (!folderId || folderId === FOLDER_WINDOW_ROOT_ID) {
		return [{ id: FOLDER_WINDOW_ROOT_ID, name: rootLabel }];
	}
	const chain: DesktopFolderPathSegment[] = [];
	let cursor: string | undefined = folderId;
	const guard = new Set<string>();
	while (cursor && !guard.has(cursor)) {
		guard.add(cursor);
		const row = items.find((item) => item.id === cursor);
		if (!row) break;
		chain.unshift({ id: row.id, name: row.name });
		cursor = row.parentId;
	}
	return [{ id: FOLDER_WINDOW_ROOT_ID, name: rootLabel }, ...chain];
}

export function resolveDesktopFolderWindowParentId(
	folderId: string | undefined
): string | undefined {
	if (!folderId || folderId === FOLDER_WINDOW_ROOT_ID) {
		return undefined;
	}
	return folderId;
}

export function liftDesktopItemsToRoot(
	items: DesktopItem[],
	itemIds: Iterable<string>
): DesktopItem[] {
	const ids = new Set(itemIds);
	let changed = false;
	const next = items.map((item) => {
		if (!ids.has(item.id) || !item.parentId) return item;
		changed = true;
		return { ...item, parentId: undefined };
	});
	return changed ? next : items;
}

/** Move nested items one level up (into parent folder of `currentFolderId`). */
export function liftDesktopItemsOneLevel(
	items: DesktopItem[],
	itemIds: Iterable<string>,
	currentFolderId: string
): DesktopItem[] {
	if (currentFolderId === FOLDER_WINDOW_ROOT_ID) {
		return liftDesktopItemsToRoot(items, itemIds);
	}
	const currentFolder = items.find((item) => item.id === currentFolderId);
	const targetParentId = currentFolder?.parentId;
	const ids = new Set(itemIds);
	let changed = false;
	const next = items.map((item) => {
		if (!ids.has(item.id) || item.parentId !== currentFolderId) return item;
		changed = true;
		return {
			...item,
			parentId: targetParentId,
		};
	});
	return changed ? next : items;
}

/** Move nested desktop shortcuts into `targetFolderId` (or desktop root when root/unfiled). */
export type DesktopMoveItemsIntoFolderReport = {
	items: DesktopItem[];
	movedIds: string[];
	skippedIds: string[];
};

export function moveDesktopItemsIntoFolderWithReport(
	items: DesktopItem[],
	itemIds: Iterable<string>,
	targetFolderId: string | undefined
): DesktopMoveItemsIntoFolderReport {
	const ids = new Set(itemIds);
	const normalizedTarget =
		!targetFolderId || targetFolderId === FOLDER_WINDOW_ROOT_ID
			? undefined
			: targetFolderId;

	let targetFolder: DesktopItem | undefined;
	if (normalizedTarget) {
		targetFolder = items.find((row) => row.id === normalizedTarget);
		if (targetFolder?.type !== 'folder') {
			return { items, movedIds: [], skippedIds: [...ids] };
		}
	}

	const movedIds: string[] = [];
	const skippedIds: string[] = [];
	let changed = false;
	const next = items.map((item) => {
		if (!ids.has(item.id)) return item;

		const currentParentKey = item.parentId ?? '';
		const nextParentKey = normalizedTarget ?? '';
		if (currentParentKey === nextParentKey) {
			skippedIds.push(item.id);
			return item;
		}

		if (normalizedTarget && targetFolder) {
			if (!canMoveDesktopItemIntoFolder(items, item, targetFolder)) {
				skippedIds.push(item.id);
				return item;
			}
		} else if (!item.parentId) {
			skippedIds.push(item.id);
			return item;
		}

		changed = true;
		movedIds.push(item.id);
		return {
			...item,
			parentId: normalizedTarget,
		};
	});
	for (const id of ids) {
		if (!items.some((item) => item.id === id) && !skippedIds.includes(id)) {
			skippedIds.push(id);
		}
	}
	return { items: changed ? next : items, movedIds, skippedIds };
}

/** Move nested desktop shortcuts into `targetFolderId` (or desktop root when root/unfiled). */
export function moveDesktopItemsIntoFolder(
	items: DesktopItem[],
	itemIds: Iterable<string>,
	targetFolderId: string | undefined
): DesktopItem[] {
	return moveDesktopItemsIntoFolderWithReport(items, itemIds, targetFolderId)
		.items;
}

/** Expand delete set with nested descendants; skips system folders. */
export function collectDesktopDeleteIds(
	items: DesktopItem[],
	seedIds: Iterable<string>
): Set<string> {
	const ids = new Set<string>();
	for (const id of seedIds) {
		const item = items.find((row) => row.id === id);
		if (!item || isDesktopSystemFolder(item)) continue;
		ids.add(id);
	}
	let added = true;
	while (added) {
		added = false;
		for (const item of items) {
			const parentKey = item.parentId ?? '';
			if (
				parentKey &&
				ids.has(parentKey) &&
				!ids.has(item.id) &&
				!isDesktopSystemFolder(item)
			) {
				ids.add(item.id);
				added = true;
			}
		}
	}
	return ids;
}

export function removeDesktopItemsByIds(
	items: DesktopItem[],
	idsToRemove: Set<string>
): DesktopItem[] {
	if (idsToRemove.size === 0) return items;
	return items.filter((row) => !idsToRemove.has(row.id));
}

export function buildDesktopFolderBreadcrumb(
	items: DesktopItem[],
	folderId: string
): string[] {
	const names: string[] = [];
	let cursor: string | undefined = folderId;
	const guard = new Set<string>();
	while (cursor && !guard.has(cursor)) {
		guard.add(cursor);
		const row = items.find((item) => item.id === cursor);
		if (!row) break;
		names.unshift(row.name);
		cursor = row.parentId;
	}
	return names;
}
