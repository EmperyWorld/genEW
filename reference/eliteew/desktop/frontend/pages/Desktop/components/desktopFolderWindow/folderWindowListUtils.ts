/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure helpers for Desktop folder window library listing: upload query shaping, date formatting, thumbnail eligibility, virtual-list constants.
 *
 * Invariants:
 * - Image/video rows use authenticated ContentThumbnail when `folderRowUsesUnifiedContentThumbnail` is true.
 *
 * Related:
 * - DesktopFolderWindow.tsx; DesktopFolderLibraryFileList.tsx
 */

import type { FolderFileItem } from '../../hooks/useFolderContents';
import { FOLDER_WINDOW_ROOT_ID } from '../../utils/desktopItemTree';

export const FOLDER_WINDOW_LIST_VIRTUAL_THRESHOLD = 400;
export const FOLDER_WINDOW_LIST_ROW_HEIGHT_PX = 52;

/** POST /content upload query for a desktop-linked folder */
export function folderWindowUploadQuery(
	folderId: string | undefined
): Record<string, unknown> {
	if (
		!folderId ||
		folderId === 'content' ||
		folderId === FOLDER_WINDOW_ROOT_ID
	) {
		return {};
	}
	return { folder_item_id: folderId };
}

export function folderItemCreatedAtMs(file: FolderFileItem): number {
	const v = file.created_at;
	if (v instanceof Date) return v.getTime();
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string') {
		const t = Date.parse(v);
		return Number.isNaN(t) ? 0 : t;
	}
	return 0;
}

export function formatFolderItemDate(
	file: FolderFileItem,
	locale?: string
): string {
	const ms = folderItemCreatedAtMs(file);
	if (ms <= 0) return '';
	const resolvedLocale =
		typeof locale === 'string' && locale.trim() !== '' ? locale : undefined;
	return new Date(ms).toLocaleDateString(resolvedLocale, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
}

/** @deprecated Use {@link formatFolderItemDate} with explicit locale. */
export function formatFolderItemDateRu(file: FolderFileItem): string {
	return formatFolderItemDate(file, 'ru-RU');
}

export type FolderWindowActiveFilterSummary = {
	hasSearch: boolean;
	hasTypeFilter: boolean;
	searchQuery: string;
	contentTypeFilter: string;
};

export function folderWindowTypeFilterLabelKey(
	contentTypeFilter: string
):
	| 'folderWindow.typeDocument'
	| 'folderWindow.typeImage'
	| 'folderWindow.typeVideo'
	| 'folderWindow.typeAudio'
	| 'folderWindow.typeAll' {
	switch (contentTypeFilter) {
		case 'document':
			return 'folderWindow.typeDocument';
		case 'image':
			return 'folderWindow.typeImage';
		case 'video':
			return 'folderWindow.typeVideo';
		case 'audio':
			return 'folderWindow.typeAudio';
		default:
			return 'folderWindow.typeAll';
	}
}

export function buildFolderWindowActiveFilterSummary(input: {
	searchQuery: string;
	contentTypeFilter: string;
}): FolderWindowActiveFilterSummary {
	const searchQuery = input.searchQuery.trim();
	return {
		hasSearch: searchQuery.length > 0,
		hasTypeFilter: input.contentTypeFilter !== 'all',
		searchQuery,
		contentTypeFilter: input.contentTypeFilter,
	};
}

export function folderRowUsesUnifiedContentThumbnail(
	file: FolderFileItem
): boolean {
	const ct = String(file.content_type ?? '').toLowerCase();
	return (
		typeof file.id === 'string' &&
		file.id.trim() !== '' &&
		(ct.includes('image') || ct.includes('video'))
	);
}

export type FolderWindowMetaLabels = {
	loadingMeta: string;
	metaNested: (count: number) => string;
	listMeta: (shown: number, total: number) => string;
	emptyMeta: string;
};

/** Toolbar subtitle under folder title (nested count + library pagination). */
export function buildFolderWindowMetaSummary(input: {
	folderFilesLoading: boolean;
	hasNestedDesktopItems: boolean;
	nestedCount: number;
	folderFiles: FolderFileItem[] | null | undefined;
	folderTotal: number;
	labels: FolderWindowMetaLabels;
}): string {
	const {
		folderFilesLoading,
		hasNestedDesktopItems,
		nestedCount,
		folderFiles,
		folderTotal,
		labels,
	} = input;
	if (folderFilesLoading) {
		return labels.loadingMeta;
	}
	const parts: string[] = [];
	if (hasNestedDesktopItems) {
		parts.push(labels.metaNested(nestedCount));
	}
	if (folderFiles && folderTotal > 0) {
		parts.push(labels.listMeta(folderFiles.length, folderTotal));
	} else if (!hasNestedDesktopItems && !folderFilesLoading) {
		return labels.emptyMeta;
	}
	return parts.length > 0 ? parts.join(' · ') : labels.emptyMeta;
}

export type FolderLibraryBodyVariant =
	| 'loading'
	| 'file-list'
	| 'filter-empty'
	| 'nested-only-hint'
	| 'folder-empty';

/** Which main-pane body to show below nested desktop shortcuts. */
export function resolveFolderLibraryBodyVariant(input: {
	folderFilesLoading: boolean;
	hasLibraryFiles: boolean;
	filtersActive: boolean;
	hasNestedDesktopItems: boolean;
}): FolderLibraryBodyVariant {
	const {
		folderFilesLoading,
		hasLibraryFiles,
		filtersActive,
		hasNestedDesktopItems,
	} = input;
	if (folderFilesLoading) {
		return 'loading';
	}
	if (hasLibraryFiles) {
		return 'file-list';
	}
	if (filtersActive && !hasNestedDesktopItems) {
		return 'filter-empty';
	}
	if (hasNestedDesktopItems) {
		return 'nested-only-hint';
	}
	return 'folder-empty';
}
