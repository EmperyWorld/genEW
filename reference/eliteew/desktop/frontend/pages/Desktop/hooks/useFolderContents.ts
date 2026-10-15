/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Adapts the atomic folder-view API to desktop folder-window files, nested desktop children, and pagination.
 *
 * Invariants:
 * - Unfiled uses folder_unassigned and never requests a folder id.
 * - Files and direct desktop children share the same initial folder-view response.
 *
 * Related:
 * - src/hooks/useFolderView.ts
 * - src/pages/Desktop/components/desktopFolderWindow/useFolderWindowController.ts
 */
import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useFolderView } from '@/hooks/useFolderView';
import type { Content } from '@/components/UnifiedContent/types';
import {
	contentApi,
	type FolderViewDesktopChild,
	type FolderViewQuery,
} from '../../../services/contentApi';
import { FOLDER_WINDOW_ROOT_ID } from '../utils/desktopItemTree';

export interface FolderFileItem {
	id: string;
	name: string;
	content_type?: string;
	original_filename?: string;
	thumbnail_url?: string | null;
	mime_type?: string | null;
	[key: string]: unknown;
}

/** First folder window fetch: balance between one round-trip and JSON size (was 200). */
const FIRST_PAGE_LIMIT = 100;

export type FolderWindowSortBy = 'name' | 'date' | 'size';

/** Maps folder window sort control to Unified Content list API. */
export function folderSortToListQuery(sortBy: FolderWindowSortBy): {
	sort_field: 'name' | 'date' | 'size';
	sort_order: 'asc' | 'desc';
} {
	if (sortBy === 'name') {
		return { sort_field: 'name', sort_order: 'asc' };
	}
	if (sortBy === 'date') {
		return { sort_field: 'date', sort_order: 'desc' };
	}
	return { sort_field: 'size', sort_order: 'desc' };
}

function folderViewBase(
	folderId: string | undefined,
	limit: number,
	offset: number
): Pick<FolderViewQuery, 'limit' | 'offset' | 'folderItemId' | 'unfiled'> {
	if (folderId === FOLDER_WINDOW_ROOT_ID) {
		return { limit, offset, unfiled: true };
	}
	const resolvedFolderId = folderId ?? 'content';
	return {
		limit,
		offset,
		...(resolvedFolderId !== 'content'
			? { folderItemId: resolvedFolderId }
			: {}),
	};
}

export interface FolderListRequestOptions {
	/** Debounced search string; server filters when set. */
	search?: string;
	sortBy?: FolderWindowSortBy;
	/** Empty or "all" = no filter. */
	contentType?: string;
}

function buildFolderViewQuery(
	folderId: string | undefined,
	limit: number,
	offset: number,
	opts?: FolderListRequestOptions
): FolderViewQuery {
	const base = folderViewBase(folderId, limit, offset);
	const sort = folderSortToListQuery(opts?.sortBy ?? 'name');
	const q: FolderViewQuery = {
		...base,
		sort: {
			field: sort.sort_field,
			order: sort.sort_order,
		},
	};
	const t = opts?.search?.trim();
	if (t) {
		q.search = t;
	}
	const ct = opts?.contentType?.trim();
	if (ct && ct !== 'all') {
		q.contentType = ct;
	}
	return q;
}

/** Список файлов для окна папки рабочего стола (Unified Content через contentApi). */
export async function fetchFolderListPage(
	folderId: string | undefined,
	limit: number,
	offset: number,
	opts?: FolderListRequestOptions
): Promise<{
	items: FolderFileItem[];
	total: number;
	desktopChildren: FolderViewDesktopChild[];
}> {
	const query = buildFolderViewQuery(folderId, limit, offset, opts);
	const res = await contentApi.getFolderView(query);
	return {
		items: res.files.items as unknown as FolderFileItem[],
		total: res.files.total,
		desktopChildren: res.desktop_children,
	};
}

