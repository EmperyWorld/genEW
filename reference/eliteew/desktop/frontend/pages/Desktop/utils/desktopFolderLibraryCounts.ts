/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Unified Content totals and folder-icon preview entries per desktop folder item_id.
 *
 * Invariants:
 * - Badge totals come from one ``GET /content/folder-totals`` (GROUP BY), not N× limit=1.
 * - Preview mosaics come from one ``GET /content/folder-previews`` (ROW_NUMBER), not N× compact list.
 * - «content» folder resolves from ``by_folder_item_id['content']`` (not library ``total``).
 *
 * Related:
 * - hooks/useFolderContents.ts · useDesktopFolderLibraryCounts.ts · useDesktopFolderLibraryPreviews.ts
 */

import { contentApi } from '@/services/contentApi';
import type { DesktopFolderPreviewEntry } from '../types/desktop.types';

export type DesktopFolderLibraryTotals = {
	byFolderItemId: Record<string, number>;
	unfiled: number;
	total: number;
};

export async function fetchDesktopFolderLibraryTotals(): Promise<DesktopFolderLibraryTotals> {
	const res = await contentApi.getFolderTotals();
	return {
		byFolderItemId: res.by_folder_item_id,
		unfiled: res.unfiled,
		total: res.total,
	};
}

/** Resolve library file count for one desktop folder id from the batch totals payload. */
export function resolveDesktopFolderLibraryTotal(
	totals: DesktopFolderLibraryTotals,
	folderItemId: string
): number {
	return totals.byFolderItemId[folderItemId] ?? 0;
}

export function buildDesktopFolderLibraryListQuery(folderItemId: string) {
	if (folderItemId === 'content') {
		return { limit: 1, offset: 0, list_profile: 'compact' as const };
	}
	return {
		limit: 1,
		offset: 0,
		folder_item_id: folderItemId,
		list_profile: 'compact' as const,
	};
}

/** @deprecated Prefer ``fetchDesktopFolderLibraryTotals`` for badge counts. */
export async function fetchDesktopFolderLibraryTotal(
	folderItemId: string
): Promise<number> {
	const totals = await fetchDesktopFolderLibraryTotals();
	return resolveDesktopFolderLibraryTotal(totals, folderItemId);
}

const FOLDER_PREVIEW_LIMIT = 4;

export function buildDesktopFolderLibraryPreviewQuery(folderItemId: string) {
	const base = buildDesktopFolderLibraryListQuery(folderItemId);
	return {
		...base,
		limit: FOLDER_PREVIEW_LIMIT,
		offset: 0,
		sort_field: 'name' as const,
		sort_order: 'asc' as const,
	};
}

export function libraryContentToFolderPreviewEntry(row: {
	id: string;
	content_type?: string;
	mime_type?: string | null;
}): DesktopFolderPreviewEntry {
	const ct = String(row.content_type ?? '').toLowerCase();
	const mime = String(row.mime_type ?? '').toLowerCase();
	let fileType: string | undefined;
	if (ct.includes('image') || mime.startsWith('image/')) {
		fileType = 'image';
	} else if (ct.includes('video') || mime.startsWith('video/')) {
		fileType = 'video';
	} else if (ct.includes('audio') || mime.startsWith('audio/')) {
		fileType = 'audio';
	} else if (
		ct.includes('archive') ||
		mime.includes('zip') ||
		mime.includes('compressed')
	) {
		fileType = 'archive';
	} else if (
		mime.includes('javascript') ||
		mime.includes('json') ||
		mime.includes('xml') ||
		ct.includes('code')
	) {
		fileType = 'code';
	}
	return { id: row.id, type: 'file', fileType };
}

/** @deprecated Prefer ``fetchDesktopFolderLibraryPreviewsBatch`` for idle desktop. */
export async function fetchDesktopFolderLibraryPreviewEntries(
	folderItemId: string
): Promise<DesktopFolderPreviewEntry[]> {
	const batch = await fetchDesktopFolderLibraryPreviewsBatch([folderItemId]);
	return batch[folderItemId] ?? [];
}

export async function fetchDesktopFolderLibraryPreviewsBatch(
	folderItemIds: readonly string[]
): Promise<Record<string, DesktopFolderPreviewEntry[]>> {
	const ids = [
		...new Set(folderItemIds.filter((id) => id.length > 0 && id !== 'content')),
	];
	if (ids.length === 0) return {};
	const res = await contentApi.getFolderPreviews(ids, FOLDER_PREVIEW_LIMIT);
	const out: Record<string, DesktopFolderPreviewEntry[]> = {};
	for (const [folderId, rows] of Object.entries(res.by_folder_item_id)) {
		const entries = rows
			.slice(0, FOLDER_PREVIEW_LIMIT)
			.map((row) => libraryContentToFolderPreviewEntry(row));
		if (entries.length > 0) {
			out[folderId] = entries;
		}
	}
	return out;
}

export function countNestedDesktopChildrenByFolderId(
	items: { parentId?: string }[]
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const item of items) {
		const parentId = item.parentId;
		if (!parentId) continue;
		counts[parentId] = (counts[parentId] ?? 0) + 1;
	}
	return counts;
}

/** Badge total = nested desktop shortcuts + library files in folder. */
export function mergeFolderIconBadgeCounts(
	nestedByFolderId: Record<string, number>,
	libraryByFolderId: Record<string, number>
): Record<string, number> {
	const merged: Record<string, number> = { ...nestedByFolderId };
	for (const [folderId, libraryTotal] of Object.entries(libraryByFolderId)) {
		if (libraryTotal <= 0) continue;
		merged[folderId] = (merged[folderId] ?? 0) + libraryTotal;
	}
	return merged;
}

export function collectFolderIdsForLibraryMutation(
	items: { id: string; folder_item_id?: string | null }[],
	contentIds: string[],
	targetFolderItemId: string | null
): string[] {
	const out = new Set<string>();
	for (const contentId of contentIds) {
		const row = items.find((item) => item.id === contentId);
		const cur = row?.folder_item_id;
		if (typeof cur === 'string' && cur.trim() !== '') {
			out.add(cur.trim());
		}
	}
	if (
		typeof targetFolderItemId === 'string' &&
		targetFolderItemId.trim() !== ''
	) {
		out.add(targetFolderItemId.trim());
	}
	return [...out];
}

const FOLDER_ICON_PREVIEW_LIMIT = 4;

/** Up to four mosaic slots: nested desktop children first, then library files. */
export function mergeFolderIconPreviewEntries(
	nested: readonly DesktopFolderPreviewEntry[],
	library: readonly DesktopFolderPreviewEntry[],
	limit = FOLDER_ICON_PREVIEW_LIMIT
): DesktopFolderPreviewEntry[] {
	const merged = [...nested];
	for (const entry of library) {
		if (merged.length >= limit) break;
		if (!merged.some((row) => row.id === entry.id)) {
			merged.push(entry);
		}
	}
	return merged.slice(0, limit);
}