export async function fetchFolderList(
	folderId: string | undefined,
	limit: number,
	opts?: FolderListRequestOptions
): Promise<FolderFileItem[]> {
	const { items } = await fetchFolderListPage(folderId, limit, 0, opts);
	return items;
}

export function useFolderContents(
	isFolderWindow: boolean,
	folderId: string | undefined,
	listRequest?: FolderListRequestOptions
) {
	const [folderLoadingMore, setFolderLoadingMore] = useState(false);

	const searchKey = listRequest?.search?.trim() ?? '';
	const sortBy = listRequest?.sortBy ?? 'name';
	const typeKey = listRequest?.contentType?.trim() ?? '';

	const resolvedRequest = useRef<FolderListRequestOptions | undefined>(
		listRequest
	);
	resolvedRequest.current = listRequest;

	const buildOpts = useCallback((): FolderListRequestOptions => {
		const cur = resolvedRequest.current;
		return {
			search: cur?.search?.trim() || undefined,
			sortBy: cur?.sortBy ?? 'name',
			contentType: cur?.contentType?.trim() || undefined,
		};
	}, []);

	const query = buildFolderViewQuery(folderId, FIRST_PAGE_LIMIT, 0, {
		search: searchKey || undefined,
		sortBy,
		contentType: typeKey || undefined,
	});
	const folderView = useFolderView({
		...query,
		enabled: isFolderWindow && Boolean(folderId),
	});
	const folderFiles = (
		isFolderWindow && folderId ? folderView.files : undefined
	) as FolderFileItem[] | undefined;
	const folderTotal = folderView.total;
	const folderFilesRef = useRef(folderFiles);
	folderFilesRef.current = folderFiles;
	const folderTotalRef = useRef(folderTotal);
	folderTotalRef.current = folderTotal;

	const refreshFolderContents = useCallback(async () => {
		await folderView.refetch();
	}, [folderView.refetch]);

	const loadMoreFolderContents = useCallback(async () => {
		if (
			!isFolderWindow ||
			!folderId ||
			folderView.loading ||
			folderLoadingMore
		) {
			return;
		}
		const loaded = folderFilesRef.current?.length ?? 0;
		if (loaded >= folderTotalRef.current) return;

		const requestOpts = buildOpts();
		setFolderLoadingMore(true);
		try {
			const limit = FIRST_PAGE_LIMIT;
			const offset = loaded;
			const page = await fetchFolderListPage(
				folderId,
				limit,
				offset,
				requestOpts
			);
			folderView.setFiles((prev) => [
				...prev,
				...(page.items as unknown as Content[]),
			]);
			folderView.setTotal(page.total);
		} catch (err) {
			console.error('[useFolderContents] loadMore failed', {
				folderId,
				err: (err as Error)?.message ?? err,
			});
		} finally {
			setFolderLoadingMore(false);
		}
	}, [
		buildOpts,
		folderId,
		folderLoadingMore,
		folderView.loading,
		folderView.setFiles,
		folderView.setTotal,
		isFolderWindow,
	]);

	const loadedCount = folderFiles?.length ?? 0;
	const folderHasMore = loadedCount > 0 && loadedCount < folderTotal;
	const setFolderFiles: Dispatch<SetStateAction<FolderFileItem[] | undefined>> =
		useCallback(
			(next) => {
				folderView.setFiles((current) => {
					const currentFolderFiles = current as unknown as FolderFileItem[];
					const resolved =
						typeof next === 'function' ? next(currentFolderFiles) : next;
					return (resolved ?? []) as unknown as Content[];
				});
			},
			[folderView.setFiles]
		);

	return {
		folderFiles,
		folderTotal,
		folderHasMore,
		folderDesktopChildren: folderView.desktopChildren,
		folderFilesLoading: folderView.loading,
		folderFilesError: folderView.error,
		folderLoadingMore,
		refreshFolderContents,
		loadMoreFolderContents,
		setFolderFiles,
	};
}
